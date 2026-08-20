import { createRequire } from 'node:module';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { RecurringAuthorityService } from '../recurringAuthority';
import { ReceivableService } from '../../domain/finance/ReceivableService';
import { UnitOfWork } from '../../db/uow';
import { OriginType } from '../../types/enums';

const require = createRequire(import.meta.url);
const { Client } = require('pg') as typeof import('pg');

const companyA = 'security-2i5-company-a';
const companyB = 'security-2i5-company-b';
const adminA = 'security-2i5-admin-a';
const adminB = 'security-2i5-admin-b';
const contractA = 'security-2i5-contract-a';
const vehicleA = 'security-2i5-vehicle-a';
const driverA = 'security-2i5-driver-a';
const rlsRole = 'security_2i5_rls_user';
const rlsPassword = 'security-i5-test-password';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function one(query: any): Promise<any> {
  const result = await db.execute(query);
  return rows(result)[0];
}

function datePlusDays(days: number): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return utc.toISOString().slice(0, 10);
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
      (${companyA}, 'I5 Company A', 'ACTIVE', NOW(), NOW()),
      (${companyB}, 'I5 Company B', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
      (${adminA}, ${companyA}, 'I5 Admin A', 'i5-admin-a@example.test', 'ADMIN', true, NOW(), NOW()),
      (${adminB}, ${companyB}, 'I5 Admin B', 'i5-admin-b@example.test', 'ADMIN', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at)
    VALUES (${vehicleA}, ${companyA}, 'I5A1A01', 'I5RENAVAM-A1', 'AVAILABLE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO drivers (
      id, company_id, name, cpf, cnh, active, cnh_expiration, status, app_platforms,
      is_archived, created_at, updated_at
    ) VALUES (
      ${driverA}, ${companyA}, 'I5 Driver A', '05298224725', '52345678900', true,
      '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO contracts (
      id, company_id, driver_id, vehicle_id, status, contract_number, start_date,
      rental_amount, billing_periodicity, billing_due_day_of_week, billing_due_day_of_month,
      security_deposit_amount, franchise_km, excess_km_rate, signature_required,
      is_archived, created_at, updated_at
    ) VALUES (
      ${contractA}, ${companyA}, ${driverA}, ${vehicleA}, 'DRAFT', 'CNT-I5-A-001', '2026-09-01',
      750, 'WEEKLY', 1, 1, 1000, 1500, 0.5, false, false, NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING
  `);
}

async function testContractTriggerAndExactlyOnce(): Promise<void> {
  await db.execute(sql`UPDATE contracts SET status='ACTIVE', updated_at=NOW() WHERE id=${contractA}`);
  let rule = await one(sql`
    SELECT id, status, active, next_generation_date::text AS next_generation_date, category_id
    FROM recurring_rules
    WHERE company_id=${companyA} AND origin_type='CONTRACT_RENT' AND origin_id=${contractA}
  `);
  assert(rule, 'contract activation did not create recurring rule');
  assert(rule.status === 'PAUSED' && rule.active === false, 'contract rule must fail closed before the authoritative first charge');
  assert(!rule.category_id, 'contract rule invented a tenant category before the first charge');

  await db.execute(sql`
    INSERT INTO account_receivables (
      id, company_id, origin_type, origin_id, vehicle_id, driver_id, contract_id, category_id,
      description, original_amount, discount_amount, fine_amount, interest_amount, updated_amount,
      paid_amount, balance_amount, due_date, competence_date, status, installment_number,
      total_installments, idempotency_key, created_at, updated_at
    ) VALUES (
      'security-2i5-initial-rent', ${companyA}, 'CONTRACT_RENT', ${contractA} || ':2026-09-01',
      ${vehicleA}, ${driverA}, ${contractA}, 'cat-rent-inc', 'initial rent', 750, 0, 0, 0, 750,
      0, 750, '2026-09-01', '2026-09-01', 'PENDING', 1, 1, 'security-2i5-initial-key', NOW(), NOW()
    )
  `);
  rule = await one(sql`
    SELECT id, status, active, next_generation_date::text AS next_generation_date, category_id
    FROM recurring_rules WHERE company_id=${companyA} AND origin_type='CONTRACT_RENT' AND origin_id=${contractA}
  `);
  assert(rule.status === 'ACTIVE' && rule.active === true, 'first authoritative rent charge did not activate recurring rule');
  assert(rule.category_id === 'cat-rent-inc', 'contract rule did not inherit financial category from authoritative charge');
  assert(String(rule.next_generation_date).slice(0, 10) === '2026-09-08', `unexpected next date ${rule.next_generation_date}`);

  const [workerA, workerB] = await Promise.all([
    RecurringAuthorityService.processTenant(companyA, '2026-09-08', 'i5-worker-a'),
    RecurringAuthorityService.processTenant(companyA, '2026-09-08', 'i5-worker-b'),
  ]);
  assert(workerA.failed === 0 && workerB.failed === 0, 'concurrent scheduler produced a failed occurrence');
  assert(workerA.processed + workerB.processed === 1, `expected exactly one processed occurrence, got ${workerA.processed + workerB.processed}`);

  const titleCount = await one(sql`
    SELECT count(*)::int AS count
    FROM account_receivables
    WHERE company_id=${companyA} AND contract_id=${contractA} AND period_ref='2026-W37' AND status <> 'CANCELLED'
  `);
  assert(Number(titleCount?.count) === 1, `expected one financial title, got ${titleCount?.count}`);

  const runCount = await one(sql`
    SELECT count(*)::int AS count, max(status) AS status, max(attempt_count)::int AS attempts
    FROM recurring_rule_runs
    WHERE company_id=${companyA} AND rule_id=${rule.id} AND period_ref='2026-W37'
  `);
  assert(Number(runCount?.count) === 1, `expected one run row, got ${runCount?.count}`);
  assert(runCount?.status === 'SUCCEEDED', `expected SUCCEEDED run, got ${runCount?.status}`);

  const rerun = await RecurringAuthorityService.processTenant(companyA, '2026-09-08', 'i5-worker-restart');
  assert(rerun.processed === 0 && rerun.failed === 0, 'restart replayed an already-advanced occurrence');
  const afterRestart = await one(sql`
    SELECT count(*)::int AS count FROM account_receivables
    WHERE company_id=${companyA} AND contract_id=${contractA} AND period_ref='2026-W37' AND status <> 'CANCELLED'
  `);
  assert(Number(afterRestart?.count) === 1, 'restart duplicated the financial title');

  const schedulerTitle = await one(sql`
    SELECT id FROM account_receivables
    WHERE company_id=${companyA} AND contract_id=${contractA} AND period_ref='2026-W37' AND status <> 'CANCELLED'
  `);
  const manualRetry = await UnitOfWork.run(companyA, async (tx) =>
    await ReceivableService.create({
      companyId: companyA,
      originType: OriginType.CONTRACT_RENT,
      originId: `${contractA}:2026-09-08`,
      vehicleId: vehicleA,
      driverId: driverA,
      contractId: contractA,
      categoryId: 'cat-rent-inc',
      description: 'manual retry after scheduler',
      totalAmount: 750,
      dueDate: '2026-09-08',
      competenceDate: '2026-09-08',
      userId: adminA,
      userName: 'I5 Admin A',
    }, tx)
  );
  assert(manualRetry[0]?.id === schedulerTitle?.id, 'manual retry after scheduler did not converge on the existing title');

  let duplicateRejected = false;
  try {
    await db.execute(sql`
      INSERT INTO account_receivables (
        id, company_id, origin_type, origin_id, vehicle_id, driver_id, contract_id, category_id,
        description, original_amount, discount_amount, fine_amount, interest_amount, updated_amount,
        paid_amount, balance_amount, due_date, competence_date, status, installment_number,
        total_installments, idempotency_key, created_at, updated_at
      ) VALUES (
        'security-2i5-manual-duplicate', ${companyA}, 'CONTRACT_RENT', 'different-manual-origin',
        ${vehicleA}, ${driverA}, ${contractA}, 'cat-rent-inc', 'duplicate', 750, 0, 0, 0, 750,
        0, 750, '2026-09-08', '2026-09-08', 'PENDING', 1, 1, 'different-manual-key', NOW(), NOW()
      )
    `);
  } catch (error: any) {
    duplicateRejected = String(error?.code || error?.cause?.code || '').includes('23505') || String(error?.message || '').includes('duplicate');
  }
  assert(duplicateRejected, 'contract+period duplicate was not rejected by PostgreSQL');

  await db.execute(sql`UPDATE contracts SET status='CLOSED', updated_at=NOW() WHERE id=${contractA}`);
  const closedRule = await one(sql`SELECT status, active FROM recurring_rules WHERE id=${rule.id}`);
  assert(closedRule?.status === 'COMPLETED' && closedRule?.active === false, 'closed contract did not complete recurring rule');
}

async function testDocumentAlertDedupAndVersioning(): Promise<void> {
  const expirationV1 = datePlusDays(7);
  await db.execute(sql`
    INSERT INTO documents (
      id, company_id, subject_type, subject_id, document_type, expiration_date,
      version_number, is_current, is_archived, cost, created_by, created_at, updated_at
    ) VALUES (
      'security-2i5-doc-v1', ${companyA}, 'VEHICLE', ${vehicleA}, 'CRLV', ${expirationV1},
      1, true, false, 0, ${adminA}, NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);
  const first = await RecurringAuthorityService.materializeDocumentAlerts(companyA);
  const second = await RecurringAuthorityService.materializeDocumentAlerts(companyA);
  assert(first === 1, `first alert sweep expected 1 insert, got ${first}`);
  assert(second === 0, `second alert sweep expected dedup 0, got ${second}`);
  assert(await RecurringAuthorityService.unreadCount(companyA, adminA) === 1, 'unread count mismatch after first alert');

  await db.execute(sql`UPDATE documents SET is_current=false, updated_at=NOW() WHERE id='security-2i5-doc-v1'`);
  await db.execute(sql`
    INSERT INTO documents (
      id, company_id, subject_type, subject_id, document_type, expiration_date,
      version_number, supersedes_document_id, is_current, is_archived, cost, created_by, created_at, updated_at
    ) VALUES (
      'security-2i5-doc-v2', ${companyA}, 'VEHICLE', ${vehicleA}, 'CRLV', ${datePlusDays(15)},
      2, 'security-2i5-doc-v1', true, false, 0, ${adminA}, NOW(), NOW()
    )
  `);
  const versionSweep = await RecurringAuthorityService.materializeDocumentAlerts(companyA);
  const stableSweep = await RecurringAuthorityService.materializeDocumentAlerts(companyA);
  assert(versionSweep === 1, `new document version expected one notification, got ${versionSweep}`);
  assert(stableSweep === 0, 'current document version generated duplicate notifications');
  const notifications = await RecurringAuthorityService.listNotifications(companyA, adminA, 20);
  assert(notifications.length === 2, `expected exactly two versioned notifications, got ${notifications.length}`);
  assert(notifications.every((item) => item.entityId !== undefined), 'notification entity linkage missing');

  const marked = await RecurringAuthorityService.markNotificationRead(companyA, adminA, notifications[0].id);
  assert(Boolean(marked?.readAt), 'mark-read did not persist read_at');
  const markedAgain = await RecurringAuthorityService.markNotificationRead(companyA, adminA, notifications[0].id);
  assert(Boolean(markedAgain?.readAt), 'mark-read is not idempotent');
  const remaining = await RecurringAuthorityService.unreadCount(companyA, adminA);
  assert(remaining === 1, `expected one unread notification, got ${remaining}`);
  const markAll = await RecurringAuthorityService.markAllNotificationsRead(companyA, adminA);
  assert(markAll === 1, `mark-all expected to update one row, got ${markAll}`);
  assert(await RecurringAuthorityService.unreadCount(companyA, adminA) === 0, 'mark-all did not clear unread count');
}

async function testRlsNonSuperuser(): Promise<void> {
  await db.execute(sql`
    INSERT INTO recurring_rules (id, company_id, description, amount, interval, active, status)
    VALUES ('security-2i5-rule-b', ${companyB}, 'B paused rule', 1, 'MONTHLY', false, 'PAUSED')
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO recurring_rule_runs (
      id, company_id, rule_id, scheduled_for, period_ref, status, attempt_count, started_at, finished_at
    ) VALUES (
      'security-2i5-run-b', ${companyB}, 'security-2i5-rule-b', '2026-09-01', '2026-09', 'SKIPPED', 1, NOW(), NOW()
    ) ON CONFLICT (company_id, rule_id, period_ref) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO notifications (
      id, company_id, user_id, event_type, dedup_key, title, message, severity, created_by
    ) VALUES (
      'security-2i5-notification-b', ${companyB}, ${adminB}, 'TEST', 'I5-RLS-B', 'B', 'B', 'INFO', 'SYSTEM'
    ) ON CONFLICT (company_id, user_id, dedup_key) DO NOTHING
  `);

  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${rlsRole}`));
  await db.execute(sql.raw(`CREATE ROLE ${rlsRole} LOGIN PASSWORD '${rlsPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${rlsRole}`));
  await db.execute(sql.raw(`GRANT SELECT, INSERT ON recurring_rules, recurring_rule_runs, notifications TO ${rlsRole}`));

  const baseUrl = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');
  baseUrl.username = rlsRole;
  baseUrl.password = rlsPassword;
  const client = new Client({ connectionString: baseUrl.toString() });
  try {
    await client.connect();
    await client.query('SELECT set_config($1, $2, false)', ['app.current_tenant', companyA]);
    for (const table of ['recurring_rules', 'recurring_rule_runs', 'notifications']) {
      const result = await client.query(`SELECT DISTINCT company_id FROM ${table}`);
      assert(result.rows.every((row: any) => row.company_id === companyA), `${table} leaked a cross-tenant row under RLS`);
    }

    let crossTenantInsertRejected = false;
    try {
      await client.query(
        `INSERT INTO notifications (id, company_id, user_id, event_type, dedup_key, title, message, severity, created_by)
         VALUES ($1,$2,$3,'TEST','I5-RLS-FORGED','forged','forged','INFO','TEST')`,
        ['security-2i5-forged-b', companyB, adminB],
      );
    } catch (error: any) {
      crossTenantInsertRejected = String(error?.code || '') === '42501' || String(error?.message || '').toLowerCase().includes('row-level security');
    }
    assert(crossTenantInsertRejected, 'RLS did not reject a cross-tenant notification insert');
  } finally {
    await client.end().catch(() => undefined);
    await db.execute(sql.raw(`REVOKE ALL PRIVILEGES ON recurring_rules, recurring_rule_runs, notifications FROM ${rlsRole}`));
    await db.execute(sql.raw(`REVOKE USAGE ON SCHEMA public FROM ${rlsRole}`));
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${rlsRole}`));
  }
}

export class RecurringAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    await seed();
    await testContractTriggerAndExactlyOnce();
    await testDocumentAlertDedupAndVersioning();
    await testRlsNonSuperuser();
  }
}

if (process.argv[1]?.includes('recurringAuthorityIntegration')) {
  RecurringAuthorityIntegrationRunner.runAllTests()
    .then(() => console.log('Recurring authority integration PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
