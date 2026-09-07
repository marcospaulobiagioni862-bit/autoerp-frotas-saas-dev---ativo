import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import { AuditAction, OriginType, RecurringFrequency, VehicleStatus } from '../types/enums';
import type { Tracker } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

export class TrackerValidationError extends Error {}
export class TrackerConflictError extends Error {}
export class TrackerNotFoundError extends Error {}

export interface TrackerExpenseCategory { id:string; name:string; type:string; }
export interface CreateTrackerInput {
  vehicleId:string; equipmentModel:string; imei:string; serialNumber?:string; chipCarrier?:string; chipNumber?:string;
  monthlyCost:number; installationDate:string; supplierId?:string; notes?:string; categoryId?:string; sourceAttachmentId?:string;
}
export interface UpdateTrackerInput {
  equipmentModel?:string; imei?:string; serialNumber?:string|null; chipCarrier?:string|null; chipNumber?:string|null;
  monthlyCost?:number; installationDate?:string; supplierId?:string|null; notes?:string|null; categoryId?:string;
}

type RuleRow = { id:string; status:string; category_id?:string; amount?:unknown; supplier_id?:string; };
let afterTrackerCreatedForTests:(()=>void|Promise<void>)|undefined;
export function setTrackerTestHooksForTests(hooks:{afterTrackerCreated?:()=>void|Promise<void>}):void {
  if(process.env.NODE_ENV!=='test') throw new Error('Tracker test hooks are available only in NODE_ENV=test');
  afterTrackerCreatedForTests=hooks.afterTrackerCreated;
}
function rows(result:any):any[]{ return Array.isArray(result?.rows)?result.rows:[]; }
function reqText(value:unknown,field:string,max=300):string { const s=typeof value==='string'?value.trim():''; if(!s||s.length>max) throw new TrackerValidationError(`Invalid ${field}`); return s; }
function optText(value:unknown,max=1000):string|undefined { if(value===undefined||value===null||value==='')return undefined; const s=String(value).trim(); if(!s||s.length>max)throw new TrackerValidationError('Invalid optional text'); return s; }
function money(value:unknown):number { const n=Number(value); if(!Number.isFinite(n)||n<0||n>999999999.99)throw new TrackerValidationError('Invalid monthlyCost'); return Math.round(n*100)/100; }
function imei(value:unknown):string { const s=String(value||'').replace(/\D/g,''); if(!/^\d{15}$/.test(s))throw new TrackerValidationError('IMEI must contain 15 digits'); return s; }
function isoDate(value:unknown):string { const s=String(value||'').trim(); if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new TrackerValidationError('Invalid installationDate'); const d=new Date(`${s}T00:00:00Z`); if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new TrackerValidationError('Invalid installationDate'); return s; }
async function audit(tx:any,p:AuthenticatedPrincipal,entityName:string,entityId:string,action:AuditAction,previousState:any,newState:any,now:string){
  await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName,entityId,action,previousState:previousState===undefined?undefined:JSON.stringify(previousState),newState:newState===undefined?undefined:JSON.stringify(newState),userId:p.userId,userName:p.name,timestamp:now});
}
async function validSupplier(tx:any,companyId:string,supplierId?:string):Promise<void>{
  if(!supplierId)return; const supplier=await tx.getSupplierRepo().findByIdForCompany(companyId,supplierId);
  if(!supplier||supplier.status!=='ACTIVE')throw new TrackerNotFoundError('Fornecedor não encontrado');
}
async function expenseCategory(raw:any,companyId:string,categoryId:string):Promise<TrackerExpenseCategory>{
  const category=rows(await raw.execute(sql`SELECT id,name,type FROM financial_categories WHERE company_id=${companyId} AND id=${categoryId} AND active=true LIMIT 1`))[0];
  if(!category)throw new TrackerNotFoundError('Categoria financeira não encontrada');
  if(!['EXPENSE','BOTH'].includes(String(category.type||'').toUpperCase()))throw new TrackerConflictError('Categoria financeira incompatível com rastreador');
  return {id:String(category.id),name:String(category.name||''),type:String(category.type)};
}
async function ruleForTracker(raw:any,companyId:string,trackerId:string,lock=true):Promise<RuleRow|null>{
  const result=lock
    ? await raw.execute(sql`SELECT id,status,category_id,amount,supplier_id FROM recurring_rules WHERE company_id=${companyId} AND origin_type='TRACKER' AND origin_id=${trackerId} LIMIT 1 FOR UPDATE`)
    : await raw.execute(sql`SELECT id,status,category_id,amount,supplier_id FROM recurring_rules WHERE company_id=${companyId} AND origin_type='TRACKER' AND origin_id=${trackerId} LIMIT 1`);
  return rows(result)[0]||null;
}
async function syncRecurringRule(tx:any,p:AuthenticatedPrincipal,tracker:Tracker,categoryId:string|undefined):Promise<void>{
  const raw=tx.getRawTransaction?.(); if(!raw)throw new Error('Tracker recurring persistence unavailable');
  const cost=Number(tracker.monthlyCost||0); const existing=await ruleForTracker(raw,p.companyId,tracker.id,true); const now=new Date().toISOString();
  if(cost<=0){
    if(existing&&existing.status==='ACTIVE'){
      await raw.execute(sql`UPDATE recurring_rules SET status='PAUSED',active=false,updated_at=${now} WHERE company_id=${p.companyId} AND id=${existing.id}`);
      await audit(tx,p,'RecurringRule',String(existing.id),AuditAction.UPDATE,existing,{...existing,status:'PAUSED',active:false},now);
    }
    return;
  }
  if(!tracker.supplierId)throw new TrackerValidationError('supplierId is required for positive monthly cost');
  await FinancialAuthorizationService.authorize(p.userId,p.companyId,'PAYABLE_CREATE',tx);
  const effectiveCategory=categoryId||existing?.category_id;
  if(!effectiveCategory)throw new TrackerValidationError('categoryId is required for positive monthly cost');
  await expenseCategory(raw,p.companyId,String(effectiveCategory));
  const description=`Mensalidade Rastreador - Veículo ${tracker.vehicleId} (${tracker.equipmentModel||tracker.imei||tracker.id})`;
  if(!existing){
    const id=randomUUID(); const start=tracker.installationDate!;
    await raw.execute(sql`
      INSERT INTO recurring_rules (
        id,company_id,description,amount,interval,active,next_execution,origin_type,origin_id,frequency,start_date,
        next_generation_date,category_id,vehicle_id,supplier_id,status,created_by,created_at,updated_at
      ) VALUES (
        ${id},${p.companyId},${description},${String(cost)},${RecurringFrequency.MONTHLY},true,${start},${OriginType.TRACKER},${tracker.id},
        ${RecurringFrequency.MONTHLY},${start},${start},${effectiveCategory},${tracker.vehicleId},${tracker.supplierId||null},'ACTIVE',${p.userId},${now},${now}
      )
    `);
    await audit(tx,p,'RecurringRule',id,AuditAction.CREATE,undefined,{originType:OriginType.TRACKER,originId:tracker.id,amount:cost,categoryId:effectiveCategory,status:'ACTIVE'},now);
    return;
  }
  if(existing.status==='COMPLETED'||existing.status==='CANCELLED')throw new TrackerConflictError('Regra recorrente encerrada requer reconciliação explícita');
  await raw.execute(sql`
    UPDATE recurring_rules SET description=${description},amount=${String(cost)},interval=${RecurringFrequency.MONTHLY},frequency=${RecurringFrequency.MONTHLY},
      active=true,status='ACTIVE',category_id=${effectiveCategory},vehicle_id=${tracker.vehicleId},supplier_id=${tracker.supplierId||null},updated_at=${now}
    WHERE company_id=${p.companyId} AND id=${existing.id}
  `);
  await audit(tx,p,'RecurringRule',String(existing.id),AuditAction.UPDATE,existing,{...existing,amount:cost,category_id:effectiveCategory,status:'ACTIVE'},now);
}
async function completeRecurringRule(tx:any,p:AuthenticatedPrincipal,trackerId:string,reason:string):Promise<void>{
  const raw=tx.getRawTransaction?.(); if(!raw)throw new Error('Tracker recurring persistence unavailable');
  const existing=await ruleForTracker(raw,p.companyId,trackerId,true); if(!existing||existing.status==='COMPLETED')return;
  if(existing.status==='CANCELLED')return; const now=new Date().toISOString();
  await raw.execute(sql`UPDATE recurring_rules SET status='COMPLETED',active=false,updated_at=${now} WHERE company_id=${p.companyId} AND id=${existing.id}`);
  await audit(tx,p,'RecurringRule',String(existing.id),AuditAction.UPDATE,existing,{...existing,status:'COMPLETED',reason},now);
}
async function removeInside(tx:any,p:AuthenticatedPrincipal,tracker:Tracker,reason:string):Promise<Tracker>{
  if(tracker.status==='REMOVED')return tracker; const now=new Date().toISOString();
  const updated=await tx.getTrackerRepo().updateForCompany(p.companyId,tracker.id,{...tracker,status:'REMOVED',notes:`${tracker.notes||''}${tracker.notes?' ':''}[Removido: ${reason}]`,updatedAt:now});
  if(!updated)throw new TrackerNotFoundError('Rastreador não encontrado'); await completeRecurringRule(tx,p,tracker.id,reason); await audit(tx,p,'Tracker',tracker.id,AuditAction.UPDATE,tracker,updated,now); return updated;
}

