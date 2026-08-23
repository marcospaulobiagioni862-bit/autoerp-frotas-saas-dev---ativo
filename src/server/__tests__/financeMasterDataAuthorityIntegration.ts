import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { FinanceMasterDataAuthority } from '../financeMasterDataAuthority';
import { FinancialAccountType, FinancialCategoryType } from '../../types/enums';

const companyA = 'finance-r23-company-a';
const companyB = 'finance-r23-company-b';
const adminA = 'finance-r23-admin-a';
const adminB = 'finance-r23-admin-b';
const readonlyA = 'finance-r23-readonly-a';

const actorA = { companyId: companyA, userId: adminA, name: 'Finance R23 Admin A' };
const actorB = { companyId: companyB, userId: adminB, name: 'Finance R23 Admin B' };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function rows(query: any): Promise<any[]> { const result: any = await db.execute(query); return result.rows || []; }
async function row(query: any): Promise<any> { return (await rows(query))[0]; }
async function rejects(fn: () => Promise<unknown>, contains: string): Promise<void> { let message = ''; try { await fn(); } catch (error) { message = String(error); } assert(message.includes(contains), `expected ${contains}, got ${message || 'no rejection'}`); }

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM account_receivables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM account_payables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_transactions WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_categories WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM payment_methods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
    (${companyA},'Finance R23 A','ACTIVE',NOW(),NOW()),(${companyB},'Finance R23 B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'Finance R23 Admin A','r23-a@example.test','ADMIN',true,NOW(),NOW()),
    (${adminB},${companyB},'Finance R23 Admin B','r23-b@example.test','ADMIN',true,NOW(),NOW()),
    (${readonlyA},${companyA},'Finance R23 Readonly','r23-readonly@example.test','READONLY',true,NOW(),NOW())`);
}

async function run(): Promise<void> {
  await seed();

  const accountA = await FinanceMasterDataAuthority.createAccount(actorA, {
    name: 'Conta Operacional', type: FinancialAccountType.BANK, initialBalance: 123.45,
  });
  assert(accountA.initialBalance === 123.45 && accountA.currentBalance === 123.45, 'opening balance must initialize initial/current balance exactly once');
  assert(accountA.status === 'ACTIVE', 'new account must default ACTIVE');

  // No master-data update path can mutate initial/current balance.
  await FinanceMasterDataAuthority.updateAccount(actorA, accountA.id, { name: 'Conta Operacional Principal' });
  const persistedAccount = await row(sql`SELECT initial_balance,current_balance,name FROM financial_accounts WHERE id=${accountA.id}`);
  assert(Number(persistedAccount.initial_balance) === 123.45 && Number(persistedAccount.current_balance) === 123.45, 'metadata update must preserve monetary balances');

  await FinanceMasterDataAuthority.updateAccount(actorA, accountA.id, { status: 'INACTIVE' });
  const inactive = await row(sql`SELECT status FROM financial_accounts WHERE id=${accountA.id}`);
  assert(inactive.status === 'INACTIVE', 'account lifecycle must be persisted');

  const methodA = await FinanceMasterDataAuthority.createPaymentMethod(actorA, { name: 'PIX Operacional', type: 'PIX' });
  assert(methodA.active === true, 'new payment method must default active');
  await FinanceMasterDataAuthority.updatePaymentMethod(actorA, methodA.id, { active: false });

  const expenseParent = await FinanceMasterDataAuthority.createCategory(actorA, { name: 'Veículos', type: FinancialCategoryType.EXPENSE });
  const expenseChild = await FinanceMasterDataAuthority.createCategory(actorA, { name: 'Manutenção', type: FinancialCategoryType.EXPENSE, parentId: expenseParent.id });
  assert(expenseChild.parentId === expenseParent.id, 'tenant-scoped compatible hierarchy must persist');
  const income = await FinanceMasterDataAuthority.createCategory(actorA, { name: 'Locações', type: FinancialCategoryType.INCOME });
  await rejects(() => FinanceMasterDataAuthority.updateCategory(actorA, income.id, { parentId: expenseParent.id }), 'incompatível');

  const foreignParent = await FinanceMasterDataAuthority.createCategory(actorB, { name: 'Foreign Expense', type: FinancialCategoryType.EXPENSE });
  await rejects(() => FinanceMasterDataAuthority.createCategory(actorA, { name: 'Cross Tenant Child', type: FinancialCategoryType.EXPENSE, parentId: foreignParent.id }), 'não encontrada');

  const snapshotA = await FinanceMasterDataAuthority.list(actorA);
  assert(snapshotA.accounts.some((item) => item.id === accountA.id), 'tenant A must list its account');
  assert(snapshotA.categories.every((item) => item.id !== foreignParent.id), 'tenant A must not list tenant B category');

  await rejects(
    () => FinanceMasterDataAuthority.createPaymentMethod({ companyId: companyA, userId: readonlyA, name: 'Readonly' }, { name: 'Blocked', type: 'PIX' }),
    'Acesso negado'
  );

  const audits = await rows(sql`SELECT entity_type,action,changes FROM audit_logs WHERE company_id=${companyA} AND entity_type IN ('FinancialAccount','PaymentMethod','FinancialCategory')`);
  assert(audits.length >= 7, 'all master-data mutations must append audit evidence');

  const duplicateResults = await Promise.allSettled([
    FinanceMasterDataAuthority.createPaymentMethod(actorA, { name: 'Boleto Concorrente', type: 'BOLETO' }),
    FinanceMasterDataAuthority.createPaymentMethod(actorA, { name: 'boleto concorrente', type: 'BOLETO' }),
  ]);
  assert(duplicateResults.filter((item) => item.status === 'fulfilled').length === 1, 'logical-name advisory lock must serialize duplicate creates');
  const duplicateCount = await row(sql`SELECT COUNT(*)::int AS count FROM payment_methods WHERE company_id=${companyA} AND lower(name)=lower('Boleto Concorrente')`);
  assert(Number(duplicateCount.count) === 1, 'concurrent duplicate name must persist exactly once');

  console.log('FINANCE-R23 financial master-data PostgreSQL authority integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
