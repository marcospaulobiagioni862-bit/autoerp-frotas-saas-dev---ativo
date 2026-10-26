import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { registerContractRoutes } from '../contractRoutes';
import { registerContractSimpleSignRoutes } from '../contractSimpleSignRoutes';
import { registerContractExecutionRoutes } from '../contractExecutionRoutes';
import { ensureInitialContractReceivable } from '../contractFinanceAuthority';
import { requireContractEffectivePeriod } from '../../domain/contracts/contractEffectivePeriod';
import { RecurringAuthorityService } from '../recurringAuthority';
import { contractConflictResponse } from '../contractConflictResponse';

const companyId = 'signed-effective-company';
const actor = { companyId, userId: 'signed-effective-admin', name: 'Test Admin', role: 'ADMIN', permissions: ['*'] };
const today = new Date().toISOString().slice(0, 10);
const planned = '2099-10-09';
async function rows(query: any): Promise<any[]> { return (await db.execute(query)).rows; }
async function count(table: string) { return Number((await rows(sql.raw(`SELECT count(*) AS n FROM ${table}`)))[0].n); }
await db.execute(sql`INSERT INTO companies(id,name,status) VALUES(${companyId},'Signature Effective','ACTIVE')`);
await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active) VALUES(${actor.userId},${companyId},'Test Admin','signature-effective@example.test','ADMIN',true)`);
await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active) VALUES('signature-rent-category',${companyId},'Receita de Aluguel','INCOME',true)`);

