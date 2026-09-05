import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { PayableService } from '../domain/finance/PayableService';
import { roundCurrency } from '../shared/utils/currency';
import { AuditAction, ContractStatus, OriginType, VehicleStatus } from '../types/enums';
import type { Part, Supplier, WorkOrder, WorkOrderLaborItem, WorkOrderPartItem, WorkOrderServiceItem } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

export class MaintenanceValidationError extends Error {}
export class MaintenanceConflictError extends Error {}
export class MaintenanceNotFoundError extends Error {}

export interface CreateWorkOrderInput {
  number:string; vehicleId:string; supplierId?:string; serviceDate:string; entryKm:number; description:string; diagnosis?:string; notes?:string;
  parts?:Array<{partId?:string;description?:string;quantity:number;unitCost?:number}>;
  services?:Array<{serviceId?:string;description:string;quantity:number;unitCost:number}>;
  laborItems?:Array<{description:string;hours:number;hourlyRate:number}>; discount?:number;
}
export interface CompleteWorkOrderInput { exitKm:number; categoryId:string; dueDate:string; installmentsCount?:number; }
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
async function targetVehicleStatus(tx:any,companyId:string,vehicle:any,workOrderId:string):Promise<VehicleStatus>{
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
    const number=osNumber(reqText(input.number,'number',80));if(await tx.getWorkOrderRepo().findByNumber(p.companyId,number))throw new MaintenanceConflictError('Número de OS já cadastrado');
    const vehicle=await tx.getVehicleRepo().findByIdForCompany(p.companyId,reqText(input.vehicleId,'vehicleId',120));if(!vehicle||vehicle.isArchived)throw new MaintenanceNotFoundError('Veículo não encontrado');if([VehicleStatus.SOLD,VehicleStatus.INACTIVE,VehicleStatus.ARCHIVED].includes(vehicle.status))throw new MaintenanceConflictError('Veículo não está elegível para manutenção');
    const serviceDate=reqText(input.serviceDate,'serviceDate',10);isoDate(serviceDate);const entryKm=nn(input.entryKm,'entryKm');if(!Number.isInteger(entryKm)||entryKm<vehicle.currentKm)throw new MaintenanceValidationError('KM de entrada não pode regredir');const supplierId=optText(input.supplierId,120);if(supplierId){const s=await tx.getSupplierRepo().findByIdForCompany(p.companyId,supplierId);if(!s||s.status!=='ACTIVE')throw new MaintenanceNotFoundError('Fornecedor não encontrado');}
    const parts:WorkOrderPartItem[]=[];for(const raw of input.parts||[]){const quantity=pos(raw.quantity,'part quantity');if(raw.partId){const c=await tx.getPartRepo().findByIdForCompany(p.companyId,raw.partId);if(!c||c.status!=='ACTIVE')throw new MaintenanceNotFoundError('Peça não encontrada');parts.push({id:randomUUID(),partId:c.id,description:c.name,quantity,unitCost:roundCurrency(c.currentCost),totalCost:roundCurrency(quantity*c.currentCost)});}else{const unitCost=roundCurrency(nn(raw.unitCost,'part unitCost'));parts.push({id:randomUUID(),description:reqText(raw.description,'part description',300),quantity,unitCost,totalCost:roundCurrency(quantity*unitCost)});}}
    const services:WorkOrderServiceItem[]=(input.services||[]).map(raw=>{const quantity=pos(raw.quantity,'service quantity'),unitCost=roundCurrency(nn(raw.unitCost,'service unitCost'));return{id:randomUUID(),serviceId:optText(raw.serviceId,120),description:reqText(raw.description,'service description',300),quantity,unitCost,totalCost:roundCurrency(quantity*unitCost)};});
    const laborItems:WorkOrderLaborItem[]=(input.laborItems||[]).map(raw=>{const hours=pos(raw.hours,'labor hours'),hourlyRate=roundCurrency(nn(raw.hourlyRate,'hourlyRate'));return{id:randomUUID(),description:reqText(raw.description,'labor description',300),hours,hourlyRate,totalCost:roundCurrency(hours*hourlyRate)};});
    const subtotalParts=roundCurrency(parts.reduce((s,i)=>s+i.totalCost,0)),subtotalServices=roundCurrency(services.reduce((s,i)=>s+i.totalCost,0)),subtotalLabor=roundCurrency(laborItems.reduce((s,i)=>s+i.totalCost,0)),gross=roundCurrency(subtotalParts+subtotalServices+subtotalLabor),discount=roundCurrency(nn(input.discount??0,'discount'));if(discount>gross)throw new MaintenanceValidationError('Desconto excede o total da OS');const now=new Date().toISOString();
    const item:WorkOrder={id:randomUUID(),companyId:p.companyId,number,vehicleId:vehicle.id,supplierId,status:'OPEN',openedAt:now,serviceDate,entryKm,description:reqText(input.description,'description',1000),diagnosis:optText(input.diagnosis,1000),notes:optText(input.notes,2000),parts,services,laborItems,subtotalParts,subtotalServices,subtotalLabor,discount,total:roundCurrency(gross-discount),createdBy:p.userId,createdAt:now,updatedAt:now};
    const created=await tx.getWorkOrderRepo().create(item);await audit(tx,p,'WorkOrder',created.id,AuditAction.CREATE,undefined,created,now);return created;
  }); }

  static startWorkOrder(p:AuthenticatedPrincipal,id:string):Promise<WorkOrder>{ return UnitOfWork.run(p.companyId,async tx=>{
    const repo=tx.getWorkOrderRepo(),before=await repo.findByIdForCompanyWithLock(p.companyId,id);if(!before)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(before.status==='IN_PROGRESS')return before;if(!['OPEN','WAITING_APPROVAL','WAITING_PARTS'].includes(before.status))throw new MaintenanceConflictError(`Não é possível iniciar OS com status ${before.status}`);
    const vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(p.companyId,before.vehicleId);if(!vehicle||vehicle.isArchived)throw new MaintenanceNotFoundError('Veículo não encontrado');if([VehicleStatus.SOLD,VehicleStatus.INACTIVE,VehicleStatus.ARCHIVED].includes(vehicle.status))throw new MaintenanceConflictError('Veículo não está elegível para manutenção');const now=new Date().toISOString();const updated=await repo.updateLifecycle(p.companyId,id,{status:'IN_PROGRESS',startedAt:now,updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(!await tx.getVehicleRepo().updateForCompany(p.companyId,vehicle.id,{status:VehicleStatus.MAINTENANCE,updatedAt:now}))throw new MaintenanceNotFoundError('Veículo não encontrado');await audit(tx,p,'WorkOrder',id,AuditAction.UPDATE,before,updated,now);return updated;
  }); }

  static completeWorkOrder(p:AuthenticatedPrincipal,id:string,input:CompleteWorkOrderInput):Promise<WorkOrder>{ return UnitOfWork.run(p.companyId,async tx=>{
    const repo=tx.getWorkOrderRepo(),before=await repo.findByIdForCompanyWithLock(p.companyId,id);if(!before)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(before.status==='COMPLETED')return before;if(before.status==='CANCELLED')throw new MaintenanceConflictError('Ordem de serviço cancelada');if(before.status!=='IN_PROGRESS')throw new MaintenanceConflictError('Ordem de serviço deve estar em andamento para conclusão');
    const vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(p.companyId,before.vehicleId);if(!vehicle||vehicle.isArchived)throw new MaintenanceNotFoundError('Veículo não encontrado');const exitKm=nn(input.exitKm,'exitKm');if(!Number.isInteger(exitKm)||exitKm<before.entryKm||exitKm<vehicle.currentKm)throw new MaintenanceValidationError('KM de saída regressivo');const dueDate=reqText(input.dueDate,'dueDate',10);isoDate(dueDate);const categoryId=reqText(input.categoryId,'categoryId',120);await expenseCategory(tx,p.companyId,categoryId);const installments=Number(input.installmentsCount??1);if(!Number.isInteger(installments)||installments<1||installments>60)throw new MaintenanceValidationError('Quantidade de parcelas inválida');
    const t=totals(before);if(t.subtotalParts!==roundCurrency(before.subtotalParts)||t.subtotalServices!==roundCurrency(before.subtotalServices)||t.subtotalLabor!==roundCurrency(before.subtotalLabor)||t.total!==roundCurrency(before.total))throw new MaintenanceConflictError('Totais persistidos da OS estão inconsistentes');
    const payables=t.total>0?await PayableService.create({companyId:p.companyId,originType:OriginType.MAINTENANCE,originId:before.id,vehicleId:before.vehicleId,supplierId:before.supplierId,categoryId,description:`Manutenção OS #${before.number} - ${before.description}`,totalAmount:t.total,dueDate,installmentsCount:installments,userId:p.userId,userName:p.name},tx):[];await afterPayableCreatedForTests?.();
    const now=new Date().toISOString(),updated=await repo.updateLifecycle(p.companyId,id,{status:'COMPLETED',exitKm,completedAt:now,accountPayableId:payables[0]?.id,updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');const status=await targetVehicleStatus(tx,p.companyId,vehicle,id);if(!await tx.getVehicleRepo().updateForCompany(p.companyId,vehicle.id,{currentKm:exitKm,status,updatedAt:now}))throw new MaintenanceNotFoundError('Veículo não encontrado');
    await tx.getKmRecordRepo().create({id:randomUUID(),companyId:p.companyId,vehicleId:vehicle.id,driverId:vehicle.currentDriverId,contractId:vehicle.currentContractId,kmValue:exitKm,recordDate:now.slice(0,10),readingType:'MAINTENANCE',notes:`Conclusão OS #${before.number}`,createdAt:now});await audit(tx,p,'WorkOrder',id,AuditAction.UPDATE,before,{...updated,vehicleStatus:status,payableIds:payables.map((x:any)=>x.id)},now);return updated;
  },{financialPeriodLock:'SHARED'}); }

  static cancelWorkOrder(p:AuthenticatedPrincipal,id:string,reason:string):Promise<WorkOrder>{ return UnitOfWork.run(p.companyId,async tx=>{
    const repo=tx.getWorkOrderRepo(),before=await repo.findByIdForCompanyWithLock(p.companyId,id);if(!before)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(before.status==='CANCELLED')return before;if(before.status==='COMPLETED')throw new MaintenanceConflictError('Não é possível cancelar uma OS concluída');const clean=reqText(reason,'reason',500),vehicle=await tx.getVehicleRepo().findByIdForCompanyWithLock(p.companyId,before.vehicleId);if(!vehicle||vehicle.isArchived)throw new MaintenanceNotFoundError('Veículo não encontrado');const now=new Date().toISOString(),updated=await repo.updateLifecycle(p.companyId,id,{status:'CANCELLED',cancelledAt:now,notes:`${before.notes||''}\n[Cancelada: ${clean}]`.trim(),updatedAt:now});if(!updated)throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');if(vehicle.status===VehicleStatus.MAINTENANCE){const status=await targetVehicleStatus(tx,p.companyId,vehicle,id);if(!await tx.getVehicleRepo().updateForCompany(p.companyId,vehicle.id,{status,updatedAt:now}))throw new MaintenanceNotFoundError('Veículo não encontrado');}await audit(tx,p,'WorkOrder',id,AuditAction.CANCEL,before,updated,now);return updated;
  }); }
}
