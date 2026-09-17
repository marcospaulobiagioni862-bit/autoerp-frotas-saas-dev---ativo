import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { SettlementService } from '../../domain/finance/SettlementService';
import { ReceivableService } from '../../domain/finance/ReceivableService';
import { PayableService } from '../../domain/finance/PayableService';

const companyId = 'finance-r21-company';
const adminId = 'finance-r21-admin';
const paymentMethodId = 'finance-r21-pm';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function txCountFor(obligationColumn: 'receivable_id' | 'payable_id', id: string): Promise<number> {
  const result: any = obligationColumn === 'receivable_id'
    ? await db.execute(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyId} AND receivable_id=${id}`)
    : await db.execute(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyId} AND payable_id=${id}`);
  return Number(result.rows?.[0]?.count || 0);
}

async function auditCount(id: string): Promise<number> {
  const result: any = await db.execute(sql`SELECT count(*)::int AS count FROM audit_logs WHERE company_id=${companyId} AND entity_id=${id}`);
  return Number(result.rows?.[0]?.count || 0);
}

async function accountBalance(id: string): Promise<number> {
  const row = await scalar(sql`SELECT current_balance FROM financial_accounts WHERE company_id=${companyId} AND id=${id}`);
  return Number(row?.current_balance || 0);
}

async function receivableState(id: string) {
  const row = await scalar(sql`SELECT paid_amount,balance_amount,status FROM account_receivables WHERE company_id=${companyId} AND id=${id}`);
  return { paid: Number(row?.paid_amount || 0), balance: Number(row?.balance_amount || 0), status: String(row?.status || '') };
}

async function payableState(id: string) {
  const row = await scalar(sql`SELECT paid_amount,balance_amount,status FROM account_payables WHERE company_id=${companyId} AND id=${id}`);
  return { paid: Number(row?.paid_amount || 0), balance: Number(row?.balance_amount || 0), status: String(row?.status || '') };
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at)
    VALUES(${companyId},'Finance R21','ACTIVE',NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${adminId},${companyId},'Finance R21 Admin','finance-r21-admin@example.test','ADMIN',true,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active)
    VALUES(${paymentMethodId},${companyId},'PIX R21','PIX',0,true)
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at)
    VALUES
      ('finance-r21-income',${companyId},'Receita R21','INCOME',true,NOW(),NOW()),
      ('finance-r21-expense',${companyId},'Despesa R21','EXPENSE',true,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);

  const accounts = [
    ['r21-rec-over-acc', 0], ['r21-rec-exact-acc', 0], ['r21-rec-retry-acc', 0],
    ['r21-rec-conflict-acc', 0], ['r21-rec-cancel-acc', 0],
    ['r21-pay-over-acc', 1000], ['r21-pay-exact-acc', 1000], ['r21-pay-retry-acc', 1000],
    ['r21-pay-cancel-acc', 1000],
  ] as const;
  for (const [id, balance] of accounts) {
    await db.execute(sql`
      INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at)
      VALUES(${id},${companyId},${id},'BANK',${balance},${balance},'ACTIVE',NOW(),NOW())
      ON CONFLICT(id) DO NOTHING
    `);
  }

  const receivables = ['r21-rec-over','r21-rec-exact','r21-rec-retry','r21-rec-conflict','r21-rec-cancel'];
  for (const id of receivables) {
    await db.execute(sql`
      INSERT INTO account_receivables(
        id,company_id,origin_type,origin_id,category_id,description,original_amount,
        discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
        due_date,competence_date,status,idempotency_key,created_at,updated_at
      ) VALUES(
        ${id},${companyId},'MANUAL',${`origin-${id}`},'finance-r21-income',${id},100,
        0,0,0,100,0,100,'2026-09-20','2026-08-22','PENDING',${`obligation-${id}`},NOW(),NOW()
      ) ON CONFLICT(id) DO NOTHING
    `);
  }

  const payables = ['r21-pay-over','r21-pay-exact','r21-pay-retry','r21-pay-cancel'];
  for (const id of payables) {
    await db.execute(sql`
      INSERT INTO account_payables(
        id,company_id,origin_type,origin_id,category_id,description,original_amount,
        discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
        due_date,competence_date,status,idempotency_key,created_at,updated_at
      ) VALUES(
        ${id},${companyId},'MANUAL',${`origin-${id}`},'finance-r21-expense',${id},100,
        0,0,0,100,0,100,'2026-09-20','2026-08-22','PENDING',${`obligation-${id}`},NOW(),NOW()
      ) ON CONFLICT(id) DO NOTHING
    `);
  }
}

function receipt(id: string, accountId: string, amount: number, idempotencyKey: string) {
  return UnitOfWork.run(companyId, async (tx) => SettlementService.registerReceipt({
    companyId,
    obligationId: id,
    financialAccountId: accountId,
    paymentMethodId,
    paymentAmount: amount,
    paymentDate: '2026-08-22',
    idempotencyKey,
    userId: adminId,
    userName: 'Finance R21 Admin',
  }, tx), { financialPeriodLock: 'SHARED' });
}

