import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { recordVehicleKm, VehicleKmError } from './vehicleKmAuthority';
import { PayableService } from '../domain/finance/PayableService';
import { roundCurrency } from '../shared/utils/currency';
import { AuditAction, ContractStatus, OriginType, VehicleStatus } from '../types/enums';
import type { Part, Supplier, WorkOrder, WorkOrderFinancialComponent, WorkOrderLaborItem, WorkOrderPartItem, WorkOrderServiceItem } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

export class MaintenanceValidationError extends Error {}
export class MaintenanceConflictError extends Error {}
export class MaintenanceNotFoundError extends Error {}

export interface CreateWorkOrderInput {
  number:string; vehicleId:string; supplierId?:string; serviceDate?:string; entryKm:number; description:string; diagnosis?:string; notes?:string; sourceAttachmentId?:string;
  parts?:Array<{partId?:string;description?:string;quantity:number;unitCost?:number}>;
  services?:Array<{serviceId?:string;description:string;quantity:number;unitCost:number}>;
  laborItems?:Array<{description:string;hours:number;hourlyRate:number}>; discount?:number;
  financialComponents?:Array<{kind:'PARTS'|'SERVICES'|'LABOR';supplierId?:string;categoryId:string;paymentMethodId:string;paymentCondition:'CASH'|'INSTALLMENTS';installmentsCount:number;firstDueDate:string;discountAmount?:number;hasInvoice:boolean;invoiceNumber?:string}>;
}
export interface CompleteWorkOrderInput { exitKm:number; categoryId?:string; dueDate?:string; installmentsCount?:number; preventivePlanIds?:string[]; preventiveExecutionReasons?:Record<string,string>; }
export interface CreateSupplierInput { name:string; tradeName?:string; document:string; phone?:string; email?:string; address?:string; category:string; notes?:string; }
export interface UpdateSupplierInput { name?:string; tradeName?:string|null; document?:string; phone?:string|null; email?:string|null; address?:string|null; category?:string; status?:Supplier['status']; notes?:string|null; }
export interface CreatePartInput { code:string; name:string; description?:string; manufacturer?:string; category:string; unit:string; currentCost:number; minimumStock:number; currentStock:number; }
export interface UpdatePartInput { code?:string; name?:string; description?:string|null; manufacturer?:string|null; category?:string; unit?:string; currentCost?:number; minimumStock?:number; currentStock?:number; status?:Part['status']; }

let afterPayableCreatedForTests:(()=>void|Promise<void>)|undefined;
export function setMaintenanceTestHooksForTests(hooks:{afterPayableCreated?:()=>void|Promise<void>}):void {
  if(process.env.NODE_ENV!=='test') throw new Error('Maintenance test hooks are available only in NODE_ENV=test');
  afterPayableCreatedForTests=hooks.afterPayableCreated;
}
const rows=(r:any):any[]=>Array.isArray(r?.rows)?r.rows:[];
function reqText(v:unknown,field:string,max=500):string { const s=typeof v==='string'?v.trim():''; if(!s||s.length>max) throw new MaintenanceValidationError(`Invalid ${field}`); return s; }
function optText(v:unknown,max=1000):string|undefined { if(v===undefined||v===null||v==='')return undefined; const s=String(v).trim(); if(!s||s.length>max) throw new MaintenanceValidationError('Invalid optional text'); return s; }
function nn(v:unknown,field:string):number { const n=Number(v); if(!Number.isFinite(n)||n<0) throw new MaintenanceValidationError(`Invalid ${field}`); return n; }
function pos(v:unknown,field:string):number { const n=Number(v); if(!Number.isFinite(n)||n<=0) throw new MaintenanceValidationError(`Invalid ${field}`); return n; }
function doc(v:string):string { const s=v.trim().toUpperCase().replace(/[^A-Z0-9]/g,''); if(!s||s.length>32) throw new MaintenanceValidationError('Invalid supplier document'); return s; }
function code(v:string):string { const s=v.trim().toUpperCase(); if(!s||s.length>80) throw new MaintenanceValidationError('Invalid part code'); return s; }
function osNumber(v:string):string { const s=v.trim().toUpperCase(); if(!s||s.length>80) throw new MaintenanceValidationError('Invalid work order number'); return s; }
function isoDate(v:string):void { if(!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new MaintenanceValidationError('Invalid due date'); const d=new Date(`${v}T00:00:00Z`); if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v) throw new MaintenanceValidationError('Invalid due date'); }

