import { createRequire } from 'node:module';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { MaintenanceAuthorityService } from '../maintenanceAuthority';
import { MaintenanceTimelineAuthorityService } from '../maintenanceTimelineAuthority';

const require = createRequire(import.meta.url);
const { Client } = require('pg') as typeof import('pg');

const companyA = 'maint-sla-1b-company-a';
const companyB = 'maint-sla-1b-company-b';
const adminAId = 'maint-sla-1b-admin-a';
const adminBId = 'maint-sla-1b-admin-b';
const vehicleA = 'maint-sla-1b-vehicle-a';
const vehicleB = 'maint-sla-1b-vehicle-b';
const roleName = 'maint_sla_1b_rls_user';
const rolePassword = 'maint-sla-1b-test-password';

const adminA: AuthenticatedPrincipal = { companyId: companyA, userId: adminAId, name: 'Timeline Admin A', role: 'ADMIN', permissions: ['*'] };
const adminB: AuthenticatedPrincipal = { companyId: companyB, userId: adminBId, name: 'Timeline Admin B', role: 'ADMIN', permissions: ['*'] };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const rows = (result: any): any[] => Array.isArray(result?.rows) ? result.rows : [];
async function scalar(query: any): Promise<number> {
  const row = rows(await db.execute(query))[0];
  return Number(row?.count ?? 0);
}

