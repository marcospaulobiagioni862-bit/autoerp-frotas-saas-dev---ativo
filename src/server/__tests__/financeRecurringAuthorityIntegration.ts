import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { FinancialPeriodService } from '../../domain/finance/FinancialPeriodService';
import { RecurringAuthorityService } from '../recurringAuthority';

const companyA = 'finance-r13-company-a';
const companyB = 'finance-r13-company-b';
const adminA = 'finance-r13-admin-a';
const vehicleA = 'finance-r13-vehicle-a';
const vehicleCatchup = 'finance-r13-vehicle-catchup';
const vehicleRollback = 'finance-r13-vehicle-rollback';
const vehicleClosedPeriod = 'finance-r13-vehicle-closed-period';
const vehicleB = 'finance-r13-vehicle-b';
const driverA = 'finance-r13-driver-a';
const expenseCategoryA = 'finance-r13-expense-category-a';
const incomeCategoryA = 'finance-r13-income-category-a';
const trackerCatchup = 'finance-r13-tracker-catchup';
const trackerRollback = 'finance-r13-tracker-rollback';
const trackerClosedPeriod = 'finance-r13-tracker-closed-period';
const trackerForeign = 'finance-r13-tracker-foreign';
const contractDeferred = 'finance-r13-contract-deferred';
const ruleCatchup = 'finance-r13-rule-catchup';
const ruleRollback = 'finance-r13-rule-rollback';
const ruleClosedPeriod = 'finance-r13-rule-closed-period';
const ruleDeferred = 'finance-r13-rule-deferred';
const ruleForeign = 'finance-r13-rule-foreign';

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
    INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
      (${companyA}, 'FINANCE-R13 Company A', 'ACTIVE', NOW(), NOW()),
      (${companyB}, 'FINANCE-R13 Company B', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at)
    VALUES (${adminA}, ${companyA}, 'FINANCE-R13 Admin', 'finance-r13-admin@example.test', 'ADMIN', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at) VALUES
      (${vehicleA}, ${companyA}, 'R13A1A1', 'R13RENAVAMA', 'AVAILABLE', NOW(), NOW()),
      (${vehicleCatchup}, ${companyA}, 'R13C1C1', 'R13RENAVAMC', 'AVAILABLE', NOW(), NOW()),
      (${vehicleRollback}, ${companyA}, 'R13R1R1', 'R13RENAVAMR', 'AVAILABLE', NOW(), NOW()),
      (${vehicleClosedPeriod}, ${companyA}, 'R13D1D1', 'R13RENAVAMD', 'AVAILABLE', NOW(), NOW()),
      (${vehicleB}, ${companyB}, 'R13B1B1', 'R13RENAVAMB', 'AVAILABLE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO drivers (
      id, company_id, name, cpf, cnh, active, cnh_expiration, status, app_platforms,
      is_archived, created_at, updated_at
    ) VALUES (
      ${driverA}, ${companyA}, 'FINANCE-R13 Driver', '91300000001', 'R13CNH00001', true,
      '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO financial_categories (id, company_id, name, type, active, created_at, updated_at) VALUES
      (${expenseCategoryA}, ${companyA}, 'R13 Recurring Expense', 'EXPENSE', true, NOW(), NOW()),
      (${incomeCategoryA}, ${companyA}, 'R13 Recurring Income', 'INCOME', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO trackers (id, company_id, vehicle_id, serial_number, status, created_at, updated_at) VALUES
      (${trackerCatchup}, ${companyA}, ${vehicleCatchup}, 'R13-CATCHUP', 'ACTIVE', NOW(), NOW()),
      (${trackerRollback}, ${companyA}, ${vehicleRollback}, 'R13-ROLLBACK', 'ACTIVE', NOW(), NOW()),
      (${trackerClosedPeriod}, ${companyA}, ${vehicleClosedPeriod}, 'R13-CLOSED', 'ACTIVE', NOW(), NOW()),
      (${trackerForeign}, ${companyB}, ${vehicleB}, 'R13-FOREIGN', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO contracts (
      id, company_id, driver_id, vehicle_id, status, contract_number, start_date,
      rental_amount, billing_periodicity, billing_due_day_of_week, billing_due_day_of_month,
      security_deposit_amount, franchise_km, excess_km_rate, signature_required,
      is_archived, created_at, updated_at
    ) VALUES (
      ${contractDeferred}, ${companyA}, ${driverA}, ${vehicleA}, 'SUSPENDED', 'R13-DEFERRED', '2026-08-01',
      750, 'MONTHLY', 1, 1, 1000, 1500, 0.5, false, false, NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO recurring_rules (
      id, company_id, description, amount, interval, active, next_execution,
      origin_type, origin_id, frequency, start_date, next_generation_date,
      category_id, vehicle_id, status, created_by, created_at, updated_at
    ) VALUES
      (${ruleCatchup}, ${companyA}, 'R13 catch-up tracker', 50, 'MONTHLY', true, '2026-02-01',
       'TRACKER', ${trackerCatchup}, 'MONTHLY', '2026-01-01', '2026-02-01',
       ${expenseCategoryA}, ${vehicleCatchup}, 'ACTIVE', ${adminA}, NOW(), NOW()),
      (${ruleRollback}, ${companyA}, 'R13 rollback tracker', 60, 'MONTHLY', true, '2026-06-01',
       'TRACKER', ${trackerRollback}, 'MONTHLY', '2026-06-01', '2026-06-01',
       ${expenseCategoryA}, ${vehicleRollback}, 'ACTIVE', ${adminA}, NOW(), NOW()),
      (${ruleClosedPeriod}, ${companyA}, 'R13 closed-period tracker', 70, 'MONTHLY', true, '2026-07-10',
       'TRACKER', ${trackerClosedPeriod}, 'MONTHLY', '2026-07-10', '2026-07-10',
       ${expenseCategoryA}, ${vehicleClosedPeriod}, 'ACTIVE', ${adminA}, NOW(), NOW()),
      (${ruleDeferred}, ${companyA}, 'R13 deferred contract', 750, 'MONTHLY', true, '2026-08-01',
       'CONTRACT_RENT', ${contractDeferred}, 'MONTHLY', '2026-08-01', '2026-08-01',
       ${incomeCategoryA}, ${vehicleA}, 'ACTIVE', ${adminA}, NOW(), NOW()),
      (${ruleForeign}, ${companyA}, 'R13 foreign tracker poisoning attempt', 999, 'MONTHLY', true, '2026-09-01',
       'TRACKER', ${trackerForeign}, 'MONTHLY', '2026-09-01', '2026-09-01',
       ${expenseCategoryA}, ${vehicleA}, 'ACTIVE', ${adminA}, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function catchUpCreatesEveryPeriodExactlyOnce(): Promise<void> {
  const result = await RecurringAuthorityService.processTenant(companyA, '2026-04-01', 'finance-r13-catchup-worker');
  assert(result.failed === 0, `catch-up unexpectedly failed ${result.failed} occurrence(s)`);
  assert(result.processed === 3, `catch-up expected 3 processed periods, got ${result.processed}`);

  const generated = rows(await db.execute(sql`
    SELECT period_ref, due_date::text AS due_date
    FROM account_payables
    WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${trackerCatchup}
    ORDER BY due_date, id
  `));
  assert(generated.length === 3, `catch-up expected 3 payables, got ${generated.length}`);
  assert(generated.map((item) => item.period_ref).join(',') === '2026-02,2026-03,2026-04', `unexpected catch-up periods ${generated.map((item) => item.period_ref).join(',')}`);

  const rule = await one(sql`
    SELECT last_generated_reference, next_generation_date::text AS next_generation_date
    FROM recurring_rules WHERE company_id=${companyA} AND id=${ruleCatchup}
  `);
  assert(rule?.last_generated_reference === '2026-04', `unexpected last generated reference ${rule?.last_generated_reference}`);
  assert(String(rule?.next_generation_date).slice(0, 10) === '2026-05-01', `unexpected next generation date ${rule?.next_generation_date}`);

  const replay = await RecurringAuthorityService.processTenant(companyA, '2026-04-01', 'finance-r13-catchup-replay');
  assert(replay.processed === 0 && replay.failed === 0, 'same processing date replayed an already advanced catch-up');
  assert(Number((await one(sql`
    SELECT count(*)::int AS count FROM account_payables
    WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${trackerCatchup}
  `))?.count) === 3, 'catch-up replay duplicated a payable');

  await db.execute(sql`UPDATE recurring_rules SET status='COMPLETED', active=false, updated_at=NOW() WHERE company_id=${companyA} AND id=${ruleCatchup}`);
}

async function failureAfterInsertRollsBackAndRetryConverges(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE OR REPLACE FUNCTION finance_r13_fail_rule_advance()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.id = '${ruleRollback}' AND NEW.last_generated_reference IS DISTINCT FROM OLD.last_generated_reference THEN
        RAISE EXCEPTION 'FINANCE_R13_INDUCED_RULE_ADVANCE_FAILURE';
      END IF;
      RETURN NEW;
    END;
    $$;
  `));
  await db.execute(sql`DROP TRIGGER IF EXISTS trg_finance_r13_fail_rule_advance ON recurring_rules`);
  await db.execute(sql.raw(`
    CREATE TRIGGER trg_finance_r13_fail_rule_advance
    BEFORE UPDATE ON recurring_rules
    FOR EACH ROW EXECUTE FUNCTION finance_r13_fail_rule_advance();
  `));

  try {
    const failed = await RecurringAuthorityService.processTenant(companyA, '2026-06-01', 'finance-r13-rollback-worker');
    assert(failed.failed === 1 && failed.processed === 0, `induced rollback expected one failure, got ${JSON.stringify(failed)}`);
    assert(Number((await one(sql`
      SELECT count(*)::int AS count FROM account_payables
      WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${trackerRollback}
    `))?.count) === 0, 'payable survived a failed atomic recurring occurrence');

    const rule = await one(sql`
      SELECT last_generated_reference, next_generation_date::text AS next_generation_date
      FROM recurring_rules WHERE company_id=${companyA} AND id=${ruleRollback}
    `);
    assert(!rule?.last_generated_reference, 'failed occurrence advanced lastGeneratedReference');
    assert(String(rule?.next_generation_date).slice(0, 10) === '2026-06-01', 'failed occurrence advanced nextGenerationDate');

    const run = await one(sql`
      SELECT status, error_code FROM recurring_rule_runs
      WHERE company_id=${companyA} AND rule_id=${ruleRollback} AND period_ref='2026-06'
    `);
    assert(run?.status === 'FAILED', `failed occurrence run was not persisted as FAILED (${run?.status})`);
  } finally {
    await db.execute(sql`DROP TRIGGER IF EXISTS trg_finance_r13_fail_rule_advance ON recurring_rules`);
    await db.execute(sql`DROP FUNCTION IF EXISTS finance_r13_fail_rule_advance()`);
  }

  const retry = await RecurringAuthorityService.processTenant(companyA, '2026-06-01', 'finance-r13-rollback-retry');
  assert(retry.failed === 0 && retry.processed === 1, `retry did not converge after rollback ${JSON.stringify(retry)}`);
  assert(Number((await one(sql`
    SELECT count(*)::int AS count FROM account_payables
    WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${trackerRollback}
  `))?.count) === 1, 'retry did not converge to exactly one payable');

  await db.execute(sql`UPDATE recurring_rules SET status='COMPLETED', active=false, updated_at=NOW() WHERE company_id=${companyA} AND id=${ruleRollback}`);
}

async function closedFinancialPeriodFailsClosed(): Promise<void> {
  const closed = await UnitOfWork.run(
    companyA,
    async (tx) => FinancialPeriodService.closePeriod({
      companyId: companyA,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      userId: adminA,
      userName: 'FINANCE-R13 Admin',
    }, tx),
    { financialPeriodLock: 'EXCLUSIVE' },
  );
  assert(closed.status === 'CLOSED', 'R13 fixture did not close the financial period');

  const result = await RecurringAuthorityService.processTenant(companyA, '2026-07-10', 'finance-r13-closed-period-worker');
  assert(result.failed === 1 && result.processed === 0, `closed period did not fail closed ${JSON.stringify(result)}`);
  assert(Number((await one(sql`
    SELECT count(*)::int AS count FROM account_payables
    WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${trackerClosedPeriod}
  `))?.count) === 0, 'closed period recurring processing created a payable');

  const rule = await one(sql`
    SELECT next_generation_date::text AS next_generation_date
    FROM recurring_rules WHERE company_id=${companyA} AND id=${ruleClosedPeriod}
  `);
  assert(String(rule?.next_generation_date).slice(0, 10) === '2026-07-10', 'closed period advanced the recurring schedule');

  const run = await one(sql`
    SELECT status, error_code FROM recurring_rule_runs
    WHERE company_id=${companyA} AND rule_id=${ruleClosedPeriod} AND period_ref='2026-07'
  `);
  assert(run?.status === 'FAILED', 'closed period occurrence was not recorded as FAILED');

  await db.execute(sql`UPDATE recurring_rules SET status='PAUSED', active=false, updated_at=NOW() WHERE company_id=${companyA} AND id=${ruleClosedPeriod}`);
}

async function temporarilyIneligibleContractDoesNotAdvance(): Promise<void> {
  const result = await RecurringAuthorityService.processTenant(companyA, '2026-08-01', 'finance-r13-deferred-worker');
  assert(result.processed === 0 && result.failed === 0 && result.deferred === 1, `suspended contract did not defer safely ${JSON.stringify(result)}`);

  const rule = await one(sql`
    SELECT status, next_generation_date::text AS next_generation_date, last_generated_reference
    FROM recurring_rules WHERE company_id=${companyA} AND id=${ruleDeferred}
  `);
  assert(rule?.status === 'ACTIVE', 'temporarily ineligible contract incorrectly completed recurring rule');
  assert(String(rule?.next_generation_date).slice(0, 10) === '2026-08-01', 'temporarily ineligible contract advanced schedule');
  assert(!rule?.last_generated_reference, 'temporarily ineligible contract recorded a generated reference');
  assert(Number((await one(sql`
    SELECT count(*)::int AS count FROM account_receivables
    WHERE company_id=${companyA} AND contract_id=${contractDeferred}
  `))?.count) === 0, 'temporarily ineligible contract generated rent');

  const run = await one(sql`
    SELECT status, error_code FROM recurring_rule_runs
    WHERE company_id=${companyA} AND rule_id=${ruleDeferred} AND period_ref='2026-08'
  `);
  assert(run?.status === 'SKIPPED' && run?.error_code === 'ORIGIN_TEMPORARILY_INELIGIBLE', 'deferred occurrence was not recorded explicitly');

  await db.execute(sql`UPDATE recurring_rules SET status='PAUSED', active=false, updated_at=NOW() WHERE company_id=${companyA} AND id=${ruleDeferred}`);
}

async function foreignTenantOriginCannotGenerateMoney(): Promise<void> {
  const result = await RecurringAuthorityService.processTenant(companyA, '2026-09-01', 'finance-r13-foreign-worker');
  assert(result.failed === 0 && result.processed === 0, `foreign tenant origin unexpectedly processed ${JSON.stringify(result)}`);

  const rule = await one(sql`SELECT status, active FROM recurring_rules WHERE company_id=${companyA} AND id=${ruleForeign}`);
  assert(rule?.status === 'COMPLETED' && rule?.active === false, 'foreign tenant tracker did not fail closed to COMPLETED');
  assert(Number((await one(sql`
    SELECT count(*)::int AS count FROM account_payables
    WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${trackerForeign}
  `))?.count) === 0, 'foreign tenant tracker generated a local payable');

  const foreignTracker = await one(sql`SELECT company_id, status FROM trackers WHERE id=${trackerForeign}`);
  assert(foreignTracker?.company_id === companyB && foreignTracker?.status === 'ACTIVE', 'foreign tenant tracker was mutated');
}

export async function run(): Promise<void> {
  await seed();
  await catchUpCreatesEveryPeriodExactlyOnce();
  await failureAfterInsertRollsBackAndRetryConverges();
  await closedFinancialPeriodFailsClosed();
  await temporarilyIneligibleContractDoesNotAdvance();
  await foreignTenantOriginCannotGenerateMoney();
  console.log('FINANCE-R13 authoritative recurring billing integration: PASS');
}

if (process.argv[1]?.includes('financeRecurringAuthorityIntegration')) run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
