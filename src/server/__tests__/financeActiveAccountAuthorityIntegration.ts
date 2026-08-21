import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { SettlementService } from '../../domain/finance/SettlementService';
import { TransferService } from '../../domain/finance/TransferService';

const companyId = 'finance-r5-company';
const adminId = 'finance-r5-admin';
const activeSource = 'finance-r5-active-source';
const activeDestination = 'finance-r5-active-destination';
const inactiveAccount = 'finance-r5-inactive-account';
const paymentMethodId = 'finance-r5-payment-method';
const receivableId = 'finance-r5-receivable';
const payableId = 'finance-r5-payable';

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

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at)
    VALUES(${companyId},'Finance R5','ACTIVE',NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${adminId},${companyId},'Finance R5 Admin','finance-r5-admin@example.test','ADMIN',true,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at)
    VALUES
      (${activeSource},${companyId},'R5 Active Source','BANK',1000,1000,'ACTIVE',NOW(),NOW()),
      (${activeDestination},${companyId},'R5 Active Destination','BANK',100,100,'ACTIVE',NOW(),NOW()),
      (${inactiveAccount},${companyId},'R5 Inactive','BANK',500,500,'INACTIVE',NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active)
    VALUES(${paymentMethodId},${companyId},'PIX R5','PIX',0,true)
    ON CONFLICT(id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at)
    VALUES
      ('finance-r5-income',${companyId},'Receita R5','INCOME',true,NOW(),NOW()),
      ('finance-r5-expense',${companyId},'Despesa R5','EXPENSE',true,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO account_receivables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,
      discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
      due_date,competence_date,status,idempotency_key,created_at,updated_at
    ) VALUES(
      ${receivableId},${companyId},'MANUAL','finance-r5-origin-rec','finance-r5-income','Receivable R5',1000,
      0,0,0,1000,0,1000,'2026-09-20','2026-08-21','PENDING','finance-r5-rec-key',NOW(),NOW()
    ) ON CONFLICT(id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO account_payables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,
      discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
      due_date,competence_date,status,idempotency_key,created_at,updated_at
    ) VALUES(
      ${payableId},${companyId},'MANUAL','finance-r5-origin-pay','finance-r5-expense','Payable R5',1000,
      0,0,0,1000,0,1000,'2026-09-20','2026-08-21','PENDING','finance-r5-pay-key',NOW(),NOW()
    ) ON CONFLICT(id) DO NOTHING
  `);
}

async function snapshot() {
  const rec = await scalar(sql`SELECT paid_amount,balance_amount,status FROM account_receivables WHERE id=${receivableId}`);
  const pay = await scalar(sql`SELECT paid_amount,balance_amount,status FROM account_payables WHERE id=${payableId}`);
  const source = await scalar(sql`SELECT current_balance FROM financial_accounts WHERE id=${activeSource}`);
  const destination = await scalar(sql`SELECT current_balance FROM financial_accounts WHERE id=${activeDestination}`);
  const inactive = await scalar(sql`SELECT current_balance FROM financial_accounts WHERE id=${inactiveAccount}`);
  const tx = await scalar(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyId}`);
  return {
    recPaid: Number(rec?.paid_amount || 0),
    recBalance: Number(rec?.balance_amount || 0),
    recStatus: String(rec?.status || ''),
    payPaid: Number(pay?.paid_amount || 0),
    payBalance: Number(pay?.balance_amount || 0),
    payStatus: String(pay?.status || ''),
    source: Number(source?.current_balance || 0),
    destination: Number(destination?.current_balance || 0),
    inactive: Number(inactive?.current_balance || 0),
    txCount: Number(tx?.count || 0),
  };
}

