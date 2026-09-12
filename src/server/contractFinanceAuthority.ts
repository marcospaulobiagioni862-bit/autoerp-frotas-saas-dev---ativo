import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Contract, KmRecord } from '../types/entities';
import { AuditAction, ObligationStatus, OriginType, RecurringFrequency } from '../types/enums';
import { ReceivableService } from '../domain/finance/ReceivableService';
import type { ITransactionContext } from '../domain/finance/ITransactionContext';
import type { AuthenticatedPrincipal } from './auth';
import { roundCurrency } from '../shared/utils/currency';

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}

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
  if(contract.rentalAmount<=0) throw new Error('Contract rental amount incomplete');
  const categoryId=await ensureRentalIncomeCategory(contract.companyId,principal,tx);
  const rental=await ReceivableService.create({
    companyId:contract.companyId,
    originType:OriginType.CONTRACT_RENT,
    originId:`${contract.id}:${contract.startDate}`,
    vehicleId:contract.vehicleId,
    driverId:contract.driverId,
    contractId:contract.id,
    categoryId,
    description:`Aluguel Contrato ${contract.contractNumber} (${contract.billingPeriodicity})`,
    totalAmount:contract.rentalAmount,
    dueDate:contract.startDate,
    competenceDate:contract.startDate,
    userId:principal.userId,
    userName:principal.name,
  },tx);

  // Legacy contracts predate the current signature/deposit projection flow. Preserve
  // their activation semantics (rent only); modern contracts project the agreed deposit.
  if(!contract.signatureRequired||contract.securityDepositAmount<=0)return rental;
  const depositCategoryId=await ensureSecurityDepositCategory(contract.companyId,principal,tx);
  const deposit=await ReceivableService.create({
    companyId:contract.companyId,
    originType:OriginType.SECURITY_DEPOSIT,
    originId:`${contract.id}:deposit`,
    vehicleId:contract.vehicleId,
    driverId:contract.driverId,
    contractId:contract.id,
    categoryId:depositCategoryId,
    description:`Caução Contrato ${contract.contractNumber}`,
    totalAmount:roundCurrency(contract.securityDepositAmount),
    dueDate:contract.startDate,
    competenceDate:contract.startDate,
    userId:principal.userId,
    userName:principal.name,
  },tx);
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
  const kmRecords=await tx.getKmRecordRepo().findByVehicleIdForCompany(contract.companyId,contract.vehicleId);
  const charge=calculateContractExcessKmCharge(contract,closeDate,kmRecords);
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