async function expenseCategory(tx:any,companyId:string,categoryId:string):Promise<void>{
  const raw=tx.getRawTransaction?.(); if(!raw) throw new Error('Maintenance persistence unavailable');
  const r=rows(await raw.execute(sql`SELECT id,type FROM financial_categories WHERE company_id=${companyId} AND id=${categoryId} AND active=true LIMIT 1`))[0];
  if(!r) throw new MaintenanceNotFoundError('Categoria financeira não encontrada');
  if(!['EXPENSE','BOTH'].includes(String(r.type||'').toUpperCase())) throw new MaintenanceConflictError('Categoria financeira incompatível com manutenção');
}

async function activePaymentMethod(tx:any,companyId:string,paymentMethodId:string):Promise<{name:string;type:string}>{
  const raw=tx.getRawTransaction?.(); if(!raw) throw new Error('Maintenance persistence unavailable');
  const r=rows(await raw.execute(sql`SELECT id,name,type FROM payment_methods WHERE company_id=${companyId} AND id=${paymentMethodId} AND active=true LIMIT 1`))[0];
  if(!r) throw new MaintenanceNotFoundError('Forma de pagamento não encontrada ou inativa');
  return {name:String(r.name||r.type||paymentMethodId),type:String(r.type||'')};
}
async function activeSupplier(tx:any,companyId:string,supplierId:string):Promise<void>{
  const s=await tx.getSupplierRepo().findByIdForCompany(companyId,supplierId);
  if(!s||s.status!=='ACTIVE')throw new MaintenanceNotFoundError('Fornecedor não encontrado');
}
async function targetVehicleStatus(tx:any,companyId:string,vehicle:any,workOrderId:string):Promise<VehicleStatus>{
  // An inspection block requires an explicit release, even after maintenance.
  if(vehicle.status===VehicleStatus.BLOCKED) return VehicleStatus.BLOCKED;
  if(await tx.getWorkOrderRepo().hasBlockingWorkOrder(companyId,vehicle.id,workOrderId)) return VehicleStatus.MAINTENANCE;
  if(vehicle.currentContractId){ const c=await tx.getContractRepo().findByIdForCompany(companyId,vehicle.currentContractId); if(c&&!c.isArchived&&c.status===ContractStatus.ACTIVE)return VehicleStatus.RENTED; }
  return VehicleStatus.AVAILABLE;
}
function totals(wo:WorkOrder){
  const subtotalParts=roundCurrency(wo.parts.reduce((s,i)=>s+roundCurrency(i.quantity*i.unitCost),0));
  const subtotalServices=roundCurrency(wo.services.reduce((s,i)=>s+roundCurrency(i.quantity*i.unitCost),0));
  const subtotalLabor=roundCurrency(wo.laborItems.reduce((s,i)=>s+roundCurrency(i.hours*i.hourlyRate),0));
  return {subtotalParts,subtotalServices,subtotalLabor,total:roundCurrency(Math.max(0,subtotalParts+subtotalServices+subtotalLabor-wo.discount))};
}
async function audit(tx:any,p:AuthenticatedPrincipal,entityName:string,entityId:string,action:AuditAction,previousState:any,newState:any,now:string){
  await tx.getAuditLogRepo().create({id:randomUUID(),companyId:p.companyId,entityName,entityId,action,previousState:previousState===undefined?undefined:JSON.stringify(previousState),newState:newState===undefined?undefined:JSON.stringify(newState),userId:p.userId,userName:p.name,timestamp:now});
}

export class MaintenanceAuthorityService {
  static listWorkOrders(companyId:string,vehicleId?:string):Promise<WorkOrder[]>{ return UnitOfWork.run(companyId,tx=>tx.getWorkOrderRepo().findAllByCompany(companyId,vehicleId)); }
  static getWorkOrder(companyId:string,id:string):Promise<WorkOrder|null>{ return UnitOfWork.run(companyId,tx=>tx.getWorkOrderRepo().findByIdForCompany(companyId,id)); }
  static listSuppliers(companyId:string):Promise<Supplier[]>{ return UnitOfWork.run(companyId,tx=>tx.getSupplierRepo().findAllByCompany(companyId)); }
  static listParts(companyId:string):Promise<Part[]>{ return UnitOfWork.run(companyId,tx=>tx.getPartRepo().findAllByCompany(companyId)); }