function payment(id: string, accountId: string, amount: number, idempotencyKey: string) {
  return UnitOfWork.run(companyId, async (tx) => SettlementService.registerPayment({
    companyId,
    obligationId: id,
    financialAccountId: accountId,
    paymentMethodId,
    paymentAmount: amount,
    paymentDate: '2026-08-22',
    idempotencyKey,
    userId: adminId,
    userName: 'Finance R21 Admin',
  }, tx), { financialPeriodLock: 'SHARED' });
}

async function testConcurrentOverpaymentReceipt(): Promise<void> {
  const results = await Promise.allSettled([
    receipt('r21-rec-over','r21-rec-over-acc',80,'r21-rec-over-a'),
    receipt('r21-rec-over','r21-rec-over-acc',80,'r21-rec-over-b'),
  ]);
  assert(results.filter((r) => r.status === 'fulfilled').length === 1, 'AR 80+80 must allow exactly one settlement');
  const state = await receivableState('r21-rec-over');
  assert(state.paid === 80 && state.balance === 20 && state.status === 'PARTIALLY_PAID', `AR 80+80 obligation mismatch ${JSON.stringify(state)}`);
  assert(await accountBalance('r21-rec-over-acc') === 80, 'AR 80+80 cash must be exactly 80');
  assert(await txCountFor('receivable_id','r21-rec-over') === 1, 'AR 80+80 must create one transaction');
}

async function testConcurrentExactReceipt(): Promise<void> {
  const results = await Promise.allSettled([
    receipt('r21-rec-exact','r21-rec-exact-acc',60,'r21-rec-exact-a'),
    receipt('r21-rec-exact','r21-rec-exact-acc',40,'r21-rec-exact-b'),
  ]);
  assert(results.every((r) => r.status === 'fulfilled'), 'AR 60+40 must both settle');
  const state = await receivableState('r21-rec-exact');
  assert(state.paid === 100 && state.balance === 0 && state.status === 'PAID', `AR 60+40 obligation mismatch ${JSON.stringify(state)}`);
  assert(await accountBalance('r21-rec-exact-acc') === 100, 'AR 60+40 cash must be exactly 100');
  assert(await txCountFor('receivable_id','r21-rec-exact') === 2, 'AR 60+40 must create two transactions');
}

async function testConcurrentOverpaymentPayment(): Promise<void> {
  const results = await Promise.allSettled([
    payment('r21-pay-over','r21-pay-over-acc',80,'r21-pay-over-a'),
    payment('r21-pay-over','r21-pay-over-acc',80,'r21-pay-over-b'),
  ]);
  assert(results.filter((r) => r.status === 'fulfilled').length === 1, 'AP 80+80 must allow exactly one settlement');
  const state = await payableState('r21-pay-over');
  assert(state.paid === 80 && state.balance === 20 && state.status === 'PARTIALLY_PAID', `AP 80+80 obligation mismatch ${JSON.stringify(state)}`);
  assert(await accountBalance('r21-pay-over-acc') === 920, 'AP 80+80 account must be exactly 920');
  assert(await txCountFor('payable_id','r21-pay-over') === 1, 'AP 80+80 must create one transaction');
}

async function testConcurrentExactPayment(): Promise<void> {
  const results = await Promise.allSettled([
    payment('r21-pay-exact','r21-pay-exact-acc',60,'r21-pay-exact-a'),
    payment('r21-pay-exact','r21-pay-exact-acc',40,'r21-pay-exact-b'),
  ]);
  assert(results.every((r) => r.status === 'fulfilled'), 'AP 60+40 must both settle');
  const state = await payableState('r21-pay-exact');
  assert(state.paid === 100 && state.balance === 0 && state.status === 'PAID', `AP 60+40 obligation mismatch ${JSON.stringify(state)}`);
  assert(await accountBalance('r21-pay-exact-acc') === 900, 'AP 60+40 account must be exactly 900');
  assert(await txCountFor('payable_id','r21-pay-exact') === 2, 'AP 60+40 must create two transactions');
}

async function testReceiptRetryIdempotency(): Promise<void> {
  const first = await receipt('r21-rec-retry','r21-rec-retry-acc',35,'r21-rec-retry-key');
  const retry = await receipt('r21-rec-retry','r21-rec-retry-acc',35,'r21-rec-retry-key');
  assert(first.transaction.id === retry.transaction.id, 'same receipt key must return original transaction');
  const state = await receivableState('r21-rec-retry');
  assert(state.paid === 35 && state.balance === 65, 'receipt retry mutated obligation twice');
  assert(await accountBalance('r21-rec-retry-acc') === 35, 'receipt retry mutated cash twice');
  assert(await txCountFor('receivable_id','r21-rec-retry') === 1, 'receipt retry created duplicate transaction');
  assert(await auditCount('r21-rec-retry') === 1, 'receipt retry must audit exactly once');
}

