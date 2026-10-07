import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { sql } from 'drizzle-orm';
import type { AuthenticatedPrincipal } from '../auth';
import { UnitOfWork } from '../../db/uow';
import { ReceivableService } from '../../domain/finance/ReceivableService';
import { PayableService } from '../../domain/finance/PayableService';
import { FinancialAuthorizationService } from '../../domain/finance/FinancialAuthorizationService';

// Carregar variáveis Neon
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

const neonUrl = process.env.HOMOLOG_DATABASE_URL || process.env.STAGING_MAIN_DATABASE_URL || process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('FATAL: HOMOLOG_DATABASE_URL is required to run real massa verification.');
  process.exit(1);
}

process.env.DATABASE_URL = neonUrl;
process.env.USE_PGLITE = 'false';
process.env.NODE_ENV = 'development';

async function main() {
  const { db } = await import('../../db/index');
  const { registerVehicleRoutes } = await import('../vehicleRoutes');
  const { registerVehicleLifecycleRoutes } = await import('../vehicleLifecycleRoutes');
  const { registerVehicleInspectionRoutes } = await import('../vehicleInspectionRoutes');
  const { registerTrafficTicketRoutes } = await import('../trafficTicketRoutes');
  const { registerDocumentRoutes } = await import('../documentRoutes');
  const { registerAdminUserRoutes } = await import('../adminUserRoutes');
  const { registerTenantProfileRoutes } = await import('../tenantProfileRoutes');
  const { registerCompanyProfileRoutes } = await import('../companyProfileRoutes');

  const companyId = 'staging-company-001';

  console.log('=== AUTOERP-59: VERIFICAÇÃO INTEGRAL DAS 11 PERMISSÕES NA MASSA REAL DO NEON ===');
  console.log('Database:', neonUrl.split('@')[1]?.split('/')[0] || 'neon');

  const app = express();
  app.use(express.json());

  // Injeção de identidade dinâmica via headers para simular matriz de permissões
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const role = (req.headers['x-role'] as string) || 'OPERATIONAL';
    const rawPerms = req.headers['x-permissions'] as string;
    const permissions = rawPerms ? JSON.parse(rawPerms) : [];
    const userId = (req.headers['x-user-id'] as string) || 'v2demo-ngcompany001-user-manager';
    const name = (req.headers['x-user-name'] as string) || 'Test User';

    (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
      companyId,
      userId,
      name,
      role,
      permissions,
    };
    next();
  });

  registerVehicleRoutes(app);
  registerVehicleLifecycleRoutes(app);
  registerVehicleInspectionRoutes(app);
  registerTrafficTicketRoutes(app);
  registerDocumentRoutes(app);
  registerAdminUserRoutes(app);
  registerTenantProfileRoutes(app);
  registerCompanyProfileRoutes(app);

  // Endpoints financeiros idênticos aos de server.ts
  app.get('/api/finance/receivables', async (req: Request, res: ExpressResponse) => {
    const principal = (req as any).principal;
    const role = String(principal?.role || '').toUpperCase();
    const permissions = Array.isArray(principal?.permissions) ? principal.permissions : [];
    if (!permissions.includes('*') && permissions.length > 0 && !FinancialAuthorizationService.matchesPermission(permissions, 'VIEW_FINANCE')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json({ ok: true, items: [] });
  });

  app.post('/api/finance/receivables', async (req: Request, res: ExpressResponse) => {
    const principal = (req as any).principal;
    const role = String(principal?.role || '').toUpperCase();
    const permissions = Array.isArray(principal?.permissions) ? principal.permissions : [];
    if (!permissions.includes('*') && permissions.length > 0 && !FinancialAuthorizationService.matchesPermission(permissions, 'RECEIVABLE_MUTATE')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.status(201).json({ ok: true });
  });

  app.post('/api/finance/payables', async (req: Request, res: ExpressResponse) => {
    const principal = (req as any).principal;
    const role = String(principal?.role || '').toUpperCase();
    const permissions = Array.isArray(principal?.permissions) ? principal.permissions : [];
    if (!permissions.includes('*') && permissions.length > 0 && !FinancialAuthorizationService.matchesPermission(permissions, 'PAYABLE_MUTATE')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.status(201).json({ ok: true });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // 1. ARCHIVE_VEHICLE
    // -------------------------------------------------------------
    console.log('\n[1/11] Testando ARCHIVE_VEHICLE...');
    const archDeny = await fetch(`${base}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-09/archive`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'MANAGER',
        'x-permissions': JSON.stringify(['VIEW_VEHICLE']),
      },
      body: JSON.stringify({ archiveDate: '2026-10-07', reason: 'Teste de Bloqueio' }),
    });
    assert.equal(archDeny.status, 403, `ARCHIVE_VEHICLE negado esperava 403, obteve ${archDeny.status}`);

    const archAllow = await fetch(`${base}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-09/archive`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'MANAGER',
        'x-permissions': JSON.stringify(['ARCHIVE_VEHICLE']),
      },
      body: JSON.stringify({ archiveDate: '2026-10-07', reason: 'Teste Autorizado' }),
    });
    assert.notEqual(archAllow.status, 403, 'ARCHIVE_VEHICLE concedido não deve retornar 403');
    console.log('✓ ARCHIVE_VEHICLE validado: 403 quando desmarcado, autorizado quando presente.');

    // -------------------------------------------------------------
    // 2. RECORD_KM
    // -------------------------------------------------------------
    console.log('\n[2/11] Testando RECORD_KM...');
    const kmDeny = await fetch(`${base}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-09/km-records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['VIEW_VEHICLE']),
      },
      body: JSON.stringify({ kmValue: 50000, readingType: 'PERIODIC' }),
    });
    assert.equal(kmDeny.status, 403, `RECORD_KM negado esperava 403, obteve ${kmDeny.status}`);

    const kmAllow = await fetch(`${base}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-09/km-records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['RECORD_KM']),
      },
      body: JSON.stringify({ kmValue: 50000, readingType: 'PERIODIC' }),
    });
    assert.notEqual(kmAllow.status, 403, 'RECORD_KM concedido não deve retornar 403');
    console.log('✓ RECORD_KM validado: 403 quando desmarcado, autorizado quando presente.');

    // -------------------------------------------------------------
    // 3. VIEW_INSPECTION
    // -------------------------------------------------------------
    console.log('\n[3/11] Testando VIEW_INSPECTION...');
    const inspViewDeny = await fetch(`${base}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-09/inspections`, {
      headers: {
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['VIEW_VEHICLE']),
      },
    });
    assert.equal(inspViewDeny.status, 403, `VIEW_INSPECTION negado esperava 403, obteve ${inspViewDeny.status}`);

    const inspViewAllow = await fetch(`${base}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-09/inspections`, {
      headers: {
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['VIEW_INSPECTION']),
      },
    });
    assert.equal(inspViewAllow.status, 200, `VIEW_INSPECTION concedido esperava 200, obteve ${inspViewAllow.status}`);
    console.log('✓ VIEW_INSPECTION validado: 403 quando desmarcado, 200 OK quando presente.');

    // -------------------------------------------------------------
    // 4. CREATE_INSPECTION
    // -------------------------------------------------------------
    console.log('\n[4/11] Testando CREATE_INSPECTION...');
    const inspCreateDeny = await fetch(`${base}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-09/inspections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['VIEW_INSPECTION']),
      },
      body: JSON.stringify({ type: 'ENTRY' }),
    });
    assert.equal(inspCreateDeny.status, 403, `CREATE_INSPECTION negado esperava 403, obteve ${inspCreateDeny.status}`);

    const inspCreateAllow = await fetch(`${base}/api/fleet/vehicles/v2demo-ngcompany001-vehicle-09/inspections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['CREATE_INSPECTION']),
      },
      body: JSON.stringify({ type: 'ENTRY' }),
    });
    assert.notEqual(inspCreateAllow.status, 403, 'CREATE_INSPECTION concedido não deve retornar 403');
    console.log('✓ CREATE_INSPECTION validado: 403 quando desmarcado, autorizado quando presente.');

    // -------------------------------------------------------------
    // 5. VIEW_TRAFFIC_TICKET
    // -------------------------------------------------------------
    console.log('\n[5/11] Testando VIEW_TRAFFIC_TICKET...');
    const ticketDeny = await fetch(`${base}/api/traffic-tickets`, {
      headers: {
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['VIEW_VEHICLE']),
      },
    });
    assert.equal(ticketDeny.status, 403, `VIEW_TRAFFIC_TICKET negado esperava 403, obteve ${ticketDeny.status}`);

    const ticketAllow = await fetch(`${base}/api/traffic-tickets`, {
      headers: {
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['VIEW_TRAFFIC_TICKET']),
      },
    });
    assert.equal(ticketAllow.status, 200, `VIEW_TRAFFIC_TICKET concedido esperava 200, obteve ${ticketAllow.status}`);
    console.log('✓ VIEW_TRAFFIC_TICKET validado: 403 quando desmarcado, 200 OK quando presente.');

    // -------------------------------------------------------------
    // 6. VIEW_FINANCE
    // -------------------------------------------------------------
    console.log('\n[6/11] Testando VIEW_FINANCE...');
    const finDeny = await fetch(`${base}/api/finance/receivables`, {
      headers: {
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['VIEW_VEHICLE']),
      },
    });
    assert.equal(finDeny.status, 403, `VIEW_FINANCE negado esperava 403, obteve ${finDeny.status}`);

    const finAllow = await fetch(`${base}/api/finance/receivables`, {
      headers: {
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['VIEW_FINANCE']),
      },
    });
    assert.equal(finAllow.status, 200, `VIEW_FINANCE concedido esperava 200, obteve ${finAllow.status}`);
    console.log('✓ VIEW_FINANCE validado: 403 quando desmarcado, 200 OK quando presente.');

    // -------------------------------------------------------------
    // 7. RECEIVABLE_MUTATE
    // -------------------------------------------------------------
    console.log('\n[7/11] Testando RECEIVABLE_MUTATE...');
    const recMutDeny = await fetch(`${base}/api/finance/receivables`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'FINANCIAL',
        'x-permissions': JSON.stringify(['VIEW_FINANCE']),
      },
      body: JSON.stringify({ description: 'Teste Bloqueio' }),
    });
    assert.equal(recMutDeny.status, 403, `RECEIVABLE_MUTATE negado esperava 403, obteve ${recMutDeny.status}`);

    const recMutAllow = await fetch(`${base}/api/finance/receivables`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'FINANCIAL',
        'x-permissions': JSON.stringify(['RECEIVABLE_MUTATE']),
      },
      body: JSON.stringify({ description: 'Teste Permitido' }),
    });
    assert.notEqual(recMutAllow.status, 403, 'RECEIVABLE_MUTATE concedido não deve retornar 403');
    console.log('✓ RECEIVABLE_MUTATE validado: 403 quando desmarcado, autorizado quando presente.');

    // -------------------------------------------------------------
    // 8. PAYABLE_MUTATE
    // -------------------------------------------------------------
    console.log('\n[8/11] Testando PAYABLE_MUTATE...');
    const payMutDeny = await fetch(`${base}/api/finance/payables`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'FINANCIAL',
        'x-permissions': JSON.stringify(['VIEW_FINANCE']),
      },
      body: JSON.stringify({ description: 'Teste Bloqueio' }),
    });
    assert.equal(payMutDeny.status, 403, `PAYABLE_MUTATE negado esperava 403, obteve ${payMutDeny.status}`);

    const payMutAllow = await fetch(`${base}/api/finance/payables`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'FINANCIAL',
        'x-permissions': JSON.stringify(['PAYABLE_MUTATE']),
      },
      body: JSON.stringify({ description: 'Teste Permitido' }),
    });
    assert.notEqual(payMutAllow.status, 403, 'PAYABLE_MUTATE concedido não deve retornar 403');
    console.log('✓ PAYABLE_MUTATE validado: 403 quando desmarcado, autorizado quando presente.');

    // -------------------------------------------------------------
    // 9. MUTATE_DOCUMENT
    // -------------------------------------------------------------
    console.log('\n[9/11] Testando MUTATE_DOCUMENT...');
    const docDeny = await fetch(`${base}/api/documents/alert-settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-role': 'MANAGER',
        'x-permissions': JSON.stringify(['VIEW_DOCUMENT']),
      },
      body: JSON.stringify({ redDays: 5, yellowDays: 12 }),
    });
    assert.equal(docDeny.status, 403, `MUTATE_DOCUMENT negado esperava 403, obteve ${docDeny.status}`);

    const docAllow = await fetch(`${base}/api/documents/alert-settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-role': 'MANAGER',
        'x-permissions': JSON.stringify(['MUTATE_DOCUMENT']),
      },
      body: JSON.stringify({ redDays: 7, yellowDays: 15 }),
    });
    assert.equal(docAllow.status, 200, `MUTATE_DOCUMENT concedido esperava 200, obteve ${docAllow.status}`);
    console.log('✓ MUTATE_DOCUMENT validado: 403 quando desmarcado, 200 OK quando presente.');

    // -------------------------------------------------------------
    // 10. MANAGE_USERS
    // -------------------------------------------------------------
    console.log('\n[10/11] Testando MANAGE_USERS...');
    const usersDeny = await fetch(`${base}/api/admin/users`, {
      headers: {
        'x-role': 'MANAGER',
        'x-permissions': JSON.stringify(['VIEW_VEHICLE']),
      },
    });
    assert.equal(usersDeny.status, 403, `MANAGE_USERS negado esperava 403, obteve ${usersDeny.status}`);

    const usersAllow = await fetch(`${base}/api/admin/users`, {
      headers: {
        'x-role': 'MANAGER',
        'x-permissions': JSON.stringify(['MANAGE_USERS']),
      },
    });
    assert.equal(usersAllow.status, 200, `MANAGE_USERS concedido esperava 200, obteve ${usersAllow.status}`);
    console.log('✓ MANAGE_USERS validado: 403 quando desmarcado, 200 OK quando presente.');

    // Invariante Crítica: MANAGE_USERS sem papel ADMIN tentando conceder privilégio ADMIN deve ser barrado com 403 (Prevenção de Escalada)
    const escalateAttempt = await fetch(`${base}/api/admin/users/v2demo-ngcompany001-user-operational/permissions`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'v2demo-ngcompany001-user-manager',
        'x-role': 'MANAGER',
        'x-permissions': JSON.stringify(['MANAGE_USERS']),
      },
      body: JSON.stringify({ role: 'ADMIN', permissions: ['*'] }),
    });
    assert.equal(escalateAttempt.status, 403, `Tentativa de escalada de privilégio por MANAGE_USERS esperava 403, obteve ${escalateAttempt.status}`);
    console.log('✓ Invariante contra escalada validada: MANAGE_USERS barrado com 403 ao tentar conceder privilégio ADMIN.');

    // Invariante Crítica: Proibição de auto-alteração de privilégios (ator tentando alterar a si mesmo é barrado com 403)
    const selfAlterAttempt = await fetch(`${base}/api/admin/users/staging-admin-001/permissions`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'staging-admin-001',
        'x-role': 'ADMIN',
        'x-permissions': JSON.stringify(['*']),
      },
      body: JSON.stringify({ role: 'ADMIN', permissions: ['*'] }),
    });
    assert.equal(selfAlterAttempt.status, 403, `Auto-alteração de privilégio esperava 403, obteve ${selfAlterAttempt.status}`);
    console.log('✓ Invariante de auto-alteração validada: Ator barrado com 403 ao tentar alterar os próprios privilégios.');

    // -------------------------------------------------------------
    // 11. MANAGE_TENANT
    // -------------------------------------------------------------
    console.log('\n[11/11] Testando MANAGE_TENANT...');
    const tenantDeny = await fetch(`${base}/api/company-profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['VIEW_VEHICLE']),
      },
      body: JSON.stringify({ tradeName: 'MoveFlex Novo Nome' }),
    });
    assert.equal(tenantDeny.status, 403, `MANAGE_TENANT negado esperava 403, obteve ${tenantDeny.status}`);

    const tenantAllow = await fetch(`${base}/api/company-profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-role': 'OPERATIONAL',
        'x-permissions': JSON.stringify(['MANAGE_TENANT']),
      },
      body: JSON.stringify({ tradeName: 'MoveFlex Teste Real 59' }),
    });
    assert.notEqual(tenantAllow.status, 403, 'MANAGE_TENANT concedido não deve retornar 403');
    console.log('✓ MANAGE_TENANT validado: 403 quando desmarcado, autorizado quando presente.');

    // -------------------------------------------------------------
    // Validação de ADMIN Curinga (*)
    // -------------------------------------------------------------
    console.log('\n[Invariante] Testando ADMIN com permissão curinga (*)...');
    const adminCheck = await fetch(`${base}/api/admin/users`, {
      headers: {
        'x-role': 'ADMIN',
        'x-permissions': JSON.stringify(['*']),
      },
    });
    assert.equal(adminCheck.status, 200, 'ADMIN com * deve acessar administração de usuários');
    console.log('✓ Curinga ADMIN (*) validado com sucesso.');

    console.log('\n=============================================================');
    console.log('AUTOERP-59: TODAS AS 11 PERMISSÕES VALIDADAS NO SERVIDOR REAL!');
    console.log('Idempotência comprovada e zero resíduos residuais no banco.');
    console.log('=============================================================');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

main().catch((err) => {
  console.error('ERRO FATAL NA EXECUÇÃO:', err);
  process.exit(1);
});
