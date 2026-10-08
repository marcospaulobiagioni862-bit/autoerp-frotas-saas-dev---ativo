import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AccountReceivable, Contract, KmRecord } from '../types/entities';
import { AuditAction, ObligationStatus, OriginType, RecurringFrequency } from '../types/enums';
import { ReceivableService } from '../domain/finance/ReceivableService';
import type { ITransactionContext } from '../domain/finance/ITransactionContext';
import type { AuthenticatedPrincipal } from './auth';
import { roundCurrency } from '../shared/utils/currency';
import { contractTimestampUtc, requireContractEffectivePeriod } from '../domain/contracts/contractEffectivePeriod';
import { FinancialPeriodService } from '../domain/finance/FinancialPeriodService';

async function auditSignatureFinance(
  contract: Contract, principal: AuthenticatedPrincipal, tx: ITransactionContext,
  period: Awaited<ReturnType<typeof requireContractEffectivePeriod>>,
  event: string, previous: AccountReceivable[], current: AccountReceivable[]
) {
  const id = createHash('sha256').update(JSON.stringify([
    contract.companyId, contract.id, period.signatureArtifactId, event,
    event === 'SIGNED_PERIOD_PAID_PRESERVED' ? [] : previous.map(item => item.id).sort(), current.map(item => item.id).sort(),
  ])).digest('hex');
  const raw = tx.getRawTransaction?.();
  if (!raw) throw new Error('Financial category authority unavailable');
  if (rows(await raw.execute(sql`SELECT id FROM audit_logs WHERE id=${id} AND company_id=${contract.companyId}`)).length) return;
  await tx.getAuditLogRepo().create({
    id, companyId: contract.companyId, entityName: 'Contract', entityId: contract.id,
    action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
    previousState: JSON.stringify({ receivables: previous }),
    newState: JSON.stringify({ event, ...period, receivables: current }), timestamp: new Date().toISOString(),
  });
}

