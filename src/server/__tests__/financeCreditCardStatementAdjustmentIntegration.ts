import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { CreditCardStatementAuthority } from '../creditCardStatementAuthority';

const companyA = 'finance-card-e5-company-a';
const companyB = 'finance-card-e5-company-b';
const adminAId = 'finance-card-e5-admin-a';
const adminBId = 'finance-card-e5-admin-b';
const readonlyAId = 'finance-card-e5-readonly-a';
const cardAccountA = 'finance-card-e5-card-a';
const cardAccountB = 'finance-card-e5-card-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function row(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0] || null;
}

async function expectFailure(action: () => Promise<unknown>, expected: string): Promise<void> {
  let message = '';
  try { await action(); } catch (error) { message = error instanceof Error ? error.message : String(error); }
  assert(message.includes(expected), `expected failure containing "${expected}", got "${message}"`);
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM credit_card_statement_adjustments WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statement_payments WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statement_items WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statements WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_profiles WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_transactions WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
    (${companyA},'Card E5 A','ACTIVE',NOW(),NOW()),
    (${companyB},'Card E5 B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminAId},${companyA},'Card E5 Admin A','card-e5-admin-a@example.test','ADMIN',true,NOW(),NOW()),
    (${readonlyAId},${companyA},'Card E5 Readonly A','card-e5-readonly-a@example.test','READONLY',true,NOW(),NOW()),
    (${adminBId},${companyB},'Card E5 Admin B','card-e5-admin-b@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at) VALUES
    (${cardAccountA},${companyA},'Card E5 A','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW()),
    (${cardAccountB},${companyB},'Card E5 B','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO credit_card_profiles(id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id) VALUES
    ('card-e5-profile-a',${companyA},${cardAccountA},5000,20,27,true,1,${adminAId},${adminAId}),
    ('card-e5-profile-b',${companyB},${cardAccountB},5000,20,27,true,1,${adminBId},${adminBId})`);
  await db.execute(sql`INSERT INTO credit_card_statements(
    id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,
    original_amount,adjustment_amount,interest_amount,fine_amount,discount_amount,paid_amount,balance_amount,
    closed_at,closed_by_id,version,created_by_id,updated_by_id
  ) VALUES
    ('card-e5-closed',${companyA},'card-e5-profile-a','2026-08-A','2026-08-20','2026-08-27','CLOSED',1000,0,0,0,0,0,1000,NOW(),${adminAId},1,${adminAId},${adminAId}),
    ('card-e5-partial',${companyA},'card-e5-profile-a','2026-08-B','2026-08-20','2026-08-27','PARTIALLY_PAID',1000,0,0,0,0,400,600,NOW(),${adminAId},1,${adminAId},${adminAId}),
    ('card-e5-open',${companyA},'card-e5-profile-a','2026-08-C','2026-08-20','2026-08-27','OPEN',1000,0,0,0,0,0,1000,NULL,NULL,1,${adminAId},${adminAId}),
    ('card-e5-paid',${companyA},'card-e5-profile-a','2026-08-D','2026-08-20','2026-08-27','PAID',1000,0,0,0,0,1000,0,NOW(),${adminAId},1,${adminAId},${adminAId}),
    ('card-e5-foreign',${companyB},'card-e5-profile-b','2026-08-A','2026-08-20','2026-08-27','CLOSED',500,0,0,0,0,0,500,NOW(),${adminBId},1,${adminBId},${adminBId})`);
}

async function run(): Promise<void> {
  await seed();
  const adminA = { companyId: companyA, userId: adminAId, name: 'Card E5 Admin A' };
  const readonlyA = { companyId: companyA, userId: readonlyAId, name: 'Card E5 Readonly A' };
  const adminB = { companyId: companyB, userId: adminBId, name: 'Card E5 Admin B' };

  const txBefore = Number((await row(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyA}`)).count);
  const first = await CreditCardStatementAuthority.applyAdjustment(adminA, 'card-e5-closed', {
    interestAmount: 20, fineAmount: 10, discountAmount: 5, reason: 'Atraso contratual', idempotencyKey: 'card-e5-adjust-1',
  });
  assert(first.replayed === false, 'first adjustment must not be a replay');
  assert(Number(first.statement.interest_amount) === 20, 'interest must be persisted exactly once');
  assert(Number(first.statement.fine_amount) === 10, 'fine must be persisted exactly once');
  assert(Number(first.statement.discount_amount) === 5, 'discount must be persisted exactly once');
  assert(Number(first.statement.balance_amount) === 1025, 'closed statement balance must include charges and discount');

  const replay = await CreditCardStatementAuthority.applyAdjustment(adminA, 'card-e5-closed', {
    interestAmount: 20, fineAmount: 10, discountAmount: 5, reason: 'Atraso contratual', idempotencyKey: 'card-e5-adjust-1',
  });
  assert(replay.replayed === true, 'same idempotent command must replay');
  assert(Number(replay.statement.balance_amount) === 1025, 'replay must not duplicate the adjustment');
  const adjustmentCount = await row(sql`SELECT count(*)::int count FROM credit_card_statement_adjustments WHERE company_id=${companyA} AND idempotency_key='card-e5-adjust-1'`);
  assert(Number(adjustmentCount.count) === 1, 'idempotency must persist exactly one adjustment command');

  await expectFailure(() => CreditCardStatementAuthority.applyAdjustment(adminA, 'card-e5-closed', {
    interestAmount: 21, fineAmount: 10, discountAmount: 5, reason: 'Atraso contratual', idempotencyKey: 'card-e5-adjust-1',
  }), 'Chave idempotente divergente');

  const partial = await CreditCardStatementAuthority.applyAdjustment(adminA, 'card-e5-partial', {
    interestAmount: 10, fineAmount: 5, discountAmount: 15, reason: 'Ajuste parcial', idempotencyKey: 'card-e5-adjust-2',
  });
  assert(Number(partial.statement.paid_amount) === 400, 'partial adjustment must preserve paid amount');
  assert(Number(partial.statement.balance_amount) === 600, 'partial adjustment must recalculate only outstanding balance');
  assert(partial.statement.status === 'PARTIALLY_PAID', 'partial statement lifecycle must be preserved');

  await expectFailure(() => CreditCardStatementAuthority.applyAdjustment(adminA, 'card-e5-open', {
    interestAmount: 1, fineAmount: 0, discountAmount: 0, reason: 'Not closed', idempotencyKey: 'card-e5-open-key',
  }), 'não está elegível');
  await expectFailure(() => CreditCardStatementAuthority.applyAdjustment(adminA, 'card-e5-paid', {
    interestAmount: 1, fineAmount: 0, discountAmount: 0, reason: 'Already paid', idempotencyKey: 'card-e5-paid-key',
  }), 'não está elegível');
  await expectFailure(() => CreditCardStatementAuthority.applyAdjustment(adminA, 'card-e5-closed', {
    interestAmount: 0, fineAmount: 0, discountAmount: 5000, reason: 'Excess discount', idempotencyKey: 'card-e5-discount-key',
  }), 'Desconto excede');
  await expectFailure(() => CreditCardStatementAuthority.applyAdjustment(readonlyA, 'card-e5-closed', {
    interestAmount: 1, fineAmount: 0, discountAmount: 0, reason: 'Readonly', idempotencyKey: 'card-e5-readonly-key',
  }), 'Acesso negado:');
  await expectFailure(() => CreditCardStatementAuthority.applyAdjustment(adminB, 'card-e5-closed', {
    interestAmount: 1, fineAmount: 0, discountAmount: 0, reason: 'Foreign tenant', idempotencyKey: 'card-e5-foreign-key',
  }), 'Fatura de cartão não encontrada');

  const txAfter = Number((await row(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyA}`)).count);
  assert(txAfter === txBefore, 'statement adjustments must not create FinancialTransactions');
  const auditCount = await row(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${companyA} AND entity_type='CreditCardStatementAdjustment'`);
  assert(Number(auditCount.count) === 2, 'two successful adjustment commands must produce exactly two adjustment audits');

  console.log('FINANCE-CARD-1E5 statement adjustment PostgreSQL integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