let sequence = 0;
async function fixture() {
  const id = `signature-effective-${++sequence}`;
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status) VALUES(${id},${companyId},${`SIG${sequence}A00`},${id},'AVAILABLE')`);
  await db.execute(sql`INSERT INTO drivers(id,company_id,name,cpf,cnh,active,cnh_expiration,status,app_platforms,is_archived)
    VALUES(${id},${companyId},'Driver',${String(sequence).padStart(11,'0')},${id},true,'2099-12-31','ACTIVE',ARRAY['Uber'],false)`);
  await db.execute(sql`INSERT INTO contracts(id,company_id,contract_number,vehicle_id,driver_id,start_date,status,rental_amount,billing_periodicity,security_deposit_amount,franchise_km,excess_km_rate,signature_required)
    VALUES(${id},${companyId},${id},${id},${id},${planned},'DRAFT',700,'WEEKLY',0,1000,1,false)`);
  await db.execute(sql`INSERT INTO file_attachments(id,company_id,entity_type,entity_name,entity_id,document_type,file_name,mime_type,url,file_size,storage_provider,storage_key,checksum,created_by,content_state)
    VALUES(${id},${companyId},'Vehicle','Vehicle',${id},'CRLV','crlv.pdf','application/pdf','attachment://test',10,'SERVER_FS',${id},repeat('a',64),${actor.userId},'AVAILABLE')`);
  for (const type of ['IPVA','CRLV','LICENCIAMENTO']) {
    await db.execute(sql`INSERT INTO documents(id,company_id,subject_type,subject_id,document_type,reference_year,expiration_date,attachment_id,version_number,is_current,is_archived,cost,created_by)
      VALUES(${`${id}-${type}`},${companyId},'VEHICLE',${id},${type},${Number(today.slice(0,4))},'2099-12-31',${id},1,true,false,0,${actor.userId})`);
  }
  await db.execute(sql`INSERT INTO insurances(id,company_id,vehicle_id,insurance_company,policy_number,coverage_details,deductible_amount,total_premium_amount,installments_count,start_date,end_date,status,account_payable_ids,created_by)
    VALUES(${id},${companyId},${id},'Test',${id},'Test',0,0,1,'2020-01-01','2099-12-31','ACTIVE','[]'::jsonb,${actor.userId})`);
  await db.execute(sql`INSERT INTO contract_artifacts(id,company_id,contract_id,artifact_type,attachment_id,template_id,snapshot_json,snapshot_hash,created_by,created_at)
    VALUES(${`${id}-pdf`},${companyId},${id},'GENERATED_PDF',${id},'test-template','{}',repeat('a',64),${actor.userId},'2020-01-01')`);
  return id;
}
async function legacyCharge(id: string, paidAmount = 0, date = '2020-01-02') {
  await db.execute(sql`INSERT INTO account_receivables(id,company_id,origin_type,origin_id,contract_id,vehicle_id,driver_id,category_id,description,original_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status,idempotency_key,created_at)
    VALUES(${`${id}-legacy`},${companyId},'CONTRACT_RENT',${`${id}:${date}`},${id},${id},${id},'signature-rent-category','Legacy rent',700,700,${paidAmount},${700-paidAmount},${date},${date},${paidAmount===700?'PAID':paidAmount?'PARTIALLY_PAID':'PENDING'},${`${id}-legacy-key`},'2020-01-02')`);
}
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).principal = req.headers['x-foreign'] ? { ...actor, companyId: 'foreign' } : actor; next(); });
registerContractRoutes(app);
registerContractSimpleSignRoutes(app);
registerContractExecutionRoutes(app);
const server = createServer(app);
await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
const port = (server.address() as any).port;
async function post(id: string, action: string, body: unknown = {}, status = 200, foreign = false) {
  const response = await fetch(`http://127.0.0.1:${port}/api/contracts/${id}/${action}`, {
    method:'POST', headers:{'content-type':'application/json', ...(foreign ? {'x-foreign':'yes'} : {})}, body:JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status,status,`${action}: ${JSON.stringify(result)}`);
  return result as any;
}
async function sign(id: string) { return post(id,'sign-status',{signed:true},201); }
async function charges(id: string) { return rows(sql`SELECT * FROM account_receivables WHERE contract_id=${id} ORDER BY id`); }
async function reconcile(id: string) {
  return UnitOfWork.run(companyId, async tx => {
    const contract = await tx.getContractRepo().findByIdForCompanyWithLock(companyId,id);
    return ensureInitialContractReceivable(contract!,actor,tx);
  });
}
try {
  // 1. Contrato unsigned ativa com vigência planejada (sem gate de assinatura - regra vigente V2)
  const unsigned = await fixture();
  const activationUnsigned = await post(unsigned,'activate',{},200);
  assert.equal(activationUnsigned.item.status,'ACTIVE');
  assert.equal(activationUnsigned.item.startDate.slice(0,10),planned,'planned date is operational authority');
  assert.equal(activationUnsigned.receivables.length,1);
  assert.equal(activationUnsigned.receivables[0].competenceDate.slice(0,10),planned);
  assert.equal(activationUnsigned.receivables[0].dueDate.slice(0,10),planned);

  // Isolamento de tenant: chamada com tenant estrangeiro retorna 404 e não gera cobrança
  await post(unsigned,'activate',{},404,true);

  // Sanitização de resposta de conflito: SQL interno não vaza segredos e protótipo vira CONTRACT_CONFLICT
  const secretError = 'SQL constraint internal_tenant_id SELECT secret FROM private_table';
  const safeConflict = contractConflictResponse(secretError);
  assert.equal(safeConflict.code,'CONTRACT_CONFLICT');
  assert(!JSON.stringify(safeConflict).includes('secret'));
  assert.equal(contractConflictResponse('__proto__').code,'CONTRACT_CONFLICT');

  // Reconciliação do recebível inicial é idempotente na vigência planejada
  const reconciled = await reconcile(unsigned);
  assert.equal(reconciled.length,1);
  assert.equal(reconciled[0].competenceDate.slice(0,10),planned);
  await post(unsigned,'reconcile-initial-receivable',{},200);
  console.log('PASS unsigned contracts activate with planned effective period; tenant isolation & conflict sanitization');

  // 2. Vigência planejada como autoridade operacional, substituição de títulos legados não-pagos
  const id = await fixture();
  await legacyCharge(id, 0, '2020-01-02');
  await sign(id);
  const artifactBefore = await rows(sql`SELECT * FROM contract_artifacts WHERE contract_id=${id} ORDER BY id`);
  const activation = await post(id,'activate');
  assert.equal(activation.item.startDate.slice(0,10),planned,'planned date governs operational period');
  assert.equal(activation.receivables[0].competenceDate.slice(0,10),planned);
  assert.equal(activation.receivables[0].dueDate.slice(0,10),planned);
  const nextDate = new Date(`${planned}T00:00:00Z`); nextDate.setUTCDate(nextDate.getUTCDate()+7);
  const rule = (await rows(sql`SELECT start_date::text,next_generation_date::text,status FROM recurring_rules WHERE origin_id=${id}`))[0];
  assert.equal(rule.start_date.slice(0,10),planned);
  assert.equal(rule.next_generation_date.slice(0,10),nextDate.toISOString().slice(0,10));
  assert.equal(rule.status,'ACTIVE');
  let items = await charges(id);
  assert.equal(items.length,2);
  assert.equal(items.find(row=>row.id===`${id}-legacy`).status,'CANCELLED');
  assert.equal(items.filter(row=>row.status!=='CANCELLED').length,1);
  const auditCount = await count('audit_logs');
  await post(id,'activate');
  await post(id,'bill',{dueDate:planned,competenceDate:planned,categoryId:'signature-rent-category'});
  assert.deepEqual(await charges(id),items,'replay must preserve every receivable field');
  assert.equal(await count('audit_logs'),auditCount,'replay must not duplicate audit');
  assert.deepEqual(await rows(sql`SELECT * FROM contract_artifacts WHERE contract_id=${id} ORDER BY id`),artifactBefore,'signed artifacts and hashes immutable');
  await RecurringAuthorityService.processTenant(companyId,nextDate.toISOString().slice(0,10),'signature-worker');
  const afterRecurring = await charges(id);
  assert.equal(afterRecurring.filter(row=>row.status!=='CANCELLED').length,2,'recurring charge must start one period after planned start');
  await RecurringAuthorityService.processTenant(companyId,nextDate.toISOString().slice(0,10),'signature-worker-replay');
  assert.deepEqual(await charges(id),afterRecurring,'recurring replay must be idempotent');
  const audit = JSON.stringify(await rows(sql`SELECT changes FROM audit_logs WHERE entity_id=${id}`));
  for (const value of ['plannedStartDate','signedAt','effectiveStartDate','SIGNED_PERIOD_RECONCILED',planned]) assert(audit.includes(value),`audit missing ${value}`);
  await post(id,'suspend',{reason:'Teste de suspensão'});
  // Contrato futuro bloqueia retomada com CONTRACT_PERIOD_NOT_STARTED (guarda real de negócio)
  const resumeFuture = await post(id,'resume',{},409);
  assert.equal(resumeFuture.code,'CONTRACT_PERIOD_NOT_STARTED');

  // Com vigência já iniciada (today), resume é permitido e close é idempotente
  await db.execute(sql`UPDATE contracts SET start_date=${today} WHERE id=${id}`);
  await post(id,'resume',{});
  await post(id,'close',{closeDate:today,finalKm:1000});
  await post(id,'close',{closeDate:today});
  console.log('PASS planned startDate governs operational validity and recurring generation; unpaid cancellation/reissue; audit; replay; suspend/resume/close; immutable PDF');

  // 3. Títulos históricos pagos e parcialmente pagos são estritamente preservados
  for (const amount of [700,100]) {
    const paid = await fixture();
    await legacyCharge(paid,amount,'2020-01-02');
    await db.execute(sql`INSERT INTO account_receivables(id,company_id,origin_type,origin_id,contract_id,category_id,description,original_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status,idempotency_key,created_at)
      VALUES(${`${paid}-unpaid`},${companyId},'CONTRACT_RENT',${`${paid}-old-unpaid`},${paid},'signature-rent-category','Unpaid draft',700,700,0,700,'2020-02-15','2020-02-15','PENDING',${`${paid}-unpaid-key`},'2020-02-15')`);
    await sign(paid);
    const before = await charges(paid);
    await post(paid,'activate');
    const audits = await count('audit_logs');
    await post(paid,'activate');
    const currentCharges = await charges(paid);
    const paidBefore = before.find(r => r.id === `${paid}-legacy`);
    const paidCurrent = currentCharges.find(r => r.id === `${paid}-legacy`);
    assert.deepEqual(paidCurrent, paidBefore, 'paid/partial history must remain byte-for-byte unchanged');
    assert.equal(currentCharges.find(r => r.id === `${paid}-unpaid`)?.status, 'CANCELLED');
    const paidRule = (await rows(sql`SELECT start_date::text,next_generation_date::text FROM recurring_rules WHERE origin_id=${paid}`))[0];
    assert.equal(paidRule.start_date.slice(0,10),planned);
    assert.equal(paidRule.next_generation_date.slice(0,10),nextDate.toISOString().slice(0,10),'planned date on paid historical title aligns future billing');
    assert.equal(await count('audit_logs'),audits);
    assert(JSON.stringify(await rows(sql`SELECT changes FROM audit_logs WHERE entity_id=${paid}`)).includes('SIGNED_PERIOD_PAID_PRESERVED'));
  }
  console.log('PASS paid and partially paid preserved; divergence recorded once');

  // 4. Múltiplos títulos pendentes prévios consolidados
  const duplicate = await fixture();
  await legacyCharge(duplicate,0,'2020-01-02');
  await db.execute(sql`INSERT INTO account_receivables(id,company_id,origin_type,origin_id,contract_id,category_id,description,original_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status,idempotency_key,created_at)
    VALUES(${`${duplicate}-extra`},${companyId},'CONTRACT_RENT','old-draft-period',${duplicate},'signature-rent-category','Extra pre-signature draft bill',700,700,0,700,'2099-11-09','2099-11-09','PENDING',${`${duplicate}-extra-key`},'2020-02-01')`);
  await sign(duplicate);
  await post(duplicate,'activate');
  await Promise.all([post(duplicate,'activate'),post(duplicate,'activate')]);
  const duplicates = await charges(duplicate);
  assert.equal(duplicates.filter(row=>row.status==='CANCELLED').length,2);
  assert.equal(duplicates.filter(row=>row.status!=='CANCELLED').length,1);
  console.log('PASS multiple pre-signature bills consolidated; concurrent replays');

  // 5. Restrições de exclusividade de veículo e motorista
  const conflict = await fixture(); await sign(conflict);
  for (const field of ['vehicle_id','driver_id']) {
    const other = await fixture();
    await assert.rejects(db.execute(sql.raw(`UPDATE contracts SET ${field}='${conflict}' WHERE id='${other}'`)),
      'exclusive vehicle/driver contract constraint must remain enforced');
  }
  console.log('PASS exclusive vehicle and driver conflict constraints');

  // 6. Período financeiro fechado bloqueia ativação e realiza rollback completo
  const closedPeriod = await fixture();
  await legacyCharge(closedPeriod,0,'2020-01-02');
  await sign(closedPeriod);
  const historical = await charges(closedPeriod);
  const beforePeriodAudit = await count('audit_logs');
  await db.execute(sql`INSERT INTO financial_periods(id,company_id,year,month,start_date,end_date,status)
    VALUES('signature-closed-period',${companyId},${Number(planned.slice(0,4))},${Number(planned.slice(5,7))},${planned},${planned},'CLOSED')`);
  await post(closedPeriod,'activate',{},409);
  assert.deepEqual(await charges(closedPeriod),historical,'new-period failure must roll back cancellation of the old title');
  assert.equal(await count('audit_logs'),beforePeriodAudit);
  assert.equal((await rows(sql`SELECT status FROM contracts WHERE id=${closedPeriod}`))[0].status,'DRAFT');
  await db.execute(sql`DELETE FROM financial_periods WHERE id='signature-closed-period'`);
  console.log('PASS closed financial period blocks reissue and rolls back cancellation, activation and audit');

  // 7. Gates operacionais vigentes bloqueiam ativação sem efeitos colaterais
  const gates: Array<[string,(id:string)=>Promise<unknown>]> = [
    ['vehicle status',id=>db.execute(sql`UPDATE vehicles SET status='MAINTENANCE' WHERE id=${id}`)],
    ['vehicle archived',id=>db.execute(sql`UPDATE vehicles SET is_archived=true WHERE id=${id}`)],
    ['vehicle bound',id=>db.execute(sql`UPDATE vehicles SET current_contract_id='other' WHERE id=${id}`)],
    ['driver archived',id=>db.execute(sql`UPDATE drivers SET is_archived=true WHERE id=${id}`)],
    ['driver inactive',id=>db.execute(sql`UPDATE drivers SET status='INACTIVE', active=false WHERE id=${id}`)],
    ['rental amount zero',id=>db.execute(sql`UPDATE contracts SET rental_amount=0 WHERE id=${id}`)],
    ['contract start exceeds end date',id=>db.execute(sql`UPDATE contracts SET end_date='2020-01-01' WHERE id=${id}`)],
    ['contract end date in past',id=>db.execute(sql`UPDATE contracts SET start_date='2019-01-01', end_date='2020-01-01' WHERE id=${id}`)],
  ];
  for (const [label,breakGate] of gates) {
    const blocked = await fixture(); await breakGate(blocked);
    const audits = await count('audit_logs');
    await post(blocked,'activate',{},409);
    assert.equal((await charges(blocked)).length,0,label);
    assert.equal(await count('audit_logs'),audits,`${label}: rollback audit`);
  }
  console.log(`PASS ${gates.length} operational vehicle/driver/lifecycle gates with no side effects`);

  // 8. Autoridade operacional em requireContractEffectivePeriod
  const periodId = await fixture();
  await UnitOfWork.run(companyId,async tx=>{
    const contract=await tx.getContractRepo().findByIdForCompany(companyId,periodId);
    const period=await requireContractEffectivePeriod(contract!,tx);
    assert.equal(period.effectiveStartDate,planned);
    assert.equal(period.plannedStartDate,planned);
    assert.equal(period.signatureArtifactId,`operational:${periodId}`);
  });

  await db.execute(sql`UPDATE contracts SET start_date='2026-10-09', end_date='2026-10-01' WHERE id=${periodId}`);
  await UnitOfWork.run(companyId,async tx=>{
    const contract=await tx.getContractRepo().findByIdForCompany(companyId,periodId);
    await assert.rejects(
      requireContractEffectivePeriod(contract!,tx),
      /Contract start exceeds contract end/
    );
  });
  console.log('PASS operational authority: planned startDate governs effective period; start exceeds end rejected');
} finally {
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
