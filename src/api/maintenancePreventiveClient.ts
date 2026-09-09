import type { MaintenancePlan, MaintenancePlanPriority, MaintenancePlanStatus, MaintenanceProjectedStatus, MaintenanceDueStage, OilChangeRecord, TireRecord, TireStatus } from '../types/entities';
import type { CreateMaintenancePlanInput, CreateOilChangeInput, CreateTireInput, RotateTireInput, UpdateMaintenancePlanInput, UpdateTireInput, RemoveTireInput } from '../server/maintenancePreventiveAuthority';
import type { CreateMaintenancePlanTemplateInput, MaintenancePlanTemplate, UpdateMaintenancePlanTemplateInput } from '../server/maintenancePlanTemplateAuthority';
import type { MaintenanceAlertRule, UpdateGlobalMaintenanceRuleInput } from '../server/maintenanceRuleAuthority';

type R=Record<string,unknown>;
const rec=(v:unknown):R=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid preventive maintenance API response');return v as R;};
const txt=(v:unknown,f:string):string=>{if(typeof v!=='string')throw new Error(`Invalid ${f}`);return v;};
const opt=(v:unknown):string|undefined=>v===undefined||v===null||v===''?undefined:txt(v,'optional field');
const num=(v:unknown,f:string):number=>{const n=Number(v);if(!Number.isFinite(n))throw new Error(`Invalid ${f}`);return n;};
const maybeNum=(v:unknown):number|undefined=>v===undefined||v===null||v===''?undefined:num(v,'number');
const bool=(v:unknown,f:string):boolean=>{if(typeof v!=='boolean')throw new Error(`Invalid ${f}`);return v;};
const enumValue=<T extends string>(v:unknown,f:string,allowed:readonly T[]):T=>{const s=txt(v,f);if(!allowed.includes(s as T))throw new Error(`Invalid ${f}`);return s as T;};
const optionalEnum=<T extends string>(v:unknown,f:string,allowed:readonly T[]):T|undefined=>v===undefined||v===null||v===''?undefined:enumValue(v,f,allowed);
const PLAN_PRIORITIES=['LOW','MEDIUM','HIGH','CRITICAL'] as const satisfies readonly MaintenancePlanPriority[];
const PLAN_STATUSES=['ACTIVE','PAUSED','COMPLETED'] as const satisfies readonly MaintenancePlanStatus[];
const PROJECTED_STATUSES=['OK','UPCOMING','DUE','OVERDUE','PAUSED','COMPLETED'] as const satisfies readonly MaintenanceProjectedStatus[];
const DUE_STAGES=['NONE','D90','D60','D30','D15','D7','DUE_TODAY','POST_DUE','KM1000','KM500','DUE_KM','OVERDUE_KM'] as const satisfies readonly MaintenanceDueStage[];
const TIRE_STATUSES=['ACTIVE','REMOVED','REPLACED','DAMAGED'] as const satisfies readonly TireStatus[];
function template(v:unknown):MaintenancePlanTemplate{const x=rec(v);return{id:txt(x.id,'id'),companyId:txt(x.companyId,'companyId'),code:txt(x.code,'code'),name:txt(x.name,'name'),maintenanceType:txt(x.maintenanceType,'maintenanceType'),intervalKm:maybeNum(x.intervalKm),intervalDays:maybeNum(x.intervalDays),priority:enumValue(x.priority,'priority',PLAN_PRIORITIES),estimatedCost:maybeNum(x.estimatedCost),active:bool(x.active,'active'),notes:opt(x.notes),createdBy:txt(x.createdBy,'createdBy'),createdAt:txt(x.createdAt,'createdAt'),updatedAt:txt(x.updatedAt,'updatedAt')};}
function plan(v:unknown):MaintenancePlan{const x=rec(v);return{id:txt(x.id,'id'),companyId:txt(x.companyId,'companyId'),vehicleId:txt(x.vehicleId,'vehicleId'),name:txt(x.name,'name'),maintenanceType:txt(x.maintenanceType,'maintenanceType'),intervalKm:maybeNum(x.intervalKm),intervalDays:maybeNum(x.intervalDays),lastExecutionKm:maybeNum(x.lastExecutionKm),lastExecutionDate:opt(x.lastExecutionDate),nextDueKm:maybeNum(x.nextDueKm),nextDueDate:opt(x.nextDueDate),priority:enumValue(x.priority,'priority',PLAN_PRIORITIES),estimatedCost:maybeNum(x.estimatedCost),status:enumValue(x.status,'status',PLAN_STATUSES),notes:opt(x.notes),lastWorkOrderId:opt(x.lastWorkOrderId),cycleSequence:num(x.cycleSequence,'cycleSequence'),createdBy:txt(x.createdBy,'createdBy'),createdAt:txt(x.createdAt,'createdAt'),updatedAt:txt(x.updatedAt,'updatedAt'),projectedStatus:optionalEnum(x.projectedStatus,'projectedStatus',PROJECTED_STATUSES),projectedStage:optionalEnum(x.projectedStage,'projectedStage',DUE_STAGES),dueReference:opt(x.dueReference),remainingKm:maybeNum(x.remainingKm),remainingDays:maybeNum(x.remainingDays)};}
function oil(v:unknown):OilChangeRecord{const x=rec(v);return{id:txt(x.id,'id'),companyId:txt(x.companyId,'companyId'),vehicleId:txt(x.vehicleId,'vehicleId'),workOrderId:opt(x.workOrderId),km:num(x.km,'km'),date:txt(x.date,'date'),oilType:txt(x.oilType,'oilType'),oilBrand:txt(x.oilBrand,'oilBrand'),quantity:num(x.quantity,'quantity'),filterChanged:bool(x.filterChanged,'filterChanged'),nextKm:num(x.nextKm,'nextKm'),nextDate:opt(x.nextDate),supplierId:opt(x.supplierId),attachmentId:opt(x.attachmentId),notes:opt(x.notes),createdBy:opt(x.createdBy),createdAt:txt(x.createdAt,'createdAt'),updatedAt:txt(x.updatedAt,'updatedAt')};}
function rule(v:unknown):MaintenanceAlertRule{const x=rec(v);return{id:opt(x.id),companyId:txt(x.companyId,'companyId'),scopeType:enumValue(x.scopeType,'scopeType',['GLOBAL','CATEGORY','MODEL','MAINTENANCE_TYPE','VEHICLE'] as const),scopeKey:opt(x.scopeKey),warningKm:num(x.warningKm,'warningKm'),urgentKm:num(x.urgentKm,'urgentKm'),warningDays:num(x.warningDays,'warningDays'),urgentDays:num(x.urgentDays,'urgentDays'),toleranceKm:num(x.toleranceKm,'toleranceKm'),toleranceDays:num(x.toleranceDays,'toleranceDays'),active:bool(x.active,'active'),effectiveFrom:txt(x.effectiveFrom,'effectiveFrom'),effectiveTo:opt(x.effectiveTo),configured:bool(x.configured,'configured'),updatedAt:opt(x.updatedAt)};}
function tire(v:unknown):TireRecord{const x=rec(v);return{id:txt(x.id,'id'),companyId:txt(x.companyId,'companyId'),vehicleId:txt(x.vehicleId,'vehicleId'),position:txt(x.position,'position'),brand:txt(x.brand,'brand'),model:txt(x.model,'model'),measure:opt(x.measure),serialNumber:opt(x.serialNumber),installationDate:txt(x.installationDate,'installationDate'),installationKm:num(x.installationKm,'installationKm'),treadDepth:maybeNum(x.treadDepth),status:enumValue(x.status,'tire status',TIRE_STATUSES),lastRotationDate:opt(x.lastRotationDate),lastRotationKm:maybeNum(x.lastRotationKm),nextRotationDate:opt(x.nextRotationDate),nextRotationKm:maybeNum(x.nextRotationKm),removalDate:opt(x.removalDate),removalKm:maybeNum(x.removalKm),removalReason:opt(x.removalReason),cost:num(x.cost,'cost'),supplierId:opt(x.supplierId),attachmentId:opt(x.attachmentId),notes:opt(x.notes),createdBy:opt(x.createdBy),createdAt:txt(x.createdAt,'createdAt'),updatedAt:txt(x.updatedAt,'updatedAt')};}
async function request(path:string,init?:RequestInit):Promise<R>{const r=await fetch(path,{...init,credentials:'include'});if(!r.ok){let m=`Preventive maintenance request failed (${r.status})`;try{const p=rec(await r.json());if(typeof p.error==='string')m=p.error;}catch{}throw new Error(m);}return rec(await r.json());}
const json=(method:string,body:unknown):RequestInit=>({method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const list=<T>(p:R,f:(v:unknown)=>T):T[]=>{if(!Array.isArray(p.items))throw new Error('Invalid list response');return p.items.map(f);};
const q=(vehicleId?:string)=>vehicleId?`?vehicleId=${encodeURIComponent(vehicleId)}`:'';

export class MaintenancePreventiveClient{
  static async getGlobalRule(){return rule((await request('/api/maintenance/rules/global')).item);}
  static async updateGlobalRule(input:UpdateGlobalMaintenanceRuleInput){return rule((await request('/api/maintenance/rules/global',json('PUT',input))).item);}
  static async listTemplates(){return list(await request('/api/maintenance/templates'),template);}
  static async createTemplate(input:CreateMaintenancePlanTemplateInput){return template((await request('/api/maintenance/templates',json('POST',input))).item);}
  static async updateTemplate(id:string,input:UpdateMaintenancePlanTemplateInput){return template((await request(`/api/maintenance/templates/${encodeURIComponent(id)}`,json('PATCH',input))).item);}
  static async applyTemplatesToFleet(){const payload=await request('/api/maintenance/templates/apply-all',json('POST',{}));return{vehicles:num(payload.vehicles,'vehicles'),plansCreated:num(payload.plansCreated,'plansCreated')};}
  static async listPlans(vehicleId?:string){return list(await request(`/api/maintenance/plans${q(vehicleId)}`),plan);}
  static async getPlan(id:string){return plan((await request(`/api/maintenance/plans/${encodeURIComponent(id)}`)).item);}
  static async createPlan(input:CreateMaintenancePlanInput){return plan((await request('/api/maintenance/plans',json('POST',input))).item);}
  static async updatePlan(id:string,input:UpdateMaintenancePlanInput){return plan((await request(`/api/maintenance/plans/${encodeURIComponent(id)}`,json('PATCH',input))).item);}
  static async pausePlan(id:string){return plan((await request(`/api/maintenance/plans/${encodeURIComponent(id)}/pause`,json('POST',{}))).item);}
  static async resumePlan(id:string){return plan((await request(`/api/maintenance/plans/${encodeURIComponent(id)}/resume`,json('POST',{}))).item);}
  static async linkWorkOrder(planId:string,workOrderId:string){await request(`/api/maintenance/plans/${encodeURIComponent(planId)}/link-work-order`,json('POST',{workOrderId}));}
  static async listOilChanges(vehicleId?:string){return list(await request(`/api/maintenance/oil-changes${q(vehicleId)}`),oil);}
  static async createOilChange(input:CreateOilChangeInput){return oil((await request('/api/maintenance/oil-changes',json('POST',input))).item);}
  static async listTires(vehicleId?:string){return list(await request(`/api/maintenance/tires${q(vehicleId)}`),tire);}
  static async createTire(input:CreateTireInput){return tire((await request('/api/maintenance/tires',json('POST',input))).item);}
  static async updateTire(id:string,input:UpdateTireInput){return tire((await request(`/api/maintenance/tires/${encodeURIComponent(id)}`,json('PATCH',input))).item);}
  static async rotateTire(id:string,input:RotateTireInput){return tire((await request(`/api/maintenance/tires/${encodeURIComponent(id)}/rotate`,json('POST',input))).item);}
  static async removeTire(id:string,input:RemoveTireInput){return tire((await request(`/api/maintenance/tires/${encodeURIComponent(id)}/remove`,json('POST',input))).item);}
}
