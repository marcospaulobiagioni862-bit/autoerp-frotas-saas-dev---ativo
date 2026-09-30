import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { SettlementService, type SettlementParams } from '../../domain/finance/SettlementService';
import { ReversalService } from '../../domain/finance/ReversalService';
import { fixedDailyInterest } from '../../domain/finance/dailyLateInterest';
import { settlementState } from '../../domain/finance/settlementComposition';
import { FinanceOverdueAuthority } from '../financeOverdueAuthority';

if (process.env.NODE_ENV !== 'test') throw new Error('Requires disposable test database');
const companyId = 'fixed-daily-a', userId = 'fixed-daily-user';
const actor = { companyId, userId, name: 'Daily interest test' };
const first = async (query: any) => (await db.execute(query)).rows[0];
// The full migration chain is applied by the runner/CI; also prove the new DDL can be reapplied.
await db.execute(sql.raw(readFileSync('drizzle/0075_finance_fixed_daily_interest.sql', 'utf8')));
await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyId},'Daily A','ACTIVE',now(),now()),('fixed-daily-b','Daily B','ACTIVE',now(),now())`);
await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES(${userId},${companyId},'Daily','fixed-daily@example.test','ADMIN',true,now(),now())`);
await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES('fixed-daily-user-b','fixed-daily-b','Daily B','fixed-daily-b@example.test','ADMIN',true,now(),now())`);
await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at) VALUES('fixed-daily-account',${companyId},'Daily','BANK',10000,10000,'ACTIVE',now(),now())`);
await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active) VALUES('fixed-daily-method',${companyId},'Daily PIX','PIX',0,true)`);
await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES('fixed-daily-category',${companyId},'Daily','BOTH',true,now(),now())`);

for (const date of ['2026-09-15','2026-09-16','2026-09-17','2026-09-28']) {
  const days = date.endsWith('28') ? 12 : date.endsWith('17') ? 1 : 0;
  assert.deepEqual(fixedDailyInterest('2026-09-16', date, 2), { daysOverdue: days, dailyInterestAmount: 2, interestAmount: days * 2 });
}
for (const tz of ['America/Sao_Paulo', 'Pacific/Kiritimati', 'America/New_York']) {
  const previous = process.env.TZ; process.env.TZ = tz;
  assert.equal(fixedDailyInterest('2026-09-16','2026-09-28',2).interestAmount,24);
  assert.equal(fixedDailyInterest('2026-03-07','2026-03-09',2).daysOverdue,2);
  if (previous == null) delete process.env.TZ; else process.env.TZ = previous;
}
assert.equal(fixedDailyInterest('2028-02-28','2028-03-01',2).daysOverdue,2);
assert.throws(() => fixedDailyInterest('2026-02-29','2026-03-01',2));
assert.throws(() => fixedDailyInterest('2026-09-16','2026-09-28',-1));

