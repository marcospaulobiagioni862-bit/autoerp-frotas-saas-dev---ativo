import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Contract } from '../types/entities';
import { AuditAction, ObligationStatus, OriginType } from '../types/enums';
import { ReceivableService } from '../domain/finance/ReceivableService';
import type { ITransactionContext } from '../domain/finance/ITransactionContext';
import type { AuthenticatedPrincipal } from './auth';

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}

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

export async function ensureInitialContractReceivable(
  contract:Contract,
  principal:AuthenticatedPrincipal,
  tx:ITransactionContext
){
  if(contract.rentalAmount<=0) throw new Error('Contract rental amount incomplete');
  const categoryId=await ensureRentalIncomeCategory(contract.companyId,principal,tx);
  return ReceivableService.create({
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
}

export async function cancelUnpaidContractReceivables(
  contract:Contract,
  reason:string,
  principal:AuthenticatedPrincipal,
  tx:ITransactionContext
):Promise<void>{
  const receivables=await tx.getReceivableRepo().findByContractId(contract.id);
  for(const item of receivables){
    if(item.companyId!==contract.companyId)continue;
    if(item.status===ObligationStatus.CANCELLED)continue;
    if(item.paidAmount>0||item.status===ObligationStatus.PAID)continue;
    await ReceivableService.cancelReceivable(
      contract.companyId,item.id,reason,principal.userId,principal.name,tx
    );
  }
}