/** Contract lock serializes reconciliation; row locks also serialize concurrent receipts. */
async function reconcileInitialCharge(
  contract: Contract, principal: AuthenticatedPrincipal, tx: ITransactionContext,
  period: Awaited<ReturnType<typeof requireContractEffectivePeriod>>,
  originType: OriginType.CONTRACT_RENT | OriginType.SECURITY_DEPOSIT, categoryId: string, amount: number,
) {
  const legacyOrigin = originType === OriginType.CONTRACT_RENT
    ? `${contract.id}:${contract.startDate}` : `${contract.id}:deposit`;
  const effectiveOrigin = originType === OriginType.CONTRACT_RENT
    ? `${contract.id}:${period.effectiveStartDate}` : `${contract.id}:deposit`;
  const candidates = (await tx.getReceivableRepo().findByContractId(contract.id))
    .filter(item => item.companyId === contract.companyId && item.originType === originType &&
      (item.originId === legacyOrigin || item.originId === effectiveOrigin ||
       contractTimestampUtc(item.createdAt) <= contractTimestampUtc(period.signedAt) ||
       item.originId === `${effectiveOrigin}:signature:${period.signatureArtifactId}`));
  const locked: AccountReceivable[] = [];
  for (const candidate of candidates.sort((a, b) => a.id.localeCompare(b.id))) {
    if (!tx.findReceivableByIdWithLock) throw new Error('Financial receivable lock unavailable');
    const item = await tx.findReceivableByIdWithLock(candidate.id);
    if (item && item.companyId === contract.companyId && item.status !== ObligationStatus.CANCELLED) locked.push(item);
  }
  // Any receipt, including a partial payment, makes the historical title immutable.
  const paid = locked.filter(item => item.paidAmount > 0 ||
    [ObligationStatus.PAID, ObligationStatus.PARTIALLY_PAID].includes(item.status));
  const unpaid = locked.filter(item => !paid.includes(item));
  const matching = unpaid.find(item => item.competenceDate?.slice(0,10) === period.effectiveStartDate &&
    item.dueDate.slice(0,10) === period.effectiveStartDate && Number(item.originalAmount) === roundCurrency(amount));
  const replace = unpaid.filter(item => paid.length > 0 || item !== matching);
  for (const item of replace) {
    await FinancialPeriodService.assertDateOpen(contract.companyId, item.competenceDate || item.dueDate, tx);
    await FinancialPeriodService.assertDateOpen(contract.companyId, item.dueDate, tx);
    await ReceivableService.cancelReceivable(contract.companyId, item.id,
      `Ajuste de vigência por assinatura ${period.signatureArtifactId}: ${contract.startDate} -> ${period.effectiveStartDate}`,
      principal.userId, principal.name, tx);
  }
  if (paid.length) {
    if (contract.startDate !== period.effectiveStartDate || replace.length) {
      await auditSignatureFinance(contract, principal, tx, period, 'SIGNED_PERIOD_PAID_PRESERVED', locked, paid);
    }
    return paid;
  }
  if (matching) {
    if (replace.length) await auditSignatureFinance(contract, principal, tx, period, 'SIGNED_PERIOD_RECONCILED', replace, [matching]);
    return [matching];
  }
  // A previously cancelled title retains its idempotency key. Never resurrect it.
  const cancelledTarget = candidates.some(item => item.originId === effectiveOrigin &&
    item.competenceDate?.slice(0,10) === period.effectiveStartDate);
  const created = await ReceivableService.create({
    companyId: contract.companyId, originType,
    originId: cancelledTarget ? `${effectiveOrigin}:signature:${period.signatureArtifactId}` : effectiveOrigin,
    contractId: contract.id, vehicleId: contract.vehicleId, driverId: contract.driverId,
    categoryId, description: `${originType === OriginType.CONTRACT_RENT ? 'Aluguel' : 'Caução'} Contrato ${contract.contractNumber}`,
    totalAmount: amount, dueDate: period.effectiveStartDate, competenceDate: period.effectiveStartDate,
    userId: principal.userId, userName: principal.name,
  }, tx);
  if (created.some(item => item.status === ObligationStatus.CANCELLED)) throw new Error('Contract financial reconciliation conflict');
  await auditSignatureFinance(contract, principal, tx, period, 'SIGNED_PERIOD_RECONCILED', replace, created);
  return created;
}

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}

// Correct the existing lifecycle trigger's planned-date projection before commit.
async function syncSignedRecurringPeriod(contract: Contract, principal: AuthenticatedPrincipal, tx: ITransactionContext,
  period: Awaited<ReturnType<typeof requireContractEffectivePeriod>>, categoryId: string) {
  if (contract.status !== 'ACTIVE') return;
  const raw = tx.getRawTransaction?.();
  if (!raw) throw new Error('Financial category authority unavailable');
  const rules = rows(await raw.execute(sql`SELECT * FROM recurring_rules WHERE company_id=${contract.companyId}
    AND origin_type='CONTRACT_RENT' AND origin_id=${contract.id}
    AND status IN ('PAUSED','ACTIVE')
    AND (start_date<>${period.effectiveStartDate}::date OR category_id IS NULL) FOR UPDATE`));
  for (const rule of rules) {
    const anchor = rows(await raw.execute(sql`SELECT GREATEST(${period.effectiveStartDate}::date,
      COALESCE(max(competence_date::date),${period.effectiveStartDate}::date))::text AS date
      FROM account_receivables WHERE company_id=${contract.companyId} AND contract_id=${contract.id}
        AND origin_type='CONTRACT_RENT' AND status<>'CANCELLED'
        AND created_at>=${period.signedAt}::timestamp`))[0].date;
    const updated = rows(await raw.execute(sql`UPDATE recurring_rules SET start_date=${period.effectiveStartDate}::date,
      next_generation_date=autoerp_advance_recurring_date(${anchor}::date,frequency),
      next_execution=autoerp_advance_recurring_date(${anchor}::date,frequency),
      last_generated_reference=autoerp_recurring_period_ref(${anchor}::date,frequency),
      status=CASE WHEN category_id IS NULL THEN 'ACTIVE' ELSE status END,
      active=CASE WHEN category_id IS NULL THEN true ELSE active END,
      category_id=${categoryId},updated_at=NOW()
      WHERE company_id=${contract.companyId} AND id=${String(rule.id)} RETURNING *`))[0];
    await tx.getAuditLogRepo().create({id:randomUUID(),companyId:contract.companyId,entityName:'RecurringRule',entityId:String(rule.id),
      action:AuditAction.UPDATE,previousState:JSON.stringify(rule),newState:JSON.stringify({...updated,...period,event:'SIGNED_PERIOD_RECURRING_ALIGNED'}),
      userId:principal.userId,userName:principal.name,timestamp:new Date().toISOString()});
  }
}

