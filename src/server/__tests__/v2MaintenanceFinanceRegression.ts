import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const require=createRequire(import.meta.url), Module=require('node:module');
const filename=path.resolve('src/server/maintenanceAuthority.ts'), mod=new Module(filename);
mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
let vehicle:any, order:any, context:any, payables:any[]=[], audits:any[]=[], plan:any;
const original=mod.require.bind(mod);
mod.require=(id:string)=>id==='../db/uow'?{UnitOfWork:{run:async(company:string,fn:Function)=>{assert.equal(company,'tenant');return fn(context);}}}
  :id==='../domain/finance/PayableService'?{PayableService:{create:async(value:any)=>{payables.push(value);return [{id:`cp-${value.supplierId}`}];}}}:original(id);
mod._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const service=mod.exports.MaintenanceAuthorityService;
const principal={companyId:'tenant',userId:'user',name:'Tester',role:'ADMIN'};
function reset(status='AVAILABLE') {
  vehicle={id:'vehicle',companyId:'tenant',currentKm:100,status};order=null;payables=[];audits=[];plan=null;
  context={getRawTransaction:()=>({execute:async()=>({rows:[plan||{id:'fixture',type:'EXPENSE',name:'PIX'}]})}),
    getVehicleRepo:()=>({findByIdForCompany:async()=>vehicle,findByIdForCompanyWithLock:async()=>vehicle,updateForCompany:async(company:string,id:string,patch:any)=>{assert.equal(company,'tenant');assert.equal(id,'vehicle');vehicle={...vehicle,...patch};return vehicle;}}),
    getSupplierRepo:()=>({findByIdForCompany:async(company:string,id:string)=>{assert.equal(company,'tenant');return {id,status:'ACTIVE'};}}),
    getWorkOrderRepo:()=>({findByNumber:async()=>null,create:async(value:any)=>{order=value;return value;},updateLifecycle:async(_company:string,_id:string,patch:any)=>{order={...order,...patch};return order;},findByIdForCompanyWithLock:async()=>order,hasBlockingWorkOrder:async()=>false}),
    getKmRecordRepo:()=>({create:async(value:any)=>value}),getAuditLogRepo:()=>({create:async(value:any)=>{audits.push(value);}})};
}
const input={number:'OS-V2',vehicleId:'vehicle',supplierId:'workshop',entryKm:100,serviceDate:'2026-09-16',description:'Peças e serviço',parts:[{description:'Peça',quantity:1,unitCost:100}],services:[{description:'Serviço',quantity:1,unitCost:200}],financialComponents:[
  {kind:'PARTS',supplierId:'parts-supplier',categoryId:'parts',paymentMethodId:'pix',paymentCondition:'INSTALLMENTS',installmentsCount:2,firstDueDate:'2026-11-01',hasInvoice:true},
  {kind:'SERVICES',supplierId:'service-supplier',categoryId:'services',paymentMethodId:'pix',paymentCondition:'CASH',installmentsCount:1,firstDueDate:'2026-10-01',hasInvoice:true},
]};
reset('BLOCKED');await service.createWorkOrder(principal,input);
assert.equal(payables.length,2);assert.deepEqual(payables.map(item=>item.supplierId),['parts-supplier','service-supplier']);
assert.deepEqual(payables.map(item=>item.totalAmount),[100,200]);assert.notEqual(payables[0].originId,payables[1].originId);
assert(payables.every(item=>item.competenceDate==='2026-09-16'&&item.competenceMode==='SINGLE_EVENT'));
await service.startWorkOrder(principal,order.id);assert.equal(order.status,'IN_PROGRESS');assert.equal(vehicle.status,'BLOCKED');
await service.completeWorkOrder(principal,order.id,{exitKm:101});assert.equal(order.status,'COMPLETED');assert.equal(vehicle.status,'BLOCKED');assert.equal(payables.length,2,'completion must not duplicate component CPs');assert.equal(vehicle.currentKm,101);
reset('BLOCKED');await service.createWorkOrder(principal,input);await service.startWorkOrder(principal,order.id);await service.cancelWorkOrder(principal,order.id,'Cancelamento justificado');assert.equal(vehicle.status,'BLOCKED');
reset();await service.createWorkOrder(principal,{...input,financialComponents:undefined});await service.startWorkOrder(principal,order.id);assert.equal(vehicle.status,'MAINTENANCE');await service.completeWorkOrder(principal,order.id,{exitKm:101,categoryId:'parts',dueDate:'2026-11-01',installmentsCount:2});assert.equal(vehicle.status,'AVAILABLE');assert.equal(payables[0].competenceDate,'2026-09-16');
reset();await service.createWorkOrder(principal,input);await service.startWorkOrder(principal,order.id);
plan={id:'preventive',vehicle_id:'vehicle',status:'ACTIVE',next_due_km:1000,next_due_date:null,interval_km:1000,cycle_sequence:0};
await assert.rejects(service.completeWorkOrder(principal,order.id,{exitKm:101,preventivePlanIds:['preventive']}),/preventiveExecutionReason/);
assert.equal(order.status,'IN_PROGRESS');
await service.completeWorkOrder(principal,order.id,{exitKm:101,preventivePlanIds:['preventive'],preventiveExecutionReasons:{preventive:'Troca antecipada por desgaste'}});
const execution=JSON.parse(audits.find(item=>item.entityName==='MaintenancePlan').newState);
assert.equal(execution.event,'PREVENTIVA_ANTECIPADA');assert.equal(execution.earlyReason,'Troca antecipada por desgaste');
console.log('V2 maintenance: separate supplier CPs, service competence, no duplicate CPs, KM, early reason and no automatic unblock PASS');