let sequence = 0;
for (const kind of ['RECEIVABLE','PAYABLE'] as const) {
  const table = sql.raw(kind === 'RECEIVABLE' ? 'account_receivables' : 'account_payables');
  const createTitle = async () => {
    const id = `fixed-daily-${++sequence}`;
    await db.execute(sql`INSERT INTO ${table}(id,company_id,origin_type,origin_id,category_id,description,original_amount,discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status,idempotency_key,created_at,updated_at)
      VALUES(${id},${companyId},'MANUAL',${id},'fixed-daily-category','Daily',100,0,0,0,100,10,90,'2026-09-16','2026-09-01','PARTIALLY_PAID',${id},now(),now())`);
    return id;
  };
  const state = (id: string) => UnitOfWork.run(companyId, async tx => settlementState(kind === 'RECEIVABLE' ? await tx.findReceivableByIdWithLock(id) : await tx.findPayableByIdWithLock(id)));
  const rule = (amount: number | null) => FinanceOverdueAuthority.upsertRule(actor,kind,{gracePeriodDays:0,finePercent:0,dailyInterestPercent:1,active:true});
  let operationDaily: number | null = null;
  const settle = (id: string, amount: number, key: string, adjustments: Partial<SettlementParams> = {}) => UnitOfWork.run(companyId, async tx => {
    const params = {companyId,obligationId:id,financialAccountId:'fixed-daily-account',paymentMethodId:'fixed-daily-method',paymentAmount:amount,paymentDate:'2026-09-28',idempotencyKey:key,userId,userName:'Daily',...(kind === 'RECEIVABLE' && operationDaily != null ? {dailyInterestAmount:operationDaily} : kind === 'PAYABLE' && operationDaily != null ? {interestAmount:fixedDailyInterest('2026-09-16',adjustments.paymentDate ?? '2026-09-28',operationDaily).interestAmount} : {}),...adjustments};
    return kind === 'RECEIVABLE' ? SettlementService.registerReceipt(params,tx) : SettlementService.registerPayment(params,tx);
  });
  const reverse = (transactionId: string, amount: number, key: string) => UnitOfWork.run(companyId, tx => ReversalService.reverseTransaction(companyId,transactionId,amount,'Daily regression',userId,'Daily',tx,key));
  const cases = [
    {name:'A principal',daily:null,amount:90,fineAmount:0,discountAmount:0},
    {name:'A partial principal',daily:null,amount:30,fineAmount:0,discountAmount:0},
    {name:'B interest',daily:2,amount:114,fineAmount:0,discountAmount:0},
    {name:'C fine + interest',daily:2,amount:119,fineAmount:5,discountAmount:0},
    {name:'D discount',daily:null,amount:87,fineAmount:0,discountAmount:3},
    {name:'E partial + adjustments',daily:2,amount:50,fineAmount:5,discountAmount:3},
  ];
  for (const c of cases) {
    operationDaily=c.daily;
    await rule(c.daily);
    const id=await createTitle(), key=`settle-${id}`;
    const before=await state(id);
    const accountBefore = Number((await first(sql`SELECT current_balance FROM financial_accounts WHERE id='fixed-daily-account'`)).current_balance);
    const result=await settle(id,c.amount,key,{fineAmount:c.fineAmount,discountAmount:c.discountAmount});
    const after=await state(id);
    assert.equal(after.interestAmount,c.daily === null ? 0 : 24);
    assert.equal(after.paidAmount,10+c.amount);
    assert.equal((await settle(id,c.amount,key,{fineAmount:c.fineAmount,discountAmount:c.discountAmount})).transaction.id,result.transaction.id);
    assert.equal((await settle(id,c.amount,key,{fineAmount:c.fineAmount,discountAmount:c.discountAmount,interestAmount:c.daily === null ? 0 : 24})).transaction.id,result.transaction.id,'explicit matching interest is the same composition');
    for (const changed of [...(kind === 'RECEIVABLE' ? [{dailyInterestAmount:99}] : []),{interestAmount:25},{fineAmount:c.fineAmount+1},{discountAmount:c.discountAmount+1}]) {
      await assert.rejects(settle(id,c.amount,key,{fineAmount:c.fineAmount,discountAmount:c.discountAmount,...changed}),/idempotência/);
    }
    const evidence = await UnitOfWork.run(companyId, async tx => await tx.findSettlementComposition(result.transaction.id));
    assert.equal(evidence.principalLiquidated,c.amount-c.fineAmount-(c.daily === null ? 0 : 24)+c.discountAmount);
    assert.equal(evidence.movementAmount,c.amount);
    assert.equal(evidence.applied.interestAmount,c.daily === null ? 0 : 24);
    await UnitOfWork.run('fixed-daily-b', async tx => assert.equal(await tx.findSettlementComposition(result.transaction.id),null));
    if (c.daily !== null || c.fineAmount || c.discountAmount) {
      await assert.rejects(reverse(result.transaction.id,1,`partial-${id}`),/estorno integral/);
      assert.deepEqual(await state(id),after);
    }
    const reversed=await reverse(result.transaction.id,c.amount,`reverse-${id}`);
    assert.equal((await reverse(result.transaction.id,c.amount,`reverse-${id}`)).id,reversed.id);
    const restored=await state(id);
    assert.deepEqual(restored,before);
    assert.equal(Number((await first(sql`SELECT current_balance FROM financial_accounts WHERE id='fixed-daily-account'`)).current_balance),accountBefore);
    console.log(kind,c.name,JSON.stringify({before,after,restored}));
  }
  operationDaily=2;
  await rule(2);
  for(const [date,interest] of [['2026-09-15',0],['2026-09-16',0],['2026-09-17',2],['2026-09-28',24]] as const) {
    const id=await createTitle();await settle(id,30,`date-${id}`,{paymentDate:date});assert.equal((await state(id)).interestAmount,interest);
  }
  const partial=await createTitle();
  const firstPartial=await settle(partial,30,`first-${partial}`);
  const snapshot=async()=>({title:await state(partial),account:await first(sql`SELECT current_balance FROM financial_accounts WHERE id='fixed-daily-account'`),transactions:await first(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyId}`),audits:await first(sql`SELECT count(*)::int AS count FROM audit_logs WHERE company_id=${companyId}`)});
  const beforeSecond=await state(partial);
  const secondPartial=await settle(partial,30,`second-${partial}`,kind === 'PAYABLE' ? {interestAmount:0} : {});
  const afterSecond=await state(partial);
  assert.equal(afterSecond.paidAmount,beforeSecond.paidAmount+30);
  assert.equal(afterSecond.interestAmount,24,'partial settlements must not double daily interest');
  const secondEvidence=await UnitOfWork.run(companyId,async tx=>tx.findSettlementComposition(secondPartial.transaction.id));
  assert.equal(secondEvidence.principalLiquidated,null,'carried adjustment allocation is explicit uncertainty, not a cash blocker');
  await reverse(secondPartial.transaction.id,30,`reverse-second-${partial}`);
  assert.deepEqual(await state(partial),beforeSecond,'reversing the follow-up restores the adjusted partial exactly');
  await reverse(firstPartial.transaction.id,30,`reverse-first-${partial}`);
  const insufficient=await createTitle();
  const insufficientBefore=await state(insufficient);
  const countsBefore=await snapshot();
  await assert.rejects(settle(insufficient,1,`insufficient-${insufficient}`),/Principal liquidado indeterminável/);
  assert.deepEqual(await state(insufficient),insufficientBefore);assert.deepEqual(await snapshot(),countsBefore);
  const carried=await createTitle();
  await db.execute(sql`UPDATE ${table} SET original_amount=100,interest_amount=24,updated_amount=124,paid_amount=0,balance_amount=124,status='PENDING' WHERE id=${carried}`);
  const carriedBefore=await state(carried);
  const carriedResult=await settle(carried,124,`carried-${carried}`,kind === 'PAYABLE' ? {interestAmount:0,settleRemainingBalance:true} : {});
  const carriedEvidence=await UnitOfWork.run(companyId,async tx=>tx.findSettlementComposition(carriedResult.transaction.id));
  assert.equal(carriedEvidence.principalLiquidated,100,'carried interest never becomes principal');
  assert.equal(carriedEvidence.applied.interestAmount,0,'carried interest is not applied twice');
  await reverse(carriedResult.transaction.id,124,`carried-reverse-${carried}`);assert.deepEqual(await state(carried),carriedBefore);
  const isolated=await createTitle();
  await assert.rejects(UnitOfWork.run('fixed-daily-b', tx => SettlementService.registerReceipt({companyId:'fixed-daily-b',userId:'fixed-daily-user-b',userName:'B',obligationId:isolated,financialAccountId:'fixed-daily-account',paymentMethodId:'fixed-daily-method',paymentAmount:1,paymentDate:'2026-09-28',idempotencyKey:`cross-${isolated}`},tx)),/não encontrada/);
  const historical=await createTitle();
  await db.execute(sql`UPDATE ${table} SET interest_amount=24,updated_amount=124,paid_amount=124,balance_amount=0,status='PAID' WHERE id=${historical}`);
  const historicalState=await state(historical);
  await UnitOfWork.run(companyId, async tx => {
    await tx.getTransactionRepo().create({id:`legacy-${historical}`,companyId,financialAccountId:'fixed-daily-account',receivableId:kind==='RECEIVABLE'?historical:undefined,payableId:kind==='PAYABLE'?historical:undefined,type:kind==='RECEIVABLE'?'INCOME':'EXPENSE',amount:114,paymentMethodId:'fixed-daily-method',transactionDate:'2026-09-28',competenceDate:'2026-09-01',description:'Legacy without linked evidence',isReversed:false,createdById:userId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  });
  await assert.rejects(reverse(`legacy-${historical}`,114,`legacy-reverse-${historical}`),/histórica sem composição/);
  assert.deepEqual(await state(historical),historicalState);
  if(kind === 'RECEIVABLE') await assert.rejects(settle(await createTitle(),1,'forged-interest',{interestAmount:1}),/autoritativo/);
  operationDaily=0;
  await rule(0); const zero=await createTitle();await settle(zero,90,`zero-${zero}`);assert.equal((await state(zero)).interestAmount,0);



  operationDaily=null;
  for (const example of kind === 'PAYABLE' ? [{cash:1300,date:'2026-09-16',days:0,interest:0},{cash:1350,date:'2026-09-19',days:3,interest:50},{cash:1300,date:'2026-09-15',days:0,interest:0}] : [{cash:1400,date:'2026-09-21',days:5,interest:100},{cash:1300,date:'2026-09-21',days:5,interest:0}]) {
    const id=await createTitle();
    await db.execute(sql`UPDATE ${table} SET original_amount=1300,updated_amount=1300,paid_amount=0,balance_amount=1300,status='PENDING' WHERE id=${id}`);
    const before=await state(id);
    const command = kind === 'PAYABLE' ? {settleRemainingBalance:true,paymentDate:example.date} : {dailyInterestAmount:example.interest ? 20 : 0,paymentDate:example.date};
    const result=await settle(id,example.cash,`example-${id}`,command);
    const evidence=await UnitOfWork.run(companyId,async tx=>tx.findSettlementComposition(result.transaction.id));
    assert.equal(evidence.principalLiquidated,1300);assert.equal(evidence.daysOverdue,example.days);assert.equal(evidence.applied.interestAmount,example.interest);
    assert.equal((await first(sql`SELECT original_amount FROM ${table} WHERE id=${id}`)).original_amount,'1300.00');
    assert.equal((await state(id)).balanceAmount,0);
    assert.equal((await settle(id,example.cash,`example-${id}`,command)).transaction.id,result.transaction.id);
    await assert.rejects(settle(id,example.cash+1,`example-${id}`,command),/idempotência/);
    await reverse(result.transaction.id,example.cash,`example-reverse-${id}`);assert.deepEqual(await state(id),before);
  }
  // Legacy percentage remains implemented by the existing overdue authority, not settlement.
  operationDaily=null;
  await rule(null);
  const legacy=await createTitle();
  await FinanceOverdueAuthority.process(actor,kind,'2026-09-28');
  assert.equal((await state(legacy)).interestAmount,kind === 'RECEIVABLE' ? 10.8 : 0,'CP never accrues global interest');
}
console.log('Fixed daily interest and symmetric reversal integration: PASS');