  static createSupplier(p:AuthenticatedPrincipal,input:CreateSupplierInput):Promise<Supplier>{ return UnitOfWork.run(p.companyId,async tx=>{
    const document=doc(reqText(input.document,'document',64)); if(await tx.getSupplierRepo().findByDocument(p.companyId,document)) throw new MaintenanceConflictError('Fornecedor já cadastrado');
    const now=new Date().toISOString(); const item:Supplier={id:randomUUID(),companyId:p.companyId,name:reqText(input.name,'name',200),tradeName:optText(input.tradeName,200),document,phone:optText(input.phone,80)||'',email:optText(input.email,200),address:optText(input.address,500),category:reqText(input.category,'category',120),status:'ACTIVE',notes:optText(input.notes),createdAt:now,updatedAt:now};
    const created=await tx.getSupplierRepo().create(item); await audit(tx,p,'Supplier',created.id,AuditAction.CREATE,undefined,created,now); return created;
  }); }
  static updateSupplier(p:AuthenticatedPrincipal,id:string,input:UpdateSupplierInput):Promise<Supplier>{ return UnitOfWork.run(p.companyId,async tx=>{
    const repo=tx.getSupplierRepo(); const before=await repo.findByIdForCompanyWithLock(p.companyId,id); if(!before) throw new MaintenanceNotFoundError('Fornecedor não encontrado');
    const document=input.document===undefined?before.document:doc(reqText(input.document,'document',64)); if(document!==before.document){const d=await repo.findByDocument(p.companyId,document);if(d&&d.id!==id)throw new MaintenanceConflictError('Fornecedor já cadastrado');}
    const now=new Date().toISOString(); const item:Supplier={...before,name:input.name===undefined?before.name:reqText(input.name,'name',200),tradeName:input.tradeName===undefined?before.tradeName:input.tradeName===null?undefined:optText(input.tradeName,200),document,phone:input.phone===undefined?before.phone:input.phone===null?'':optText(input.phone,80)||'',email:input.email===undefined?before.email:input.email===null?undefined:optText(input.email,200),address:input.address===undefined?before.address:input.address===null?undefined:optText(input.address,500),category:input.category===undefined?before.category:reqText(input.category,'category',120),status:input.status??before.status,notes:input.notes===undefined?before.notes:input.notes===null?undefined:optText(input.notes),updatedAt:now};
    const updated=await repo.updateForCompany(p.companyId,id,item); if(!updated)throw new MaintenanceNotFoundError('Fornecedor não encontrado'); await audit(tx,p,'Supplier',id,AuditAction.UPDATE,before,updated,now); return updated;
  }); }

  static createPart(p:AuthenticatedPrincipal,input:CreatePartInput):Promise<Part>{ return UnitOfWork.run(p.companyId,async tx=>{
    const c=code(reqText(input.code,'code',80)); if(await tx.getPartRepo().findByCode(p.companyId,c))throw new MaintenanceConflictError('Código de peça já cadastrado'); const now=new Date().toISOString();
    const item:Part={id:randomUUID(),companyId:p.companyId,code:c,name:reqText(input.name,'name',200),description:optText(input.description,500),manufacturer:optText(input.manufacturer,200),category:reqText(input.category,'category',120),unit:reqText(input.unit,'unit',30).toUpperCase(),currentCost:roundCurrency(nn(input.currentCost,'currentCost')),minimumStock:nn(input.minimumStock,'minimumStock'),currentStock:nn(input.currentStock,'currentStock'),status:'ACTIVE',createdAt:now,updatedAt:now};
    const created=await tx.getPartRepo().create(item); await audit(tx,p,'Part',created.id,AuditAction.CREATE,undefined,created,now); return created;
  }); }
  static updatePart(p:AuthenticatedPrincipal,id:string,input:UpdatePartInput):Promise<Part>{ return UnitOfWork.run(p.companyId,async tx=>{
    const repo=tx.getPartRepo();const before=await repo.findByIdForCompanyWithLock(p.companyId,id);if(!before)throw new MaintenanceNotFoundError('Peça não encontrada');const c=input.code===undefined?before.code:code(reqText(input.code,'code',80));if(c!==before.code){const d=await repo.findByCode(p.companyId,c);if(d&&d.id!==id)throw new MaintenanceConflictError('Código de peça já cadastrado');}
    const now=new Date().toISOString();const item:Part={...before,code:c,name:input.name===undefined?before.name:reqText(input.name,'name',200),description:input.description===undefined?before.description:input.description===null?undefined:optText(input.description,500),manufacturer:input.manufacturer===undefined?before.manufacturer:input.manufacturer===null?undefined:optText(input.manufacturer,200),category:input.category===undefined?before.category:reqText(input.category,'category',120),unit:input.unit===undefined?before.unit:reqText(input.unit,'unit',30).toUpperCase(),currentCost:input.currentCost===undefined?before.currentCost:roundCurrency(nn(input.currentCost,'currentCost')),minimumStock:input.minimumStock===undefined?before.minimumStock:nn(input.minimumStock,'minimumStock'),currentStock:input.currentStock===undefined?before.currentStock:nn(input.currentStock,'currentStock'),status:input.status??before.status,updatedAt:now};
    const updated=await repo.updateForCompany(p.companyId,id,item);if(!updated)throw new MaintenanceNotFoundError('Peça não encontrada');await audit(tx,p,'Part',id,AuditAction.UPDATE,before,updated,now);return updated;
  }); }

