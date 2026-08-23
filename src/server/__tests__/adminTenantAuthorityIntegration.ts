import { sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  AdminTenantAuthority,
  AdminTenantForbiddenError,
  AdminTenantValidationError,
  TENANT_PROFILE_DEFAULTS,
} from '../adminTenantAuthority';

const companyA = 'security-2q2-company-a';
const companyB = 'security-2q2-company-b';
const adminA = 'security-2q2-admin-a';
const readonlyA = 'security-2q2-readonly-a';
const adminB = 'security-2q2-admin-b';

const actorA = { companyId: companyA, userId: adminA, name: 'Admin A', role: 'ADMIN' };
const actorB = { companyId: companyB, userId: adminB, name: 'Admin B', role: 'ADMIN' };
const readonlyActor = { companyId: companyA, userId: readonlyA, name: 'Readonly A', role: 'READONLY' };

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
async function rejects<T extends Error>(fn: () => Promise<unknown>, type: new (...args: any[]) => T): Promise<T> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof type, `expected ${type.name}, got ${String(error)}`);
    return error;
  }
  throw new Error(`expected ${type.name}, got success`);
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM tenant_operational_configs WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA}, ${companyB})`);
  await db.execute(sql`INSERT INTO companies(id,document,name,status,created_at,updated_at) VALUES
    (${companyA},'11111111000191','Empresa A Original','ACTIVE',NOW(),NOW()),
    (${companyB},'22222222000182','Empresa B Original','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,permissions,created_at,updated_at) VALUES
    (${adminA},${companyA},'Admin A','2q2-admin-a@example.test','ADMIN',true,ARRAY['*'],NOW(),NOW()),
    (${readonlyA},${companyA},'Readonly A','2q2-readonly-a@example.test','READONLY',true,ARRAY['FLEET_READ'],NOW(),NOW()),
    (${adminB},${companyB},'Admin B','2q2-admin-b@example.test','ADMIN',true,ARRAY['*'],NOW(),NOW())`);
}

export async function runAdminTenantAuthorityIntegration(): Promise<void> {
  await seed();

  await rejects(() => AdminTenantAuthority.get(readonlyActor), AdminTenantForbiddenError);
  await rejects(() => AdminTenantAuthority.update(readonlyActor, { companyName: 'Nope' }), AdminTenantForbiddenError);

  const [firstA, concurrentA] = await Promise.all([
    AdminTenantAuthority.get(actorA),
    AdminTenantAuthority.get(actorA),
  ]);
  assert(firstA.companyId === companyA && concurrentA.companyId === companyA, 'tenant A ADMIN must read tenant A only');
  assert(firstA.companyName === 'Empresa A Original', 'company name must come from authoritative companies row');
  assert(firstA.document === '11111111000191', 'read-only document must come from authoritative companies row');
  assert(firstA.timezone === TENANT_PROFILE_DEFAULTS.timezone, 'first read must materialize canonical timezone default');
  assert(firstA.currency === TENANT_PROFILE_DEFAULTS.currency, 'first read must materialize canonical currency default');
  assert(firstA.maxVehiclesLimit === TENANT_PROFILE_DEFAULTS.maxVehiclesLimit, 'first read must materialize canonical vehicle limit');
  assert(firstA.maxDriversLimit === TENANT_PROFILE_DEFAULTS.maxDriversLimit, 'first read must materialize canonical driver limit');

  const configCount = await row(sql`SELECT COUNT(*)::int AS count FROM tenant_operational_configs WHERE company_id=${companyA}`);
  assert(Number(configCount.count) === 1, 'concurrent first reads must converge to exactly one tenant config row');
  const createAuditCount = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TENANT_OPERATIONAL_CONFIG' AND action='CREATE'`);
  assert(Number(createAuditCount.count) === 1, 'default materialization must be audited exactly once');

  const profileB = await AdminTenantAuthority.get(actorB);
  assert(profileB.companyId === companyB && profileB.companyName === 'Empresa B Original', 'tenant B profile must remain isolated');
  assert(profileB.document === '22222222000182', 'tenant B document must not leak into tenant A');

  const beforeUpdateAudits = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TENANT_OPERATIONAL_CONFIG'`);
  const updated = await AdminTenantAuthority.update(actorA, {
    companyName: 'Empresa A Atualizada',
    timezone: 'America/Fortaleza',
    currency: 'BRL',
    maxVehiclesLimit: 6000,
    maxDriversLimit: 12000,
  });
  assert(updated.companyName === 'Empresa A Atualizada', 'company name update did not persist in response');
  assert(updated.timezone === 'America/Fortaleza', 'timezone update did not persist in response');
  assert(updated.maxVehiclesLimit === 6000 && updated.maxDriversLimit === 12000, 'limits update did not persist in response');
  assert(updated.document === '11111111000191', 'login-critical document must remain unchanged');

  const companyPersisted = await row(sql`SELECT name,document FROM companies WHERE id=${companyA}`);
  const configPersisted = await row(sql`SELECT timezone,currency,max_vehicles_limit,max_drivers_limit,updated_by FROM tenant_operational_configs WHERE company_id=${companyA}`);
  assert(companyPersisted?.name === 'Empresa A Atualizada' && companyPersisted?.document === '11111111000191', 'company update must be atomic without document mutation');
  assert(configPersisted?.timezone === 'America/Fortaleza' && configPersisted?.currency === 'BRL', 'tenant config values not persisted');
  assert(Number(configPersisted?.max_vehicles_limit) === 6000 && Number(configPersisted?.max_drivers_limit) === 12000, 'tenant limits not persisted');
  assert(configPersisted?.updated_by === adminA, 'authenticated actor must be persisted as updater');

  const afterUpdateAudits = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TENANT_OPERATIONAL_CONFIG'`);
  assert(Number(afterUpdateAudits.count) === Number(beforeUpdateAudits.count) + 1, 'valid update must append exactly one audit');

  const beforeNoopAudits = Number(afterUpdateAudits.count);
  const noop = await AdminTenantAuthority.update(actorA, {
    companyName: updated.companyName,
    timezone: updated.timezone,
    currency: updated.currency,
    maxVehiclesLimit: updated.maxVehiclesLimit,
    maxDriversLimit: updated.maxDriversLimit,
  });
  assert(noop.companyName === updated.companyName, 'no-op update should return current profile');
  const afterNoopAudits = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TENANT_OPERATIONAL_CONFIG'`);
  assert(Number(afterNoopAudits.count) === beforeNoopAudits, 'no-op update must not append audit');

  const invalidCases = [
    () => AdminTenantAuthority.update(actorA, { timezone: 'Mars/Olympus' }),
    () => AdminTenantAuthority.update(actorA, { currency: 'USD' }),
    () => AdminTenantAuthority.update(actorA, { maxVehiclesLimit: -1 }),
    () => AdminTenantAuthority.update(actorA, { maxDriversLimit: 1.5 }),
    () => AdminTenantAuthority.update(actorA, { maxVehiclesLimit: 2_147_483_648 }),
  ];
  for (const invalid of invalidCases) await rejects(invalid, AdminTenantValidationError);

  const afterInvalidCompany = await row(sql`SELECT name,document FROM companies WHERE id=${companyA}`);
  const afterInvalidConfig = await row(sql`SELECT timezone,currency,max_vehicles_limit,max_drivers_limit FROM tenant_operational_configs WHERE company_id=${companyA}`);
  const afterInvalidAudits = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TENANT_OPERATIONAL_CONFIG'`);
  assert(afterInvalidCompany?.name === 'Empresa A Atualizada' && afterInvalidCompany?.document === '11111111000191', 'invalid updates must leave company unchanged');
  assert(afterInvalidConfig?.timezone === 'America/Fortaleza' && afterInvalidConfig?.currency === 'BRL', 'invalid updates must leave config unchanged');
  assert(Number(afterInvalidConfig?.max_vehicles_limit) === 6000 && Number(afterInvalidConfig?.max_drivers_limit) === 12000, 'invalid limit updates must leave config unchanged');
  assert(Number(afterInvalidAudits.count) === beforeNoopAudits, 'invalid updates must append zero audit records');

  const bAfterAUpdate = await AdminTenantAuthority.get(actorB);
  assert(bAfterAUpdate.companyName === 'Empresa B Original' && bAfterAUpdate.document === '22222222000182', 'tenant A mutation must not affect tenant B');

  console.log('SECURITY-2Q2 PostgreSQL tenant profile authority integration: PASS');
}

if (process.argv[1]?.includes('adminTenantAuthorityIntegration')) {
  runAdminTenantAuthorityIntegration().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
