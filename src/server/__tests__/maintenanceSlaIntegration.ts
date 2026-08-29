import { createRequire } from 'node:module';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { MaintenanceAuthorityService } from '../maintenanceAuthority';
import { MaintenanceSlaAuthorityService } from '../maintenanceSlaAuthority';
import { MaintenanceTimelineAuthorityService } from '../maintenanceTimelineAuthority';

const require = createRequire(import.meta.url);
const { Client } = require('pg') as typeof import('pg');

const companyA = 'maint-sla-1c-company-a';
const companyB = 'maint-sla-1c-company-b';
const adminAId = 'maint-sla-1c-admin-a';
const adminBId = 'maint-sla-1c-admin-b';
const vehicleA = 'maint-sla-1c-vehicle-a';
const vehicleB = 'maint-sla-1c-vehicle-b';
const roleName = 'maint_sla_1c_rls_user';
const rolePassword = 'maint-sla-1c-test-password';

const adminA: AuthenticatedPrincipal = { companyId: companyA, userId: adminAId, name: 'SLA Admin A', role: 'ADMIN', permissions: ['*'] };
const adminB: AuthenticatedPrincipal = { companyId: companyB, userId: adminBId, name: 'SLA Admin B', role: 'ADMIN', permissions: ['*'] };

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
    (${companyA},'SLA Company A','ACTIVE',NOW(),NOW()),
    (${companyB},'SLA Company B','ACTIVE',NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users (id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminAId},${companyA},'SLA Admin A','sla-a@example.test','ADMIN',true,NOW(),NOW()),
    (${adminBId},${companyB},'SLA Admin B','sla-b@example.test','ADMIN',true,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles (id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES
    (${vehicleA},${companyA},'SLA1A01','SLAREN-A','AVAILABLE',10000,NOW(),NOW()),
    (${vehicleB},${companyB},'SLB1B01','SLAREN-B','AVAILABLE',20000,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
}

async function financialCounts(companyId: string): Promise<[number, number, number]> {
  return [
    await scalar(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyId}`),
    await scalar(sql`SELECT count(*)::int count FROM account_receivables WHERE company_id=${companyId}`),
    await scalar(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}`),
  ];
}

async function authorityFlow(): Promise<{ workOrderAId: string; workOrderBId: string; reasonId: string }> {
  const workOrderA = await MaintenanceAuthorityService.createWorkOrder(adminA, {
    number: 'OS-SLA-A', vehicleId: vehicleA, entryKm: 10000, description: 'Synthetic SLA A',
  });
  const workOrderB = await MaintenanceAuthorityService.createWorkOrder(adminB, {
    number: 'OS-SLA-B', vehicleId: vehicleB, entryKm: 20000, description: 'Synthetic SLA B',
  });

  const beforeFinance = await financialCounts(companyA);
  const empty = await MaintenanceSlaAuthorityService.get(companyA, workOrderA.id);
  assert(empty.projection.status === 'SEM_SLA', 'new work order must not invent an SLA');

  const configured = await MaintenanceSlaAuthorityService.setExpectedDuration(adminA, workOrderA.id, 1);
  assert(configured.projection.expectedDurationMinutes === 1, 'explicit SLA was not persisted');

  await MaintenanceTimelineAuthorityService.register(adminA, workOrderA.id, {
    eventType: 'ENTERED_WORKSHOP', idempotencyKey: 'sla-a-entered',
  });

  await db.execute(sql`
    UPDATE maintenance_work_order_events
    SET occurred_at=now()-interval '2 minutes'
    WHERE company_id=${companyA} AND work_order_id=${workOrderA.id} AND event_type='ENTERED_WORKSHOP'
  `).catch(() => undefined);

  let delayConflict = false;
  try {
    await MaintenanceSlaAuthorityService.addDelayReason(adminB, workOrderB.id, 'Ainda não atrasada');
  } catch { delayConflict = true; }
  assert(delayConflict, 'delay reason was accepted without an overdue authoritative SLA');

  const projection = await MaintenanceSlaAuthorityService.get(companyA, workOrderA.id);
  if (projection.projection.status !== 'ATRASADO') {
    await db.execute(sql.raw(`ALTER TABLE maintenance_work_order_events DISABLE TRIGGER maintenance_work_order_events_append_only`));
    try {
      await db.execute(sql`UPDATE maintenance_work_order_events SET occurred_at=now()-interval '2 minutes' WHERE company_id=${companyA} AND work_order_id=${workOrderA.id} AND event_type='ENTERED_WORKSHOP'`);
    } finally {
      await db.execute(sql.raw(`ALTER TABLE maintenance_work_order_events ENABLE TRIGGER maintenance_work_order_events_append_only`));
    }
  }

  const late = await MaintenanceSlaAuthorityService.get(companyA, workOrderA.id);
  assert(late.projection.status === 'ATRASADO', `expected overdue SLA, got ${late.projection.status}`);
  const added = await MaintenanceSlaAuthorityService.addDelayReason(adminA, workOrderA.id, 'Aguardando peça sintética');
  assert(added.reason.reason === 'Aguardando peça sintética', 'delay reason was not persisted');
  assert(added.reason.actorUserId === adminAId && added.reason.actorName === adminA.name, 'delay reason actor was not server-authoritative');

  const read = await MaintenanceSlaAuthorityService.get(companyA, workOrderA.id);
  assert(read.delayReasons.length === 1 && read.delayReasons[0].id === added.reason.id, 'delay reason history missing');

  let crossTenant = false;
  try { await MaintenanceSlaAuthorityService.get(companyB, workOrderA.id); }
  catch { crossTenant = true; }
  assert(crossTenant, 'SLA authority exposed another tenant work order');

  const cleared = await MaintenanceSlaAuthorityService.setExpectedDuration(adminA, workOrderA.id, null);
  assert(cleared.projection.status === 'SEM_SLA', 'explicit SLA removal did not return SEM_SLA');

  const afterFinance = await financialCounts(companyA);
  assert(JSON.stringify(afterFinance) === JSON.stringify(beforeFinance), 'SLA operations mutated financial records');

  return { workOrderAId: workOrderA.id, workOrderBId: workOrderB.id, reasonId: added.reason.id };
}

async function rlsAndAppendOnly(workOrderBId: string, reasonId: string): Promise<void> {
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));
  await db.execute(sql.raw(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${roleName}`));
  await db.execute(sql.raw(`GRANT SELECT,INSERT,UPDATE,DELETE ON maintenance_work_order_delay_reasons TO ${roleName}`));

  const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');
  const client = new Client({ host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1), user: roleName, password: rolePassword });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant',$1,true)`, [companyA]);
    const visible = await client.query(`SELECT company_id FROM maintenance_work_order_delay_reasons`);
    assert(visible.rows.length > 0 && visible.rows.every((row: any) => row.company_id === companyA), 'RLS leaked another tenant delay reason');
    let crossTenantInsert = false;
    try {
      await client.query(`INSERT INTO maintenance_work_order_delay_reasons (id,company_id,work_order_id,reason,actor_user_id,actor_name) VALUES ('sla-cross',$1,$2,'x','x','x')`, [companyB, workOrderBId]);
    } catch { crossTenantInsert = true; }
    assert(crossTenantInsert, 'RLS allowed cross-tenant delay reason insert');
    await client.query('ROLLBACK');

    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant',$1,true)`, [companyA]);
    let updateRejected = false;
    try { await client.query(`UPDATE maintenance_work_order_delay_reasons SET reason='mutated' WHERE id=$1`, [reasonId]); }
    catch { updateRejected = true; }
    assert(updateRejected, 'append-only trigger allowed delay reason update');
    await client.query('ROLLBACK');

    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant',$1,true)`, [companyA]);
    let deleteRejected = false;
    try { await client.query(`DELETE FROM maintenance_work_order_delay_reasons WHERE id=$1`, [reasonId]); }
    catch { deleteRejected = true; }
    assert(deleteRejected, 'append-only trigger allowed delay reason delete');
    await client.query('ROLLBACK');
  } finally {
    await client.end();
    await db.execute(sql.raw(`DROP OWNED BY ${roleName}`));
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));
  }
}

export async function runMaintenanceSlaIntegration(): Promise<void> {
  await seed();
  const result = await authorityFlow();
  await rlsAndAppendOnly(result.workOrderBId, result.reasonId);
  console.log('MAINT-SLA-1C persistence tenant append-only integration: PASS');
}