  static createWorkOrder(p:AuthenticatedPrincipal,input:CreateWorkOrderInput):Promise<WorkOrder>{ return UnitOfWork.run(p.companyId,async tx=>{
    const rawTx=tx.getRawTransaction?.();if(!rawTx)throw new Error('Maintenance persistence unavailable');
    const number=osNumber(reqText(input.number,'number',80));if(await tx.getWorkOrderRepo().findByNumber(p.companyId,number))throw new MaintenanceConflictError('Número de OS já cadastrado');
    const vehicle=await tx.getVehicleRepo().findByIdForCompany(p.companyId,reqText(input.vehicleId,'vehicleId',120));if(!vehicle||vehicle.isArchived)throw new MaintenanceNotFoundError('Veículo não encontrado');if([VehicleStatus.SOLD,VehicleStatus.INACTIVE,VehicleStatus.ARCHIVED].includes(vehicle.status))throw new MaintenanceConflictError('Veículo não está elegível para manutenção');
    const serviceDate=input.serviceDate?reqText(input.serviceDate,'serviceDate',10):new Date().toISOString().slice(0,10);isoDate(serviceDate);const entryKm=nn(input.entryKm,'entryKm');if(!Number.isInteger(entryKm)||entryKm<vehicle.currentKm)throw new MaintenanceValidationError('KM de entrada não pode regredir');const supplierId=optText(input.supplierId,120);if(supplierId){const s=await tx.getSupplierRepo().findByIdForCompany(p.companyId,supplierId);if(!s||s.status!=='ACTIVE')throw new MaintenanceNotFoundError('Fornecedor não encontrado');}
    let sourceAttachment:any;
    if(input.sourceAttachmentId){
      sourceAttachment=rows(await rawTx.execute(sql`SELECT * FROM file_attachments WHERE company_id=${p.companyId} AND id=${input.sourceAttachmentId} FOR UPDATE`))[0];
      if(!sourceAttachment||sourceAttachment.is_archived||String(sourceAttachment.content_state)!=='AVAILABLE'||String(sourceAttachment.entity_type)!=='Vehicle'||String(sourceAttachment.entity_id)!==vehicle.id||String(sourceAttachment.document_type||'').toUpperCase()!=='MAINTENANCE_EVIDENCE'){
        throw new MaintenanceConflictError('Documento de manutenção inválido para este veículo');
      }
    }
    const parts:WorkOrderPartItem[]=[];for(const raw of input.parts||[]){const quantity=pos(raw.quantity,'part quantity');if(raw.partId){const c=await tx.getPartRepo().findByIdForCompany(p.companyId,raw.partId);if(!c||c.status!=='ACTIVE')throw new MaintenanceNotFoundError('Peça não encontrada');parts.push({id:randomUUID(),partId:c.id,description:c.name,quantity,unitCost:roundCurrency(c.currentCost),totalCost:roundCurrency(quantity*c.currentCost)});}else{const unitCost=roundCurrency(nn(raw.unitCost,'part unitCost'));parts.push({id:randomUUID(),description:reqText(raw.description,'part description',300),quantity,unitCost,totalCost:roundCurrency(quantity*unitCost)});}}
    const services:WorkOrderServiceItem[]=(input.services||[]).map(raw=>{const quantity=pos(raw.quantity,'service quantity'),unitCost=roundCurrency(nn(raw.unitCost,'service unitCost'));return{id:randomUUID(),serviceId:optText(raw.serviceId,120),description:reqText(raw.description,'service description',300),quantity,unitCost,totalCost:roundCurrency(quantity*unitCost)};});
    const laborItems:WorkOrderLaborItem[]=(input.laborItems||[]).map(raw=>{const hours=pos(raw.hours,'labor hours'),hourlyRate=roundCurrency(nn(raw.hourlyRate,'hourlyRate'));return{id:randomUUID(),description:reqText(raw.description,'labor description',300),hours,hourlyRate,totalCost:roundCurrency(hours*hourlyRate)};});
    const subtotalParts=roundCurrency(parts.reduce((s,i)=>s+i.totalCost,0)),subtotalServices=roundCurrency(services.reduce((s,i)=>s+i.totalCost,0)),subtotalLabor=roundCurrency(laborItems.reduce((s,i)=>s+i.totalCost,0)),gross=roundCurrency(subtotalParts+subtotalServices+subtotalLabor);const now=new Date().toISOString();
    const financialComponents:WorkOrderFinancialComponent[]=[];
    const paymentLabels=new Map<string,string>();
    if(input.financialComponents!==undefined){
      if(!Array.isArray(input.financialComponents)||input.financialComponents.length>3)throw new MaintenanceValidationError('Configuração financeira inválida');
      const seen=new Set<string>();
      for(const raw of input.financialComponents){
        const kind=raw.kind;if(kind!=='PARTS'&&kind!=='SERVICES'&&kind!=='LABOR')throw new MaintenanceValidationError('Componente financeiro inválido');if(seen.has(kind))throw new MaintenanceValidationError('Componente financeiro duplicado');seen.add(kind);
        const grossAmount=kind==='PARTS'?subtotalParts:kind==='SERVICES'?subtotalServices:subtotalLabor;if(grossAmount<=0)throw new MaintenanceValidationError('Componente financeiro sem valor');
        const categoryId=reqText(raw.categoryId,'categoryId',120);await expenseCategory(tx,p.companyId,categoryId);
        const paymentMethodId=reqText(raw.paymentMethodId,'paymentMethodId',120);const paymentMethod=await activePaymentMethod(tx,p.companyId,paymentMethodId);paymentLabels.set(paymentMethodId,paymentMethod.name);
        const componentSupplierId=optText(raw.supplierId,120)||supplierId;if(!componentSupplierId)throw new MaintenanceValidationError('Fornecedor do pagamento é obrigatório');await activeSupplier(tx,p.companyId,componentSupplierId);
        const paymentCondition=raw.paymentCondition;if(paymentCondition!=='CASH'&&paymentCondition!=='INSTALLMENTS')throw new MaintenanceValidationError('Condição de pagamento inválida');
        const installmentsCount=Number(raw.installmentsCount);if(!Number.isInteger(installmentsCount)||installmentsCount<1||installmentsCount>60)throw new MaintenanceValidationError('Quantidade de parcelas inválida');if(paymentCondition==='CASH'&&installmentsCount!==1)throw new MaintenanceValidationError('Pagamento à vista deve ter uma parcela');if(paymentCondition==='INSTALLMENTS'&&installmentsCount<2)throw new MaintenanceValidationError('Pagamento parcelado exige ao menos duas parcelas');
        const firstDueDate=reqText(raw.firstDueDate,'firstDueDate',10);isoDate(firstDueDate);const discountAmount=roundCurrency(nn(raw.discountAmount??0,'discountAmount'));if(discountAmount>grossAmount)throw new MaintenanceValidationError('Desconto excede o valor do componente');
        const hasInvoice=Boolean(raw.hasInvoice),invoiceNumber=hasInvoice?optText(raw.invoiceNumber,120):undefined;
        financialComponents.push({id:randomUUID(),kind,supplierId:componentSupplierId,categoryId,paymentMethodId,paymentCondition,installmentsCount,firstDueDate,grossAmount,discountAmount,netAmount:roundCurrency(grossAmount-discountAmount),hasInvoice,invoiceNumber,createdAt:now,updatedAt:now});
      }
      if(subtotalParts>0&&!seen.has('PARTS'))throw new MaintenanceValidationError('Informe o pagamento das peças');
      if(subtotalServices>0&&!seen.has('SERVICES'))throw new MaintenanceValidationError('Informe o pagamento dos serviços');
      if(subtotalLabor>0&&!seen.has('LABOR'))throw new MaintenanceValidationError('Informe o pagamento da mão de obra');
    }
    const discount=financialComponents.length>0?roundCurrency(financialComponents.reduce((sum,item)=>sum+item.discountAmount,0)):roundCurrency(nn(input.discount??0,'discount'));if(discount>gross)throw new MaintenanceValidationError('Desconto excede o total da OS');
    const item:WorkOrder={id:randomUUID(),companyId:p.companyId,number,vehicleId:vehicle.id,supplierId,status:'OPEN',openedAt:now,serviceDate,entryKm,description:reqText(input.description,'description',1000),diagnosis:optText(input.diagnosis,1000),notes:optText(input.notes,2000),parts,services,laborItems,financialComponents,subtotalParts,subtotalServices,subtotalLabor,discount,total:roundCurrency(gross-discount),createdBy:p.userId,createdAt:now,updatedAt:now};
    let created=await tx.getWorkOrderRepo().create(item);
    const payableIds:string[]=[];
    for(const component of financialComponents){
      if(component.netAmount<=0)continue;
      const componentLabel=component.kind==='PARTS'?'Peças':component.kind==='SERVICES'?'Serviços':'Mão de obra';
      const methodLabel=paymentLabels.get(component.paymentMethodId)||component.paymentMethodId;
      const conditionLabel=component.paymentCondition==='CASH'?'À vista':`Parcelado ${component.installmentsCount}x`;
      const createdPayables=await PayableService.create({companyId:p.companyId,originType:OriginType.MAINTENANCE,originId:`${created.id}:${component.kind}`,vehicleId:created.vehicleId,supplierId:component.supplierId,categoryId:component.categoryId,description:`Manutenção OS #${created.number} - ${componentLabel} - ${methodLabel} - ${conditionLabel}`,totalAmount:component.netAmount,dueDate:component.firstDueDate,competenceDate:serviceDate,competenceMode:'SINGLE_EVENT',installmentsCount:component.installmentsCount,userId:p.userId,userName:p.name},tx);
      payableIds.push(...createdPayables.map((item:any)=>item.id));
    }
    if(payableIds.length>0){const linked=await tx.getWorkOrderRepo().updateLifecycle(p.companyId,created.id,{status:'OPEN',accountPayableId:payableIds[0],updatedAt:now});if(!linked)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');created=linked;}
    await audit(tx,p,'WorkOrder',created.id,AuditAction.CREATE,undefined,{...created,payableIds},now);
    if(sourceAttachment){
      const relinked=await rawTx.execute(sql`UPDATE file_attachments SET entity_name='MaintenanceWorkOrder',entity_type='MaintenanceWorkOrder',entity_id=${created.id} WHERE company_id=${p.companyId} AND id=${input.sourceAttachmentId} AND entity_type='Vehicle' AND entity_id=${vehicle.id} AND is_archived=false RETURNING id`);
      if(rows(relinked).length!==1)throw new MaintenanceConflictError('Falha ao vincular documento original à ordem de serviço');
      await audit(tx,p,'FileAttachment',input.sourceAttachmentId!,AuditAction.UPDATE,{entityType:'Vehicle',entityId:vehicle.id},{event:'PROMOTE_MAINTENANCE_EVIDENCE',entityType:'MaintenanceWorkOrder',entityId:created.id},now);
    }
    return created;
  }); }

  static startWorkOrder(p:AuthenticatedPrincipal,id:string):Promise<WorkOrder>{ return UnitOfWork.run(p.companyId,async tx=>{
    const repo=tx.getWorkOrderRepo(),before=await repo.findByIdForCompanyWithLock(p.companyId,id);if(!before)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(before.status==='IN_PROGRESS')return before;if(!['OPEN','WAITING_APPROVAL','WAITING_PARTS'].includes(before.status))throw new MaintenanceConflictError(`Não é possível iniciar OS com status ${before.status}`);
    const vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(p.companyId,before.vehicleId);if(!vehicle||vehicle.isArchived)throw new MaintenanceNotFoundError('Veículo não encontrado');if([VehicleStatus.SOLD,VehicleStatus.INACTIVE,VehicleStatus.ARCHIVED].includes(vehicle.status))throw new MaintenanceConflictError('Veículo não está elegível para manutenção');const now=new Date().toISOString();const updated=await repo.updateLifecycle(p.companyId,id,{status:'IN_PROGRESS',startedAt:now,updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(vehicle.status!==VehicleStatus.BLOCKED&&!await tx.getVehicleRepo().updateForCompany(p.companyId,vehicle.id,{status:VehicleStatus.MAINTENANCE,updatedAt:now}))throw new MaintenanceNotFoundError('Veículo não encontrado');await audit(tx,p,'WorkOrder',id,AuditAction.UPDATE,before,updated,now);return updated;
  }); }

  static completeWorkOrder(p:AuthenticatedPrincipal,id:string,input:CompleteWorkOrderInput):Promise<WorkOrder>{ return UnitOfWork.run(p.companyId,async tx=>{
    const repo=tx.getWorkOrderRepo(),before=await repo.findByIdForCompanyWithLock(p.companyId,id);if(!before)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(before.status==='COMPLETED')return before;if(before.status==='CANCELLED')throw new MaintenanceConflictError('Ordem de serviço cancelada');if(before.status!=='IN_PROGRESS')throw new MaintenanceConflictError('Ordem de serviço deve estar em andamento para conclusão');
    const vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(p.companyId,before.vehicleId);if(!vehicle||vehicle.isArchived)throw new MaintenanceNotFoundError('Veículo não encontrado');const exitKm=nn(input.exitKm,'exitKm');if(!Number.isInteger(exitKm)||exitKm<before.entryKm)throw new MaintenanceValidationError('KM de saída regressivo');

    const explicitPreventiveSelection=input.preventivePlanIds!==undefined;
    const preventivePlanIds=explicitPreventiveSelection
      ?Array.from(new Set((input.preventivePlanIds||[]).map(value=>reqText(value,'preventivePlanId',200))))
      :[];
    if(preventivePlanIds.length>100)throw new MaintenanceValidationError('Muitos itens preventivos selecionados');
    const preventiveExecutionReasons=input.preventiveExecutionReasons||{};
    if(!preventiveExecutionReasons||typeof preventiveExecutionReasons!=='object'||Array.isArray(preventiveExecutionReasons))throw new MaintenanceValidationError('Justificativas preventivas inválidas');
    for(const planId of Object.keys(preventiveExecutionReasons))if(!preventivePlanIds.includes(planId))throw new MaintenanceValidationError('Justificativa informada para item preventivo não selecionado');
    const raw=tx.getRawTransaction?.();if(explicitPreventiveSelection&&!raw)throw new Error('Maintenance persistence unavailable');
    const selectedPlans:any[]=[];
    if(explicitPreventiveSelection){
      for(const planId of preventivePlanIds){
        const plan=rows(await raw.execute(sql`SELECT id,vehicle_id,status,interval_km,interval_days,next_due_km,next_due_date,cycle_sequence,last_work_order_id FROM maintenance_plans WHERE company_id=${p.companyId} AND id=${planId} FOR UPDATE`))[0];
        if(!plan)throw new MaintenanceNotFoundError('Plano preventivo não encontrado');
        if(String(plan.vehicle_id)!==before.vehicleId)throw new MaintenanceConflictError('Plano preventivo pertence a outro veículo');
        if(String(plan.status)!=='ACTIVE')throw new MaintenanceConflictError('Somente planos preventivos ativos podem ser executados');
        selectedPlans.push(plan);
      }
    }

    const t=totals(before);if(t.subtotalParts!==roundCurrency(before.subtotalParts)||t.subtotalServices!==roundCurrency(before.subtotalServices)||t.subtotalLabor!==roundCurrency(before.subtotalLabor)||t.total!==roundCurrency(before.total))throw new MaintenanceConflictError('Totais persistidos da OS estão inconsistentes');
    let payables:any[]=[];
    if(!(before.financialComponents&&before.financialComponents.length>0)&&t.total>0){const dueDate=reqText(input.dueDate,'dueDate',10);isoDate(dueDate);const categoryId=reqText(input.categoryId,'categoryId',120);await expenseCategory(tx,p.companyId,categoryId);const installments=Number(input.installmentsCount??1);if(!Number.isInteger(installments)||installments<1||installments>60)throw new MaintenanceValidationError('Quantidade de parcelas inválida');payables=await PayableService.create({companyId:p.companyId,originType:OriginType.MAINTENANCE,originId:before.id,vehicleId:before.vehicleId,supplierId:before.supplierId,categoryId,description:`Manutenção OS #${before.number} - ${before.description}`,totalAmount:t.total,dueDate,competenceDate:before.serviceDate||new Date().toISOString().slice(0,10),competenceMode:'SINGLE_EVENT',installmentsCount:installments,userId:p.userId,userName:p.name},tx);await afterPayableCreatedForTests?.();}

    const now=new Date().toISOString(),completionDate=now.slice(0,10);
    try {
      await recordVehicleKm(tx,p.companyId,{vehicleId:vehicle.id,kmValue:exitKm,recordDate:completionDate,readingType:'MAINTENANCE',notes:`Conclusão OS #${before.number}`});
    } catch(error) {
      if(error instanceof VehicleKmError){
        if(error.kind==='NOT_FOUND')throw new MaintenanceNotFoundError(error.message);
        if(error.kind==='TERMINAL')throw new MaintenanceConflictError(error.message);
        throw new MaintenanceValidationError(error.message);
      }
      throw error;
    }
    const preventiveExecutions:Array<{planId:string;executionKind:'SCHEDULED'|'PREVENTIVA_ANTECIPADA';earlyReason?:string}>=[];
    if(explicitPreventiveSelection){
      await raw.execute(sql`UPDATE work_orders SET preventive_plan_selection_applied=true,updated_at=${now} WHERE company_id=${p.companyId} AND id=${id}`);
      for(const plan of selectedPlans){
        const dueKm=plan.next_due_km===null||plan.next_due_km===undefined?undefined:Number(plan.next_due_km);
        const dueDate=plan.next_due_date===null||plan.next_due_date===undefined?undefined:(plan.next_due_date instanceof Date?plan.next_due_date.toISOString().slice(0,10):String(plan.next_due_date).slice(0,10));
        const hasDue=dueKm!==undefined||dueDate!==undefined;
        const beforeKmDue=dueKm===undefined||exitKm<dueKm;
        const beforeDateDue=dueDate===undefined||completionDate<dueDate;
        const executionKind:'SCHEDULED'|'PREVENTIVA_ANTECIPADA'=hasDue&&beforeKmDue&&beforeDateDue?'PREVENTIVA_ANTECIPADA':'SCHEDULED';
        const earlyReason=executionKind==='PREVENTIVA_ANTECIPADA'?reqText(preventiveExecutionReasons[String(plan.id)],'preventiveExecutionReason',1000):undefined;
        const executionId=randomUUID();
        const inserted=rows(await raw.execute(sql`INSERT INTO maintenance_work_order_plan_executions(id,company_id,work_order_id,maintenance_plan_id,execution_kind,execution_km,execution_date,early_reason,created_by,created_at)
          VALUES(${executionId},${p.companyId},${id},${String(plan.id)},${executionKind},${exitKm},${completionDate},${earlyReason??null},${p.userId},${now})
          ON CONFLICT(company_id,work_order_id,maintenance_plan_id) DO NOTHING RETURNING id`))[0];
        if(!inserted)continue;
        const updatedPlan=rows(await raw.execute(sql`UPDATE maintenance_plans
          SET last_execution_km=${exitKm},
              last_execution_date=${completionDate},
              next_due_km=CASE WHEN interval_km IS NULL THEN NULL ELSE ${exitKm}+interval_km END,
              next_due_date=CASE WHEN interval_days IS NULL THEN NULL ELSE CAST(${completionDate} AS date)+interval_days END,
              last_work_order_id=${id},
              cycle_sequence=cycle_sequence+1,
              updated_at=${now}
          WHERE company_id=${p.companyId} AND id=${String(plan.id)} AND vehicle_id=${before.vehicleId} AND status='ACTIVE'
          RETURNING id,cycle_sequence,next_due_km,next_due_date,last_execution_km,last_execution_date,last_work_order_id`))[0];
        if(!updatedPlan)throw new MaintenanceConflictError('Falha ao avançar item preventivo');
        preventiveExecutions.push({planId:String(plan.id),executionKind,earlyReason});
        await audit(tx,p,'MaintenancePlan',String(plan.id),AuditAction.UPDATE,plan,{event:executionKind,workOrderId:id,executionKm:exitKm,executionDate:completionDate,earlyReason,cycleSequence:Number(updatedPlan.cycle_sequence),nextDueKm:updatedPlan.next_due_km===null?undefined:Number(updatedPlan.next_due_km),nextDueDate:updatedPlan.next_due_date===null?undefined:String(updatedPlan.next_due_date).slice(0,10)},now);
      }
    }

    const updated=await repo.updateLifecycle(p.companyId,id,{status:'COMPLETED',exitKm,completedAt:now,accountPayableId:payables[0]?.id,updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');const status=await targetVehicleStatus(tx,p.companyId,vehicle,id);if(!await tx.getVehicleRepo().updateForCompany(p.companyId,vehicle.id,{status,updatedAt:now}))throw new MaintenanceNotFoundError('Veículo não encontrado');
    await audit(tx,p,'WorkOrder',id,AuditAction.UPDATE,before,{...updated,vehicleStatus:status,payableIds:payables.map((x:any)=>x.id),preventiveSelectionApplied:explicitPreventiveSelection,preventiveExecutions},now);return updated;
  },{financialPeriodLock:'SHARED'}); }

  static cancelWorkOrder(p:AuthenticatedPrincipal,id:string,reason:string):Promise<WorkOrder>{ return UnitOfWork.run(p.companyId,async tx=>{
    const repo=tx.getWorkOrderRepo(),before=await repo.findByIdForCompanyWithLock(p.companyId,id);if(!before)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(before.status==='CANCELLED')return before;if(before.status==='COMPLETED')throw new MaintenanceConflictError('Não é possível cancelar uma OS concluída');const clean=reqText(reason,'reason',500),vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(p.companyId,before.vehicleId);if(!vehicle||vehicle.isArchived)throw new MaintenanceNotFoundError('Veículo não encontrado');const now=new Date().toISOString(),updated=await repo.updateLifecycle(p.companyId,id,{status:'CANCELLED',cancelledAt:now,notes:`${before.notes||''}\n[Cancelada: ${clean}]`.trim(),updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(vehicle.status===VehicleStatus.MAINTENANCE){const status=await targetVehicleStatus(tx,p.companyId,vehicle,id);if(!await tx.getVehicleRepo().updateForCompany(p.companyId,vehicle.id,{status,updatedAt:now}))throw new MaintenanceNotFoundError('Veículo não encontrado');}await audit(tx,p,'WorkOrder',id,AuditAction.CANCEL,before,updated,now);return updated;
  }); }
}
