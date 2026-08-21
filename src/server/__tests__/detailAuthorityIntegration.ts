import express from 'express';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { registerDetailAuthorityRoutes } from '../detailAuthorityRoutes';
import type { AuthenticatedPrincipal } from '../auth';

const require = createRequire(import.meta.url);
const { Client } = require('pg') as typeof import('pg');

const companyA = 'authority-1-company-a';
const companyB = 'authority-1-company-b';
const adminA = 'authority-1-admin-a';
const readonlyA = 'authority-1-readonly-a';
const driverA = 'authority-1-driver-a';
const driverB = 'authority-1-driver-b';
const roleName = 'authority_1_rls_user';
const rolePassword = 'authority-1-rls-password';

const admin: AuthenticatedPrincipal = {
  companyId: companyA,
  userId: adminA,
  name: 'Authority Admin',
  role: 'ADMIN',
  permissions: ['*'],
};
const readonly: AuthenticatedPrincipal = {
  companyId: companyA,
  userId: readonlyA,
  name: 'Authority Viewer',
  role: 'READONLY',
  permissions: [],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function rows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}
async function one(query: any): Promise<any> {
  return rows(await db.execute(query))[0];
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at)
    VALUES
      (${companyA},'Authority A','ACTIVE',NOW(),NOW()),
      (${companyB},'Authority B','ACTIVE',NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES
      (${adminA},${companyA},'Authority Admin','authority-admin@example.test','ADMIN',true,NOW(),NOW()),
      (${readonlyA},${companyA},'Authority Viewer','authority-view@example.test','READONLY',true,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO drivers(
      id,company_id,name,cpf,cnh,active,birth_date,phone,whatsapp,cnh_category,cnh_expiration,
      app_platforms,status,is_archived,created_at,updated_at
    ) VALUES
      (${driverA},${companyA},'Motorista Authority A','52998224725','02650306461',true,'1990-01-01','11999990001','11999990001','B','2030-01-01',ARRAY[]::text[],'ACTIVE',false,NOW(),NOW()),
      (${driverB},${companyB},'Motorista Authority B','16899535009','80187404008',true,'1991-01-01','11999990002','11999990002','B','2030-01-01',ARRAY[]::text[],'ACTIVE',false,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO audit_logs(id,company_id,user_id,action,entity_type,entity_id,changes,timestamp)
    VALUES
      ('authority-1-audit-a',${companyA},${adminA},'UPDATE','Driver',${driverA},${JSON.stringify({userName:'Authority Admin',newState:{seed:'A'}})},NOW()),
      ('authority-1-audit-b',${companyB},'authority-1-admin-b','UPDATE','Driver',${driverB},${JSON.stringify({userName:'Authority B Admin',newState:{seed:'B'}})},NOW())
    ON CONFLICT(id) DO NOTHING
  `);
}

async function httpAuthority(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const who = req.header('x-test-principal');
    if (who === 'admin') (req as any).principal = admin;
    if (who === 'readonly') (req as any).principal = readonly;
    next();
  });
  registerDetailAuthorityRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('detail authority server unavailable');
  const base = `http://127.0.0.1:${address.port}`;

  try {
    let response = await fetch(`${base}/api/detail-audit?entityName=Driver&entityId=${driverA}`);
    assert(response.status === 401, `audit no-session expected 401 got ${response.status}`);

    response = await fetch(`${base}/api/drivers/${driverA}/communications`);
    assert(response.status === 401, `communication no-session expected 401 got ${response.status}`);

    response = await fetch(`${base}/api/drivers/${driverA}/communications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-principal': 'readonly' },
      body: JSON.stringify({ type: 'CUSTOM', message: 'readonly cannot write' }),
    });
    assert(response.status === 403, `READONLY communication write expected 403 got ${response.status}`);

    response = await fetch(`${base}/api/drivers/${driverB}/communications`, {
      headers: { 'x-test-principal': 'admin' },
    });
    assert(response.status === 404, `cross-tenant driver read expected 404 got ${response.status}`);

    response = await fetch(`${base}/api/drivers/${driverB}/communications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-principal': 'admin' },
      body: JSON.stringify({ type: 'CUSTOM', message: 'cross tenant' }),
    });
    assert(response.status === 404, `cross-tenant driver write expected 404 got ${response.status}`);

    response = await fetch(`${base}/api/drivers/${driverA}/communications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-principal': 'admin' },
      body: JSON.stringify({ type: 'CUSTOM', message: 'forged', companyId: companyB }),
    });
    assert(response.status === 400, `forged authority field expected 400 got ${response.status}`);

    response = await fetch(`${base}/api/drivers/${driverA}/communications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-principal': 'admin' },
      body: JSON.stringify({ type: 'DUE_REMINDER', message: 'Lembrete de vencimento' }),
    });
    assert(response.status === 201, `valid communication expected 201 got ${response.status}`);
    const createdPayload: any = await response.json();
    const created = createdPayload.item;
    assert(created.companyId === companyA, 'communication tenant was not derived from principal');
    assert(created.driverId === driverA, 'communication driver mismatch');
    assert(created.status === 'OPENED_IN_WHATSAPP', 'communication initial status mismatch');
    assert(created.phone === '11999990001', 'communication phone must come from server driver');
    assert(typeof created.id === 'string' && created.id.length > 0, 'communication id missing');

    const dbRow = await one(sql`
      SELECT company_id,driver_id,status,created_by
      FROM communication_logs WHERE id=${created.id}
    `);
    assert(dbRow.company_id === companyA && dbRow.driver_id === driverA, 'communication persisted with wrong authority');
    assert(dbRow.created_by === adminA, 'communication created_by was not derived from principal');

    response = await fetch(`${base}/api/drivers/${driverA}/communications`, {
      headers: { 'x-test-principal': 'readonly' },
    });
    assert(response.status === 200, `READONLY communication read expected 200 got ${response.status}`);
    const listPayload: any = await response.json();
    assert(Array.isArray(listPayload.items) && listPayload.items.some((item: any) => item.id === created.id), 'communication list missing created item');

    response = await fetch(`${base}/api/communications/${created.id}/confirm-sent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-principal': 'admin' }, body: '{}',
    });
    assert(response.status === 200, `confirm communication expected 200 got ${response.status}`);
    const confirmed: any = (await response.json()).item;
    assert(confirmed.status === 'MANUALLY_CONFIRMED_SENT', 'communication confirm status mismatch');

    response = await fetch(`${base}/api/communications/${created.id}/confirm-sent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-principal': 'admin' }, body: '{}',
    });
    assert(response.status === 200, 'communication confirm should be idempotent');

    response = await fetch(`${base}/api/detail-audit?entityName=Driver&entityId=${driverA}`, {
      headers: { 'x-test-principal': 'readonly' },
    });
    assert(response.status === 200, `audit read expected 200 got ${response.status}`);
    const auditPayload: any = await response.json();
    assert(Array.isArray(auditPayload.items) && auditPayload.items.length >= 3, 'driver audit history missing server events');
    assert(auditPayload.items.every((item: any) => item.companyId === companyA && item.entityId === driverA), 'audit endpoint leaked another tenant/entity');
    assert(auditPayload.items.some((item: any) => String(item.newState || '').includes('COMMUNICATION_OPENED')), 'communication create audit missing');
    assert(auditPayload.items.some((item: any) => String(item.newState || '').includes('COMMUNICATION_MANUALLY_CONFIRMED_SENT')), 'communication confirmation audit missing');

    return created.id;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function rls(): Promise<void> {
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));
  await db.execute(sql.raw(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${roleName}`));
  await db.execute(sql.raw(`GRANT SELECT,INSERT,UPDATE ON communication_logs TO ${roleName}`));
  await db.execute(sql.raw(`GRANT SELECT ON audit_logs TO ${roleName}`));

  const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');
  const client = new Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.slice(1),
    user: roleName,
    password: rolePassword,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant',$1,true)`, [companyA]);

    const communications = await client.query('SELECT company_id FROM communication_logs');
    assert(communications.rows.every((row: any) => row.company_id === companyA), 'communication RLS leaked another tenant');
    const audits = await client.query('SELECT company_id FROM audit_logs');
    assert(audits.rows.every((row: any) => row.company_id === companyA), 'audit RLS leaked another tenant');

    let denied = false;
    try {
      await client.query(
        `INSERT INTO communication_logs(id,company_id,driver_id,type,message,status,created_by) VALUES($1,$2,$3,'CUSTOM','cross','OPENED_IN_WHATSAPP',$4)`,
        ['authority-1-cross-rls', companyB, driverB, adminA],
      );
    } catch {
      denied = true;
    }
    assert(denied, 'communication RLS allowed cross-tenant insert');
    await client.query('ROLLBACK');
  } finally {
    await client.end();
    await db.execute(sql.raw(`DROP OWNED BY ${roleName}`));
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));
  }
}

async function main(): Promise<void> {
  await seed();
  const id = await httpAuthority();
  assert(typeof id === 'string' && id.length > 0, 'communication test did not create an id');
  await rls();
  console.log('AUTHORITY-1 detail authority integration: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
