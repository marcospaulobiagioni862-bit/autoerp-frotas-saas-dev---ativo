import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { ReversalService } from '../../domain/finance/ReversalService';
import { FinancialPeriodService } from '../../domain/finance/FinancialPeriodService';

const companyA = 'finance-r18-company-a';
const companyB = 'finance-r18-company-b';
const adminA = 'finance-r18-admin-a';
const viewerA = 'finance-r18-viewer-a';
const adminB = 'finance-r18-admin-b';
const paymentMethodA = 'finance-r18-pm-a';
const paymentMethodB = 'finance-r18-pm-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function scalar(query: any): Promise<any> {
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

async function seedAccount(id: string, companyId: string, balance: number, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'): Promise<void> {
  await db.execute(sql`
    INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at)
    VALUES(${id},${companyId},${id},'BANK',${balance},${balance},${status},NOW(),NOW())
  `);
}

async function seedReceivable(id: string, amount: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO account_receivables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,
      discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
      due_date,competence_date,status,idempotency_key,created_at,updated_at
    ) VALUES(
      ${id},${companyA},'MANUAL',${`${id}-origin`},'finance-r18-income',${id},${amount},
      0,0,0,${amount},${amount},0,'2026-09-20','2026-08-22','PAID',${`${id}-obligation-key`},NOW(),NOW()
    )
  `);
}

async function seedPayable(id: string, amount: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO account_payables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,
      discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
      due_date,competence_date,status,idempotency_key,created_at,updated_at
    ) VALUES(
      ${id},${companyA},'MANUAL',${`${id}-origin`},'finance-r18-expense',${id},${amount},
      0,0,0,${amount},${amount},0,'2026-09-20','2026-08-22','PAID',${`${id}-obligation-key`},NOW(),NOW()
    )
  `);
}

async function seedTransaction(input: {
  id: string;
  companyId?: string;
  accountId: string;
  destinationAccountId?: string;
  receivableId?: string;
  payableId?: string;
  type?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount?: number;
  date?: string;
  userId?: string;
  paymentMethodId?: string;
}): Promise<void> {
  const targetCompany = input.companyId || companyA;
  const targetUser = input.userId || (targetCompany === companyA ? adminA : adminB);
  const targetMethod = input.paymentMethodId || (targetCompany === companyA ? paymentMethodA : paymentMethodB);
  const type = input.type || 'INCOME';
  const amount = input.amount ?? 100;
  const date = input.date || '2026-08-22';
  await db.execute(sql`
    INSERT INTO financial_transactions(
      id,company_id,financial_account_id,destination_account_id,receivable_id,payable_id,
      type,amount,payment_method_id,transaction_date,competence_date,description,is_reversed,
      reversal_transaction_id,created_by_id,created_at,updated_at
    ) VALUES(
      ${input.id},${targetCompany},${input.accountId},${input.destinationAccountId || null},
      ${input.receivableId || null},${input.payableId || null},${type},${amount},${targetMethod},
      ${date},${date},${`Original ${input.id}`},false,null,${targetUser},NOW(),NOW()
    )
  `);
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM financial_transactions WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM account_receivables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM account_payables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_periods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM payment_methods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_categories WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);

  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
      (${companyA},'Finance R18 A','ACTIVE',NOW(),NOW()),
      (${companyB},'Finance R18 B','ACTIVE',NOW(),NOW())
  `);

  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
      (${adminA},${companyA},'R18 Admin A','r18-admin-a@example.test','ADMIN',true,NOW(),NOW()),
      (${viewerA},${companyA},'R18 Viewer A','r18-viewer-a@example.test','FINANCIAL_VIEWER',true,NOW(),NOW()),
      (${adminB},${companyB},'R18 Admin B','r18-admin-b@example.test','ADMIN',true,NOW(),NOW())
  `);

  await db.execute(sql`
    INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active) VALUES
      (${paymentMethodA},${companyA},'PIX R18 A','PIX',0,true),
      (${paymentMethodB},${companyB},'PIX R18 B','PIX',0,true)
  `);

  await db.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES
      ('finance-r18-income',${companyA},'Income R18','INCOME',true,NOW(),NOW()),
      ('finance-r18-expense',${companyA},'Expense R18','EXPENSE',true,NOW(),NOW())
  `);

  const accounts: Array<[string, number, 'ACTIVE' | 'INACTIVE'?]> = [
    ['r18-over-acc', 100],
    ['r18-exact-acc', 100],
    ['r18-retry-acc', 100],
    ['r18-conflict-acc', 100],
    ['r18-rec-acc', 100],
    ['r18-pay-acc', 900],
    ['r18-transfer-source', 900],
    ['r18-transfer-destination', 200],
    ['r18-closed-acc', 100],
    ['r18-unauthorized-acc', 100],
    ['r18-missing-key-acc', 100],
    ['r18-inactive-acc', 100, 'INACTIVE'],
  ];
  for (const [id, balance, status] of accounts) {
    await seedAccount(id, companyA, balance, status || 'ACTIVE');
  }
  await seedAccount('r18-tenant-b-acc', companyB, 100);

  await seedReceivable('r18-rec', 100);
  await seedPayable('r18-pay', 100);

  await seedTransaction({ id: 'r18-over-tx', accountId: 'r18-over-acc' });
  await seedTransaction({ id: 'r18-exact-tx', accountId: 'r18-exact-acc' });
  await seedTransaction({ id: 'r18-retry-tx', accountId: 'r18-retry-acc' });
  await seedTransaction({ id: 'r18-conflict-tx', accountId: 'r18-conflict-acc' });
  await seedTransaction({ id: 'r18-rec-tx', accountId: 'r18-rec-acc', receivableId: 'r18-rec' });
  await seedTransaction({ id: 'r18-pay-tx', accountId: 'r18-pay-acc', payableId: 'r18-pay', type: 'EXPENSE' });
  await seedTransaction({ id: 'r18-transfer-tx', accountId: 'r18-transfer-source', destinationAccountId: 'r18-transfer-destination', type: 'TRANSFER' });
  await seedTransaction({ id: 'r18-closed-tx', accountId: 'r18-closed-acc', date: '2026-08-05' });
  await seedTransaction({ id: 'r18-unauthorized-tx', accountId: 'r18-unauthorized-acc' });
  await seedTransaction({ id: 'r18-missing-key-tx', accountId: 'r18-missing-key-acc' });
  await seedTransaction({ id: 'r18-inactive-tx', accountId: 'r18-inactive-acc' });
  await seedTransaction({ id: 'r18-tenant-b-tx', companyId: companyB, accountId: 'r18-tenant-b-acc' });
}

function reverse(
  transactionId: string,
  amount: number,
  key: string | undefined,
  options?: { companyId?: string; userId?: string; userName?: string; reason?: string }
) {
  const targetCompany = options?.companyId || companyA;
  const targetUser = options?.userId || (targetCompany === companyA ? adminA : adminB);
  const targetName = options?.userName || (targetCompany === companyA ? 'R18 Admin A' : 'R18 Admin B');
  return UnitOfWork.run(
    targetCompany,
    async (tx) => ReversalService.reverseTransaction(
      targetCompany,
      transactionId,
      amount,
      options?.reason || 'R18 correction',
      targetUser,
      targetName,
      tx,
      key
    ),
    { financialPeriodLock: 'SHARED' }
  );
}

async function accountBalance(companyId: string, id: string): Promise<number> {
  const row = await scalar(sql`SELECT current_balance FROM financial_accounts WHERE company_id=${companyId} AND id=${id}`);
  return Number(row?.current_balance || 0);
}

async function reversalState(companyId: string, originalId: string) {
  const row = await scalar(sql`
    SELECT count(*)::int AS count, COALESCE(sum(amount),0) AS amount
    FROM financial_transactions
    WHERE company_id=${companyId} AND type='REVERSAL' AND reversal_transaction_id=${originalId}
  `);
  const original = await scalar(sql`
    SELECT is_reversed FROM financial_transactions WHERE company_id=${companyId} AND id=${originalId}
  `);
  return {
    count: Number(row?.count || 0),
    amount: Number(row?.amount || 0),
    isReversed: Boolean(original?.is_reversed),
  };
}

async function auditCount(originalId: string): Promise<number> {
  const row = await scalar(sql`
    SELECT count(*)::int AS count FROM audit_logs
    WHERE company_id=${companyA} AND entity_id=${originalId}
  `);
  return Number(row?.count || 0);
}

async function run(): Promise<void> {
  await seed();

  const over = await Promise.allSettled([
    reverse('r18-over-tx', 80, 'r18-over-a'),
    reverse('r18-over-tx', 80, 'r18-over-b'),
  ]);
  assert(over.filter((result) => result.status === 'fulfilled').length === 1, '80+80 must allow exactly one reversal');
  assert(JSON.stringify(await reversalState(companyA, 'r18-over-tx')) === JSON.stringify({ count: 1, amount: 80, isReversed: false }), '80+80 reversal state mismatch');
  assert(await accountBalance(companyA, 'r18-over-acc') === 20, '80+80 account must end at 20');

  const exact = await Promise.allSettled([
    reverse('r18-exact-tx', 60, 'r18-exact-a'),
    reverse('r18-exact-tx', 40, 'r18-exact-b'),
  ]);
  assert(exact.every((result) => result.status === 'fulfilled'), '60+40 must both serialize successfully');
  assert(JSON.stringify(await reversalState(companyA, 'r18-exact-tx')) === JSON.stringify({ count: 2, amount: 100, isReversed: true }), '60+40 reversal state mismatch');
  assert(await accountBalance(companyA, 'r18-exact-acc') === 0, '60+40 account must end at 0');

  const sameKey = await Promise.all([
    reverse('r18-retry-tx', 35, 'r18-retry-key'),
    reverse('r18-retry-tx', 35, 'r18-retry-key'),
  ]);
  assert(sameKey[0].id === sameKey[1].id, 'same key retry must converge to one reversal transaction');
  assert(JSON.stringify(await reversalState(companyA, 'r18-retry-tx')) === JSON.stringify({ count: 1, amount: 35, isReversed: false }), 'same key retry created duplicate reversal');
  assert(await accountBalance(companyA, 'r18-retry-acc') === 65, 'same key retry mutated cash twice');
  assert(await auditCount('r18-retry-tx') === 1, 'same key retry duplicated audit effect');

  const conflictFirst = await reverse('r18-conflict-tx', 25, 'r18-conflict-key');
  assert(Number(conflictFirst.amount) === 25, 'conflict baseline reversal missing');
  await rejects(() => reverse('r18-conflict-tx', 30, 'r18-conflict-key'), 'Chave de idempotência reutilizada');
  assert(JSON.stringify(await reversalState(companyA, 'r18-conflict-tx')) === JSON.stringify({ count: 1, amount: 25, isReversed: false }), 'conflicting key changed reversal state');
  assert(await accountBalance(companyA, 'r18-conflict-acc') === 75, 'conflicting key changed cash');

  const receivableReversal = await reverse('r18-rec-tx', 40, 'r18-rec-key');
  const receivableRetry = await reverse('r18-rec-tx', 40, 'r18-rec-key');
  assert(receivableReversal.id === receivableRetry.id, 'AR retry must converge');
  const rec = await scalar(sql`SELECT paid_amount,balance_amount,status FROM account_receivables WHERE company_id=${companyA} AND id='r18-rec'`);
  assert(Number(rec?.paid_amount) === 60 && Number(rec?.balance_amount) === 40 && String(rec?.status) === 'PARTIALLY_PAID', `AR state mismatch ${JSON.stringify(rec)}`);
  assert(await accountBalance(companyA, 'r18-rec-acc') === 60, 'AR reversal cash mismatch');

  const payableReversal = await reverse('r18-pay-tx', 40, 'r18-pay-key');
  const payableRetry = await reverse('r18-pay-tx', 40, 'r18-pay-key');
  assert(payableReversal.id === payableRetry.id, 'AP retry must converge');
  const pay = await scalar(sql`SELECT paid_amount,balance_amount,status FROM account_payables WHERE company_id=${companyA} AND id='r18-pay'`);
  assert(Number(pay?.paid_amount) === 60 && Number(pay?.balance_amount) === 40 && String(pay?.status) === 'PARTIALLY_PAID', `AP state mismatch ${JSON.stringify(pay)}`);
  assert(await accountBalance(companyA, 'r18-pay-acc') === 940, 'AP reversal account mismatch');

  const transferReversal = await reverse('r18-transfer-tx', 100, 'r18-transfer-key');
  const transferRetry = await reverse('r18-transfer-tx', 100, 'r18-transfer-key');
  assert(transferReversal.id === transferRetry.id, 'transfer retry must converge');
  assert(await accountBalance(companyA, 'r18-transfer-source') === 1000, 'transfer source not restored exactly once');
  assert(await accountBalance(companyA, 'r18-transfer-destination') === 100, 'transfer destination not restored exactly once');
  assert((await reversalState(companyA, 'r18-transfer-tx')).isReversed, 'full transfer reversal must mark original reversed');

  await rejects(
    () => reverse('r18-over-tx', 1, 'r18-cross-tenant-attempt', { companyId: companyB }),
    'Transação não encontrada'
  );
  const tenantB = await reverse('r18-tenant-b-tx', 20, 'r18-retry-key', { companyId: companyB });
  assert(tenantB.companyId === companyB, 'tenant B reversal did not remain tenant-scoped');
  assert(await accountBalance(companyB, 'r18-tenant-b-acc') === 80, 'tenant B account reversal mismatch');
  const sameKeyAcrossTenants = await scalar(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE idempotency_key='r18-retry-key'`);
  assert(Number(sameKeyAcrossTenants?.count) === 2, 'same idempotency key should be independently valid across two tenants');

  const closed = await UnitOfWork.run(
    companyA,
    async (tx) => FinancialPeriodService.closePeriod({
      companyId: companyA,
      startDate: '2026-08-05',
      endDate: '2026-08-05',
      userId: adminA,
      userName: 'R18 Admin A',
    }, tx),
    { financialPeriodLock: 'EXCLUSIVE' }
  );
  assert(closed.status === 'CLOSED', 'failed to create R18 closed period');
  await rejects(() => reverse('r18-closed-tx', 10, 'r18-closed-key'), 'está fechado');
  assert((await reversalState(companyA, 'r18-closed-tx')).count === 0, 'closed period created a reversal');
  assert(await accountBalance(companyA, 'r18-closed-acc') === 100, 'closed period changed cash');

  await rejects(
    () => reverse('r18-unauthorized-tx', 10, 'r18-unauthorized-key', {
      userId: viewerA,
      userName: 'R18 Viewer A',
    }),
    'Acesso negado'
  );
  assert((await reversalState(companyA, 'r18-unauthorized-tx')).count === 0, 'unauthorized actor created reversal');

  await rejects(() => reverse('r18-inactive-tx', 10, 'r18-inactive-key'), 'Conta financeira inativa');
  assert((await reversalState(companyA, 'r18-inactive-tx')).count === 0, 'inactive account created reversal');
  assert(await accountBalance(companyA, 'r18-inactive-acc') === 100, 'inactive account balance changed');

  await rejects(() => reverse('r18-missing-key-tx', 10, undefined), 'Chave de idempotência do estorno é obrigatória');
  assert((await reversalState(companyA, 'r18-missing-key-tx')).count === 0, 'missing key created reversal');

  console.log('FINANCE-R18 reversal concurrency/idempotency integration PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