export class TrackerAuthorityService {
  static list(companyId:string,vehicleId?:string):Promise<Tracker[]>{ return UnitOfWork.run(companyId,tx=>tx.getTrackerRepo().findAllByCompany(companyId,vehicleId)); }
  static get(companyId:string,id:string):Promise<Tracker|null>{ return UnitOfWork.run(companyId,tx=>tx.getTrackerRepo().findByIdForCompany(companyId,id)); }
  static listExpenseCategories(companyId:string):Promise<TrackerExpenseCategory[]>{ return UnitOfWork.run(companyId,async tx=>{
    const raw=tx.getRawTransaction?.(); if(!raw)throw new Error('Tracker category persistence unavailable');
    return rows(await raw.execute(sql`SELECT id,name,type FROM financial_categories WHERE company_id=${companyId} AND active=true AND type IN ('EXPENSE','BOTH') ORDER BY name,id`)).map(r=>({id:String(r.id),name:String(r.name||''),type:String(r.type)}));
  }); }

  static create(p:AuthenticatedPrincipal,input:CreateTrackerInput):Promise<Tracker>{ return UnitOfWork.run(p.companyId,async tx=>{
    const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Tracker persistence unavailable');
    const vehicleId=reqText(input.vehicleId,'vehicleId',160); const vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(p.companyId,vehicleId);
    if(!vehicle||vehicle.isArchived)throw new TrackerNotFoundError('Veículo não encontrado');
    if([VehicleStatus.SOLD,VehicleStatus.ARCHIVED].includes(vehicle.status))throw new TrackerConflictError('Veículo não está elegível para rastreador');
    const normalizedImei=imei(input.imei),model=reqText(input.equipmentModel,'equipmentModel',200),cost=money(input.monthlyCost),installationDate=isoDate(input.installationDate),supplierId=optText(input.supplierId,160);
    await validSupplier(tx,p.companyId,supplierId);
    let sourceAttachment:any;
    if(input.sourceAttachmentId){
      sourceAttachment=rows(await raw.execute(sql`SELECT * FROM file_attachments WHERE company_id=${p.companyId} AND id=${input.sourceAttachmentId} FOR UPDATE`))[0];
      if(!sourceAttachment||sourceAttachment.is_archived||String(sourceAttachment.content_state)!=='AVAILABLE'||String(sourceAttachment.entity_type)!=='Vehicle'||String(sourceAttachment.entity_id)!==vehicleId||String(sourceAttachment.document_type||'').toUpperCase()!=='TRACKER_EVIDENCE'){
        throw new TrackerConflictError('Documento de rastreador inválido para este veículo');
      }
    }
    const duplicate=await tx.getTrackerRepo().findByImei(p.companyId,normalizedImei);
    if(duplicate){
      const same=duplicate.vehicleId===vehicleId&&duplicate.status==='ACTIVE'&&duplicate.equipmentModel===model&&Number(duplicate.monthlyCost||0)===cost;
      if(same)return duplicate; throw new TrackerConflictError('IMEI já cadastrado');
    }
    const active=await tx.getTrackerRepo().findActiveByVehicle(p.companyId,vehicleId,undefined,true);
    if(active)await removeInside(tx,p,active,'Substituído por novo rastreador');
    const now=new Date().toISOString(); const item:Tracker={
      id:randomUUID(),companyId:p.companyId,vehicleId,serialNumber:optText(input.serialNumber,120),equipmentModel:model,imei:normalizedImei,
      chipCarrier:optText(input.chipCarrier,120),chipNumber:optText(input.chipNumber,120),monthlyCost:cost,installationDate,status:'ACTIVE',supplierId,
      notes:optText(input.notes,1000),createdBy:p.userId,createdAt:now,updatedAt:now,
    };
    const created=await tx.getTrackerRepo().create(item); await audit(tx,p,'Tracker',created.id,AuditAction.CREATE,undefined,created,now);
    if(sourceAttachment){
      const relinked=await raw.execute(sql`UPDATE file_attachments SET entity_name='Tracker',entity_type='Tracker',entity_id=${created.id} WHERE company_id=${p.companyId} AND id=${input.sourceAttachmentId} AND entity_type='Vehicle' AND entity_id=${vehicleId} AND is_archived=false RETURNING id`);
      if(rows(relinked).length!==1)throw new TrackerConflictError('Falha ao vincular documento original ao rastreador');
      await audit(tx,p,'FileAttachment',input.sourceAttachmentId!,AuditAction.UPDATE,{entityType:'Vehicle',entityId:vehicleId},{event:'PROMOTE_TRACKER_DOCUMENT',entityType:'Tracker',entityId:created.id},now);
    }
    if(afterTrackerCreatedForTests)await afterTrackerCreatedForTests();
    await syncRecurringRule(tx,p,created,input.categoryId); return created;
  }); }

