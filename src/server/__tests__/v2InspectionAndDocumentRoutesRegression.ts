import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

// Execute the actual route bodies with in-memory transaction ports. No DB module is loaded.
const require = createRequire(import.meta.url);
const Module = require('node:module');
const routes = new Map<string, Function>();
const app: any = Object.fromEntries(['get','post','put','patch','delete'].map(method=>[method,(url:string,handler:Function)=>routes.set(`${method} ${url}`,handler)]));
let context: any, calls = 0;
const unit = {run:async(company:string,fn:Function)=>{assert.equal(company,'tenant');calls++;return fn(context);}};
function load(file: string, entry: string) {
  const filename=path.resolve(file), mod=new Module(filename);
  mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
  const original=mod.require.bind(mod);
  mod.require=(id:string)=>id==='../db/uow'?{UnitOfWork:unit}:original(id);
  mod._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
  mod.exports[entry](app);
}
load('src/server/vehicleInspectionRoutes.ts','registerVehicleInspectionRoutes');
load('src/server/documentRoutes.ts','registerDocumentRoutes');
const principal={companyId:'tenant',userId:'user',name:'Tester',role:'ADMIN',permissions:['*']};
async function request(route:string,body:any={},role='ADMIN',authenticated=true) {
  let status=200,payload:any;
  const res={status:(code:number)=>{status=code;return res;},json:(value:any)=>{payload=value;return res;}};
  await routes.get(route)!({params:{id:'vehicle'},body,principal:authenticated?{...principal,role}:undefined},res);
  return {status,payload};
}
let vehicle:any, saved:any[], updates:any[], readings:any[];
function inspectionContext() {
  vehicle={id:'vehicle',companyId:'tenant',status:'AVAILABLE',currentKm:100,currentContractId:'contract'};saved=[];updates=[];readings=[];
  context={getVehicleRepo:()=>({findByIdForCompanyWithLock:async()=>vehicle,updateForCompany:async(company:string,id:string,patch:any)=>{assert.equal(company,'tenant');assert.equal(id,'vehicle');updates.push(patch);vehicle={...vehicle,...patch};return vehicle;}}),
    getContractRepo:()=>({findByIdForCompany:async(company:string)=>{assert.equal(company,'tenant');return {id:'contract',driverId:'driver',vehicleId:'vehicle'};}}),
    getDriverRepo:()=>({findByIdForCompany:async(company:string,id:string)=>{assert.equal(company,'tenant');assert.equal(id,'driver');return {id:'driver'};}}),
    getRawTransaction:()=>({insert:()=>({values:(value:any)=>({returning:async()=>{saved.push(value);return [value];}})})}),
    getKmRecordRepo:()=>({create:async(value:any)=>{readings.push(value);return value;}}),getAuditLogRepo:()=>({create:async()=>{}})};
}
const technical=Object.fromEntries(['tires','glassMirrors','bodyPaint','interior','dashboard','lighting','brakes','suspension','steering','engine','transmission','safety'].map(key=>[key,'OK']));
const body={inspectionType:'ENTRY',odometer:101,fuelLevel:50,technicalChecklist:technical,equipmentSnapshot:{tireBrand:'A',tireModel:'B',tireMeasure:'C',batteryBrand:'D',batteryModel:'E'}};
for(const [field,state,result] of [[null,'OK','APPROVED'],['interior','ATTENTION','APPROVED_WITH_RESERVATIONS'],['engine','FAILED','FAILED'],...['tires','brakes','steering','safety'].map(field=>[field,'FAILED','BLOCKED_FOR_RENTAL'])]) {
  inspectionContext();const checks={...technical};if(field)checks[field]=state!;
  const response=await request('post /api/fleet/vehicles/:id/inspections',{...body,technicalChecklist:checks});
  assert.equal(response.status,201);assert.equal(response.payload.item.result,result);
  assert.equal(response.payload.item.driverId,'driver');assert.equal(response.payload.item.contractId,'contract');
  assert.equal(readings[0].kmValue,101);assert.equal(vehicle.currentKm,101);assert.equal(saved[0].checklist.equipment.tireMeasure,'C');
  assert.equal(vehicle.status,result==='BLOCKED_FOR_RENTAL'?'BLOCKED':'AVAILABLE');
}
inspectionContext();vehicle.status='BLOCKED';await request('post /api/fleet/vehicles/:id/inspections',body);assert.equal(vehicle.status,'BLOCKED','approved inspections never unlock a vehicle');
inspectionContext();const invalid=await request('post /api/fleet/vehicles/:id/inspections',{...body,driverId:'other-driver'});assert.equal(invalid.status,400);assert.equal(saved.length,0);
inspectionContext();await request('post /api/fleet/vehicles/:id/inspections',body,'READONLY');assert.equal(saved.length,0);
let writes:any[]=[], audits:any[]=[];
context={getRawTransaction:()=>({select:()=>({from:()=>({where:()=>({limit:async()=>[]})})}),insert:()=>({values:(value:any)=>({onConflictDoUpdate:async(config:any)=>{writes.push({value,config});}})})}),getAuditLogRepo:()=>({create:async(value:any)=>{audits.push(value);}})};
const defaults=await request('get /api/documents/alert-settings');assert.deepEqual(defaults.payload.settings,{redDays:7,yellowDays:15});assert.equal(writes.length,0,'GET never creates settings');
assert.equal((await request('put /api/documents/alert-settings',{redDays:10,yellowDays:30},'READONLY')).status,403);
assert.equal((await request('put /api/documents/alert-settings',{redDays:30,yellowDays:7})).status,400);
assert.equal((await request('put /api/documents/alert-settings',{redDays:7,yellowDays:15,companyId:'other'})).status,400);assert.equal(writes.length,0);
assert.equal((await request('put /api/documents/alert-settings',{redDays:10,yellowDays:30})).status,200);assert.equal(writes.length,1);assert.equal(writes[0].value.companyId,'tenant');assert.equal(writes[0].config.set.documentRedDays,10);assert.equal(audits[0].companyId,'tenant');
const before=calls;assert.equal((await request('get /api/documents/alert-settings',{},'ADMIN',false)).status,401);assert.equal(calls,before);
console.log('V2 inspection grades, critical blocking, no auto unlock, binding/KM/equipment; document settings scope, permissions and validation: PASS');
