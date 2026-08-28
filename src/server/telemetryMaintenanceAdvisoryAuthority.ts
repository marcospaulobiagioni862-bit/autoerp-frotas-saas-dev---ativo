import type { MaintenancePlanPriority } from '../types/entities';
import { MaintenancePreventiveAuthority } from './maintenancePreventiveAuthority';
import { TelemetryKmDivergenceAuthority } from './telemetryKmDivergenceAuthority';

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

export const TELEMETRY_MAINTENANCE_DUE_SOON_KM=500;

function finiteKm(value:unknown,label:string):number{
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<0||parsed>9_999_999)throw new Error(`Invalid ${label}`);
  return Math.round(parsed*1000)/1000;
}

function rounded(value:number):number{return Math.round(value*1000)/1000;}

export function deriveTelemetryMaintenanceAdvisory(
  authoritativeVehicleKm:number,
  telemetryOdometerKm:number|null,
  nextDueKm:number|null,
  thresholdKm=TELEMETRY_MAINTENANCE_DUE_SOON_KM,
):Pick<TelemetryMaintenanceAdvisoryPlan,'authoritativeVehicleKm'|'telemetryOdometerKm'|'nextDueKm'|'telemetryKmRemaining'|'state'>{
  const authoritative=finiteKm(authoritativeVehicleKm,'authoritative vehicle KM');
  if(!Number.isFinite(thresholdKm)||thresholdKm<0)throw new Error('Invalid maintenance advisory threshold');
  const threshold=rounded(thresholdKm);
  if(telemetryOdometerKm===null||nextDueKm===null){
    return{authoritativeVehicleKm:authoritative,telemetryOdometerKm:null===telemetryOdometerKm?null:finiteKm(telemetryOdometerKm,'telemetry odometer'),nextDueKm:nextDueKm===null?null:finiteKm(nextDueKm,'next due KM'),telemetryKmRemaining:null,state:'UNAVAILABLE'};
  }
  const telemetry=finiteKm(telemetryOdometerKm,'telemetry odometer');
  const due=finiteKm(nextDueKm,'next due KM');
  const remaining=rounded(due-telemetry);
  const state:TelemetryMaintenanceAdvisoryState=remaining<=0?'DUE':remaining<=threshold?'DUE_SOON':'NOT_DUE';
  return{authoritativeVehicleKm:authoritative,telemetryOdometerKm:telemetry,nextDueKm:due,telemetryKmRemaining:remaining,state};
}

export class TelemetryMaintenanceAdvisoryAuthority {
  static async get(companyId:string,trackerId:string):Promise<TelemetryMaintenanceAdvisorySummary>{
    const divergence=await TelemetryKmDivergenceAuthority.get(companyId,trackerId);
    const plans=await MaintenancePreventiveAuthority.listPlans(companyId,divergence.vehicleId);
    return{
      trackerId:divergence.trackerId,
      vehicleId:divergence.vehicleId,
      dueSoonThresholdKm:TELEMETRY_MAINTENANCE_DUE_SOON_KM,
      plans:plans.filter(plan=>plan.status==='ACTIVE').map(plan=>({
        planId:plan.id,
        name:plan.name,
        priority:plan.priority,
        ...deriveTelemetryMaintenanceAdvisory(
          divergence.authoritativeVehicleKm,
          divergence.telemetryOdometerKm,
          plan.nextDueKm??null,
        ),
      })),
    };
  }
}
