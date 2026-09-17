import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { PayableService } from '../../domain/finance/PayableService';
import { SettlementService } from '../../domain/finance/SettlementService';
import { RenegotiationService } from '../../domain/finance/RenegotiationService';
import { ReversalService } from '../../domain/finance/ReversalService';
import { OriginType } from '../../types/enums';
import { createManualPayable } from '../../api/manualPayableCommand';
import { manualPayableOrigin } from '../manualPayableAuthority';

export async function run() {
  const companyId = 'ap-integrity-a', userId = 'ap-integrity-admin';
  await db.execute(sql`INSERT INTO companies(id,name,status) VALUES (${companyId},'AP test','ACTIVE'),('ap-integrity-b','Other','ACTIVE')`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active) VALUES (${userId},${companyId},'Admin','ap@test.invalid','ADMIN',true)`);
  await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active) VALUES ('ap-expense',${companyId},'Expense','EXPENSE',true),('ap-income',${companyId},'Income','INCOME',true),('ap-other','ap-integrity-b','Other','EXPENSE',true),('ap-inactive',${companyId},'Inactive','EXPENSE',false)`);
  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,active) VALUES ('ap-pix',${companyId},'PIX','PIX',true)`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status) VALUES ('ap-account',${companyId},'Bank','BANK',1000,1000,'ACTIVE')`);
  const base = { companyId, userId, userName: 'Admin', originType: OriginType.MANUAL, originId: 'ap-manual', categoryId: 'ap-expense', description: 'Test', totalAmount: 100, dueDate: '2026-10-15', competenceDate: '2026-10-15', idempotencyKey: 'ap-command' };
  const create = (changes = {}) => UnitOfWork.run(companyId, tx => PayableService.create({ ...base, ...changes }, tx));
  const installments = await create({ totalAmount: 300, installmentsCount: 3 });
  assert.equal(new Set(installments.map(p => p.id)).size, 3);
  assert.equal(new Set(installments.map(p => p.idempotencyKey)).size, 3);
  assert.equal(new Set(installments.map(p => p.installmentGroupId)).size, 1);
  assert.equal(installments.reduce((n,p) => n + Number(p.originalAmount), 0), 300);
  assert.deepEqual((await create({ totalAmount: 300, installmentsCount: 3 })).map(p=>p.id), installments.map(p=>p.id));
  const tiny = await create({ totalAmount: 0.06, installmentsCount: 4, originId:'ap-tiny', idempotencyKey:'ap-tiny' });
  assert.ok(tiny.every(p=>Number(p.originalAmount)>0));
  assert.equal(Math.round(tiny.reduce((sum,p)=>sum+Number(p.originalAmount),0)*100),6);
  const [legacy] = await create({ originId:'ap-legacy',idempotencyKey:'ap-legacy' });
  await db.execute(sql`UPDATE account_payables SET idempotency_key='ap-legacy' WHERE id=${legacy.id}`);
  assert.equal((await create({originId:'ap-legacy',idempotencyKey:'ap-legacy'}))[0].id,legacy.id);
  await assert.rejects(create({originId:'ap-legacy',idempotencyKey:'ap-legacy',installmentsCount:2}),/legada/);
  await assert.rejects(create({ totalAmount: 301, installmentsCount: 3 }), /Conflito/);
  for (const totalAmount of [0, -1, NaN, Infinity, 0.001]) await assert.rejects(create({ totalAmount }), /Total/);
  for (const installmentsCount of [0,-1,1.5,121,NaN]) await assert.rejects(create({ installmentsCount }), /parcelas/);
  for (const ref of ['supplierId','vehicleId','driverId','contractId']) await assert.rejects(create({ [ref]: 'ap-missing' }), /tenant/);
  for (const ref of ['supplierId','vehicleId','driverId','contractId']) await assert.rejects(create({ [ref]: 0 }), /Referência/);
  await db.execute(sql`INSERT INTO suppliers(id,company_id,name,document,category) VALUES ('ap-foreign-supplier','ap-integrity-b','Other','123','OTHER')`);
  await assert.rejects(create({ supplierId: 'ap-foreign-supplier' }), /tenant/);
  for (const categoryId of ['ap-income','ap-other','ap-inactive']) await assert.rejects(create({ categoryId }), /Categoria/);
  await assert.rejects(UnitOfWork.run('ap-integrity-b', tx => PayableService.create(base, tx)), /tenant|empresa|negado/i);

  const [payable] = await create({ originId: 'ap-payment', idempotencyKey: 'ap-payment' });
  const pay = (amount: number, key: string) => UnitOfWork.run(companyId, tx => SettlementService.registerPayment({ companyId, userId, userName: 'Admin', obligationId: payable.id, financialAccountId: 'ap-account', paymentMethodId: 'ap-pix', paymentAmount: amount, paymentDate: '2026-10-15', idempotencyKey: key }, tx));
  await db.execute(sql`UPDATE account_payables SET status='OVERDUE' WHERE id=${payable.id}`);
  const payment = await pay(99.99, 'ap-pay-1');
  const state = async () => (await db.execute(sql`SELECT status,balance_amount,paid_amount,updated_amount FROM account_payables WHERE id=${payable.id}`)).rows[0] as any;
  assert.equal((await state()).status, 'PARTIALLY_PAID');
  assert.equal(Number((await state()).balance_amount), 0.01);
  await pay(99.99, 'ap-pay-1');
  assert.equal(Number((await state()).paid_amount), 99.99);
  await assert.rejects(pay(0.02, 'ap-overpayment'), /Overpayment/);
  const replacements = await UnitOfWork.run(companyId, tx => RenegotiationService.renegociate({ companyId,userId,userName:'Admin',type:'PAYABLE',obligationIds:[payable.id],newTotalAmount:0.01,installmentsCount:1,firstDueDate:'2026-11-15',categoryId:'ap-expense',description:'Replacement',idempotencyKey:'ap-renegotiate' }, tx));
  await assert.rejects(UnitOfWork.run(companyId, tx => ReversalService.reverseTransaction(companyId, payment.transaction.id, 99.99, 'Test reversal',userId,'Admin',tx,'ap-reverse')), /renegociado/);
  assert.equal((await state()).status,'CANCELLED');
  assert.equal(Number((await db.execute(sql`SELECT current_balance FROM financial_accounts WHERE id='ap-account'`)).rows[0].current_balance),900.01);
  assert.ok(replacements);
  const [exact] = await create({ originId:'ap-exact',idempotencyKey:'ap-exact' });
  for (const [amount,key] of [[40,'ap-partial'],[60,'ap-full']] as const) await UnitOfWork.run(companyId, tx=>SettlementService.registerPayment({companyId,userId,userName:'Admin',obligationId:exact.id,financialAccountId:'ap-account',paymentMethodId:'ap-pix',paymentAmount:amount,paymentDate:'2026-10-15',idempotencyKey:key},tx));
  const final = (await db.execute(sql`SELECT status,balance_amount,paid_amount,updated_amount FROM account_payables WHERE id=${exact.id}`)).rows[0] as any;
  assert.equal(final.status,'PAID'); assert.equal(Number(final.balance_amount),0); assert.equal(Number(final.paid_amount),Number(final.updated_amount));

  // Simulate a committed request whose response was lost; retry after an arbitrary delay.
  const storage = new Map<string,string>();
  Object.defineProperty(globalThis,'sessionStorage',{ configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)} });
  const originalFetch = globalThis.fetch, originalNow = Date.now; const bodies:any[]=[];
  globalThis.fetch = async (_url,init) => { const body=JSON.parse(String(init?.body)); bodies.push(body); if(bodies.length===1) throw new Error('Response lost'); return new Response(JSON.stringify({items:[{...exact,dueDate:'2026-10-15',competenceDate:'2026-10-15'}]}),{status:200}); };
  try { const input={categoryId:'ap-expense',description:'UI retry',totalAmount:10,dueDate:'2026-10-15'}; await assert.rejects(createManualPayable(companyId, input),/lost/); Date.now = () => originalNow() + 86_400_000; await createManualPayable(companyId, input); assert.deepEqual(bodies[0],bodies[1]); await createManualPayable(companyId, input); assert.notEqual(bodies[1].idempotencyKey,bodies[2].idempotencyKey); } finally {globalThis.fetch=originalFetch; Date.now=originalNow;}
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const sharedBodies: any[] = [];
  globalThis.fetch = async (_url, init) => { sharedBodies.push(JSON.parse(String(init?.body))); await gate; return new Response(JSON.stringify({items:[{...exact,dueDate:'2026-10-15',competenceDate:'2026-10-15'}]}),{status:200}); };
  try {
    const input = {categoryId:'ap-expense',description:'UI concurrent',totalAmount:10,dueDate:'2026-10-15'};
    const first = createManualPayable(companyId,input), second = createManualPayable(companyId,input);
    assert.equal(sharedBodies.length,1); release(); await Promise.all([first,second]);
    sharedBodies.length = 0;
    await Promise.all([createManualPayable(companyId,input),createManualPayable('ap-integrity-b',input)]);
    assert.equal(sharedBodies.length,2);
    assert.notEqual(sharedBodies[0].idempotencyKey,sharedBodies[1].idempotencyKey);
  } finally { release(); globalThis.fetch = originalFetch; }
  for (const origin of [OriginType.MAINTENANCE, OriginType.RENEGOTIATION, undefined, 'UNKNOWN']) assert.throws(()=>manualPayableOrigin(origin),/não autorizada/);
  assert.equal(manualPayableOrigin(OriginType.MANUAL),OriginType.MANUAL);
  const server=readFileSync('server.ts','utf8'); assert.ok(server.includes('const originType = manualPayableOrigin(req.body?.originType)'));
  const ui=readFileSync('src/components/finance/PayablesView.tsx','utf8'); assert.match(ui,/const isPending = .*ObligationStatus.OVERDUE/);
  console.log('Payables integrity blockers 1–7 regression PASS');
}
