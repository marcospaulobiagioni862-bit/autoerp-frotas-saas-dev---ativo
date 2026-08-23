import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { FinancialPeriodService } from '../../domain/finance/FinancialPeriodService';
import { SettlementService } from '../../domain/finance/SettlementService';
import { FinanceOverdueAuthority } from '../financeOverdueAuthority';
import { parseOverdueProcessRequest } from '../financeOverdueRoutes';
import { TrafficTicketAuthorityService } from '../trafficTicketAuthority';
import { TicketResponsibility } from '../../types/enums';
import type { AuthenticatedPrincipal } from '../auth';

const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
const companyA = `finance-r12-a-${suffix}`;
const companyB = `finance-r12-b-${suffix}`;
const adminA = `${companyA}-admin`;
const adminB = `${companyB}-admin`;
const operatorA = `${companyA}-operator`;
const categoryA = `${companyA}-category`;
const categoryB = `${companyB}-category`;
const vehicleA = `${companyA}-vehicle`;
const paymentMethodA = `${companyA}-pix`;
const financialAccountA = `${companyA}-bank`;

const actorA = { companyId: companyA, userId: adminA, name: 'Finance R12 Admin A' };
const actorB = { companyId: companyB, userId: adminB, name: 'Finance R12 Admin B' };
const operatorActorA = { companyId: companyA, userId: operatorA, name: 'Finance R12 Operator A' };