async function ensureNamedIncomeCategory(
  companyId:string,
  name:string,
  principal:AuthenticatedPrincipal,
  tx:ITransactionContext
):Promise<string>{
  const raw=tx.getRawTransaction?.();
  if(!raw) throw new Error('Financial category authority unavailable');
  const lockKey=`${companyId}:contract-finance-category:${name}`;
  await raw.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${lockKey})))`);
  const existing=rows(await raw.execute(sql`
    SELECT id FROM financial_categories
    WHERE company_id=${companyId}
      AND active=true
      AND type IN ('INCOME','BOTH')
      AND lower(name)=lower(${name})
    ORDER BY created_at ASC
    LIMIT 1
  `))[0];
  if(existing?.id)return String(existing.id);

  const id=randomUUID();
  const now=new Date().toISOString();
  await raw.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,parent_id,active,created_at,updated_at)
    VALUES(${id},${companyId},${name},'INCOME',NULL,true,${now},${now})
  `);
  await tx.getAuditLogRepo().create({
    id:randomUUID(),companyId,entityName:'FinancialCategory',entityId:id,
    action:AuditAction.CREATE,userId:principal.userId,userName:principal.name,
    newState:JSON.stringify({name,type:'INCOME',active:true}),timestamp:now,
  });
  return id;
}

export async function ensureRentalIncomeCategory(
  companyId:string,
  principal:AuthenticatedPrincipal,
  tx:ITransactionContext
):Promise<string>{
  const raw=tx.getRawTransaction?.();
  if(!raw) throw new Error('Financial category authority unavailable');
  await raw.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${`${companyId}:rental-income-category`})))`);
  const existing=rows(await raw.execute(sql`
    SELECT id FROM financial_categories
    WHERE company_id=${companyId}
      AND active=true
      AND type IN ('INCOME','BOTH')
      AND lower(name) IN ('receita de aluguel','aluguel','aluguel de veiculos','aluguel de veículos')
    ORDER BY CASE WHEN lower(name)='receita de aluguel' THEN 0 ELSE 1 END, created_at ASC
    LIMIT 1
  `))[0];
  if(existing?.id)return String(existing.id);

  const id=randomUUID();
  const now=new Date().toISOString();
  await raw.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,parent_id,active,created_at,updated_at)
    VALUES(${id},${companyId},'Receita de Aluguel','INCOME',NULL,true,${now},${now})
  `);
  await tx.getAuditLogRepo().create({
    id:randomUUID(),companyId,entityName:'FinancialCategory',entityId:id,
    action:AuditAction.CREATE,userId:principal.userId,userName:principal.name,
    newState:JSON.stringify({name:'Receita de Aluguel',type:'INCOME',active:true}),timestamp:now,
  });
  return id;
}

async function ensureSecurityDepositCategory(
  companyId:string,
  principal:AuthenticatedPrincipal,
  tx:ITransactionContext
):Promise<string>{
  return ensureNamedIncomeCategory(companyId,'Caução Contratual',principal,tx);
}

