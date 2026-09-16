import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { RenegotiationService } from '../../domain/finance/RenegotiationService';

const companyA = 'finance-r17-company-a';
const companyB = 'finance-r17-company-b';
const adminA = 'finance-r17-admin-a';
const adminB = 'finance-r17-admin-b';
const categoryA = 'finance-r17-expense-a';
const categoryB = 'finance-r17-expense-b';
const receivableCategoryA = 'finance-r18-income-a';
const receivableCategoryB = 'finance-r18-income-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rows(query: any): Promise<any[]> {
  const result: any = await db.execute(query);
  return result.rows || [];
}

async function row(query: any): Promise<any> {
  return (await rows(query))[0];
}

async function rejects(fn: () => Promise<unknown>, contains: string): Promise<void> {
  let message = '';
  try { await fn(); } catch (error) { message = String(error); }
  assert(message.includes(contains), `expected rejection containing ${contains}, got ${message || 'no rejection'}`);
}

async function seedPayable(
  id: string,
  companyId: string,
  categoryId: string,
  status: string,
  originalAmount: number,
  updatedAmount: number,
  paidAmount: number,
  balanceAmount: number
): Promise<void> {
  await db.execute(sql`INSERT INTO account_payables(
    id,company_id,origin_type,origin_id,category_id,description,original_amount,
    discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
    due_date,competence_date,status,idempotency_key,created_at,updated_at
  ) VALUES(
    ${id},${companyId},'MANUAL',${`origin-${id}`},${categoryId},${id},${originalAmount},
    0,0,0,${updatedAmount},${paidAmount},${balanceAmount},'2026-10-15','2026-08-23',${status},${`seed-${id}`},NOW(),NOW()
  )`);
}

