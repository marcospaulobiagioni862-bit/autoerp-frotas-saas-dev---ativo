import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import {
  MAX_DRIVERS_LIMIT,
  MAX_VEHICLES_LIMIT,
  TenantProfileAuthority,
  TenantProfileForbiddenError,
  TenantProfileValidationError,
} from '../tenantProfileAuthority';
import { registerTenantProfileRoutes } from '../tenantProfileRoutes';

const companyA = 'security-2q2-company-a';
const companyB = 'security-2q2-company-b';
const adminA = 'security-2q2-admin-a';
const readonlyA = 'security-2q2-readonly-a';
const adminB = 'security-2q2-admin-b';
const actorA = { companyId: companyA, userId: adminA, name: 'Q2 Admin A', role: 'ADMIN' };
const actorB = { companyId: companyB, userId: adminB, name: 'Q2 Admin B', role: 'ADMIN' };
const readonlyActor = { companyId: companyA, userId: readonlyA, name: 'Q2 Readonly A', role: 'READONLY' };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rows(query: any): Promise<any[]> {
  const result: any = await db.execute(query);
  return result.rows || [];
}

async function row(query: any): Promise<any> {
  return (await rows(query))[0];
}

async function rejects<T extends Error>(fn: () => Promise<unknown>, type: new (...args: any[]) => T): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof type, `expected ${type.name}, got ${String(error)}`);
    return;
  }
  throw new Error(`expected ${type.name}, got success`);
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM tenant_operational_configs WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA}, ${companyB})`);
  await db.execute(sql`INSERT INTO companies(id,document,name,status,created_at,updated_at) VALUES
    (${companyA},'11111111000191','Security 2Q2 Company A','ACTIVE',NOW(),NOW()),
    (${companyB},'22222222000191','Security 2Q2 Company B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,permissions,created_at,updated_at) VALUES
    (${adminA},${companyA},'Q2 Admin A','2q2-admin-a@example.test','ADMIN',true,ARRAY['*'],NOW(),NOW()),
    (${readonlyA},${companyA},'Q2 Readonly A','2q2-readonly-a@example.test','READONLY',true,ARRAY[]::text[],NOW(),NOW()),
    (${adminB},${companyB},'Q2 Admin B','2q2-admin-b@example.test','ADMIN',true,ARRAY['*'],NOW(),NOW())`);
}

async function requestServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const companyId = typeof req.headers['x-test-company'] === 'string' ? req.headers['x-test-company'] : '';
    const userId = typeof req.headers['x-test-user'] === 'string' ? req.headers['x-test-user'] : '';
    const role = typeof req.headers['x-test-role'] === 'string' ? req.headers['x-test-role'] : '';
    if (companyId && userId && role) {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
        companyId, userId, role, name: `${role} integration`, permissions: [],
      };
    }
    next();
  });
  registerTenantProfileRoutes(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'tenant profile test server unavailable');
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: async () => await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export async function runTenantProfileAuthorityIntegration(): Promise<void> {
  await seed();

  const firstReads = await Promise.all([
    TenantProfileAuthority.get(actorA),
    TenantProfileAuthority.get(actorA),
  ]);
  assert(firstReads[0].companyId === companyA && firstReads[1].companyId === companyA, 'concurrent defaults returned wrong tenant');
  assert(firstReads[0].document === '11111111000191', 'company document must come from PostgreSQL');
  assert(firstReads[0].timezone === 'America/Sao_Paulo' && firstReads[0].currency === 'BRL', 'deterministic defaults missing');
  const configCount = await row(sql`SELECT COUNT(*)::int AS count FROM tenant_operational_configs WHERE company_id=${companyA}`);
  assert(Number(configCount.count) === 1, 'concurrent reads must converge to one config row');
  const createAudits = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TenantOperationalConfig' AND action='CREATE'`);
  assert(Number(createAudits.count) === 1, 'default creation must be audited exactly once');

  const profileB = await TenantProfileAuthority.get(actorB);
  assert(profileB.document === '22222222000191' && profileB.companyName.includes('Company B'), 'tenant B profile not isolated');
  await rejects(() => TenantProfileAuthority.get(readonlyActor), TenantProfileForbiddenError);
  await rejects(() => TenantProfileAuthority.update(readonlyActor, { companyName: 'Forbidden' }), TenantProfileForbiddenError);

  const beforeInvalid = await row(sql`SELECT name,updated_at FROM companies WHERE id=${companyA}`);
  const invalidInputs = [
    { timezone: 'Invalid/Timezone' },
    { currency: 'USD' },
    { maxVehiclesLimit: -1 },
    { maxVehiclesLimit: 1.5 },
    { maxVehiclesLimit: MAX_VEHICLES_LIMIT + 1 },
    { maxDriversLimit: MAX_DRIVERS_LIMIT + 1 },
    { document: 'forged' } as any,
    { companyId: companyB } as any,
  ];
  for (const input of invalidInputs) {
    await rejects(() => TenantProfileAuthority.update(actorA, input), TenantProfileValidationError);
  }
  const afterInvalid = await row(sql`SELECT name,updated_at FROM companies WHERE id=${companyA}`);
  assert(afterInvalid.name === beforeInvalid.name && String(afterInvalid.updated_at) === String(beforeInvalid.updated_at), 'invalid updates must perform zero company writes');

  const updated = await TenantProfileAuthority.update(actorA, {
    companyName: 'MoveFlex Locação de Veículos',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    maxVehiclesLimit: 750,
    maxDriversLimit: 1500,
  });
  assert(updated.companyName === 'MoveFlex Locação de Veículos', 'company name update missing');
  assert(updated.document === '11111111000191', 'document must remain unchanged');
  assert(updated.maxVehiclesLimit === 750 && updated.maxDriversLimit === 1500, 'operational limits not persisted');
  assert(updated.updatedBy === adminA, 'actor must come from authenticated principal');
  const foreignCompany = await row(sql`SELECT name,document FROM companies WHERE id=${companyB}`);
  assert(foreignCompany.name === 'Security 2Q2 Company B' && foreignCompany.document === '22222222000191', 'tenant B must remain unchanged');
  const updateAuditBeforeNoop = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TenantOperationalConfig' AND action='UPDATE'`);
  assert(Number(updateAuditBeforeNoop.count) === 1, 'valid update must append one audit');

  await TenantProfileAuthority.update(actorA, {
    companyName: updated.companyName,
    timezone: updated.timezone,
    currency: updated.currency,
    maxVehiclesLimit: updated.maxVehiclesLimit,
    maxDriversLimit: updated.maxDriversLimit,
  });
  const updateAuditAfterNoop = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TenantOperationalConfig' AND action='UPDATE'`);
  assert(Number(updateAuditAfterNoop.count) === 1, 'no-op update must not append audit');

  const http = await requestServer();
  try {
    let response = await fetch(`${http.base}/api/admin/tenant-profile`);
    assert(response.status === 401, `unauthenticated GET expected 401, got ${response.status}`);
    response = await fetch(`${http.base}/api/admin/tenant-profile`, { headers: {
      'x-test-company': companyA, 'x-test-user': readonlyA, 'x-test-role': 'READONLY',
    }});
    assert(response.status === 403, `non-admin GET expected 403, got ${response.status}`);
    response = await fetch(`${http.base}/api/admin/tenant-profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN' },
      body: JSON.stringify({ companyId: companyB, document: 'forged', companyName: 'Forged' }),
    });
    assert(response.status === 400, `forged authority fields expected 400, got ${response.status}`);
    response = await fetch(`${http.base}/api/admin/tenant-profile`, { headers: {
      'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN',
    }});
    assert(response.status === 200, `ADMIN GET expected 200, got ${response.status}`);
    const body: any = await response.json();
    assert(body.item.companyId === companyA && body.item.document === '11111111000191', 'HTTP response leaked or forged tenant');
  } finally {
    await http.close();
  }

  console.log('SECURITY-2Q2 PostgreSQL tenant profile authority integration: PASS');
}

if (process.argv[1]?.includes('tenantProfileAuthorityIntegration')) {
  runTenantProfileAuthorityIntegration().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