const principalA: AuthenticatedPrincipal = {
  companyId: companyA,
  userId: adminA,
  name: actorA.name,
  role: 'ADMIN',
  permissions: ['*'],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function money(actual: unknown, expected: number, message: string): void {
  const value = Number(actual);
  if (Math.round(value * 100) !== Math.round(expected * 100)) {
    throw new Error(`${message}: expected ${expected}, got ${value}`);
  }
}

async function one(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function rejects(fn: () => Promise<unknown>, contains: string): Promise<void> {
  let message = '';
  try {
    await fn();
  } catch (error) {
    message = String(error);
  }
  assert(message.includes(contains), `expected rejection containing ${contains}, got ${message || 'no rejection'}`);
}

function rejectsSync(fn: () => unknown): void {
  let rejected = false;
  try {
    fn();
  } catch {
    rejected = true;
  }
  assert(rejected, 'expected synchronous request validation rejection');
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
      (${adminB},${companyB},'Finance R12 Admin B',${`${adminB}@example.test`},'ADMIN',true,NOW(),NOW()),
      (${operatorA},${companyA},'Finance R12 Operator A',${`${operatorA}@example.test`},'FINANCIAL_OPERATOR',true,NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES
      (${categoryA},${companyA},'R12 A','BOTH',true,NOW(),NOW()),
      (${categoryB},${companyB},'R12 B','BOTH',true,NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at)
    VALUES(${vehicleA},${companyA},${`R12${suffix.slice(0,4).toUpperCase()}`},${`R12-REN-${suffix}`},'AVAILABLE',1000,NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active)
    VALUES(${paymentMethodA},${companyA},'PIX R12','PIX',0,true)
  `);
  await db.execute(sql`
    INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at)
    VALUES(${financialAccountA},${companyA},'R12 Bank','BANK',1000,1000,'ACTIVE',NOW(),NOW())
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
    INSERT INTO account_payables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,discount_amount,
      fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status,created_at,updated_at
    ) VALUES (
      ${args.id},${companyId},'MANUAL',${`${args.id}-origin`},${companyId === companyA ? categoryA : categoryB},'R12 AP',
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
async function transactionCount(args: { receivableId?: string; payableId?: string }): Promise<number> {
  const row = args.receivableId
    ? await one(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyA} AND receivable_id=${args.receivableId}`)
    : await one(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyA} AND payable_id=${args.payableId}`);
  return Number(row?.count || 0);
}
async function accountBalance(): Promise<number> {
  const row = await one(sql`SELECT current_balance FROM financial_accounts WHERE company_id=${companyA} AND id=${financialAccountA}`);
  return Number(row?.current_balance || 0);
}

async function noImplicitDefaultsAndForgeryBlocked(): Promise<void> {
  const initialRules = await FinanceOverdueAuthority.listRules(actorA);
  assert(initialRules.length === 0, 'R12 silently created a default late-charge rule');

  const before = `${companyA}-before-rule`;
  await insertReceivable({ id: before });
  await rejects(
    () => FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-11'),
    'Regra autoritativa de encargos por atraso'
  );
  const untouched = await receivable(before);
  money(untouched.fine_amount, 0, 'missing rule mutated fine');
  money(untouched.interest_amount, 0, 'missing rule mutated interest');

  rejectsSync(() => parseOverdueProcessRequest({ type: 'RECEIVABLE', processingDate: '2026-08-11', companyId: companyB }));
  rejectsSync(() => parseOverdueProcessRequest({
    type: 'RECEIVABLE', processingDate: '2026-08-11', finePercent: 99, dailyInterestPercent: 9, gracePeriodDays: 0,
  }));

  await FinanceOverdueAuthority.upsertRule(actorA, 'RECEIVABLE', {
    gracePeriodDays: 0, finePercent: 2, dailyInterestPercent: 0.1, active: true,
  });

  const beforeBoth = await receivable(before);
  await rejects(() => FinanceOverdueAuthority.process(actorA, 'BOTH', '2026-08-11'), 'PAYABLE');
  const afterBoth = await receivable(before);
  money(afterBoth.fine_amount, beforeBoth.fine_amount, 'BOTH partially mutated before missing rule failure');

  await FinanceOverdueAuthority.upsertRule(actorA, 'PAYABLE', {
    gracePeriodDays: 0, finePercent: 2, dailyInterestPercent: 0.1, active: true,
  });
  await FinanceOverdueAuthority.upsertRule(actorB, 'RECEIVABLE', {
    gracePeriodDays: 0, finePercent: 99, dailyInterestPercent: 9, active: true,
  });

  await rejects(
    () => FinanceOverdueAuthority.upsertRule(operatorActorA, 'RECEIVABLE', {
      gracePeriodDays: 0, finePercent: 1, dailyInterestPercent: 0.01, active: true,
    }),
    'Permissão insuficiente'
  );
  await rejects(
    () => FinanceOverdueAuthority.process(operatorActorA, 'RECEIVABLE', '2026-08-11'),
    'Permissão insuficiente'
  );
}

async function receivableTenantPartialAndIdempotency(): Promise<void> {
  const idA = `${companyA}-ar-overdue`;
  const idB = `${companyB}-ar-control`;
  await insertReceivable({ id: idA, original: 100, paid: 20, discount: 5 });
  await insertReceivable({ id: idB, companyId: companyB, original: 100, fine: 7, interest: 9 });

  await FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-11');
  const row = await receivable(idA);
  assert(row.status === 'OVERDUE', 'overdue receivable status was not persisted');
  money(row.fine_amount, 1.6, 'receivable fine must use unsettled original principal');
  money(row.interest_amount, 0.8, 'receivable interest must use deterministic days and remaining principal');
  money(row.discount_amount, 5, 'receivable discount was overwritten');
  money(row.updated_amount, 97.4, 'receivable updated amount must preserve discount');
  money(row.balance_amount, 77.4, 'receivable balance must preserve partial settlement');

  const foreign = await receivable(idB, companyB);
  money(foreign.fine_amount, 7, 'tenant A processing mutated tenant B fine');
  money(foreign.interest_amount, 9, 'tenant A processing mutated tenant B interest');

  const first = await receivable(idA);
  await FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-11');
  const retry = await receivable(idA);
  money(retry.fine_amount, first.fine_amount, 'same-date retry accumulated fine');
  money(retry.interest_amount, first.interest_amount, 'same-date retry accumulated interest');
  money(retry.updated_amount, first.updated_amount, 'same-date retry changed total');

  await FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-21');
  const advanced = await receivable(idA);
  money(advanced.fine_amount, 1.6, 'fine accumulated after processing-date advance');
  money(advanced.interest_amount, 1.6, 'interest did not deterministically recalculate for new date');
}

async function payableNotDuePaidCancelledAndClosedPeriod(): Promise<void> {
  const overdue = `${companyA}-ap-overdue`;
  const future = `${companyA}-ap-future`;
  const paid = `${companyA}-ap-paid`;
  const cancelled = `${companyA}-ap-cancelled`;
  const closed = `${companyA}-ap-closed`;

  await insertPayable({ id: overdue, original: 200, paid: 50 });
  await insertPayable({ id: future, due: '2026-09-01' });
  await insertPayable({ id: paid, status: 'PAID', paid: 100 });
  await insertPayable({ id: cancelled, status: 'CANCELLED' });
  await insertPayable({ id: closed, competence: '2026-10-01' });

  const period = await UnitOfWork.run(
    companyA,
    async (tx) => FinancialPeriodService.closePeriod({
      companyId: companyA, startDate: '2026-10-01', endDate: '2026-10-31', userId: adminA, userName: actorA.name,
    }, tx),
    { financialPeriodLock: 'EXCLUSIVE' }
  );
  assert(period.status === 'CLOSED', 'R12 closed-period fixture failed');

  const result = (await FinanceOverdueAuthority.process(actorA, 'PAYABLE', '2026-08-11'))[0];
  assert(result.skippedClosedPeriod >= 1, 'closed-period title was not reported as skipped');

  const overdueRow = await payable(overdue);
  assert(overdueRow.status === 'OVERDUE', 'overdue payable status was not persisted');
  money(overdueRow.fine_amount, 3, 'payable fine must use remaining principal');
  money(overdueRow.interest_amount, 1.5, 'payable interest must use remaining principal');

  const futureRow = await payable(future);
  money(futureRow.fine_amount, 0, 'not-yet-due payable received fine');
  money(futureRow.interest_amount, 0, 'not-yet-due payable received interest');
  assert((await payable(paid)).status === 'PAID', 'PAID payable was mutated');
  assert((await payable(cancelled)).status === 'CANCELLED', 'CANCELLED payable was mutated');
  const closedRow = await payable(closed);
  money(closedRow.fine_amount, 0, 'closed financial period received fine');
  money(closedRow.interest_amount, 0, 'closed financial period received interest');
}

async function persistedChargesAreConsumedBySettlement(): Promise<void> {
  const id = `${companyA}-ar-settlement`;
  await insertReceivable({ id, original: 100, due: '2026-08-01', competence: '2026-09-01' });
  await FinanceOverdueAuthority.process(actorA, 'RECEIVABLE', '2026-08-11');
  const processed = await receivable(id);
  money(processed.updated_amount, 103, 'R12 receivable charges not persisted before settlement');

  const beforeBalance = await accountBalance();
  const settled = await UnitOfWork.run(
    companyA,
    async (tx) => SettlementService.registerReceipt({
      companyId: companyA, obligationId: id, financialAccountId: financialAccountA,
      paymentMethodId: paymentMethodA, paymentAmount: 103, paymentDate: '2026-09-15',
      idempotencyKey: `r12-receipt-${suffix}`, userId: adminA, userName: actorA.name,
    }, tx),
    { financialPeriodLock: 'SHARED' }
  );
  assert(settled.receivable.status === 'PAID', 'settlement did not consume persisted overdue charges');
  money(settled.transaction.amount, 103, 'cash transaction differs from actual receipt');
  money(await accountBalance(), beforeBalance + 103, 'receipt did not move actual cash amount');
  assert(await transactionCount({ receivableId: id }) === 1, 'settlement produced unexpected transaction count');
}

async function r11TrafficTicketInteraction(): Promise<void> {
  const discounted = await TrafficTicketAuthorityService.create(principalA, {
    vehicleId: vehicleA,
    autoNumber: `R12-DISCOUNTED-${suffix}`,
    organName: 'DETRAN',
    infractionCode: '745-50',
    description: 'R12 preserves already-settled R11 discount',
    infractionDate: '2026-08-01',
    dueDate: '2026-08-20',
    discountDueDate: '2026-08-20',
    originalAmount: 200,
    discountedAmount: 160,
    points: 4,
    responsibility: TicketResponsibility.COMPANY,
    baseExpenseCategoryId: categoryA,
  });
  const discountedPayableId = discounted.item.payableId!;

  const discountedSettlement = await UnitOfWork.run(
    companyA,
    async (tx) => SettlementService.registerPayment({
      companyId: companyA, obligationId: discountedPayableId, financialAccountId: financialAccountA,
      paymentMethodId: paymentMethodA, paymentAmount: 160, paymentDate: '2026-08-20',
      idempotencyKey: `r12-discounted-payment-${suffix}`, userId: adminA, userName: actorA.name,
    }, tx),
    { financialPeriodLock: 'SHARED' }
  );
  assert(discountedSettlement.payable.status === 'PAID', 'R11 eligible discounted title did not close');
  money(discountedSettlement.payable.discountAmount, 40, 'R11 eligible discount was not persisted');

  const overdue = await TrafficTicketAuthorityService.create(principalA, {
    vehicleId: vehicleA,
    autoNumber: `R12-OVERDUE-${suffix}`,
    organName: 'DETRAN',
    infractionCode: '745-50',
    description: 'R12 respects expired R11 discount',
    infractionDate: '2026-08-01',
    dueDate: '2026-08-20',
    discountDueDate: '2026-08-20',
    originalAmount: 200,
    discountedAmount: 160,
    points: 4,
    responsibility: TicketResponsibility.COMPANY,
    baseExpenseCategoryId: categoryA,
  });
  const overduePayableId = overdue.item.payableId!;

  await FinanceOverdueAuthority.process(actorA, 'PAYABLE', '2026-08-25');
  const paidDiscountedAfterR12 = await payable(discountedPayableId);
  assert(paidDiscountedAfterR12.status === 'PAID', 'R12 mutated an R11 title already settled with discount');
  money(paidDiscountedAfterR12.discount_amount, 40, 'R12 changed persisted R11 discount');
  money(paidDiscountedAfterR12.fine_amount, 0, 'R12 charged fine on PAID discounted ticket');
  money(paidDiscountedAfterR12.interest_amount, 0, 'R12 charged interest on PAID discounted ticket');

  const processed = await payable(overduePayableId);
  assert(processed.status === 'OVERDUE', 'unpaid traffic ticket was not marked overdue');
  money(processed.fine_amount, 4, 'R12 did not persist overdue ticket fine');
  money(processed.interest_amount, 1, 'R12 did not persist overdue ticket interest');
  money(processed.discount_amount, 0, 'R12 manufactured an expired traffic-ticket discount');
  money(processed.updated_amount, 205, 'R12 overdue ticket total is incorrect');

  const beforeBalance = await accountBalance();
  const expiredSettlement = await UnitOfWork.run(
    companyA,
    async (tx) => SettlementService.registerPayment({
      companyId: companyA, obligationId: overduePayableId, financialAccountId: financialAccountA,
      paymentMethodId: paymentMethodA, paymentAmount: 205, paymentDate: '2026-08-25',
      idempotencyKey: `r12-expired-payment-${suffix}`, userId: adminA, userName: actorA.name,
    }, tx),
    { financialPeriodLock: 'SHARED' }
  );
  assert(expiredSettlement.payable.status === 'PAID', 'expired discounted ticket did not settle at R12 full target');
  money(expiredSettlement.payable.discountAmount, 0, 'expired R11 discount was resurrected');
  money(expiredSettlement.transaction.amount, 205, 'R11/R12 payment transaction differs from cash paid');
  money(await accountBalance(), beforeBalance - 205, 'R11/R12 payment cash movement is incorrect');
  assert(await transactionCount({ payableId: overduePayableId }) === 1, 'R11/R12 produced unexpected transaction count');
}

async function reportsRemainTenantScoped(): Promise<void> {
  const delinquent = await FinanceOverdueAuthority.getDelinquentReceivables(actorA, '2026-08-21');
  assert(delinquent.length > 0, 'authoritative delinquency report returned no overdue AR items');
  assert(delinquent.every((item) => item.companyId === companyA), 'delinquency report leaked another tenant');

  const aging = await FinanceOverdueAuthority.getAgingReport(actorA, 'RECEIVABLE', '2026-08-21');
  const total = aging['A VENCER'] + aging['1-7'] + aging['8-15'] + aging['16-30'] + aging['31-60'] + aging['61-90'] + aging['90+'];
  assert(total >= 0, 'authoritative aging report produced an invalid total');
}

async function run(): Promise<void> {
  await seed();
  await noImplicitDefaultsAndForgeryBlocked();
  await receivableTenantPartialAndIdempotency();
  await payableNotDuePaidCancelledAndClosedPeriod();
  await persistedChargesAreConsumedBySettlement();
  await r11TrafficTicketInteraction();
  await reportsRemainTenantScoped();
  console.log('FINANCE-R12 authoritative overdue PostgreSQL integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