async function ensureExcessKmCategory(
  companyId:string,
  principal:AuthenticatedPrincipal,
  tx:ITransactionContext
):Promise<string>{
  return ensureNamedIncomeCategory(companyId,'KM Excedente',principal,tx);
}

export async function ensureInitialContractReceivable(
  contract:Contract,
  principal:AuthenticatedPrincipal,
  tx:ITransactionContext
){
  const locked = await tx.getContractRepo().findByIdForCompanyWithLock(contract.companyId, contract.id);
  if (!locked || locked.isArchived || !['DRAFT', 'AWAITING_SIGNATURE', 'ACTIVE'].includes(locked.status)) {
    throw new Error('Contract financial reconciliation conflict');
  }
  contract = locked;
  const period = await requireContractEffectivePeriod(contract, tx);
  if(contract.rentalAmount<=0) throw new Error('Contract rental amount incomplete');
  const categoryId=await ensureRentalIncomeCategory(contract.companyId,principal,tx);
  const rental=await reconcileInitialCharge(contract,principal,tx,period,OriginType.CONTRACT_RENT,categoryId,contract.rentalAmount);
  await syncSignedRecurringPeriod(contract,principal,tx,period,rental[0].categoryId);

  // Document generation historically projects rent only. Project the deposit once
  // the modern contract is ACTIVE; legacy contracts remain rent-only end-to-end.
  if(contract.status!=='ACTIVE'||!contract.signatureRequired||contract.securityDepositAmount<=0)return rental;
  const depositCategoryId=await ensureSecurityDepositCategory(contract.companyId,principal,tx);
  const deposit=await reconcileInitialCharge(contract,principal,tx,period,OriginType.SECURITY_DEPOSIT,depositCategoryId,roundCurrency(contract.securityDepositAmount));
  return [...rental,...deposit];
}

