import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { SettlementService } from '../../domain/finance/SettlementService';
import { TrafficTicketAuthorityService } from '../trafficTicketAuthority';
import { TicketResponsibility } from '../../types/enums';
import type { AuthenticatedPrincipal } from '../auth';

const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
const companyId = `finance-r11-${suffix}`;
const adminId = `${companyId}-admin`;
const vehicleId = `${companyId}-vehicle`;
const expenseCategoryId = `${companyId}-expense`;
const paymentMethodId = `${companyId}-pix`;
const principal: AuthenticatedPrincipal = {
  companyId,
  userId: adminId,
  name: 'Finance R11 Admin',
  role: 'ADMIN',
  permissions: ['*'],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertMoney(actual: unknown, expected: number, message: string): void {
  const value = Number(actual);
  if (Math.round(value * 100) !== Math.round(expected * 100)) {
    throw new Error(`${message}: expected ${expected}, got ${value}`);
  }
}

async function one(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at)
    VALUES(${companyId},'Finance R11','ACTIVE',NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${adminId},${companyId},'Finance R11 Admin',${`${adminId}@example.test`},'ADMIN',true,NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at)
    VALUES(${vehicleId},${companyId},'ABC1D23',${`REN-${suffix}`},'AVAILABLE',1000,NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at)
    VALUES(${expenseCategoryId},${companyId},'Multas R11','EXPENSE',true,NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active)
    VALUES(${paymentMethodId},${companyId},'PIX R11','PIX',0,true)
  `);
}

async function createAccount(label: string, balance = 1000): Promise<string> {
  const id = `${companyId}-${label}`;
  await db.execute(sql`
    INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at)
    VALUES(${id},${companyId},${label},'BANK',${balance},${balance},'ACTIVE',NOW(),NOW())
  `);
  return id;
}

async function createTicket(
  autoNumber: string,
  extra: Partial<{
    discountDueDate: string;
    discountedAmount: number;
    responsibility: TicketResponsibility;
    nicAmount: number;
  }> = {}
) {
  return TrafficTicketAuthorityService.create(principal, {
    vehicleId,
    autoNumber,
    organName: 'DETRAN',
    infractionCode: '745-50',
    description: `FINANCE-R11 ${autoNumber}`,
    infractionDate: '2026-08-01',
    dueDate: '2026-09-10',
    originalAmount: 200,
    points: 4,
    responsibility: extra.responsibility || TicketResponsibility.COMPANY,
    baseExpenseCategoryId: expenseCategoryId,
    nicExpenseCategoryId: expenseCategoryId,
    discountDueDate: extra.discountDueDate,
    discountedAmount: extra.discountedAmount,
    nicAmount: extra.nicAmount,
  });
}

function pay(
  payableId: string,
  accountId: string,
  amount: number,
  paymentDate: string,
  idempotencyKey: string,
  discountAmount?: number
) {
  return UnitOfWork.run(
    companyId,
    async (tx) => SettlementService.registerPayment({
      companyId,
      obligationId: payableId,
      financialAccountId: accountId,
      paymentMethodId,
      paymentAmount: amount,
      paymentDate,
      discountAmount,
      idempotencyKey,
      userId: adminId,
      userName: principal.name,
    }, tx),
    { financialPeriodLock: 'SHARED' }
  );
}

async function payableState(id: string): Promise<any> {
  return one(sql`
    SELECT status,original_amount,discount_amount,fine_amount,interest_amount,
           updated_amount,paid_amount,balance_amount
    FROM account_payables
    WHERE company_id=${companyId} AND id=${id}
  `);
}

async function accountBalance(id: string): Promise<number> {
  const row = await one(sql`
    SELECT current_balance FROM financial_accounts WHERE company_id=${companyId} AND id=${id}
  `);
  return Number(row?.current_balance || 0);
}

async function transactionStats(payableId: string): Promise<{ count: number; total: number }> {
  const row = await one(sql`
    SELECT count(*)::int AS count, COALESCE(sum(amount),0)::numeric AS total
    FROM financial_transactions
    WHERE company_id=${companyId} AND payable_id=${payableId}
  `);
  return { count: Number(row?.count || 0), total: Number(row?.total || 0) };
}

async function fullSettlementOnDeadline(): Promise<void> {
  const accountId = await createAccount('deadline-account');
  const ticket = await createTicket('R11-DEADLINE', {
    discountDueDate: '2026-08-20',
    discountedAmount: 160,
  });
  const payableId = ticket.item.payableId!;

  const first = await pay(payableId, accountId, 160, '2026-08-20', 'r11-deadline-key');
  const state = await payableState(payableId);

  assert(state.status === 'PAID', 'deadline discounted payment must close payable');
  assertMoney(state.discount_amount, 40, 'deadline discount');
  assertMoney(state.updated_amount, 160, 'deadline updated amount');
  assertMoney(state.paid_amount, 160, 'deadline paid amount');
  assertMoney(state.balance_amount, 0, 'deadline balance');
  assertMoney(first.transaction.amount, 160, 'cash transaction must equal actual payment');
  assertMoney(await accountBalance(accountId), 840, 'deadline account balance');

  const retry = await pay(payableId, accountId, 160, '2026-08-20', 'r11-deadline-key');
  assert(first.transaction.id === retry.transaction.id, 'discounted retry must converge to original transaction');
  const stats = await transactionStats(payableId);
  assert(stats.count === 1, 'discounted retry created duplicate transaction');
  assertMoney(stats.total, 160, 'discounted retry duplicated cash');
}

async function expiredDiscount(): Promise<void> {
  const accountId = await createAccount('expired-account');
  const ticket = await createTicket('R11-EXPIRED', {
    discountDueDate: '2026-08-20',
    discountedAmount: 160,
  });
  const payableId = ticket.item.payableId!;

  await pay(payableId, accountId, 160, '2026-08-21', 'r11-expired-key');
  const state = await payableState(payableId);

  assert(state.status === 'PARTIALLY_PAID', 'expired discount must not close payable at discounted amount');
  assertMoney(state.discount_amount, 0, 'expired discount must remain zero');
  assertMoney(state.updated_amount, 200, 'expired updated amount');
  assertMoney(state.paid_amount, 160, 'expired paid amount');
  assertMoney(state.balance_amount, 40, 'expired remaining balance');
  assertMoney(await accountBalance(accountId), 840, 'expired account balance');
}

async function partialThenFinalWithinDeadline(): Promise<void> {
  const accountId = await createAccount('partial-account');
  const ticket = await createTicket('R11-PARTIAL', {
    discountDueDate: '2026-08-20',
    discountedAmount: 160,
  });
  const payableId = ticket.item.payableId!;

  await pay(payableId, accountId, 100, '2026-08-19', 'r11-partial-a');
  let state = await payableState(payableId);
  assert(state.status === 'PARTIALLY_PAID', 'first partial must remain partial');
  assertMoney(state.discount_amount, 0, 'partial payment must not consume full discount early');
  assertMoney(state.balance_amount, 100, 'partial normal balance before final discount');

  await pay(payableId, accountId, 60, '2026-08-20', 'r11-partial-b');
  state = await payableState(payableId);
  assert(state.status === 'PAID', 'partial + final discounted target must close payable');
  assertMoney(state.discount_amount, 40, 'final partial discount');
  assertMoney(state.updated_amount, 160, 'final partial updated amount');
  assertMoney(state.paid_amount, 160, 'final partial paid amount');
  assertMoney(state.balance_amount, 0, 'final partial balance');
  const stats = await transactionStats(payableId);
  assert(stats.count === 2, 'partial + final must create two cash transactions');
  assertMoney(stats.total, 160, 'partial + final cash total');
  assertMoney(await accountBalance(accountId), 840, 'partial + final account balance');
}

async function paidAlreadyBeyondDiscountTarget(): Promise<void> {
  const accountId = await createAccount('over-target-account');
  const ticket = await createTicket('R11-OVER-TARGET', {
    discountDueDate: '2026-08-20',
    discountedAmount: 160,
  });
  const payableId = ticket.item.payableId!;

  await pay(payableId, accountId, 170, '2026-08-19', 'r11-over-target-a');
  let state = await payableState(payableId);
  assertMoney(state.discount_amount, 0, 'crossing discount target must not create retroactive discount');
  assertMoney(state.balance_amount, 30, 'normal balance after crossing target');

  await pay(payableId, accountId, 30, '2026-08-20', 'r11-over-target-b');
  state = await payableState(payableId);
  assert(state.status === 'PAID', 'over-target title must close only at normal balance');
  assertMoney(state.discount_amount, 0, 'over-target close must not manufacture discount/refund');
  assertMoney(state.paid_amount, 200, 'over-target normal paid amount');
  assertMoney(await accountBalance(accountId), 800, 'over-target account balance');
}

async function fineAndInterestOrdering(): Promise<void> {
  const accountId = await createAccount('adjustment-account');
  const ticket = await createTicket('R11-ADJUSTED', {
    discountDueDate: '2026-08-20',
    discountedAmount: 160,
  });
  const payableId = ticket.item.payableId!;

  await db.execute(sql`
    UPDATE account_payables
    SET fine_amount=10,interest_amount=5,updated_amount=215,balance_amount=215
    WHERE company_id=${companyId} AND id=${payableId}
  `);

  await pay(payableId, accountId, 175, '2026-08-20', 'r11-adjusted-key');
  const state = await payableState(payableId);

  assert(state.status === 'PAID', 'discount target plus fine/interest must close payable');
  assertMoney(state.discount_amount, 40, 'adjusted discount');
  assertMoney(state.fine_amount, 10, 'fine must remain authoritative');
  assertMoney(state.interest_amount, 5, 'interest must remain authoritative');
  assertMoney(state.updated_amount, 175, 'adjusted target amount');
  assertMoney(state.paid_amount, 175, 'adjusted cash paid');
  assertMoney(await accountBalance(accountId), 825, 'adjusted account balance');
}

async function forgedDiscountFailsClosed(): Promise<void> {
  const accountId = await createAccount('forged-account');
  const ticket = await createTicket('R11-FORGED', {
    discountDueDate: '2026-08-20',
    discountedAmount: 160,
  });
  const payableId = ticket.item.payableId!;

  let message = '';
  try {
    await pay(payableId, accountId, 120, '2026-08-20', 'r11-forged-key', 80);
  } catch (error) {
    message = String(error);
  }

  assert(message.includes('derivado exclusivamente'), `forged discount must fail closed, got ${message}`);
  const state = await payableState(payableId);
  assert(state.status === 'PENDING', 'forged discount mutated payable');
  assertMoney(state.discount_amount, 0, 'forged discount persisted');
  assertMoney(state.paid_amount, 0, 'forged discount moved payable paid amount');
  assertMoney(await accountBalance(accountId), 1000, 'forged discount moved cash');
  const stats = await transactionStats(payableId);
  assert(stats.count === 0, 'forged discount created transaction');
}

async function noDiscountTicketStaysGeneric(): Promise<void> {
  const accountId = await createAccount('generic-account');
  const ticket = await createTicket('R11-NO-DISCOUNT');
  const payableId = ticket.item.payableId!;

  await pay(payableId, accountId, 160, '2026-08-20', 'r11-generic-key');
  const state = await payableState(payableId);

  assert(state.status === 'PARTIALLY_PAID', 'no-discount ticket must preserve generic settlement');
  assertMoney(state.discount_amount, 0, 'no-discount ticket invented discount');
  assertMoney(state.balance_amount, 40, 'no-discount generic balance');
}

async function nicPayableDoesNotReceiveBaseDiscount(): Promise<void> {
  const accountId = await createAccount('nic-account');
  const ticket = await createTicket('R11-NIC', {
    responsibility: TicketResponsibility.UNIDENTIFIED,
    discountDueDate: '2026-08-20',
    discountedAmount: 160,
    nicAmount: 200,
  });
  const nicPayableId = ticket.item.nicPayableId!;

  await pay(nicPayableId, accountId, 160, '2026-08-20', 'r11-nic-key');
  const state = await payableState(nicPayableId);

  assert(state.status === 'PARTIALLY_PAID', 'NIC payable must not inherit base fine discount');
  assertMoney(state.discount_amount, 0, 'NIC payable received base fine discount');
  assertMoney(state.balance_amount, 40, 'NIC payable balance');
}

async function run(): Promise<void> {
  await seed();
  await fullSettlementOnDeadline();
  await expiredDiscount();
  await partialThenFinalWithinDeadline();
  await paidAlreadyBeyondDiscountTarget();
  await fineAndInterestOrdering();
  await forgedDiscountFailsClosed();
  await noDiscountTicketStaysGeneric();
  await nicPayableDoesNotReceiveBaseDiscount();
  console.log('FINANCE-R11 authoritative traffic-ticket discount integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
