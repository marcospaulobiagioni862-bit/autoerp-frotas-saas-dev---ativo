import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';
import { Client } from 'pg';
import type { AuthenticatedPrincipal } from '../auth';

// 1. Carregar variáveis Neon ANTES de qualquer import do Drizzle
try {
  const envContent = readFileSync(join(homedir(), '.config/autoerp-neon.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(trimmed);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
} catch (e) {
  console.warn('Could not read ~/.config/autoerp-neon.env:', e);
}

const neonUrl = process.env.STAGING_MAIN_DATABASE_URL || process.env.HOMOLOG_DATABASE_URL || process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('FATAL: Database URL is required to run real massa verification.');
  process.exit(1);
}

process.env.DATABASE_URL = neonUrl;
process.env.USE_PGLITE = 'false';
process.env.NODE_ENV = 'development';

async function runRegression() {
  console.log('=== AUTOERP-78: SUÍTE DE REGRESSÃO FAIL-CLOSED NAS GUARDAS DE AUTORIZAÇÃO ===\n');
  console.log('Database:', neonUrl.split('@')[1]?.split('/')[0] || 'neon');

  // Dynamic import de rotas e presets
  const { registerVehicleInspectionRoutes } = await import('../vehicleInspectionRoutes');
  const { registerContractSimpleSignRoutes } = await import('../contractSimpleSignRoutes');
  const { registerVehicleRoutes } = await import('../vehicleRoutes');
  const { registerVehicleLifecycleRoutes } = await import('../vehicleLifecycleRoutes');
  const { registerContractRoutes } = await import('../contractRoutes');
  const { registerCompanyProfileRoutes } = await import('../companyProfileRoutes');
  const { registerDocumentRoutes } = await import('../documentRoutes');
  const { registerTrafficTicketRoutes } = await import('../trafficTicketRoutes');
  const { registerDriverRoutes } = await import('../driverRoutes');
  const { registerAdminUserRoutes } = await import('../adminUserRoutes');
  const { getDefaultPermissionsForRole } = await import('../rolePresets');

  // 1. Conferência nos dados reais do Neon
  console.log('[1/6] Verificando integridade da massa de usuários no banco...');
  const pgClient = new Client({ connectionString: neonUrl });
  await pgClient.connect();

  try {
    const res = await pgClient.query<{ id: string; role: string; permissions: string[] | null }>(`
      SELECT id, role, permissions FROM users WHERE company_id = 'staging-company-001' ORDER BY id;
    `);
    const allUsers = res.rows;

    const emptyPermUsers = allUsers.filter(
      (u) => !u.permissions || (Array.isArray(u.permissions) && u.permissions.length === 0)
    );

    console.log(`  Total de usuários no banco: ${allUsers.length}`);
    console.log(`  Usuários com permissões nulas ou vazias: ${emptyPermUsers.length}`);
    for (const u of emptyPermUsers) {
      console.log(`    - ${u.id} (${u.role}): ${JSON.stringify(u.permissions)}`);
    }

    // O único usuário com lista vazia no banco DEVE ser o canary (se existir no ambiente)
    const nonCanaryEmpty = emptyPermUsers.filter((u) => u.id !== 'staging-canary-001');
    assert.equal(
      nonCanaryEmpty.length,
      0,
      `Nenhum usuário legítimo pode ter lista nula/vazia após o backfill. Encontrados: ${nonCanaryEmpty.map((u) => u.id).join(', ')}`
    );
    console.log('  ✓ Backfill comprovado: zero administradores ou operadores legítimos com lista nula/vazia.\n');
  } finally {
    await pgClient.end();
  }

  // 2. Configurar servidor Express de teste com rotas reais
  console.log('[2/6] Inicializando servidor de teste com rotas reais protegidas...');
  const app = express();
  app.use(express.json());

  let currentActor: AuthenticatedPrincipal = {
    companyId: 'v2demo-ngcompany001',
    userId: 'test-user',
    name: 'Test Actor',
    role: 'OPERATIONAL',
    permissions: [],
  };

  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as Request & { principal?: AuthenticatedPrincipal }).principal = { ...currentActor };
    next();
  });

  registerVehicleInspectionRoutes(app);
  registerContractSimpleSignRoutes(app);
  registerVehicleRoutes(app);
  registerVehicleLifecycleRoutes(app);
  registerContractRoutes(app);
  registerCompanyProfileRoutes(app);
  registerDocumentRoutes(app);
  registerTrafficTicketRoutes(app);
  registerDriverRoutes(app);
  registerAdminUserRoutes(app);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 3. SENTIDO NEGATIVO (Fail-Closed na lista vazia)
    console.log('[3/6] Testando sentido negativo (Fail-Closed): usuário OPERATIONAL com permissões vazias...');
    currentActor = {
      companyId: 'v2demo-ngcompany001',
      userId: 'test-canary-unconfigured',
      name: 'Unconfigured Operator',
      role: 'OPERATIONAL',
      permissions: [],
    };

    // 3.1 Criação de vistoria (a falha clássica descrita no card AUTOERP-78)
    const inspRes = await fetch(`${baseUrl}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-01/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'CHECK_IN', currentKm: 50000 }),
    });
    assert.equal(
      inspRes.status,
      403,
      `Vistoria: esperado 403 Forbidden para lista vazia, recebido ${inspRes.status}`
    );
    console.log('  ✓ POST /api/fleet/vehicles/:id/inspections: 403 Forbidden (bloqueado com sucesso!)');

    // 3.2 Assinatura de contrato
    const signRes = await fetch(`${baseUrl}/api/contracts/v2demo-ngcompany001-contract-01/sign-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SIGNED' }),
    });
    assert.equal(
      signRes.status,
      403,
      `Assinatura de contrato: esperado 403 Forbidden para lista vazia, recebido ${signRes.status}`
    );
    console.log('  ✓ POST /api/contracts/:id/sign-status: 403 Forbidden (bloqueado com sucesso!)');

    // 3.3 Alteração de status de veículo
    const statusRes = await fetch(`${baseUrl}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-01/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toStatus: 'MAINTENANCE', reason: 'Revisão' }),
    });
    assert.equal(
      statusRes.status,
      403,
      `Status do veículo: esperado 403 Forbidden para lista vazia, recebido ${statusRes.status}`
    );
    console.log('  ✓ PATCH /api/fleet/vehicles/:id/status: 403 Forbidden (bloqueado com sucesso!)');

    // 3.3.1 Arquivamento de veículo
    const archiveRes = await fetch(`${baseUrl}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-01/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Vendido' }),
    });
    assert.equal(
      archiveRes.status,
      403,
      `Arquivamento de veículo: esperado 403 Forbidden para lista vazia, recebido ${archiveRes.status}`
    );
    console.log('  ✓ POST /api/fleet/vehicles/:id/archive: 403 Forbidden (bloqueado com sucesso!)');

    // 3.4 Edição de perfil da empresa
    const profileRes = await fetch(`${baseUrl}/api/company-profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nova Razão Social' }),
    });
    assert.equal(
      profileRes.status,
      403,
      `Perfil da empresa: esperado 403 Forbidden para lista vazia, recebido ${profileRes.status}`
    );
    console.log('  ✓ PATCH /api/company-profile: 403 Forbidden (bloqueado com sucesso!)');

    // 3.5 Leitura de multas
    const ticketRes = await fetch(`${baseUrl}/api/traffic-tickets`);
    assert.equal(
      ticketRes.status,
      403,
      `Leitura de multas: esperado 403 Forbidden para lista vazia, recebido ${ticketRes.status}`
    );
    console.log('  ✓ GET /api/traffic-tickets: 403 Forbidden (bloqueado com sucesso!)');

    // 3.6 Leitura de motoristas
    const driverRes = await fetch(`${baseUrl}/api/drivers`);
    assert.equal(
      driverRes.status,
      403,
      `Leitura de motoristas: esperado 403 Forbidden para lista vazia, recebido ${driverRes.status}`
    );
    console.log('  ✓ GET /api/drivers: 403 Forbidden (bloqueado com sucesso!)\n');

    // 4. SENTIDO POSITIVO (Sem lockout para usuários legítimos configurados)
    console.log('[4/6] Testando sentido positivo: usuários configurados e admin...');

    // 4.1 Usuário com permissão explícita CREATE_INSPECTION consegue acessar a guarda de vistoria
    currentActor = {
      companyId: 'v2demo-ngcompany001',
      userId: 'test-configured-operator',
      name: 'Configured Operator',
      role: 'OPERATIONAL',
      permissions: ['CREATE_INSPECTION', 'VIEW_INSPECTION', 'VIEW_VEHICLE'],
    };

    // A requisição passa da guarda requirePrincipal (pode dar 400 por payload incompleto, mas NÃO 403)
    const inspAllowedRes = await fetch(`${baseUrl}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-01/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.notEqual(
      inspAllowedRes.status,
      403,
      `Usuário com CREATE_INSPECTION NÃO pode ser barrado com 403, recebeu ${inspAllowedRes.status}`
    );
    console.log(`  ✓ POST /api/fleet/vehicles/:id/inspections com CREATE_INSPECTION: passou da guarda (status HTTP ${inspAllowedRes.status})`);

    // 4.2 Usuário ADMIN tem acesso irrestrito de governança
    currentActor = {
      companyId: 'v2demo-ngcompany001',
      userId: 'test-admin',
      name: 'Admin Actor',
      role: 'ADMIN',
      permissions: ['*'],
    };

    const adminUsersRes = await fetch(`${baseUrl}/api/admin/users`);
    assert.equal(adminUsersRes.status, 200, `ADMIN deve acessar /api/admin/users com 200 OK, recebeu ${adminUsersRes.status}`);
    console.log('  ✓ GET /api/admin/users como ADMIN: 200 OK');

    const adminTicketsRes = await fetch(`${baseUrl}/api/traffic-tickets`);
    assert.equal(adminTicketsRes.status, 200, `ADMIN deve acessar /api/traffic-tickets com 200 OK, recebeu ${adminTicketsRes.status}`);
    console.log('  ✓ GET /api/traffic-tickets como ADMIN: 200 OK\n');

    // 5. PROVISIONAMENTO DE NOVOS USUÁRIOS COM PRESETS DO PAPEL
    console.log('[5/6] Testando provisionamento automático com ROLE_PRESETS...');
    const operationalPreset = getDefaultPermissionsForRole('OPERATIONAL');
    assert(operationalPreset.length > 5, 'Preset de OPERATIONAL deve conter as permissões padrão');
    assert(operationalPreset.includes('CREATE_INSPECTION'), 'Preset de OPERATIONAL deve incluir CREATE_INSPECTION');
    assert(operationalPreset.includes('RECORD_KM'), 'Preset de OPERATIONAL deve incluir RECORD_KM');

    const managerPreset = getDefaultPermissionsForRole('MANAGER');
    assert(managerPreset.includes('EDIT_VEHICLE'), 'Preset de MANAGER deve incluir EDIT_VEHICLE');
    assert(!managerPreset.includes('MANAGE_USERS'), 'Preset de MANAGER não deve incluir MANAGE_USERS');

    const adminPreset = getDefaultPermissionsForRole('ADMIN');
    assert(adminPreset.includes('*'), 'Preset de ADMIN deve incluir wildcard *');

    console.log(`  ✓ Presets verificados: OPERATIONAL (${operationalPreset.length} perms), MANAGER (${managerPreset.length} perms), ADMIN (*)`);

    // 6. BLOQUEIO DE ESCALADA DE PRIVILÉGIOS EM POST /api/admin/users (Regra 3.2-a e pedido Claude 2026-10-09)
    console.log('\n[6/6] Testando bloqueio contra escalada de privilégios em POST /api/admin/users...');

    // Ator com apenas permissão MANAGE_USERS (não-admin)
    currentActor = {
      companyId: 'staging-company-001',
      userId: 'test-user-manager-only',
      name: 'Operador com MANAGE_USERS',
      role: 'OPERATIONAL',
      permissions: ['MANAGE_USERS'],
    };

    // Cenário A: Operador tenta criar usuário com role ADMIN -> 403 Forbidden
    const escalateRoleRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tentativa Hacker Admin',
        email: `hacker-admin-${Date.now()}@teste.com`,
        role: 'ADMIN',
      }),
    });
    assert.equal(
      escalateRoleRes.status,
      403,
      `Operador com MANAGE_USERS tentando criar ADMIN deve receber 403 Forbidden, recebeu ${escalateRoleRes.status}`
    );
    console.log('  ✓ POST /api/admin/users com role ADMIN por operador MANAGE_USERS: 403 Forbidden (bloqueado com sucesso!)');

    // Cenário B: Operador tenta conceder permissão wildcard '*' -> 403 Forbidden
    const escalateWildcardRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tentativa Hacker Wildcard',
        email: `hacker-wildcard-${Date.now()}@teste.com`,
        role: 'OPERATIONAL',
        permissions: ['*'],
      }),
    });
    assert.equal(
      escalateWildcardRes.status,
      403,
      `Operador com MANAGE_USERS tentando conceder '*' deve receber 403 Forbidden, recebeu ${escalateWildcardRes.status}`
    );
    console.log('  ✓ POST /api/admin/users com permissions [*] por operador MANAGE_USERS: 403 Forbidden (bloqueado com sucesso!)');

    // Cenário C: Operador tenta conceder permissão além do preset do papel -> 403 Forbidden
    const escalateExcessiveRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tentativa Hacker Excessivo',
        email: `hacker-excessivo-${Date.now()}@teste.com`,
        role: 'OPERATIONAL',
        permissions: ['MANAGE_USERS', 'SPECIAL_SUPER_POWER'],
      }),
    });
    assert.equal(
      escalateExcessiveRes.status,
      403,
      `Operador tentando conceder permissões além do preset deve receber 403 Forbidden, recebeu ${escalateExcessiveRes.status}`
    );
    console.log('  ✓ POST /api/admin/users com permissões excessivas: 403 Forbidden (bloqueado com sucesso!)');

    // Cenário D: Administrador autêntico consegue provisionar normalmente com 201 Created
    currentActor = {
      companyId: 'staging-company-001',
      userId: 'test-admin',
      name: 'Admin Legítimo',
      role: 'ADMIN',
      permissions: ['*'],
    };
    const legitimateAdminRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Operador Legítimo',
        email: `operador-legitimo-${Date.now()}@teste.com`,
        role: 'OPERATIONAL',
      }),
    });
    assert.equal(
      legitimateAdminRes.status,
      201,
      `Administrador deve conseguir provisionar usuário com 201 Created, recebeu ${legitimateAdminRes.status}`
    );
    console.log('  ✓ POST /api/admin/users por ADMIN legítimo: 201 Created (permitido com sucesso!)\n');

    console.log('\n=============================================================');
    console.log('AUTOERP-78: REGRESSÃO FAIL-CLOSED 100% COMPROVADA E VALIDADA!');
    console.log('=============================================================');
  } finally {
    server.close();
  }
}

runRegression()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FALHA NA REGRESSÃO AUTOERP-78:', err);
    process.exit(1);
  });