async function seed(): Promise<void> {
  await db.execute(sql`INSERT INTO companies (id,name,status,created_at,updated_at) VALUES
    (${companyA},'Timeline Company A','ACTIVE',NOW(),NOW()),
    (${companyB},'Timeline Company B','ACTIVE',NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users (id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminAId},${companyA},'Timeline Admin A','timeline-a@example.test','ADMIN',true,NOW(),NOW()),
    (${adminBId},${companyB},'Timeline Admin B','timeline-b@example.test','ADMIN',true,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles (id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES
    (${vehicleA},${companyA},'TLA1A01','TLAREN-A','AVAILABLE',10000,NOW(),NOW()),
    (${vehicleB},${companyB},'TLB1B01','TLAREN-B','AVAILABLE',20000,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
}

async function financialCounts(companyId: string): Promise<[number, number, number]> {
  return [
    await scalar(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyId}`),
    await scalar(sql`SELECT count(*)::int count FROM account_receivables WHERE company_id=${companyId}`),
    await scalar(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}`),
  ];
}

async function authorityAndIdempotency(): Promise<{ workOrderBId: string; firstEventId: string }> {
  const workOrderA = await MaintenanceAuthorityService.createWorkOrder(adminA, {
    number: 'OS-TIMELINE-A', vehicleId: vehicleA, entryKm: 10000, description: 'Synthetic timeline A',
  });
  const workOrderB = await MaintenanceAuthorityService.createWorkOrder(adminB, {
    number: 'OS-TIMELINE-B', vehicleId: vehicleB, entryKm: 20000, description: 'Synthetic timeline B',
  });

  const beforeFinance = await financialCounts(companyA);
  const first = await MaintenanceTimelineAuthorityService.register(adminA, workOrderA.id, {
    eventType: 'ENTERED_WORKSHOP', idempotencyKey: 'timeline-a-entered', note: 'Entrada sintética',
  });
  assert(!first.replayed, 'first timeline event was unexpectedly replayed');

  const replay = await MaintenanceTimelineAuthorityService.register(adminA, workOrderA.id, {
    eventType: 'ENTERED_WORKSHOP', idempotencyKey: 'timeline-a-entered', note: 'Entrada sintética',
  });
  assert(replay.replayed && replay.event.id === first.event.id, 'idempotent replay duplicated the event');

  let conflict = false;
  try {
    await MaintenanceTimelineAuthorityService.register(adminA, workOrderA.id, {
      eventType: 'ENTERED_WORKSHOP', idempotencyKey: 'timeline-a-entered', note: 'Payload diferente',
    });
  } catch { conflict = true; }
  assert(conflict, 'idempotency key accepted a different payload');

  await MaintenanceTimelineAuthorityService.register(adminA, workOrderA.id, { eventType: 'WORK_STARTED', idempotencyKey: 'timeline-a-start' });
  await MaintenanceTimelineAuthorityService.register(adminA, workOrderA.id, { eventType: 'WAITING_PARTS', idempotencyKey: 'timeline-a-parts' });
  await MaintenanceTimelineAuthorityService.register(adminA, workOrderA.id, { eventType: 'WORK_RESUMED', idempotencyKey: 'timeline-a-resume' });
  await MaintenanceTimelineAuthorityService.register(adminA, workOrderA.id, { eventType: 'TECHNICALLY_COMPLETED', idempotencyKey: 'timeline-a-complete' });
  await MaintenanceTimelineAuthorityService.register(adminA, workOrderA.id, { eventType: 'VEHICLE_RELEASED', idempotencyKey: 'timeline-a-release' });

  const timeline = await MaintenanceTimelineAuthorityService.list(companyA, workOrderA.id);
  assert(timeline.events.length === 6, `expected six persisted events, got ${timeline.events.length}`);
  assert(timeline.events[0].eventType === 'ENTERED_WORKSHOP' && timeline.events[5].eventType === 'VEHICLE_RELEASED', 'timeline is not chronological');
  assert(timeline.summary.totalElapsedMs !== null, 'released timeline must have a real total elapsed interval');

  let invalidSequence = false;
  try {
    await MaintenanceTimelineAuthorityService.register(adminB, workOrderB.id, { eventType: 'WORK_STARTED', idempotencyKey: 'timeline-b-invalid-start' });
  } catch { invalidSequence = true; }
  assert(invalidSequence, 'invalid initial transition was accepted');

  await MaintenanceTimelineAuthorityService.register(adminB, workOrderB.id, { eventType: 'ENTERED_WORKSHOP', idempotencyKey: 'timeline-b-entered' });

  let crossTenantRead = false;
  try { await MaintenanceTimelineAuthorityService.list(companyA, workOrderB.id); }
  catch { crossTenantRead = true; }
  assert(crossTenantRead, 'authority exposed another tenant work order timeline');

  const afterFinance = await financialCounts(companyA);
  assert(JSON.stringify(afterFinance) === JSON.stringify(beforeFinance), 'timeline mutated financial records');

  return { workOrderBId: workOrderB.id, firstEventId: first.event.id };
}

async function rlsAndAppendOnly(workOrderBId: string, firstEventId: string): Promise<void> {
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));
  await db.execute(sql.raw(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${roleName}`));
  await db.execute(sql.raw(`GRANT SELECT,INSERT,UPDATE,DELETE ON maintenance_work_order_events TO ${roleName}`));

  const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');
  const client = new Client({ host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1), user: roleName, password: rolePassword });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant',$1,true)`, [companyA]);
    const visible = await client.query(`SELECT company_id FROM maintenance_work_order_events`);
    assert(visible.rows.length > 0 && visible.rows.every((row: any) => row.company_id === companyA), 'RLS leaked another tenant timeline');

    let crossTenantInsert = false;
    try {
      await client.query(`INSERT INTO maintenance_work_order_events (id,company_id,work_order_id,event_type,idempotency_key,actor_user_id,actor_name) VALUES ('timeline-cross-tenant',$1,$2,'WORK_STARTED','cross-tenant','x','x')`, [companyB, workOrderBId]);
    } catch { crossTenantInsert = true; }
    assert(crossTenantInsert, 'RLS allowed cross-tenant timeline insert');
    await client.query('ROLLBACK');

    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant',$1,true)`, [companyA]);
    let updateRejected = false;
    try { await client.query(`UPDATE maintenance_work_order_events SET note='mutated' WHERE id=$1`, [firstEventId]); }
    catch { updateRejected = true; }
    assert(updateRejected, 'append-only trigger allowed timeline update');
    await client.query('ROLLBACK');

    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant',$1,true)`, [companyA]);
    let deleteRejected = false;
    try { await client.query(`DELETE FROM maintenance_work_order_events WHERE id=$1`, [firstEventId]); }
    catch { deleteRejected = true; }
    assert(deleteRejected, 'append-only trigger allowed timeline delete');
    await client.query('ROLLBACK');
  } finally {
    await client.end();
    await db.execute(sql.raw(`DROP OWNED BY ${roleName}`));
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));
  }
}

export async function runMaintenanceTimelineIntegration(): Promise<void> {
  await seed();
  const result = await authorityAndIdempotency();
  await rlsAndAppendOnly(result.workOrderBId, result.firstEventId);
  console.log('MAINT-SLA-1B persistence tenant append-only integration: PASS');
}