async function seedReceivable(
  id: string,
  companyId: string,
  categoryId: string,
  status: string,
  originalAmount: number,
  updatedAmount: number,
  paidAmount: number,
  balanceAmount: number
): Promise<void> {
  await db.execute(sql`INSERT INTO account_receivables(
    id,company_id,origin_type,origin_id,category_id,description,original_amount,
    discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
    due_date,competence_date,status,idempotency_key,created_at,updated_at
  ) VALUES(
    ${id},${companyId},'MANUAL',${`origin-${id}`},${categoryId},${id},${originalAmount},
    0,0,0,${updatedAmount},${paidAmount},${balanceAmount},'2026-10-15','2026-08-23',${status},${`seed-${id}`},NOW(),NOW()
  )`);
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM account_receivables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM account_payables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_periods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_categories WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
    (${companyA},'Finance R17 A','ACTIVE',NOW(),NOW()),
    (${companyB},'Finance R17 B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'Finance R17 Admin A','r17-a@example.test','ADMIN',true,NOW(),NOW()),
    (${adminB},${companyB},'Finance R17 Admin B','r17-b@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES
    (${categoryA},${companyA},'Expense R17 A','EXPENSE',true,NOW(),NOW()),
    (${categoryB},${companyB},'Expense R17 B','EXPENSE',true,NOW(),NOW()),
    (${receivableCategoryA},${companyA},'Income R18 A','INCOME',true,NOW(),NOW()),
    (${receivableCategoryB},${companyB},'Income R18 B','INCOME',true,NOW(),NOW())`);

  await seedPayable('r17-valid-1', companyA, categoryA, 'PENDING', 110.01, 110.01, 0, 110.01);
  await seedPayable('r17-valid-2', companyA, categoryA, 'PARTIALLY_PAID', 60, 60, 19.98, 40.02);
  await seedPayable('r17-wrong-total', companyA, categoryA, 'PENDING', 25, 25, 0, 25);
  await seedPayable('r17-paid', companyA, categoryA, 'PAID', 30, 30, 30, 0);
  await seedPayable('r17-foreign', companyB, categoryB, 'PENDING', 40, 40, 0, 40);

  await seedReceivable('r18-valid-1', companyA, receivableCategoryA, 'PENDING', 110.01, 110.01, 0, 110.01);
  await seedReceivable('r18-valid-2', companyA, receivableCategoryA, 'PARTIALLY_PAID', 60, 60, 19.98, 40.02);
  await seedReceivable('r18-wrong-total', companyA, receivableCategoryA, 'PENDING', 25, 25, 0, 25);
  await seedReceivable('r18-paid', companyA, receivableCategoryA, 'PAID', 30, 30, 30, 0);
  await seedReceivable('r18-foreign', companyB, receivableCategoryB, 'PENDING', 40, 40, 0, 40);
}

function command(
  ids: string[],
  total: number,
  key: string,
  installmentsCount = 2,
  firstDueDate = '2026-10-20'
) {
  return UnitOfWork.run(companyA, (tx) => RenegotiationService.renegociate({
    companyId: companyA,
    obligationIds: ids,
    type: 'PAYABLE',
    newTotalAmount: total,
    installmentsCount,
    firstDueDate,
    installmentFrequency: 'MONTHLY',
    categoryId: categoryA,
    description: 'Acordo fornecedor R17',
    idempotencyKey: key,
    userId: adminA,
    userName: 'Finance R17 Admin A',
  }, tx));
}

function receivableCommand(
  ids: string[],
  total: number,
  key: string | undefined,
  installmentsCount = 2,
  firstDueDate = '2026-10-20',
  description = 'Acordo cliente R18'
) {
  return UnitOfWork.run(companyA, (tx) => RenegotiationService.renegociate({
    companyId: companyA,
    obligationIds: ids,
    type: 'RECEIVABLE',
    newTotalAmount: total,
    installmentsCount,
    firstDueDate,
    installmentFrequency: 'MONTHLY',
    categoryId: receivableCategoryA,
    description,
    idempotencyKey: key,
    userId: adminA,
    userName: 'Finance R17 Admin A',
  }, tx));
}

export async function run(): Promise<void> {
  await seed();

  // PAYABLE baseline: two concurrent copies of the same logical command converge.
  const [first, retry] = await Promise.all([
    command(['r17-valid-1', 'r17-valid-2'], 150.03, 'r17-command-concurrent'),
    command(['r17-valid-2', 'r17-valid-1'], 150.03, 'r17-command-concurrent'),
  ]);
  assert(first.length === 2 && retry.length === 2, 'concurrent retry must return two installments');

  const originals = await rows(sql`SELECT id,status,renegotiation_id,cancel_reason FROM account_payables
    WHERE company_id=${companyA} AND id IN ('r17-valid-1','r17-valid-2') ORDER BY id`);
  assert(originals.length === 2 && originals.every((item) => item.status === 'CANCELLED'), 'original APs must be cancelled atomically');
  assert(originals.every((item) => item.renegotiation_id === 'R17:r17-command-concurrent'), 'original APs must share deterministic renegotiation id');

  const replacements = await rows(sql`SELECT installment_number,total_installments,original_amount,balance_amount,status,idempotency_key
    FROM account_payables WHERE company_id=${companyA} AND origin_type='RENEGOTIATION'
      AND origin_id='R17:r17-command-concurrent' ORDER BY installment_number`);
  assert(replacements.length === 2, 'concurrent command must create exactly one replacement set');
  assert(Number(replacements[0].original_amount) === 75.01, 'first exact-cent installment must be 75.01');
  assert(Number(replacements[1].original_amount) === 75.02, 'last installment must carry the cent remainder');
  assert(replacements.reduce((sum, item) => sum + Math.round(Number(item.original_amount) * 100), 0) === 15003, 'replacement principal must equal authoritative remaining debt exactly');
  assert(replacements.every((item) => item.status === 'PENDING'), 'replacement APs must be pending');

  await rejects(
    () => command(['r17-valid-1', 'r17-valid-2'], 150.03, 'r17-command-concurrent', 3),
    'Chave de idempotência reutilizada'
  );
  const afterConflict = await row(sql`SELECT COUNT(*)::int AS count FROM account_payables
    WHERE company_id=${companyA} AND origin_id='R17:r17-command-concurrent'`);
  assert(Number(afterConflict.count) === 2, 'conflicting retry must not create additional installments');

  await rejects(
    () => command(['r17-wrong-total'], 24.99, 'r17-command-wrong-total', 1),
    'diverge do saldo devedor autoritativo'
  );
  const wrongTotal = await row(sql`SELECT status,renegotiation_id FROM account_payables WHERE company_id=${companyA} AND id='r17-wrong-total'`);
  assert(wrongTotal.status === 'PENDING' && !wrongTotal.renegotiation_id, 'wrong total must roll back without mutating original AP');

  await rejects(
    () => command(['r17-paid'], 30, 'r17-command-paid', 1),
    'não aceita renegociação'
  );
  const paid = await row(sql`SELECT status,renegotiation_id FROM account_payables WHERE company_id=${companyA} AND id='r17-paid'`);
  assert(paid.status === 'PAID' && !paid.renegotiation_id, 'paid AP must remain unchanged');

  await rejects(
    () => command(['r17-foreign'], 40, 'r17-command-foreign', 1),
    'não encontrado'
  );
  const foreign = await row(sql`SELECT status,renegotiation_id FROM account_payables WHERE company_id=${companyB} AND id='r17-foreign'`);
  assert(foreign.status === 'PENDING' && !foreign.renegotiation_id, 'cross-tenant AP must remain unchanged');

  // RECEIVABLE #907: equivalent concurrent commands with explicit key must converge.
  const [receivableFirst, receivableRetry] = await Promise.all([
    receivableCommand(['r18-valid-1', 'r18-valid-2'], 150.03, 'r18-command-concurrent'),
    receivableCommand(['r18-valid-2', 'r18-valid-1'], 150.03, 'r18-command-concurrent'),
  ]);
  assert(receivableFirst.length === 2 && receivableRetry.length === 2, 'AR concurrent retry must return the same two installments');

  const receivableOriginals = await rows(sql`SELECT id,status,renegotiation_id FROM account_receivables
    WHERE company_id=${companyA} AND id IN ('r18-valid-1','r18-valid-2') ORDER BY id`);
  assert(receivableOriginals.length === 2 && receivableOriginals.every((item) => item.status === 'CANCELLED'), 'original ARs must be cancelled atomically');
  assert(receivableOriginals.every((item) => item.renegotiation_id === 'R18:r18-command-concurrent'), 'original ARs must share deterministic renegotiation id');

  const receivableReplacements = await rows(sql`SELECT installment_number,total_installments,original_amount,balance_amount,status,idempotency_key
    FROM account_receivables WHERE company_id=${companyA} AND origin_type='RENEGOTIATION'
      AND origin_id='R18:r18-command-concurrent' ORDER BY installment_number`);
  assert(receivableReplacements.length === 2, 'AR concurrent command must create exactly one replacement set');
  assert(receivableReplacements.reduce((sum, item) => sum + Math.round(Number(item.original_amount) * 100), 0) === 15003, 'AR replacement principal must equal authoritative remaining debt exactly');

  // Same explicit key with divergent command shape fails closed.
  await rejects(
    () => receivableCommand(['r18-valid-1', 'r18-valid-2'], 150.03, 'r18-command-concurrent', 3),
    'Chave de idempotência reutilizada'
  );

  // Legacy route compatibility: absent idempotency key derives a deterministic safe key.
  await seedReceivable('r18-auto-key', companyA, receivableCategoryA, 'PENDING', 12.34, 12.34, 0, 12.34);
  const autoFirst = await receivableCommand(['r18-auto-key'], 12.34, undefined, 1);
  const autoRetry = await receivableCommand(['r18-auto-key'], 12.34, undefined, 1);
  assert(autoFirst.length === 1 && autoRetry.length === 1, 'derived-key retry must converge');
  const autoCount = await row(sql`SELECT COUNT(*)::int AS count FROM account_receivables
    WHERE company_id=${companyA} AND origin_type='RENEGOTIATION' AND origin_id LIKE 'R18:AUTO-AR-%'`);
  assert(Number(autoCount.count) === 1, 'derived-key replay must create one AR installment');

  await rejects(
    () => receivableCommand(['r18-wrong-total'], 24.99, 'r18-command-wrong-total', 1),
    'diverge do saldo devedor autoritativo'
  );
  const receivableWrongTotal = await row(sql`SELECT status,renegotiation_id FROM account_receivables WHERE company_id=${companyA} AND id='r18-wrong-total'`);
  assert(receivableWrongTotal.status === 'PENDING' && !receivableWrongTotal.renegotiation_id, 'wrong AR total must roll back without mutation');

  await rejects(
    () => receivableCommand(['r18-paid'], 30, 'r18-command-paid', 1),
    'não aceita renegociação'
  );
  const receivablePaid = await row(sql`SELECT status,renegotiation_id FROM account_receivables WHERE company_id=${companyA} AND id='r18-paid'`);
  assert(receivablePaid.status === 'PAID' && !receivablePaid.renegotiation_id, 'paid AR must remain unchanged');

  await rejects(
    () => receivableCommand(['r18-foreign'], 40, 'r18-command-foreign', 1),
    'não encontrado'
  );
  const receivableForeign = await row(sql`SELECT status,renegotiation_id FROM account_receivables WHERE company_id=${companyB} AND id='r18-foreign'`);
  assert(receivableForeign.status === 'PENDING' && !receivableForeign.renegotiation_id, 'cross-tenant AR must remain unchanged');

  await db.execute(sql`INSERT INTO financial_periods(
    id,company_id,year,month,start_date,end_date,status,closed_at,closed_by,created_at,updated_at
  ) VALUES('r17-closed-period',${companyA},2026,12,'2026-12-01','2026-12-31','CLOSED',NOW(),${adminA},NOW(),NOW())`);
  await seedPayable('r17-closed-source', companyA, categoryA, 'PENDING', 12, 12, 0, 12);
  await rejects(
    () => command(['r17-closed-source'], 12, 'r17-command-closed', 1, '2026-12-10'),
    'Período'
  );
  const closed = await row(sql`SELECT status,renegotiation_id FROM account_payables WHERE company_id=${companyA} AND id='r17-closed-source'`);
  assert(closed.status === 'PENDING' && !closed.renegotiation_id, 'closed period must block mutation atomically');

  const audit = await row(sql`SELECT changes FROM audit_logs WHERE company_id=${companyA}
    AND entity_id='R18:r18-command-concurrent' AND action='CREATE' ORDER BY timestamp DESC LIMIT 1`);
  assert(Boolean(audit), 'successful AR renegotiation must persist an audit event');

  console.log('FINANCE-R17/R18 payable + receivable renegotiation PostgreSQL integration: PASS');
}

if (process.env.FINANCE_ISOLATED_RUNNER !== 'true') run().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });