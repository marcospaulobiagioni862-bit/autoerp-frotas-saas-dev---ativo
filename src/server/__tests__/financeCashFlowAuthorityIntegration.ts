import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { CashFlowService } from '../../domain/finance/CashFlowService';

const companyA = 'finance-r24-company-a';
const companyB = 'finance-r24-company-b';
const accountA1 = 'finance-r24-account-a1';
const accountA2 = 'finance-r24-account-a2';
const accountB = 'finance-r24-account-b';
const methodA = 'finance-r24-method-a';
const methodB = 'finance-r24-method-b';
const categoryIncomeA = 'finance-r24-cat-income-a';
const categoryExpenseA = 'finance-r24-cat-expense-a';
const categoryIncomeB = 'finance-r24-cat-income-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function money(value: unknown): number {
  return Math.round(Number(value) * 100) / 100;
}

async function rows(query: any): Promise<any[]> {
  const result: any = await db.execute(query);
  return result.rows || [];
}

async function row(query: any): Promise<any> {
  return (await rows(query))[0];
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM account_receivables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM account_payables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_transactions WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM payment_methods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_categories WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
    (${companyA},'Finance R24 A','ACTIVE',NOW(),NOW()),
    (${companyB},'Finance R24 B','ACTIVE',NOW(),NOW())`);

  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,active) VALUES
    (${methodA},${companyA},'PIX R24 A','PIX',true),
    (${methodB},${companyB},'PIX R24 B','PIX',true)`);

  await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES
    (${categoryIncomeA},${companyA},'Receitas R24','INCOME',true,NOW(),NOW()),
    (${categoryExpenseA},${companyA},'Despesas R24','EXPENSE',true,NOW(),NOW()),
    (${categoryIncomeB},${companyB},'Receitas R24 B','INCOME',true,NOW(),NOW())`);

  // initial balance is the accounting source; current balance is seeded to the
  // fully reconciled post-period balance only as an independent consistency check.
  await db.execute(sql`INSERT INTO financial_accounts(
    id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at
  ) VALUES
    (${accountA1},${companyA},'Conta A1','BANK',1000,1140,'ACTIVE',NOW(),NOW()),
    (${accountA2},${companyA},'Conta A2','BANK',500,700,'ACTIVE',NOW(),NOW()),
    (${accountB},${companyB},'Conta B','BANK',99999,199999,'ACTIVE',NOW(),NOW())`);

  await db.execute(sql`INSERT INTO financial_transactions(
    id,company_id,financial_account_id,destination_account_id,type,amount,payment_method_id,
    transaction_date,competence_date,description,is_reversed,reversal_transaction_id,created_by_id,created_at,updated_at
  ) VALUES
    ('r24-pre-income',${companyA},${accountA1},NULL,'INCOME',100,${methodA},'2026-05-31','2026-05-31','Entrada anterior ao período',false,NULL,'r24-user',NOW(),NOW()),
    ('r24-start-income',${companyA},${accountA1},NULL,'INCOME',100,${methodA},'2026-06-01','2026-06-01','Entrada na data inicial',false,NULL,'r24-user',NOW(),NOW()),
    ('r24-end-expense',${companyA},${accountA1},NULL,'EXPENSE',40,${methodA},'2026-06-30','2026-06-30','Saída na data final',false,NULL,'r24-user',NOW(),NOW()),
    ('r24-transfer',${companyA},${accountA1},${accountA2},'TRANSFER',200,${methodA},'2026-06-08','2026-06-08','Transferência interna',false,NULL,'r24-user',NOW(),NOW()),
    ('r24-original-income',${companyA},${accountA1},NULL,'INCOME',50,${methodA},'2026-06-05','2026-06-05','Receita depois estornada',true,NULL,'r24-user',NOW(),NOW()),
    ('r24-reversal-income',${companyA},${accountA1},NULL,'REVERSAL',50,${methodA},'2026-06-06','2026-06-05','ESTORNO: Receita depois estornada',false,'r24-original-income','r24-user',NOW(),NOW()),
    ('r24-deposit-receipt',${companyA},${accountA1},NULL,'INCOME',300,${methodA},'2026-06-18','2026-06-18','Recebimento de Caução (Contrato: R24)',false,NULL,'r24-user',NOW(),NOW()),
    ('r24-deposit-return',${companyA},${accountA1},NULL,'EXPENSE',120,${methodA},'2026-06-25','2026-06-25','Devolução de Caução (Motorista: R24)',false,NULL,'r24-user',NOW(),NOW()),
    ('r24-foreign-income',${companyB},${accountB},NULL,'INCOME',100000,${methodB},'2026-06-01','2026-06-01','Foreign tenant cash',false,NULL,'r24-user-b',NOW(),NOW())`);

  await db.execute(sql`INSERT INTO account_receivables(
    id,company_id,origin_type,origin_id,category_id,description,original_amount,discount_amount,fine_amount,interest_amount,
    updated_amount,paid_amount,balance_amount,due_date,competence_date,status,idempotency_key,created_at,updated_at
  ) VALUES
    ('r24-ar-partial',${companyA},'MANUAL','r24-ar-partial-origin',${categoryIncomeA},'AR parcial',500,0,0,0,500,200,300,'2026-06-10','2026-06-10','PARTIALLY_PAID','r24-ar-partial-key',NOW(),NOW()),
    ('r24-ar-overdue',${companyA},'MANUAL','r24-ar-overdue-origin',${categoryIncomeA},'AR ajustado',200,40,10,5,175,0,175,'2026-06-15','2026-06-15','OVERDUE','r24-ar-overdue-key',NOW(),NOW()),
    ('r24-ar-paid',${companyA},'MANUAL','r24-ar-paid-origin',${categoryIncomeA},'AR pago',50,0,0,0,50,50,50,'2026-06-20','2026-06-20','PAID','r24-ar-paid-key',NOW(),NOW()),
    ('r24-ar-cancelled',${companyA},'MANUAL','r24-ar-cancelled-origin',${categoryIncomeA},'AR cancelado',70,0,0,0,70,0,70,'2026-06-21','2026-06-21','CANCELLED','r24-ar-cancelled-key',NOW(),NOW()),
    ('r24-ar-foreign',${companyB},'MANUAL','r24-ar-foreign-origin',${categoryIncomeB},'AR foreign',99999,0,0,0,99999,0,99999,'2026-06-10','2026-06-10','PENDING','r24-ar-foreign-key',NOW(),NOW())`);

  await db.execute(sql`INSERT INTO account_payables(
    id,company_id,origin_type,origin_id,category_id,description,original_amount,discount_amount,fine_amount,interest_amount,
    updated_amount,paid_amount,balance_amount,due_date,competence_date,status,idempotency_key,created_at,updated_at
  ) VALUES
    ('r24-ap-pending',${companyA},'MANUAL','r24-ap-pending-origin',${categoryExpenseA},'AP pendente',100,0,0,0,100,20,80,'2026-06-12','2026-06-12','PARTIALLY_PAID','r24-ap-pending-key',NOW(),NOW()),
    ('r24-ap-cancelled',${companyA},'MANUAL','r24-ap-cancelled-origin',${categoryExpenseA},'AP cancelado',90,0,0,0,90,0,90,'2026-06-22','2026-06-22','CANCELLED','r24-ap-cancelled-key',NOW(),NOW())`);
}

async function run(): Promise<void> {
  await seed();

  const report = await UnitOfWork.run(companyA, async (txContext) =>
    CashFlowService.getCashFlowReport(companyA, '2026-06-01', '2026-06-30', txContext)
  );

  assert(report.periodStart === '2026-06-01' && report.periodEnd === '2026-06-30', 'cash-flow period must preserve exact boundaries');
  assert(report.initialCashBalance === 1600, `opening balance must be initial balances + pre-period ledger; got ${report.initialCashBalance}`);
  assert(report.totalRealizedIncomes === 450, `realized incomes must include authoritative cash/deposit/reversal semantics; got ${report.totalRealizedIncomes}`);
  assert(report.totalRealizedExpenses === 210, `realized expenses must include authoritative cash/deposit/reversal semantics; got ${report.totalRealizedExpenses}`);
  assert(report.finalRealizedCashBalance === 1840, `final realized balance must reconcile to 1840; got ${report.finalRealizedCashBalance}`);

  const startDay = report.dailyFlows.find((item) => item.date === '2026-06-01');
  const endDay = report.dailyFlows.find((item) => item.date === '2026-06-30');
  const transferDay = report.dailyFlows.find((item) => item.date === '2026-06-08');
  const reversalDay = report.dailyFlows.find((item) => item.date === '2026-06-06');
  const partialReceivableDay = report.dailyFlows.find((item) => item.date === '2026-06-10');
  const overdueReceivableDay = report.dailyFlows.find((item) => item.date === '2026-06-15');
  const payableDay = report.dailyFlows.find((item) => item.date === '2026-06-12');

  assert(startDay?.realizedIncomes === 100, 'exact period start transaction must be included');
  assert(endDay?.realizedExpenses === 40, 'exact period end transaction must be included');
  assert(!transferDay || (transferDay.realizedIncomes === 0 && transferDay.realizedExpenses === 0), 'internal transfer must not inflate consolidated cash flow');
  assert(reversalDay?.realizedExpenses === 50, 'reversal of income must be represented as authoritative cash outflow on reversal date');
  assert(partialReceivableDay?.predictedIncomes === 300, 'partial receivable prediction must use remaining balanceAmount only');
  assert(overdueReceivableDay?.predictedIncomes === 175, 'overdue/discount/fine/interest prediction must use authoritative balanceAmount');
  assert(payableDay?.predictedExpenses === 80, 'partial payable prediction must use remaining balanceAmount only');
  assert(!report.dailyFlows.some((item) => item.date === '2026-06-20' && item.predictedIncomes > 0), 'PAID receivable must be excluded from predictions');
  assert(!report.dailyFlows.some((item) => item.date === '2026-06-21' && item.predictedIncomes > 0), 'CANCELLED receivable must be excluded from predictions');
  assert(!report.dailyFlows.some((item) => item.date === '2026-06-22' && item.predictedExpenses > 0), 'CANCELLED payable must be excluded from predictions');

  const persistedCash = await row(sql`SELECT COALESCE(SUM(current_balance),0) AS total FROM financial_accounts WHERE company_id=${companyA}`);
  assert(money(persistedCash.total) === report.finalRealizedCashBalance, 'final cash-flow balance must reconcile with authoritative account balances when no post-period movement exists');

  assert(report.totalRealizedIncomes < 100000, 'another tenant transaction must never influence totals');
  assert((partialReceivableDay?.predictedIncomes || 0) < 99999, 'another tenant receivable must never influence predictions');

  console.log('FINANCE-R24 authoritative cash-flow PostgreSQL integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