function assertSnapshotEqual(actual: Awaited<ReturnType<typeof snapshot>>, expected: Awaited<ReturnType<typeof snapshot>>, label: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mutated financial state: ${JSON.stringify({ expected, actual })}`);
}

async function run(): Promise<void> {
  await seed();

  const baseline = await snapshot();

  await rejects(
    () => UnitOfWork.run(companyId, async (tx) =>
      await SettlementService.registerReceipt({
        companyId,
        obligationId: receivableId,
        financialAccountId: inactiveAccount,
        paymentMethodId,
        paymentAmount: 100,
        paymentDate: '2026-08-21',
        userId: adminId,
        userName: 'Finance R5 Admin',
      }, tx)
    ),
    'Conta financeira inativa'
  );
  assertSnapshotEqual(await snapshot(), baseline, 'inactive-account receipt');

  await rejects(
    () => UnitOfWork.run(companyId, async (tx) =>
      await SettlementService.registerPayment({
        companyId,
        obligationId: payableId,
        financialAccountId: inactiveAccount,
        paymentMethodId,
        paymentAmount: 100,
        paymentDate: '2026-08-21',
        userId: adminId,
        userName: 'Finance R5 Admin',
      }, tx)
    ),
    'Conta financeira inativa'
  );
  assertSnapshotEqual(await snapshot(), baseline, 'inactive-account payment');

  await rejects(
    () => UnitOfWork.run(companyId, async (tx) =>
      await TransferService.transferFunds({
        companyId,
        sourceAccountId: inactiveAccount,
        destinationAccountId: activeDestination,
        amount: 50,
        transferDate: '2026-08-21',
        paymentMethodId,
        description: 'Inactive source transfer',
        userId: adminId,
        userName: 'Finance R5 Admin',
      }, tx)
    ),
    'Conta financeira de origem inativa'
  );
  assertSnapshotEqual(await snapshot(), baseline, 'inactive-source transfer');

  await rejects(
    () => UnitOfWork.run(companyId, async (tx) =>
      await TransferService.transferFunds({
        companyId,
        sourceAccountId: activeSource,
        destinationAccountId: inactiveAccount,
        amount: 50,
        transferDate: '2026-08-21',
        paymentMethodId,
        description: 'Inactive destination transfer',
        userId: adminId,
        userName: 'Finance R5 Admin',
      }, tx)
    ),
    'Conta financeira de destino inativa'
  );
  assertSnapshotEqual(await snapshot(), baseline, 'inactive-destination transfer');

  const receipt = await UnitOfWork.run(companyId, async (tx) =>
    await SettlementService.registerReceipt({
      companyId,
      obligationId: receivableId,
      financialAccountId: activeSource,
      paymentMethodId,
      paymentAmount: 100,
      paymentDate: '2026-08-21',
      userId: adminId,
      userName: 'Finance R5 Admin',
    }, tx)
  );
  assert(receipt.receivable.paidAmount === 100, 'active-account receipt did not settle 100');

  const payment = await UnitOfWork.run(companyId, async (tx) =>
    await SettlementService.registerPayment({
      companyId,
      obligationId: payableId,
      financialAccountId: activeSource,
      paymentMethodId,
      paymentAmount: 100,
      paymentDate: '2026-08-21',
      userId: adminId,
      userName: 'Finance R5 Admin',
    }, tx)
  );
  assert(payment.payable.paidAmount === 100, 'active-account payment did not settle 100');

  const transfer = await UnitOfWork.run(companyId, async (tx) =>
    await TransferService.transferFunds({
      companyId,
      sourceAccountId: activeSource,
      destinationAccountId: activeDestination,
      amount: 50,
      transferDate: '2026-08-21',
      paymentMethodId,
      description: 'Active R5 transfer',
      userId: adminId,
      userName: 'Finance R5 Admin',
    }, tx)
  );
  assert(transfer.amount === 50, 'active-account transfer amount mismatch');

  const finalState = await snapshot();
  assert(finalState.recPaid === 100 && finalState.recBalance === 900, 'active receipt final obligation state mismatch');
  assert(finalState.payPaid === 100 && finalState.payBalance === 900, 'active payment final obligation state mismatch');
  assert(finalState.source === 950, `active source expected 950, got ${finalState.source}`);
  assert(finalState.destination === 150, `active destination expected 150, got ${finalState.destination}`);
  assert(finalState.inactive === 500, `inactive account balance changed to ${finalState.inactive}`);
  assert(finalState.txCount === baseline.txCount + 3, `expected 3 valid transactions, got delta ${finalState.txCount - baseline.txCount}`);

  console.log('FINANCE-R5 active account authority integration PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});