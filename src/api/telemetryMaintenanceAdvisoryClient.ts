import type { MaintenancePlanPriority } from '../types/entities';

export type TelemetryMaintenanceAdvisoryState='UNAVAILABLE'|'NOT_DUE'|'DUE_SOON'|'DUE';
export interface TelemetryMaintenanceAdvisoryPlan {
  planId:string;
  name:string;
  priority:MaintenancePlanPriority;
  authoritativeVehicleKm:number;
  telemetryOdometerKm:number|null;
  nextDueKm:number|null;
  telemetryKmRemaining:number|null;
  state:TelemetryMaintenanceAdvisoryState;
}
export interface TelemetryMaintenanceAdvisorySummary {
  trackerId:string;
  vehicleId:string;
  dueSoonThresholdKm:number;
  plans:TelemetryMaintenanceAdvisoryPlan[];
}

type JsonRecord=Record<string,unknown>;
const priorities=new Set<MaintenancePlanPriority>(['LOW','MEDIUM','HIGH','CRITICAL']);
const states=new Set<TelemetryMaintenanceAdvisoryState>(['UNAVAILABLE','NOT_DUE','DUE_SOON','DUE']);
function record(value:unknown):JsonRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid telemetry maintenance advisory response');return value as JsonRecord;}
function text(value:unknown,field:string):string{if(typeof value!=='string'||value.trim()==='')throw new Error(`Invalid advisory field: ${field}`);return value;}
function km(value:unknown,field:string):number{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>9_999_999)throw new Error(`Invalid advisory KM field: ${field}`);return value;}
function nullableKm(value:unknown,field:string):number|null{return value===null?null:km(value,field);}
function remainingKm(value:unknown):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>9_999_999)throw new Error('Invalid advisory KM remaining');return value;}
export function parseTelemetryMaintenanceAdvisorySummary(value:unknown):TelemetryMaintenanceAdvisorySummary{
  const item=record(value),allowed=new Set(['trackerId','vehicleId','dueSoonThresholdKm','plans']);
  if(Object.keys(item).some(key=>!allowed.has(key)))throw new Error('Unsafe telemetry maintenance advisory response');
  if(!Array.isArray(item.plans))throw new Error('Invalid advisory plans');
  const dueSoonThresholdKm=km(item.dueSoonThresholdKm,'dueSoonThresholdKm');
  const plans=item.plans.map((raw,index)=>{
    const plan=record(raw),planAllowed=new Set(['planId','name','priority','authoritativeVehicleKm','telemetryOdometerKm','nextDueKm','telemetryKmRemaining','state']);
    if(Object.keys(plan).some(key=>!planAllowed.has(key)))throw new Error('Unsafe telemetry maintenance advisory plan');
    const priority=text(plan.priority,`plans[${index}].priority`) as MaintenancePlanPriority,state=text(plan.state,`plans[${index}].state`) as TelemetryMaintenanceAdvisoryState;
    if(!priorities.has(priority)||!states.has(state))throw new Error('Invalid advisory plan classification');
    const telemetryOdometerKm=nullableKm(plan.telemetryOdometerKm,`plans[${index}].telemetryOdometerKm`),nextDueKm=nullableKm(plan.nextDueKm,`plans[${index}].nextDueKm`),telemetryKmRemaining=remainingKm(plan.telemetryKmRemaining);
    if(state==='UNAVAILABLE'&&telemetryKmRemaining!==null)throw new Error('Inconsistent unavailable advisory plan');
    if(state!=='UNAVAILABLE'&&(telemetryOdometerKm===null||nextDueKm===null||telemetryKmRemaining===null))throw new Error('Inconsistent available advisory plan');
    return{planId:text(plan.planId,`plans[${index}].planId`),name:text(plan.name,`plans[${index}].name`),priority,authoritativeVehicleKm:km(plan.authoritativeVehicleKm,`plans[${index}].authoritativeVehicleKm`),telemetryOdometerKm,nextDueKm,telemetryKmRemaining,state};
  });
  return{trackerId:text(item.trackerId,'trackerId'),vehicleId:text(item.vehicleId,'vehicleId'),dueSoonThresholdKm,plans};
}
export class TelemetryMaintenanceAdvisoryClient {
  static async get(trackerId:string):Promise<TelemetryMaintenanceAdvisorySummary>{
    const response=await fetch(`/api/trackers/${encodeURIComponent(trackerId)}/telemetry/maintenance-advisory`,{credentials:'include',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Falha ao consultar alerta preventivo (${response.status})`);
    const payload=record(await response.json());
    if(Object.keys(payload).some(key=>key!=='item'))throw new Error('Unsafe telemetry maintenance advisory envelope');
    return parseTelemetryMaintenanceAdvisorySummary(payload.item);
  }
}
