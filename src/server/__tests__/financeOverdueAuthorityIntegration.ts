import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { FinancialPeriodService } from '../../domain/finance/FinancialPeriodService';
import { FinanceOverdueAuthority } from '../financeOverdueAuthority';

const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
const companyA = `finance-r12-a-${suffix}`;
const companyB = `finance-r12-b-${suffix}`;
const adminA = `${companyA}-admin`;
const adminB = `${companyB}-admin`;
const categoryA = `${companyA}-category`;
const categoryB = `${companyB}-category`;

const actorA = { companyId: companyA, userId: adminA, name: 'Finance R12 Admin A' };
const actorB = { companyId: companyB, userId: adminB, name: 'Finance R12 Admin B' };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function money(actual: unknown, expected: number, message: string): void {
  if (Math.round(Number(actual) * 100) !== Math.round(expected * 100)) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}
async function one(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
      (${companyA},'Finance R12 A','ACTIVE',NOW(),NOW()),
      (${companyB},'Finance R12 B','ACTIVE',NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
      (${adminA},${companyA},'Finance R12 Admin A',${`${adminA}@example.test`},'ADMIN',true,NOW(),NOW()),
      (${adminB},${companyB},'Finance R12 Admin B',${`${adminB}@example.test`},'ADMIN',true,NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES
      (${categoryA},${companyA},'R12 A','BOTH',true,NOW(),NOW()),
      (${categoryB},${companyB},'R12 B','BOTH',true,NOW(),NOW())
  `);
}

async function insertReceivable(args: {
  id: string; companyId?: string; status?: string; original?: number; paid?: number; discount?: number;
  fine?: number; interest?: number; due?: string; competence?: string;
}): Promise<void> {
  const companyId = args.companyId || companyA;
  const original = args.original ?? 100;
  const paid = args.paid ?? 0;
  const discount = args.discount ?? 0;
  const fine = args.fine ?? 0;
  const interest = args.interest ?? 0;
  const updated = original + fine + interest - discount;
  const balance = Math.max(0, updated - paid);
  await db.execute(sql`
    INSERT INTO account_receivables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,discount_amount,
      fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status,created_at,updated_at
    ) VALUES (
      ${args.id},${companyId},'MANUAL',${`${args.id}-origin`},${companyId === companyA ? categoryA : categoryB},'R12 AR',
      ${original},${discount},${fine},${interest},${updated},${paid},${balance},
      ${args.due || '2026-08-01'},${args.competence || '2026-08-01'},${args.status || 'PENDING'},NOW(),NOW()
    )
  `);
}

async function insertPayable(args: {
  id: string; companyId?: string; status?: string; original?: number; paid?: number; discount?: number;
  fine?: number; interest?: number; due?: string; competence?: string; originType?: string;
}): Promise<void> {
  const companyId = args.companyId || companyA;
  const original = args.original ?? 100;
  const paid = args.paid ?? 0;
  const discount = args.discount ?? 0;
  const fine = args.fine ?? 0;
  const interest = args.interest ?? 0;
  const updated = original + fine + interest - discount;
  const balance = Math.max(0, updated - paid);
  await db.execute(sql`
    INSERT INTO account_payables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,discount_amount,
      fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status,created_at,updated_at
    ) VALUES (
      ${args.id},${companyId},${args.originType || 'MANUAL'},${`${args.id}-origin`},${companyId === companyA ? categoryA : categoryB},'R12 AP',
      ${original},${discount},${fine},${interest},${updated},${paid},${balance},
      ${args.due || '2026-08-01'},${args.competence || '2026-08-01'},${args.status || 'PENDING'},NOW(),NOW()
    )
  `);
}

async function receivable(id: string, companyId = companyA): Promise<any> {
  return one(sql`SELECT * FROM account_receivables WHERE company_id=${companyId} AND id=${id}`);
}
async function payable(id: string, companyId = companyA): Promise<any> {
  return one(sql`SELECT * FROM account_payables WHERE company_id=${companyId} AND id=${id}`);
}
async function auditCount(id: string): Promise<number> {
  const row = await one(sql`SELECT count(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_id=${id}`);
  return Number(row?.count || 0);
}

async function receivableAndTenantIsolation(): Promise<void> {
  const idA = `${companyA}-ar-overdue`;
  const idB = `${companyB}-ar-control`;
  await insertReceivable({ id: idA, original: 100, paid: 20, discount: 5 });
  await insertReceivable({ id: idB, companyId: companyB, original: 100, fine: 7, interest: 9 });

  const result = await FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-11');
  assert(result.updated >= 1, 'R12 did not update overdue receivable');
  const row = await receivable(idA);
  assert(row.status === 'OVERDUE', 'overdue receivable status was not persisted');
  money(row.fine_amount, 1.6, 'receivable fine must use outstanding principal only');
  money(row.interest_amount, 0.26, 'receivable interest must use outstanding principal only');
  money(row.updated_amount, 96.86, 'receivable updated amount must preserve discount');
  money(row.balance_amount, 76.86, 'receivable balance must preserve partial settlement');

  const foreign = await receivable(idB, companyB);
  money(foreign.fine_amount, 7, 'tenant A processing mutated tenant B fine');
  money(foreign.interest_amount, 9, 'tenant A processing mutated tenant B interest');
}

async function payableAndDiscountPreservation(): Promise<void> {
  const id = `${companyA}-ap-ticket`;
  await insertPayable({ id, original: 200, paid: 40, discount: 40, originType: 'TRAFFIC_TICKET_COMPANY' });
  await FinanceOverdueAuthority.process(actorA, 'PAYABLE', '2026-08-11');
  const row = await payable(id);
  assert(row.status === 'OVERDUE', 'overdue payable status was not persisted');
  money(row.fine_amount, 3.2, 'payable fine must use remaining principal');
  money(row.interest_amount, 0.53, 'payable interest must use remaining principal');
  money(row.discount_amount, 40, 'R12 must preserve R11 traffic-ticket discount');
  money(row.updated_amount, 163.73, 'payable updated amount must retain existing discount');
  money(row.balance_amount, 123.73, 'payable balance must remain settlement-compatible');
}

async function notDuePaidCancelledAndIdempotency(): Promise<void> {
  const future = `${companyA}-future`;
  const paid = `${companyA}-paid`;
  const cancelled = `${companyA}-cancelled`;
  const idem = `${companyA}-idem`;
  await insertReceivable({ id: future, due: '2026-09-01' });
  await insertReceivable({ id: paid, status: 'PAID', paid: 100 });
  await insertReceivable({ id: cancelled, status: 'CANCELLED' });
  await insertReceivable({ id: idem });

  await FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-11');
  const futureRow = await receivable(future);
  money(futureRow.fine_amount, 0, 'not-yet-due receivable received a fine');
  money(futureRow.interest_amount, 0, 'not-yet-due receivable received interest');
  assert((await receivable(paid)).status === 'PAID', 'PAID obligation was mutated');
  assert((await receivable(cancelled)).status === 'CANCELLED', 'CANCELLED obligation was mutated');

  const firstAudit = await auditCount(idem);
  await FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-11');
  const secondAudit = await auditCount(idem);
  assert(firstAudit === secondAudit, 'same-date retry accumulated a second overdue mutation');

  await FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-21');
  const advanced = await receivable(idem);
  money(advanced.fine_amount, 2, 'fine must be recalculated rather than accumulated');
  money(advanced.interest_amount, 0.66, 'interest must deterministically recalculate for new processing date');
}

async function authoritativeRuleAndClosedPeriod(): Promise<void> {
  const custom = `${companyA}-custom-rule`;
  const closed = `${companyA}-closed-period`;
  await insertReceivable({ id: custom, due: '2026-08-01', competence: '2026-09-01' });
  await insertReceivable({ id: closed, due: '2026-08-01', competence: '2026-10-01' });

  await FinanceOverdueAuthority.getRule(companyA);
  await FinanceOverdueAuthority.getRule(companyB);
  await UnitOfWork.run(companyA, async (ctx: any) => {
    await ctx.getRawTransaction().execute(sql`
      UPDATE finance_late_charge_rules
      SET fine_percent=5, daily_interest_percent=0.1, grace_period_days=2, updated_at=NOW()
      WHERE company_id=${companyA}
    `);
  });
  await UnitOfWork.run(companyB, async (ctx: any) => {
    await ctx.getRawTransaction().execute(sql`
      UPDATE finance_late_charge_rules
      SET fine_percent=99, daily_interest_percent=9, grace_period_days=0, updated_at=NOW()
      WHERE company_id=${companyB}
    `);
  });

  const period = await UnitOfWork.run(
    companyA,
    async (ctx) => await FinancialPeriodService.closePeriod({
      companyId: companyA,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      userId: adminA,
      userName: actorA.name,
    }, ctx),
    { financialPeriodLock: 'EXCLUSIVE' }
  );
  assert(period.status === 'CLOSED', 'closed-period fixture failed');

  const result = await FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-11');
  const customRow = await receivable(custom);
  money(customRow.fine_amount, 5, 'tenant A rule was not the authoritative fine source');
  money(customRow.interest_amount, 1, 'tenant A rule was not the authoritative interest source');
  const closedRow = await receivable(closed);
  money(closedRow.fine_amount, 0, 'closed financial period was retroactively mutated');
  assert(result.skippedClosedPeriod >= 1, 'closed-period skip was not reported');
}

async function run(): Promise<void> {
  await seed();
  await receivableAndTenantIsolation();
  await payableAndDiscountPreservation();
  await notDuePaidCancelledAndIdempotency();
  await authoritativeRuleAndClosedPeriod();
  console.log('FINANCE-R12 authoritative overdue PostgreSQL integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
