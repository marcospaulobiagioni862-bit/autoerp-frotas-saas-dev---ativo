import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';

function assertIsolatedDatabase(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test environment required');
  if (process.env.FINANCE_ISOLATED_RUNNER === 'true' && process.env.USE_PGLITE === 'true') return;
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/autoerp_phase1_test') throw new Error('Isolated loopback CI test database required');
}

export async function run() {
  // Check isolation before loading any database module or dotenv configuration.
  assertIsolatedDatabase();
  const { db } = await import('../../db');
  const { UnitOfWork } = await import('../../db/uow');
  const { PayableService } = await import('../../domain/finance/PayableService');
  const { SettlementService } = await import('../../domain/finance/SettlementService');
  const { RenegotiationService } = await import('../../domain/finance/RenegotiationService');
  const { ReversalService } = await import('../../domain/finance/ReversalService');
  const { OriginType } = await import('../../types/enums');
  const companies = ['ap-risks-a', 'ap-risks-b'];
  const row = async (query: any) => (await db.execute(query)).rows[0] as any;
  for (const companyId of companies) {
    await db.execute(sql`INSERT INTO companies(id,name,status) VALUES (${companyId},${companyId},'ACTIVE')`);
    await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active) VALUES (${`${companyId}-admin`},${companyId},'Admin',${`${companyId}@test.invalid`},'ADMIN',true)`);
    await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active) VALUES (${`${companyId}-expense`},${companyId},'Expense','EXPENSE',true)`);
  }
  const params = (companyId: string, command: string) => ({ companyId,userId:`${companyId}-admin`,userName:'Admin',originType:OriginType.MANUAL,originId:command,categoryId:`${companyId}-expense`,description:command,totalAmount:100,dueDate:'2026-10-15',competenceDate:'2026-10-15',idempotencyKey:command });
  const create = (companyId: string, command: string, changes = {}) => UnitOfWork.run(companyId, tx => PayableService.create({...params(companyId,command),...changes},tx));

  // Literal keys are deliberately identical; tenant filtering must work even with RLS bypassed.
  const legacyIds: string[] = [];
  for (const companyId of companies) {
    const [payable] = await create(companyId,'ap-shared-literal');
    legacyIds.push(payable.id);
    await db.execute(sql`UPDATE account_payables SET idempotency_key='ap-shared-literal' WHERE company_id=${companyId} AND id=${payable.id}`);
  }
  for (const [index,companyId] of companies.entries()) {
    await UnitOfWork.run(companyId, async tx => {
      const own = await tx.getPayableRepo().findByIdempotencyKey('ap-shared-literal');
      assert.equal(own?.id,legacyIds[index]); assert.equal(own?.companyId,companyId);
    });
    assert.equal((await create(companyId,'ap-shared-literal'))[0].id,legacyIds[index]);
  }
  console.log('CP literal key tenant isolation A/B PASS');

  const companyId = companies[0], userId = `${companyId}-admin`;
  const copies = await Promise.all([create(companyId,'ap-concurrent',{installmentsCount:3}),create(companyId,'ap-concurrent',{installmentsCount:3})]);
  assert.deepEqual(copies[0].map(p=>p.id),copies[1].map(p=>p.id));
  const debt = await row(sql`SELECT count(*)::int AS count,sum(original_amount) AS amount FROM account_payables WHERE company_id=${companyId} AND origin_id='ap-concurrent'`);
  assert.equal(debt.count,3); assert.equal(Number(debt.amount),100);
  const different = await Promise.allSettled([create(companyId,'ap-conflicting',{totalAmount:100}),create(companyId,'ap-conflicting',{totalAmount:101})]);
  assert.equal(different.filter(r=>r.status==='fulfilled').length,1);
  const rejected = different.find(r=>r.status==='rejected') as PromiseRejectedResult;
  assert.match(String(rejected.reason),/Conflito de idempotência/);
  assert.equal((await row(sql`SELECT count(*)::int AS count FROM account_payables WHERE company_id=${companyId} AND origin_id='ap-conflicting'`)).count,1);

  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,active) VALUES ('ap-risks-pix',${companyId},'PIX','PIX',true)`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status) VALUES ('ap-risks-account',${companyId},'Bank','BANK',1000,1000,'ACTIVE')`);
  // Repeat to exercise both possible lock order outcomes without relying on one winner.
  for (let i=0;i<5;i++) {
    const command = `ap-race-${i}`;
    const [source] = await create(companyId,command);
    const payment = await UnitOfWork.run(companyId,tx=>SettlementService.registerPayment({companyId,userId,userName:'Admin',obligationId:source.id,financialAccountId:'ap-risks-account',paymentMethodId:'ap-risks-pix',paymentAmount:40,paymentDate:'2026-10-15',idempotencyKey:`${command}-pay`},tx));
    const renegotiate = () => UnitOfWork.run(companyId,tx=>RenegotiationService.renegociate({companyId,userId,userName:'Admin',type:'PAYABLE',obligationIds:[source.id],newTotalAmount:60,installmentsCount:2,firstDueDate:'2026-11-15',categoryId:`${companyId}-expense`,description:command,idempotencyKey:`${command}-renegotiate`},tx));
    const reverse = () => UnitOfWork.run(companyId,tx=>ReversalService.reverseTransaction(companyId,payment.transaction.id,40,'Correct payment',userId,'Admin',tx,`${command}-reverse`));
    const outcomes = await Promise.allSettled(i%2 ? [reverse(),renegotiate()] : [renegotiate(),reverse()]);
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    const failure = outcomes.find(r=>r.status==='rejected') as PromiseRejectedResult;
    assert.match(String(failure.reason),/renegociado|saldo devedor autoritativo/);
    const original = await row(sql`SELECT status,paid_amount,balance_amount,renegotiation_id FROM account_payables WHERE company_id=${companyId} AND id=${source.id}`);
    const movements = await row(sql`SELECT count(*)::int AS count,sum(amount) AS amount FROM financial_transactions WHERE company_id=${companyId} AND reversal_transaction_id=${payment.transaction.id}`);
    const replacements = await row(sql`SELECT count(*)::int AS count,coalesce(sum(balance_amount),0) AS debt FROM account_payables WHERE company_id=${companyId} AND origin_type='RENEGOTIATION' AND origin_id=${original.renegotiation_id || 'none'}`);
    if (original.status==='CANCELLED') {
      assert.equal(Number(original.paid_amount),40); assert.equal(movements.count,0);
      assert.equal(replacements.count,2); assert.equal(Number(replacements.debt),60);
    } else {
      assert.equal(original.status,'PENDING'); assert.equal(Number(original.paid_amount),0);
      assert.equal(Number(original.balance_amount),100); assert.equal(movements.count,1);
      assert.equal(Number(movements.amount),40); assert.equal(replacements.count,0);
    }
  }
  const transactions = await row(sql`SELECT coalesce(sum(CASE WHEN type='EXPENSE' THEN -amount WHEN type='REVERSAL' THEN amount ELSE 0 END),0) AS delta FROM financial_transactions WHERE company_id=${companyId} AND financial_account_id='ap-risks-account'`);
  const account = await row(sql`SELECT current_balance FROM financial_accounts WHERE company_id=${companyId} AND id='ap-risks-account'`);
  assert.equal(Number(account.current_balance),1000+Number(transactions.delta));
  assert.equal((await row(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companies[1]}`)).count,0);
  console.log(process.env.USE_PGLITE==='true' ? 'CP concurrency scenarios PASS COM CAVEAT (single-connection PGlite)' : 'CP real PostgreSQL creation/conflict/renegotiation-reversal concurrency PASS');
}

if (process.env.FINANCE_ISOLATED_RUNNER !== 'true') {
  run().then(()=>process.exit(0)).catch(()=>{ console.error('CP tenant/concurrency integration FAIL (details withheld)'); process.exit(1); });
}
