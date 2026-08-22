import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { FinancialPeriodService } from '../../domain/finance/FinancialPeriodService';
import { SettlementService } from '../../domain/finance/SettlementService';

const companyA = 'finance-r15-company-a';
const companyB = 'finance-r15-company-b';
const adminA = 'finance-r15-admin-a';
const managerA = 'finance-r15-manager-a';
const viewerA = 'finance-r15-viewer-a';
const adminB = 'finance-r15-admin-b';
const accountA = 'finance-r15-account-a';
const accountB = 'finance-r15-account-b';
const paymentMethodA = 'finance-r15-pm-a';
const paymentMethodB = 'finance-r15-pm-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function seedReceivable(id: string, companyId: string, amount: number, date: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO account_receivables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,
      discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
      due_date,competence_date,status,idempotency_key,created_at,updated_at
    ) VALUES(
      ${id},${companyId},'MANUAL',${`${id}-origin`},${companyId === companyA ? 'finance-r15-income-a' : 'finance-r15-income-b'},
      ${id},${amount},0,0,0,${amount},0,${amount},${date},${date},'PENDING',${`${id}-seed-key`},NOW(),NOW()
    )
    ON CONFLICT(id) DO UPDATE SET
      paid_amount=0,balance_amount=${amount},status='PENDING',updated_amount=${amount},updated_at=NOW()
  `);
}

async function seedPayable(id: string, companyId: string, amount: number, date: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO account_payables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,
      discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
      due_date,competence_date,status,idempotency_key,created_at,updated_at
    ) VALUES(
      ${id},${companyId},'MANUAL',${`${id}-origin`},${companyId === companyA ? 'finance-r15-expense-a' : 'finance-r15-expense-b'},
      ${id},${amount},0,0,0,${amount},0,${amount},${date},${date},'PENDING',${`${id}-seed-key`},NOW(),NOW()
    )
    ON CONFLICT(id) DO UPDATE SET
      paid_amount=0,balance_amount=${amount},status='PENDING',updated_amount=${amount},updated_at=NOW()
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
      (${companyA},'Finance R15 A','ACTIVE',NOW(),NOW()),
      (${companyB},'Finance R15 B','ACTIVE',NOW(),NOW())
  `);

  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
      (${adminA},${companyA},'R15 Admin A','r15-admin-a@example.test','ADMIN',true,NOW(),NOW()),
      (${managerA},${companyA},'R15 Manager A','r15-manager-a@example.test','MANAGER',true,NOW(),NOW()),
      (${viewerA},${companyA},'R15 Viewer A','r15-viewer-a@example.test','FINANCIAL',true,NOW(),NOW()),
      (${adminB},${companyB},'R15 Admin B','r15-admin-b@example.test','ADMIN',true,NOW(),NOW())
  `);

  await db.execute(sql`
    INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at) VALUES
      (${accountA},${companyA},'R15 Account A','BANK',1000,1000,'ACTIVE',NOW(),NOW()),
      (${accountB},${companyB},'R15 Account B','BANK',1000,1000,'ACTIVE',NOW(),NOW())
  `);

  await db.execute(sql`
    INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active) VALUES
      (${paymentMethodA},${companyA},'PIX A','PIX',0,true),
      (${paymentMethodB},${companyB},'PIX B','PIX',0,true)
  `);

  await db.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES
      ('finance-r15-income-a',${companyA},'Income A','INCOME',true,NOW(),NOW()),
      ('finance-r15-expense-a',${companyA},'Expense A','EXPENSE',true,NOW(),NOW()),
      ('finance-r15-income-b',${companyB},'Income B','INCOME',true,NOW(),NOW()),
      ('finance-r15-expense-b',${companyB},'Expense B','EXPENSE',true,NOW(),NOW())
  `);

  await seedReceivable('finance-r15-rec-boundary', companyA, 100, '2026-08-15');
  await seedPayable('finance-r15-pay-boundary', companyA, 100, '2026-08-15');
  await seedReceivable('finance-r15-rec-outside', companyA, 100, '2026-09-01');
  await seedReceivable('finance-r15-rec-b', companyB, 100, '2026-08-15');
  await seedReceivable('finance-r15-rec-race-close', companyA, 50, '2026-08-20');
  await seedReceivable('finance-r15-rec-race-reopen', companyA, 60, '2026-08-21');
}

async function receipt(companyId: string, obligationId: string, accountId: string, paymentMethodId: string, date: string, key: string, userId: string, userName: string) {
  return UnitOfWork.run(
    companyId,
    async (tx) => SettlementService.registerReceipt({
      companyId,
      obligationId,
      financialAccountId: accountId,
      paymentMethodId,
      paymentAmount: 10,
      paymentDate: date,
      idempotencyKey: key,
      userId,
      userName,
    }, tx),
    { financialPeriodLock: 'SHARED' }
  );
}

async function run(): Promise<void> {
  await seed();

  const closeParams = {
    companyId: companyA,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    userId: adminA,
    userName: 'R15 Admin A',
  };

  const closed = await UnitOfWork.run(
    companyA,
    async (tx) => FinancialPeriodService.closePeriod(closeParams, tx),
    { financialPeriodLock: 'EXCLUSIVE' }
  );
  assert(closed.status === 'CLOSED', 'authoritative close did not persist CLOSED');

  const duplicateClose = await UnitOfWork.run(
    companyA,
    async (tx) => FinancialPeriodService.closePeriod(closeParams, tx),
    { financialPeriodLock: 'EXCLUSIVE' }
  );
  assert(duplicateClose.id === closed.id, 'identical close must be idempotent');
  const closedRows = await scalar(sql`SELECT count(*)::int AS count FROM financial_periods WHERE company_id=${companyA}`);
  assert(Number(closedRows?.count) === 1, 'identical close created a duplicate period');
  const closedAudit = await scalar(sql`SELECT count(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND action='PERIOD_CLOSED'`);
  assert(Number(closedAudit?.count) === 1, 'idempotent close duplicated audit evidence');

  await rejects(
    () => UnitOfWork.run(companyA, async (tx) => FinancialPeriodService.closePeriod({
      ...closeParams,
      startDate: '2026-08-15',
      endDate: '2026-09-15',
    }, tx), { financialPeriodLock: 'EXCLUSIVE' }),
    'sobreposto'
  );

  await rejects(
    () => UnitOfWork.run(companyA, async (tx) => FinancialPeriodService.closePeriod({
      companyId: companyA,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      userId: viewerA,
      userName: 'R15 Viewer A',
    }, tx), { financialPeriodLock: 'EXCLUSIVE' }),
    'Acesso negado'
  );

  await rejects(
    () => receipt(companyA, 'finance-r15-rec-boundary', accountA, paymentMethodA, '2026-08-01', 'r15-start-boundary', adminA, 'R15 Admin A'),
    'está fechado'
  );

  await rejects(
    () => UnitOfWork.run(companyA, async (tx) => SettlementService.registerPayment({
      companyId: companyA,
      obligationId: 'finance-r15-pay-boundary',
      financialAccountId: accountA,
      paymentMethodId: paymentMethodA,
      paymentAmount: 10,
      paymentDate: '2026-08-31',
      idempotencyKey: 'r15-end-boundary',
      userId: adminA,
      userName: 'R15 Admin A',
    }, tx), { financialPeriodLock: 'SHARED' }),
    'está fechado'
  );

  const outside = await receipt(companyA, 'finance-r15-rec-outside', accountA, paymentMethodA, '2026-09-01', 'r15-outside', adminA, 'R15 Admin A');
  assert(Number(outside.receivable.paidAmount) === 10, 'date outside closed range should remain open');

  const periodsB = await UnitOfWork.run(companyB, async (tx) => FinancialPeriodService.getPeriods(companyB, tx));
  assert(periodsB.length === 0, 'tenant B observed tenant A financial period');
  const tenantBReceipt = await receipt(companyB, 'finance-r15-rec-b', accountB, paymentMethodB, '2026-08-15', 'r15-tenant-b', adminB, 'R15 Admin B');
  assert(Number(tenantBReceipt.receivable.paidAmount) === 10, 'tenant B identical date range was incorrectly blocked');

  await rejects(
    () => UnitOfWork.run(companyA, async (tx) => FinancialPeriodService.reopenPeriod({
      companyId: companyA,
      periodId: closed.id,
      reason: '   ',
      userId: adminA,
      userName: 'R15 Admin A',
    }, tx), { financialPeriodLock: 'EXCLUSIVE' }),
    'Motivo'
  );

  await rejects(
    () => UnitOfWork.run(companyA, async (tx) => FinancialPeriodService.reopenPeriod({
      companyId: companyA,
      periodId: closed.id,
      reason: 'Manager não pode reabrir',
      userId: managerA,
      userName: 'R15 Manager A',
    }, tx), { financialPeriodLock: 'EXCLUSIVE' }),
    'Acesso negado'
  );

  const reopened = await UnitOfWork.run(
    companyA,
    async (tx) => FinancialPeriodService.reopenPeriod({
      companyId: companyA,
      periodId: closed.id,
      reason: '  Correção contábil autorizada  ',
      userId: adminA,
      userName: 'R15 Admin A',
    }, tx),
    { financialPeriodLock: 'EXCLUSIVE' }
  );
  assert(reopened.status === 'OPEN', 'reopen did not persist OPEN');
  assert(reopened.reopenReason === 'Correção contábil autorizada', 'reopen reason was not trimmed/persisted');
  assert(Boolean(reopened.reopenedAt), 'reopen timestamp missing');
  const reopenAudit = await scalar(sql`SELECT count(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND action='PERIOD_REOPENED'`);
  assert(Number(reopenAudit?.count) === 1, 'reopen audit missing or duplicated');

  const afterReopen = await receipt(companyA, 'finance-r15-rec-boundary', accountA, paymentMethodA, '2026-08-15', 'r15-after-reopen', adminA, 'R15 Admin A');
  assert(Number(afterReopen.receivable.paidAmount) === 10, 'settlement remained blocked after authoritative reopen');

  let closeLockReady!: () => void;
  const closeLockAcquired = new Promise<void>((resolve) => { closeLockReady = resolve; });
  const racingClose = UnitOfWork.run(
    companyA,
    async (tx) => {
      const item = await FinancialPeriodService.closePeriod(closeParams, tx);
      closeLockReady();
      await tx.getRawTransaction().execute(sql`SELECT pg_sleep(0.25)`);
      return item;
    },
    { financialPeriodLock: 'EXCLUSIVE' }
  );
  await closeLockAcquired;
  const settlementBehindClose = receipt(
    companyA,
    'finance-r15-rec-race-close',
    accountA,
    paymentMethodA,
    '2026-08-20',
    'r15-race-close',
    adminA,
    'R15 Admin A'
  );
  await racingClose;
  await rejects(() => settlementBehindClose, 'está fechado');
  const raceCloseState = await scalar(sql`SELECT paid_amount FROM account_receivables WHERE id='finance-r15-rec-race-close'`);
  assert(Number(raceCloseState?.paid_amount) === 0, 'settlement bypassed concurrently committed close');

  let reopenLockReady!: () => void;
  const reopenLockAcquired = new Promise<void>((resolve) => { reopenLockReady = resolve; });
  const racingReopen = UnitOfWork.run(
    companyA,
    async (tx) => {
      const item = await FinancialPeriodService.reopenPeriod({
        companyId: companyA,
        periodId: closed.id,
        reason: 'Reabertura concorrente controlada',
        userId: adminA,
        userName: 'R15 Admin A',
      }, tx);
      reopenLockReady();
      await tx.getRawTransaction().execute(sql`SELECT pg_sleep(0.25)`);
      return item;
    },
    { financialPeriodLock: 'EXCLUSIVE' }
  );
  await reopenLockAcquired;
  const settlementBehindReopen = receipt(
    companyA,
    'finance-r15-rec-race-reopen',
    accountA,
    paymentMethodA,
    '2026-08-21',
    'r15-race-reopen',
    adminA,
    'R15 Admin A'
  );
  await racingReopen;
  const raceReopenResult = await settlementBehindReopen;
  assert(Number(raceReopenResult.receivable.paidAmount) === 10, 'settlement did not observe authoritative reopen after lock release');

  await rejects(
    () => UnitOfWork.run(companyA, async (tx) => FinancialPeriodService.assertDateOpen(companyA, '2026-02-30', tx)),
    'data inválida'
  );

  console.log('FINANCE-R15 authoritative financial period integration PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