async function testPaymentRetryIdempotency(): Promise<void> {
  const first = await payment('r21-pay-retry','r21-pay-retry-acc',35,'r21-pay-retry-key');
  const retry = await payment('r21-pay-retry','r21-pay-retry-acc',35,'r21-pay-retry-key');
  assert(first.transaction.id === retry.transaction.id, 'same payment key must return original transaction');
  const state = await payableState('r21-pay-retry');
  assert(state.paid === 35 && state.balance === 65, 'payment retry mutated obligation twice');
  assert(await accountBalance('r21-pay-retry-acc') === 965, 'payment retry mutated account twice');
  assert(await txCountFor('payable_id','r21-pay-retry') === 1, 'payment retry created duplicate transaction');
  assert(await auditCount('r21-pay-retry') === 1, 'payment retry must audit exactly once');
}

async function testConflictingRetryFailsClosed(): Promise<void> {
  await receipt('r21-rec-conflict','r21-rec-conflict-acc',25,'r21-rec-conflict-key');
  let message = '';
  try {
    await receipt('r21-rec-conflict','r21-rec-conflict-acc',30,'r21-rec-conflict-key');
  } catch (error) {
    message = String(error);
  }
  assert(message.includes('Chave de idempotência reutilizada'), `conflicting retry must fail closed, got ${message}`);
  const state = await receivableState('r21-rec-conflict');
  assert(state.paid === 25 && state.balance === 75, 'conflicting retry changed obligation');
  assert(await accountBalance('r21-rec-conflict-acc') === 25, 'conflicting retry changed cash');
  assert(await txCountFor('receivable_id','r21-rec-conflict') === 1, 'conflicting retry created transaction');
}

async function testSettlementVsCancellationReceipt(): Promise<void> {
  const results = await Promise.allSettled([
    receipt('r21-rec-cancel','r21-rec-cancel-acc',100,'r21-rec-cancel-settlement'),
    UnitOfWork.run(companyId, async (tx) => ReceivableService.cancelReceivable(
      companyId,'r21-rec-cancel','concurrent cancel',adminId,'Finance R21 Admin',tx
    )),
  ]);
  assert(results.filter((r) => r.status === 'fulfilled').length === 1, 'receipt vs cancellation must have exactly one winner');
  const state = await receivableState('r21-rec-cancel');
  const balance = await accountBalance('r21-rec-cancel-acc');
  const count = await txCountFor('receivable_id','r21-rec-cancel');
  if (state.status === 'PAID') {
    assert(state.paid === 100 && state.balance === 0 && balance === 100 && count === 1, 'settlement winner left inconsistent receipt state');
  } else {
    assert(state.status === 'CANCELLED' && state.paid === 0 && state.balance === 100 && balance === 0 && count === 0, 'cancellation winner left inconsistent receipt state');
  }
}

async function testSettlementVsCancellationPayment(): Promise<void> {
  const results = await Promise.allSettled([
    payment('r21-pay-cancel','r21-pay-cancel-acc',100,'r21-pay-cancel-settlement'),
    UnitOfWork.run(companyId, async (tx) => PayableService.cancelPayable(
      companyId,'r21-pay-cancel','concurrent cancel',adminId,'Finance R21 Admin',tx
    )),
  ]);
  assert(results.filter((r) => r.status === 'fulfilled').length === 1, 'payment vs cancellation must have exactly one winner');
  const state = await payableState('r21-pay-cancel');
  const balance = await accountBalance('r21-pay-cancel-acc');
  const count = await txCountFor('payable_id','r21-pay-cancel');
  if (state.status === 'PAID') {
    assert(state.paid === 100 && state.balance === 0 && balance === 900 && count === 1, 'settlement winner left inconsistent payment state');
  } else {
    assert(state.status === 'CANCELLED' && state.paid === 0 && state.balance === 100 && balance === 1000 && count === 0, 'cancellation winner left inconsistent payment state');
  }
}

export async function run(): Promise<void> {
  await seed();
  await testConcurrentOverpaymentReceipt();
  await testConcurrentExactReceipt();
  await testConcurrentOverpaymentPayment();
  await testConcurrentExactPayment();
  await testReceiptRetryIdempotency();
  await testPaymentRetryIdempotency();
  await testConflictingRetryFailsClosed();
  await testSettlementVsCancellationReceipt();
  await testSettlementVsCancellationPayment();
  console.log('FINANCE-R21 settlement concurrency/idempotency integration PASS');
}

if (process.env.FINANCE_ISOLATED_RUNNER !== 'true') run().catch((error) => {
  console.error(error);
  process.exit(1);
});
