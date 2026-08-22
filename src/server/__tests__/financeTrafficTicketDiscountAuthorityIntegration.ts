import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { FinancialPeriodService } from '../../domain/finance/FinancialPeriodService';
import { SettlementService } from '../../domain/finance/SettlementService';
import { TrafficTicketAuthorityService } from '../trafficTicketAuthority';
import { TicketResponsibility } from '../../types/enums';
import type { AuthenticatedPrincipal } from '../auth';

const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
const companyA = `finance-r11-auth-a-${suffix}`;
const companyB = `finance-r11-auth-b-${suffix}`;
const adminA = `${companyA}-admin`;
const adminB = `${companyB}-admin`;
const vehicleA = `${companyA}-vehicle`;
const vehicleB = `${companyB}-vehicle`;
const expenseA = `${companyA}-expense`;
const expenseB = `${companyB}-expense`;
const paymentMethodA = `${companyA}-pix`;
const activeAccountA = `${companyA}-active`;
const inactiveAccountA = `${companyA}-inactive`;

const principalA: AuthenticatedPrincipal = {
  companyId: companyA,
  userId: adminA,
  name: 'Finance R11 Authority Admin A',
  role: 'ADMIN',
  permissions: ['*'],
};

const principalB: AuthenticatedPrincipal = {
  companyId: companyB,
  userId: adminB,
  name: 'Finance R11 Authority Admin B',
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

async function rejects(fn: () => Promise<unknown>, contains: string): Promise<void> {
  let message = '';
  try {
    await fn();
  } catch (error) {
    message = String(error);
  }
  assert(message.includes(contains), `expected rejection containing ${contains}, got ${message || 'no rejection'}`);
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
      (${companyA},'Finance R11 Authority A','ACTIVE',NOW(),NOW()),
      (${companyB},'Finance R11 Authority B','ACTIVE',NOW(),NOW())
  `);

  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
      (${adminA},${companyA},'Finance R11 Authority Admin A',${`${adminA}@example.test`},'ADMIN',true,NOW(),NOW()),
      (${adminB},${companyB},'Finance R11 Authority Admin B',${`${adminB}@example.test`},'ADMIN',true,NOW(),NOW())
  `);

  await db.execute(sql`
    INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES
      (${vehicleA},${companyA},${`RAA1A${suffix.slice(0, 2).toUpperCase()}`},${`REN-A-${suffix}`},'AVAILABLE',1000,NOW(),NOW()),
      (${vehicleB},${companyB},${`RBB1B${suffix.slice(2, 4).toUpperCase()}`},${`REN-B-${suffix}`},'AVAILABLE',1000,NOW(),NOW())
  `);

  await db.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES
      (${expenseA},${companyA},'Multas R11 A','EXPENSE',true,NOW(),NOW()),
      (${expenseB},${companyB},'Multas R11 B','EXPENSE',true,NOW(),NOW())
  `);

  await db.execute(sql`
    INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active)
    VALUES(${paymentMethodA},${companyA},'PIX R11 Authority','PIX',0,true)
  `);

  await db.execute(sql`
    INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at) VALUES
      (${activeAccountA},${companyA},'R11 Active','BANK',1000,1000,'ACTIVE',NOW(),NOW()),
      (${inactiveAccountA},${companyA},'R11 Inactive','BANK',1000,1000,'INACTIVE',NOW(),NOW())
  `);
}

async function createTicket(
  principal: AuthenticatedPrincipal,
  vehicleId: string,
  expenseCategoryId: string,
  autoNumber: string,
  discountedAmount = 160
) {
  return TrafficTicketAuthorityService.create(principal, {
    vehicleId,
    autoNumber,
    organName: 'DETRAN',
    infractionCode: '745-50',
    description: `FINANCE-R11 authority ${autoNumber}`,
    infractionDate: '2026-08-01',
    dueDate: '2026-09-10',
    discountDueDate: '2026-08-20',
    originalAmount: 200,
    discountedAmount,
    points: 4,
    responsibility: TicketResponsibility.COMPANY,
    baseExpenseCategoryId: expenseCategoryId,
  });
}

function payA(
  payableId: string,
  accountId: string,
  amount: number,
  paymentDate: string,
  idempotencyKey: string
) {
  return UnitOfWork.run(
    companyA,
    async (tx) => SettlementService.registerPayment({
      companyId: companyA,
      obligationId: payableId,
      financialAccountId: accountId,
      paymentMethodId: paymentMethodA,
      paymentAmount: amount,
      paymentDate,
      idempotencyKey,
      userId: adminA,
      userName: principalA.name,
    }, tx),
    { financialPeriodLock: 'SHARED' }
  );
}

async function payableState(id: string): Promise<any> {
  return one(sql`
    SELECT status,discount_amount,updated_amount,paid_amount,balance_amount
    FROM account_payables
    WHERE company_id=${companyA} AND id=${id}
  `);
}

async function accountBalance(id: string): Promise<number> {
  const row = await one(sql`
    SELECT current_balance FROM financial_accounts WHERE company_id=${companyA} AND id=${id}
  `);
  return Number(row?.current_balance || 0);
}

async function transactionCount(payableId: string): Promise<number> {
  const row = await one(sql`
    SELECT count(*)::int AS count
    FROM financial_transactions
    WHERE company_id=${companyA} AND payable_id=${payableId}
  `);
  return Number(row?.count || 0);
}

async function foreignTenantTicketCannotInfluenceSettlement(): Promise<void> {
  const local = await createTicket(principalA, vehicleA, expenseA, 'R11-AUTH-LOCAL');
  const foreign = await createTicket(principalB, vehicleB, expenseB, 'R11-AUTH-FOREIGN', 100);
  const payableId = local.item.payableId!;

  await db.execute(sql`
    UPDATE account_payables
    SET origin_id=${foreign.item.id}
    WHERE company_id=${companyA} AND id=${payableId}
  `);

  await rejects(
    () => payA(payableId, activeAccountA, 100, '2026-08-20', 'r11-auth-cross-tenant'),
    'Multa autoritativa vinculada à Conta a Pagar não encontrada'
  );

  const state = await payableState(payableId);
  assert(state.status === 'PENDING', 'cross-tenant ticket lookup mutated local payable');
  assertMoney(state.discount_amount, 0, 'cross-tenant ticket lookup persisted discount');
  assertMoney(state.paid_amount, 0, 'cross-tenant ticket lookup moved paid amount');
  assertMoney(await accountBalance(activeAccountA), 1000, 'cross-tenant ticket lookup moved cash');
  assert(await transactionCount(payableId) === 0, 'cross-tenant ticket lookup created transaction');
}

async function inactiveAccountFailsClosedOnDiscountPath(): Promise<void> {
  const ticket = await createTicket(principalA, vehicleA, expenseA, 'R11-AUTH-INACTIVE');
  const payableId = ticket.item.payableId!;

  await rejects(
    () => payA(payableId, inactiveAccountA, 160, '2026-08-20', 'r11-auth-inactive'),
    'Conta financeira inativa'
  );

  const state = await payableState(payableId);
  assert(state.status === 'PENDING', 'inactive account mutated discounted payable');
  assertMoney(state.discount_amount, 0, 'inactive account persisted discount');
  assertMoney(state.paid_amount, 0, 'inactive account moved paid amount');
  assertMoney(await accountBalance(inactiveAccountA), 1000, 'inactive account moved cash');
  assert(await transactionCount(payableId) === 0, 'inactive account created transaction');
}

async function closedFinancialPeriodFailsClosedOnDiscountPath(): Promise<void> {
  const ticket = await createTicket(principalA, vehicleA, expenseA, 'R11-AUTH-PERIOD');
  const payableId = ticket.item.payableId!;

  const closed = await UnitOfWork.run(
    companyA,
    async (tx) => FinancialPeriodService.closePeriod({
      companyId: companyA,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      userId: adminA,
      userName: principalA.name,
    }, tx),
    { financialPeriodLock: 'EXCLUSIVE' }
  );
  assert(closed.status === 'CLOSED', 'R11 authority fixture did not close financial period');

  await rejects(
    () => payA(payableId, activeAccountA, 160, '2026-08-20', 'r11-auth-closed-period'),
    'está fechado'
  );

  const state = await payableState(payableId);
  assert(state.status === 'PENDING', 'closed period mutated discounted payable');
  assertMoney(state.discount_amount, 0, 'closed period persisted discount');
  assertMoney(state.paid_amount, 0, 'closed period moved paid amount');
  assertMoney(await accountBalance(activeAccountA), 1000, 'closed period moved cash');
  assert(await transactionCount(payableId) === 0, 'closed period created transaction');
}

async function run(): Promise<void> {
  await seed();
  await foreignTenantTicketCannotInfluenceSettlement();
  await inactiveAccountFailsClosedOnDiscountPath();
  await closedFinancialPeriodFailsClosedOnDiscountPath();
  console.log('FINANCE-R11 traffic-ticket discount authority integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
