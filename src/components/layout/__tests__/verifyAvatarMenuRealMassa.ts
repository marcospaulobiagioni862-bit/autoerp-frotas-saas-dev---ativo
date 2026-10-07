import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express, { type Request, type Response, type NextFunction } from 'express';
import { Client } from 'pg';
import type { AuthenticatedPrincipal } from '../../../server/auth';

// 1. Carregar variáveis Neon ANTES de qualquer import de db ou rotas que usem Drizzle
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

// Preferir STAGING_MAIN_DATABASE_URL onde as migrações mais recentes (ex: 0085 logo_url)
// estão integralmente aplicadas, com fallback para HOMOLOG_DATABASE_URL e DATABASE_URL.
const neonUrl = process.env.STAGING_MAIN_DATABASE_URL || process.env.HOMOLOG_DATABASE_URL || process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('FATAL: Database URL is required to run real massa verification.');
  process.exit(1);
}

process.env.DATABASE_URL = neonUrl;
process.env.USE_PGLITE = 'false';
process.env.NODE_ENV = 'development';

interface DbUserRow {
  id: string;
  name: string;
  role: string;
  permissions: string[] | null;
  active: boolean;
  company_id: string;
}

async function verifyAvatarMenuRealMassa(): Promise<void> {
  console.log('=== AUTOERP-46: VERIFICAÇÃO REAL DE AUTORIDADE DO MENU DE AVATAR NA MASSA NEON ===');
  console.log('Database:', neonUrl.split('@')[1]?.split('/')[0] || 'neon');

  // Dynamic import para garantir que db/index inicialize com DATABASE_URL do Neon
  const { registerAdminUserRoutes } = await import('../../../server/adminUserRoutes');
  const { registerTenantProfileRoutes } = await import('../../../server/tenantProfileRoutes');

  // 1. Consultar e carregar usuários reais do banco Neon
  const pgClient = new Client({ connectionString: neonUrl });
  await pgClient.connect();

  const userQuery = await pgClient.query<DbUserRow>(`
    SELECT id, name, role, permissions, active, company_id
    FROM users
    WHERE id IN (
      'v2demo-ngcompany001-user-admin',
      'v2demo-ngcompany001-user-operational',
      'staging-canary-001'
    )
    ORDER BY id ASC;
  `);

  await pgClient.end();

  const usersById = new Map<string, DbUserRow>();
  for (const row of userQuery.rows) {
    usersById.set(row.id, row);
  }

  const adminDbUser = usersById.get('v2demo-ngcompany001-user-admin');
  const opDbUser = usersById.get('v2demo-ngcompany001-user-operational');
  const canaryDbUser = usersById.get('staging-canary-001');

  assert(adminDbUser, 'Ator ADMIN real (v2demo-ngcompany001-user-admin) deve existir na massa');
  assert(opDbUser, 'Ator OPERATIONAL real (v2demo-ngcompany001-user-operational) deve existir na massa');
  assert(canaryDbUser, 'Ator Canary real (staging-canary-001) deve existir na massa');

  // Validação estrita do mapeamento de papéis e permissões no banco
  assert.equal(adminDbUser.role, 'ADMIN', 'Ator admin deve ter role ADMIN');
  assert(Array.isArray(adminDbUser.permissions) && adminDbUser.permissions.includes('*'), 'Ator admin deve ter curinga *');

  assert.equal(opDbUser.role, 'OPERATIONAL', 'Ator operacional deve ter role OPERATIONAL');
  assert(Array.isArray(opDbUser.permissions), 'Ator operacional deve ter lista de permissoes explicita');
  assert(!opDbUser.permissions.includes('*'), 'Ator operacional NAO deve ter curinga *');
  assert(!opDbUser.permissions.includes('MANAGE_USERS'), 'Ator operacional NAO deve ter MANAGE_USERS');
  assert(!opDbUser.permissions.includes('MANAGE_TENANT'), 'Ator operacional NAO deve ter MANAGE_TENANT');

  assert.equal(canaryDbUser.role, 'OPERATIONAL', 'Ator canary deve ter role OPERATIONAL');
  assert(Array.isArray(canaryDbUser.permissions) && canaryDbUser.permissions.length === 0, 'Ator canary deve ter permissoes vazias');

  console.log('✓ Usuários reais validados no Neon:');
  console.log(`  - ADMIN: ${adminDbUser.id} (${adminDbUser.name}) [role=${adminDbUser.role}, permissions=${JSON.stringify(adminDbUser.permissions)}]`);
  console.log(`  - OPERATIONAL: ${opDbUser.id} (${opDbUser.name}) [role=${opDbUser.role}, permissions=${JSON.stringify(opDbUser.permissions)}]`);
  console.log(`  - CANARY: ${canaryDbUser.id} (${canaryDbUser.name}) [role=${canaryDbUser.role}, permissions=[]]`);

  // 2. Subir servidor Express com rotas reais de administração e logout
  const app = express();
  app.use(express.json());

  // Middleware de injeção de autenticação baseado no ator real
  app.use((req: Request, res: Response, next: NextFunction) => {
    const actorId = req.headers['x-actor-user-id'] as string;
    if (!actorId) {
      next();
      return;
    }
    const dbRow = usersById.get(actorId);
    if (!dbRow) {
      res.status(401).json({ error: 'Unknown actor user' });
      return;
    }

    const principal: AuthenticatedPrincipal = {
      companyId: dbRow.company_id,
      userId: dbRow.id,
      name: dbRow.name,
      role: dbRow.role,
      permissions: dbRow.permissions || [],
    };

    (req as Request & { principal?: AuthenticatedPrincipal }).principal = principal;
    next();
  });

  registerAdminUserRoutes(app);
  registerTenantProfileRoutes(app);

  // Endpoint de logout idêntico ao de server.ts (linha 558)
  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', 'autoerp_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax');
    res.status(204).end();
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // CENÁRIO 1: ATOR ADMIN REAL (v2demo-ngcompany001-user-admin)
    // -------------------------------------------------------------
    console.log('\n[CENÁRIO 1] Testando autorização do usuário ADMIN real...');

    // 1.1 GET /api/admin/users
    const adminUsersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { 'x-actor-user-id': adminDbUser.id },
    });
    assert.equal(adminUsersRes.status, 200, `ADMIN em /api/admin/users esperava 200 OK, recebeu ${adminUsersRes.status}`);
    const adminUsersData = (await adminUsersRes.json()) as { items?: any[] };
    assert(Array.isArray(adminUsersData.items), 'ADMIN deve listar items de usuários');
    assert(adminUsersData.items.length > 0, 'Deve retornar ao menos 1 usuário do tenant');
    console.log(`  ✓ GET /api/admin/users: 200 OK (${adminUsersData.items.length} usuários listados)`);

    // 1.2 GET /api/admin/tenant-profile
    const adminTenantRes = await fetch(`${baseUrl}/api/admin/tenant-profile`, {
      headers: { 'x-actor-user-id': adminDbUser.id },
    });
    assert.equal(adminTenantRes.status, 200, `ADMIN em /api/admin/tenant-profile esperava 200 OK, recebeu ${adminTenantRes.status}`);
    const adminTenantData = (await adminTenantRes.json()) as { item?: any };
    assert(adminTenantData.item, 'ADMIN deve receber o objeto item de tenant-profile');
    console.log(`  ✓ GET /api/admin/tenant-profile: 200 OK (empresa: ${adminTenantData.item.companyName || adminDbUser.company_id})`);

    // 1.3 POST /api/auth/logout
    const adminLogoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'x-actor-user-id': adminDbUser.id },
    });
    assert.equal(adminLogoutRes.status, 204, `Logout esperava 204 No Content, recebeu ${adminLogoutRes.status}`);
    assert(adminLogoutRes.headers.get('set-cookie')?.includes('Expires='), 'Logout deve enviar cookie expirado');
    console.log('  ✓ POST /api/auth/logout: 204 No Content com Set-Cookie expirado');

    // -------------------------------------------------------------
    // CENÁRIO 2: ATOR NÃO-ADMIN REAL (v2demo-ngcompany001-user-operational)
    // -------------------------------------------------------------
    console.log('\n[CENÁRIO 2] Testando bloqueio 403 Forbidden para usuário NÃO-ADMIN real...');

    // 2.1 GET /api/admin/users -> 403
    const opUsersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { 'x-actor-user-id': opDbUser.id },
    });
    assert.equal(opUsersRes.status, 403, `NÃO-ADMIN em /api/admin/users esperava 403 Forbidden, recebeu ${opUsersRes.status}`);
    const opUsersData = (await opUsersRes.json()) as { error?: string };
    assert.equal(opUsersData.error, 'Forbidden', 'Resposta deve ser Forbidden');
    console.log('  ✓ GET /api/admin/users: 403 Forbidden estritamente barrado');

    // 2.2 GET /api/admin/tenant-profile -> 403
    const opTenantRes = await fetch(`${baseUrl}/api/admin/tenant-profile`, {
      headers: { 'x-actor-user-id': opDbUser.id },
    });
    assert.equal(opTenantRes.status, 403, `NÃO-ADMIN em /api/admin/tenant-profile esperava 403 Forbidden, recebeu ${opTenantRes.status}`);
    const opTenantData = (await opTenantRes.json()) as { error?: string };
    assert.equal(opTenantData.error, 'Forbidden', 'Resposta deve ser Forbidden');
    console.log('  ✓ GET /api/admin/tenant-profile: 403 Forbidden estritamente barrado');

    // 2.3 Tentativa de PATCH /api/admin/tenant-profile -> 403
    const opTenantPatchRes = await fetch(`${baseUrl}/api/admin/tenant-profile`, {
      method: 'PATCH',
      headers: {
        'x-actor-user-id': opDbUser.id,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ companyName: 'Ataque Não-Autorizado' }),
    });
    assert.equal(opTenantPatchRes.status, 403, `NÃO-ADMIN mutando tenant esperava 403 Forbidden, recebeu ${opTenantPatchRes.status}`);
    console.log('  ✓ PATCH /api/admin/tenant-profile: 403 Forbidden em mutação não autorizada');

    // 2.4 Tentativa de PATCH /api/admin/users/:id/status -> 403
    const opUserStatusPatchRes = await fetch(`${baseUrl}/api/admin/users/${opDbUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'x-actor-user-id': opDbUser.id,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ active: false }),
    });
    assert.equal(opUserStatusPatchRes.status, 403, `NÃO-ADMIN alterando status de usuário esperava 403 Forbidden, recebeu ${opUserStatusPatchRes.status}`);
    console.log('  ✓ PATCH /api/admin/users/:id/status: 403 Forbidden em mutação de usuário');

    // 2.5 POST /api/auth/logout -> 204
    const opLogoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'x-actor-user-id': opDbUser.id },
    });
    assert.equal(opLogoutRes.status, 204, `Logout de não-ADMIN esperava 204 No Content, recebeu ${opLogoutRes.status}`);
    console.log('  ✓ POST /api/auth/logout: 204 No Content permitido para usuário não-admin');

    // -------------------------------------------------------------
    // CENÁRIO 3: ATOR CANARY COM LISTA DE PERMISSÕES VAZIA (staging-canary-001)
    // -------------------------------------------------------------
    console.log('\n[CENÁRIO 3] Testando usuário Canary (OPERATIONAL, permissions=[])');

    // 3.1 GET /api/admin/users -> 403
    const canaryUsersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { 'x-actor-user-id': canaryDbUser.id },
    });
    assert.equal(canaryUsersRes.status, 403, `Canary em /api/admin/users esperava 403 Forbidden, recebeu ${canaryUsersRes.status}`);
    console.log('  ✓ GET /api/admin/users: 403 Forbidden (papel OPERATIONAL sem permissões de admin)');

    // 3.2 GET /api/admin/tenant-profile -> 403
    const canaryTenantRes = await fetch(`${baseUrl}/api/admin/tenant-profile`, {
      headers: { 'x-actor-user-id': canaryDbUser.id },
    });
    assert.equal(canaryTenantRes.status, 403, `Canary em /api/admin/tenant-profile esperava 403 Forbidden, recebeu ${canaryTenantRes.status}`);
    console.log('  ✓ GET /api/admin/tenant-profile: 403 Forbidden (papel OPERATIONAL sem permissões de admin)');

    // -------------------------------------------------------------
    // CENÁRIO 4: REQUISIÇÃO NÃO AUTENTICADA (401 Unauthorized)
    // -------------------------------------------------------------
    console.log('\n[CENÁRIO 4] Testando requisição anônima / sem principal...');
    const unauthUsersRes = await fetch(`${baseUrl}/api/admin/users`);
    assert.equal(unauthUsersRes.status, 401, `Anônimo em /api/admin/users esperava 401, recebeu ${unauthUsersRes.status}`);

    const unauthTenantRes = await fetch(`${baseUrl}/api/admin/tenant-profile`);
    assert.equal(unauthTenantRes.status, 401, `Anônimo em /api/admin/tenant-profile esperava 401, recebeu ${unauthTenantRes.status}`);
    console.log('  ✓ 401 Unauthorized estritamente retornado para chamadas sem sessão');

    console.log('\n=== AUTOERP-46: TODAS AS VALIDAÇÕES NA MASSA REAL DO NEON PASSARAM COM SUCESSO! ===');
  } finally {
    server.close();
  }
}

verifyAvatarMenuRealMassa()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL VERIFICATION ERROR:', err);
    process.exit(1);
  });
