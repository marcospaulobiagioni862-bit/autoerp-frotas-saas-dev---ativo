import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { PayableService } from '../domain/finance/PayableService';
import { AuditAction, OriginType } from '../types/enums';
import type { Insurance } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

export interface InsuranceExpenseCategory { id:string; name:string; type:string; }
export interface CreateInsuranceAuthorityInput {
  vehicleId:string;insuranceCompany:string;policyNumber:string;coverageDetails:string;
  deductibleAmount:number;totalPremiumAmount:number;installmentsCount:number;
  startDate:string;endDate:string;brokerName?:string;brokerPhone?:string;categoryId?:string;sourceAttachmentId?:string;
}

type InsuranceHooks={afterPayablesCreated?:()=>void|Promise<void>};
let testHooks:InsuranceHooks={};
export function setInsuranceTestHooksForTests(hooks:InsuranceHooks):void{testHooks=hooks;}

export class InsuranceValidationError extends Error{}
export class InsuranceNotFoundError extends Error{}
export class InsuranceForbiddenError extends Error{}
export class InsuranceConflictError extends Error{}

const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','FINANCIAL_MANAGER','OPERATIONAL']);
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function normalizePolicy(value:string):string{return value.trim().toUpperCase().replace(/\s+/g,' ');}
function assertWrite(principal:AuthenticatedPrincipal):void{
  const role=String(principal.role||'').toUpperCase();const permissions=Array.isArray(principal.permissions)?principal.permissions:[];
  if(!WRITE_ROLES.has(role)&&!permissions.includes('*')&&!permissions.includes('INSURANCE_WRITE'))throw new InsuranceForbiddenError('Acesso negado: Seguro sem permissão de escrita');
}
function validateDate(value:string,label:string):void{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new InsuranceValidationError(`${label} inválida`);
  const parsed=new Date(`${value}T00:00:00Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new InsuranceValidationError(`${label} inválida`);
}
async function validateCategory(rawTx:any,companyId:string,categoryId:string):Promise<void>{
  const result=await rawTx.execute(sql`SELECT id,type FROM financial_categories WHERE company_id=${companyId} AND id=${categoryId} AND active=true LIMIT 1`);
  const category=rows(result)[0];if(!category)throw new InsuranceNotFoundError('Categoria financeira não encontrada');
  if(!['EXPENSE','BOTH'].includes(String(category.type)))throw new InsuranceConflictError('Categoria financeira incompatível com despesa de seguro');
}

export class InsuranceAuthorityService {
  static async list(companyId:string,filters:{vehicleId?:string;status?:'ACTIVE'|'EXPIRED'|'CANCELLED'}={}):Promise<Insurance[]>{
    return await UnitOfWork.run(companyId,async txContext=>await txContext.getInsuranceRepo().findAllByCompany(companyId,filters));
  }

  static async get(companyId:string,id:string):Promise<Insurance|null>{
    return await UnitOfWork.run(companyId,async txContext=>await txContext.getInsuranceRepo().findByIdForCompany(companyId,id));
  }

  static async listExpenseCategories(companyId:string):Promise<InsuranceExpenseCategory[]>{
    return await UnitOfWork.run(companyId,async txContext=>{
      const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Insurance persistence unavailable');
      const result=await rawTx.execute(sql`SELECT id,name,type FROM financial_categories WHERE company_id=${companyId} AND active=true AND type IN ('EXPENSE','BOTH') ORDER BY name,id`);
      return rows(result).map(row=>({id:String(row.id),name:String(row.name),type:String(row.type)}));
    });
  }

  static async create(principal:AuthenticatedPrincipal,input:CreateInsuranceAuthorityInput):Promise<Insurance>{
    assertWrite(principal);
    const insuranceCompany=input.insuranceCompany.trim(),policyNumber=normalizePolicy(input.policyNumber),coverage=input.coverageDetails.trim();
    if(!input.vehicleId||!insuranceCompany||!policyNumber||!coverage)throw new InsuranceValidationError('Campos obrigatórios ausentes');
    if(!Number.isFinite(input.deductibleAmount)||input.deductibleAmount<0)throw new InsuranceValidationError('Franquia inválida');
    if(!Number.isFinite(input.totalPremiumAmount)||input.totalPremiumAmount<0)throw new InsuranceValidationError('Prêmio inválido');
    if(!Number.isInteger(input.installmentsCount)||input.installmentsCount<1||input.installmentsCount>60)throw new InsuranceValidationError('Parcelamento inválido');
    validateDate(input.startDate,'Data inicial');validateDate(input.endDate,'Data final');if(input.endDate<input.startDate)throw new InsuranceValidationError('Vigência inválida');
    if(input.totalPremiumAmount>0&&!input.categoryId)throw new InsuranceValidationError('Categoria financeira obrigatória');

    return await UnitOfWork.run(principal.companyId,async txContext=>{
      const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Insurance persistence unavailable');
      const repo=txContext.getInsuranceRepo();
      const vehicle=await txContext.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId,input.vehicleId);
      if(!vehicle||vehicle.isArchived)throw new InsuranceNotFoundError('Veículo não encontrado');
      if(await repo.findByPolicyNumber(principal.companyId,policyNumber))throw new InsuranceConflictError('Apólice já cadastrada');
      if(input.totalPremiumAmount>0)await validateCategory(rawTx,principal.companyId,input.categoryId!);
      let sourceAttachment:any;
      if(input.sourceAttachmentId){
        const result=await rawTx.execute(sql`SELECT * FROM file_attachments WHERE company_id=${principal.companyId} AND id=${input.sourceAttachmentId} FOR UPDATE`);
        sourceAttachment=rows(result)[0];
        if(!sourceAttachment||sourceAttachment.is_archived||String(sourceAttachment.content_state)!=='AVAILABLE'||String(sourceAttachment.entity_type)!=='Vehicle'||String(sourceAttachment.entity_id)!==input.vehicleId||String(sourceAttachment.document_type||'').toUpperCase()!=='INSURANCE_POLICY'){
          throw new InsuranceConflictError('Documento de apólice inválido para este veículo');
        }
      }

      const now=new Date().toISOString();const id=randomUUID();
      let insurance:Insurance=await repo.create({
        id,companyId:principal.companyId,vehicleId:input.vehicleId,insuranceCompany,policyNumber,coverageDetails:coverage,
        deductibleAmount:Math.round(input.deductibleAmount*100)/100,totalPremiumAmount:Math.round(input.totalPremiumAmount*100)/100,
        installmentsCount:input.installmentsCount,startDate:input.startDate,endDate:input.endDate,status:'ACTIVE',
        brokerName:input.brokerName?.trim()||undefined,brokerPhone:input.brokerPhone?.trim()||undefined,
        accountPayableIds:[],createdBy:principal.userId,createdAt:now,updatedAt:now,
      });

      if(input.totalPremiumAmount>0){
        const payables=await PayableService.create({
          companyId:principal.companyId,originType:OriginType.INSURANCE,originId:id,vehicleId:input.vehicleId,
          categoryId:input.categoryId!,description:`Seguro ${insuranceCompany} — apólice ${policyNumber}`,
          totalAmount:insurance.totalPremiumAmount,dueDate:input.startDate,competenceDate:input.startDate,
          installmentsCount:input.installmentsCount,userId:principal.userId,userName:principal.name,
        },txContext);
        insurance=await repo.setPayableIds(principal.companyId,id,payables.map((item:any)=>String(item.id)),new Date().toISOString());
      }
      if(sourceAttachment){
        const relinked=await rawTx.execute(sql`UPDATE file_attachments SET entity_name='Insurance',entity_type='Insurance',entity_id=${id} WHERE company_id=${principal.companyId} AND id=${input.sourceAttachmentId} AND entity_type='Vehicle' AND entity_id=${input.vehicleId} AND is_archived=false RETURNING id`);
        if(rows(relinked).length!==1)throw new InsuranceConflictError('Falha ao vincular apólice original ao seguro');
        await txContext.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'FileAttachment',entityId:input.sourceAttachmentId!,action:AuditAction.UPDATE,previousState:JSON.stringify({entityType:'Vehicle',entityId:input.vehicleId}),newState:JSON.stringify({event:'PROMOTE_INSURANCE_POLICY',entityType:'Insurance',entityId:id}),userId:principal.userId,userName:principal.name,timestamp:now});
      }
      await testHooks.afterPayablesCreated?.();
      await txContext.getAuditLogRepo().create({
        id:randomUUID(),companyId:principal.companyId,entityName:'Insurance',entityId:id,action:AuditAction.CREATE,
        newState:JSON.stringify(insurance),userId:principal.userId,userName:principal.name,timestamp:new Date().toISOString(),
      });
      return insurance;
    },{financialPeriodLock:'SHARED'});
  }

  static async cancel(principal:AuthenticatedPrincipal,id:string,reason:string):Promise<Insurance>{
    assertWrite(principal);const cleanReason=reason.trim();if(!cleanReason)throw new InsuranceValidationError('Motivo obrigatório');
    return await UnitOfWork.run(principal.companyId,async txContext=>{
      const repo=txContext.getInsuranceRepo();const current=await repo.findByIdForCompanyWithLock(principal.companyId,id);
      if(!current)throw new InsuranceNotFoundError('Seguro não encontrado');
      if(current.status==='CANCELLED')return current;
      if(current.status==='EXPIRED')throw new InsuranceConflictError('Seguro expirado não pode ser convertido em cancelado');
      const now=new Date().toISOString();const updated=await repo.cancel(principal.companyId,id,cleanReason,now);
      await txContext.getAuditLogRepo().create({
        id:randomUUID(),companyId:principal.companyId,entityName:'Insurance',entityId:id,action:AuditAction.UPDATE,
        previousState:JSON.stringify(current),newState:JSON.stringify(updated),userId:principal.userId,userName:principal.name,timestamp:now,
      });
      return updated;
    });
  }
}
