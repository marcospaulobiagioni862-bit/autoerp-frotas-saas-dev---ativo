import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { SettlementService } from '../../domain/finance/SettlementService';
import { ReversalService } from '../../domain/finance/ReversalService';
import { PayableService } from '../../domain/finance/PayableService';

const company = 'installment-order-company';
const user = 'installment-order-user';
const account = 'installment-order-account';
const method = 'installment-order-method';

async function seed(): Promise<void> {
  await db.execute(sql`INSERT INTO companies(id,name,status) VALUES(${company},'Installment order','ACTIVE')`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active) VALUES(${user},${company},'Tester','installment-order@example.test','ADMIN',true)`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status) VALUES(${account},${company},'Bank','BANK',10000,10000,'ACTIVE')`);
  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,active) VALUES(${method},${company},'PIX','PIX',true)`);
  await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active) VALUES('installment-order-category',${company},'Expense','EXPENSE',true)`);
  for (const [id, group, number] of [
    ['order-a-1','order-a',1], ['order-a-2','order-a',2],
    ['order-b-1','order-b',1], ['order-b-2','order-b',2],
    ['order-single',null,null], ['order-cancel-1','order-cancel',1], ['order-cancel-2','order-cancel',2],
  ] as const) {
    await db.execute(sql`INSERT INTO account_payables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,updated_amount,
      paid_amount,balance_amount,due_date,competence_date,status,installment_group_id,installment_number,total_installments
    ) VALUES(${id},${company},'MANUAL',${group || id},'installment-order-category',${id},100,100,
      0,100,'2026-09-22','2026-09-22','PENDING',${group},${number},${group ? 2 : null})`);
  }
}

let command = 0;
async function pay(id: string, amount = 100) {
  return UnitOfWork.run(company, (tx) => SettlementService.registerPayment({
    companyId: company, obligationId: id, financialAccountId: account, paymentMethodId: method,
    paymentAmount: amount, paymentDate: '2026-09-22', idempotencyKey: `order-payment-${++command}`,
    userId: user, userName: 'Tester',
  }, tx));
}

async function transactionCount(id: string): Promise<number> {
  const result: any = await db.execute(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${company} AND payable_id=${id}`);
  return Number(result.rows[0].count);
}

async function blocked(id: string, installment: string): Promise<void> {
  const before: any = await db.execute(sql`SELECT paid_amount,balance_amount FROM account_payables WHERE id=${id}`);
  const transactions = await transactionCount(id);
  await assert.rejects(pay(id), new RegExp(`Quite primeiro a parcela ${installment}`));
  const after: any = await db.execute(sql`SELECT paid_amount,balance_amount FROM account_payables WHERE id=${id}`);
  assert.deepEqual(after.rows, before.rows, 'blocked attempt cannot change payable balance');
  assert.equal(await transactionCount(id), transactions, 'blocked attempt cannot create a transaction');
}

export async function runPayableInstallmentOrderIntegration(): Promise<void> {
  await seed();
  await blocked('order-a-2', '1/2');
  const partial = await pay('order-a-1', 40);
  assert.equal(partial.payable.status, 'PARTIALLY_PAID', 'first installment can be partially paid');
  await blocked('order-a-2', '1/2');
  await pay('order-a-1', 60);
  await pay('order-a-2', 40);
  assert.equal(await transactionCount('order-a-2'), 1, 'second installment is available after first is settled');
  await pay('order-single');
  assert.equal(await transactionCount('order-single'), 1, 'standalone title is available');
  await blocked('order-b-2', '1/2');
  const concurrent = await Promise.allSettled([pay('order-b-2'), pay('order-b-2')]);
  assert(concurrent.every((result) => result.status === 'rejected'), 'concurrent attempts cannot skip the first installment');
  assert.equal(await transactionCount('order-b-2'), 0, 'concurrent blocked attempts cannot create transactions');
  await UnitOfWork.run(company, (tx) => PayableService.cancelPayable(company, 'order-cancel-1', 'Cancelled obligation', user, 'Tester', tx));
  await pay('order-cancel-2');
  assert.equal(await transactionCount('order-cancel-2'), 1, 'documented cancellation releases next installment');
  await UnitOfWork.run(company, (tx) => ReversalService.reverseTransaction(company, partial.transaction.id, 40, 'Restore balance', user, 'Tester', tx, 'order-reversal'));
  await blocked('order-a-2', '1/2');
  console.log('Payable installment order integration: PASS');
}