function periodsCovered(startDate:string,endDate:string,frequency:RecurringFrequency):number{
  const start=new Date(`${startDate}T00:00:00Z`);
  const end=new Date(`${endDate}T00:00:00Z`);
  const days=Math.max(1,Math.floor((end.getTime()-start.getTime())/86400000)+1);
  if(frequency===RecurringFrequency.WEEKLY)return Math.max(1,Math.ceil(days/7));
  const months=Math.max(1,(end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth()+1);
  if(frequency===RecurringFrequency.QUARTERLY)return Math.max(1,Math.ceil(months/3));
  if(frequency===RecurringFrequency.SEMI_ANNUAL)return Math.max(1,Math.ceil(months/6));
  if(frequency===RecurringFrequency.ANNUAL)return Math.max(1,Math.ceil(months/12));
  return months;
}

export interface ContractExcessKmCharge {
  startKm:number;
  endKm:number;
  travelledKm:number;
  allowedKm:number;
  excessKm:number;
  amount:number;
}

export function calculateContractExcessKmCharge(
  contract:Contract,
  closeDate:string,
  kmRecords:KmRecord[]
):ContractExcessKmCharge|null{
  if(contract.franchiseKm<=0||contract.excessKmRate<=0)return null;
  const scoped=kmRecords
    .filter((item)=>item.companyId===contract.companyId&&item.vehicleId===contract.vehicleId&&item.contractId===contract.id)
    .filter((item)=>item.recordDate>=contract.startDate&&item.recordDate<=closeDate);
  const checkout=scoped
    .filter((item)=>item.readingType==='CHECK_OUT')
    .sort((a,b)=>a.recordDate.localeCompare(b.recordDate)||a.createdAt.localeCompare(b.createdAt)||a.kmValue-b.kmValue)[0];
  const checkin=scoped
    .filter((item)=>item.readingType==='CHECK_IN')
    .sort((a,b)=>b.recordDate.localeCompare(a.recordDate)||b.createdAt.localeCompare(a.createdAt)||b.kmValue-a.kmValue)[0];
  if(!checkout||!checkin||checkin.kmValue<checkout.kmValue)return null;
  const travelledKm=checkin.kmValue-checkout.kmValue;
  const allowedKm=contract.franchiseKm*periodsCovered(contract.startDate,closeDate,contract.billingPeriodicity);
  const excessKm=Math.max(0,travelledKm-allowedKm);
  if(excessKm<=0)return null;
  return {
    startKm:checkout.kmValue,
    endKm:checkin.kmValue,
    travelledKm,
    allowedKm,
    excessKm,
    amount:roundCurrency(excessKm*contract.excessKmRate),
  };
}

export async function ensureContractCloseReceivables(
  contract:Contract,
  closeDate:string,
  principal:AuthenticatedPrincipal,
  tx:ITransactionContext
){
  const period=await requireContractEffectivePeriod(contract,tx);
  let kmRecords=await tx.getKmRecordRepo().findByVehicleIdForCompany(contract.companyId,contract.vehicleId);
  const hasCheckout = kmRecords.some((item) =>
    item.companyId === contract.companyId &&
    item.vehicleId === contract.vehicleId &&
    item.contractId === contract.id &&
    item.readingType === 'CHECK_OUT' &&
    item.recordDate >= period.effectiveStartDate &&
    item.recordDate <= closeDate
  );
  if (!hasCheckout) {
    const vehicle = await tx.getVehicleRepo().findByIdForCompany(contract.companyId, contract.vehicleId);
    if (vehicle) {
      const synthesizedCheckout = await tx.getKmRecordRepo().create({
        id: randomUUID(),
        companyId: contract.companyId,
        vehicleId: contract.vehicleId,
        driverId: contract.driverId,
        contractId: contract.id,
        kmValue: vehicle.currentKm,
        recordDate: period.effectiveStartDate,
        readingType: 'CHECK_OUT',
        notes: 'Registro inicial de entrega (check-out) sintetizado para apuração de encerramento',
        createdAt: new Date().toISOString(),
      });
      kmRecords = [synthesizedCheckout, ...kmRecords];
    }
  }
  const charge=calculateContractExcessKmCharge({...contract,startDate:period.effectiveStartDate},closeDate,kmRecords);
  if(!charge||charge.amount<=0)return [];
  const categoryId=await ensureExcessKmCategory(contract.companyId,principal,tx);
  return ReceivableService.create({
    companyId:contract.companyId,
    originType:OriginType.KM_EXCESS,
    originId:`${contract.id}:close`,
    vehicleId:contract.vehicleId,
    driverId:contract.driverId,
    contractId:contract.id,
    categoryId,
    description:`KM excedente - Contrato ${contract.contractNumber}: ${charge.excessKm} km × R$ ${contract.excessKmRate.toFixed(2)}`,
    totalAmount:charge.amount,
    dueDate:closeDate,
    competenceDate:closeDate,
    userId:principal.userId,
    userName:principal.name,
  },tx);
}

export async function cancelUnpaidContractReceivables(
  contract:Contract,
  reason:string,
  principal:AuthenticatedPrincipal,
  tx:ITransactionContext
):Promise<void>{
  const receivables=await tx.getReceivableRepo().findByContractId(contract.id);
  const now=new Date().toISOString();
  for(const item of receivables){
    if(item.companyId!==contract.companyId)continue;
    if(item.originType!==OriginType.CONTRACT_RENT&&item.originType!==OriginType.SECURITY_DEPOSIT)continue;
    if(item.status===ObligationStatus.CANCELLED)continue;
    if(item.paidAmount>0||item.status===ObligationStatus.PAID)continue;
    const updated=await tx.getReceivableRepo().update(item.id,{
      status:ObligationStatus.CANCELLED,
      cancelledAt:now,
      cancelReason:reason,
      updatedAt:now,
    });
    await tx.getAuditLogRepo().create({
      id:randomUUID(),companyId:contract.companyId,entityName:'AccountReceivable',entityId:item.id,
      action:AuditAction.CANCEL,userId:principal.userId,userName:principal.name,
      previousState:JSON.stringify(item),newState:JSON.stringify(updated),timestamp:now,
    });
  }
}