  static update(p:AuthenticatedPrincipal,id:string,input:UpdateTrackerInput):Promise<Tracker>{ return UnitOfWork.run(p.companyId,async tx=>{
    const repo=tx.getTrackerRepo(),before=await repo.findByIdForCompanyWithLock(p.companyId,id); if(!before)throw new TrackerNotFoundError('Rastreador não encontrado');
    if(before.status==='REMOVED')throw new TrackerConflictError('Rastreador removido não pode ser alterado');
    const nextImei=input.imei===undefined?before.imei:imei(input.imei); if(nextImei&&nextImei!==before.imei){const other=await repo.findByImei(p.companyId,nextImei);if(other&&other.id!==id)throw new TrackerConflictError('IMEI já cadastrado');}
    const supplierId=input.supplierId===undefined?before.supplierId:input.supplierId===null?undefined:optText(input.supplierId,160); await validSupplier(tx,p.companyId,supplierId);
    const now=new Date().toISOString(); const updatedCandidate:Tracker={...before,
      equipmentModel:input.equipmentModel===undefined?before.equipmentModel:reqText(input.equipmentModel,'equipmentModel',200),imei:nextImei,
      serialNumber:input.serialNumber===undefined?before.serialNumber:input.serialNumber===null?undefined:optText(input.serialNumber,120),
      chipCarrier:input.chipCarrier===undefined?before.chipCarrier:input.chipCarrier===null?undefined:optText(input.chipCarrier,120),
      chipNumber:input.chipNumber===undefined?before.chipNumber:input.chipNumber===null?undefined:optText(input.chipNumber,120),
      monthlyCost:input.monthlyCost===undefined?before.monthlyCost:money(input.monthlyCost),
      installationDate:input.installationDate===undefined?before.installationDate:isoDate(input.installationDate),supplierId,
      notes:input.notes===undefined?before.notes:input.notes===null?undefined:optText(input.notes,1000),updatedAt:now};
    const updated=await repo.updateForCompany(p.companyId,id,updatedCandidate); if(!updated)throw new TrackerNotFoundError('Rastreador não encontrado');
    await syncRecurringRule(tx,p,updated,input.categoryId); await audit(tx,p,'Tracker',id,AuditAction.UPDATE,before,updated,now); return updated;
  }); }

  static remove(p:AuthenticatedPrincipal,id:string,reason:string):Promise<Tracker>{ return UnitOfWork.run(p.companyId,async tx=>{
    const tracker=await tx.getTrackerRepo().findByIdForCompanyWithLock(p.companyId,id); if(!tracker)throw new TrackerNotFoundError('Rastreador não encontrado'); return removeInside(tx,p,tracker,reqText(reason,'reason',500));
  }); }
}
