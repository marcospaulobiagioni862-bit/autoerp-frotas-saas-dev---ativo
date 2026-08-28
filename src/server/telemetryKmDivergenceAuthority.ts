import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { TelemetryNotFoundError } from './telemetryAuthority';

export type TelemetryKmDivergenceDirection='ALIGNED'|'TELEMETRY_ABOVE'|'TELEMETRY_BELOW'|'UNAVAILABLE';

export interface TelemetryKmDivergenceSummary {
  trackerId:string;
  vehicleId:string;
  authoritativeVehicleKm:number;
  telemetryOdometerKm:number|null;
  differenceKm:number|null;
  direction:TelemetryKmDivergenceDirection;
  thresholdKm:number;
}

export const TELEMETRY_KM_DIVERGENCE_THRESHOLD_KM=5;

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function km(value:unknown,label:string):number{
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<0||parsed>9_999_999)throw new Error(`Invalid ${label}`);
  return Math.round(parsed*1000)/1000;
}
function difference(a:number,b:number):number{return Math.round(Math.abs(a-b)*1000)/1000;}

export function deriveTelemetryKmDivergence(authoritativeVehicleKm:number,telemetryOdometerKm:number|null,thresholdKm=TELEMETRY_KM_DIVERGENCE_THRESHOLD_KM):Pick<TelemetryKmDivergenceSummary,'differenceKm'|'direction'|'thresholdKm'>{
  const authoritative=km(authoritativeVehicleKm,'authoritative vehicle KM');
  if(!Number.isFinite(thresholdKm)||thresholdKm<0)throw new Error('Invalid telemetry KM divergence threshold');
  const threshold=Math.round(thresholdKm*1000)/1000;
  if(telemetryOdometerKm===null)return{differenceKm:null,direction:'UNAVAILABLE',thresholdKm:threshold};
  const telemetry=km(telemetryOdometerKm,'telemetry odometer');
  const delta=difference(authoritative,telemetry);
  if(delta<=threshold)return{differenceKm:delta,direction:'ALIGNED',thresholdKm:threshold};
  return{differenceKm:delta,direction:telemetry>authoritative?'TELEMETRY_ABOVE':'TELEMETRY_BELOW',thresholdKm:threshold};
}

export class TelemetryKmDivergenceAuthority {
  static async get(companyId:string,trackerId:string):Promise<TelemetryKmDivergenceSummary>{
    return await UnitOfWork.run(companyId,async tx=>{
      const tracker=await tx.getTrackerRepo().findByIdForCompany(companyId,trackerId);
      if(!tracker)throw new TelemetryNotFoundError('Tracker not found');
      const vehicle=await tx.getVehicleRepo().findByIdForCompany(companyId,tracker.vehicleId);
      if(!vehicle||vehicle.isArchived)throw new TelemetryNotFoundError('Vehicle not found');
      const authoritativeVehicleKm=km(vehicle.currentKm,'authoritative vehicle KM');
      const raw=tx.getRawTransaction?.();
      if(!raw)throw new Error('Telemetry persistence unavailable');
      const latest=rows(await raw.execute(sql`
        SELECT raw_payload->>'odometerKm' AS odometer
        FROM tracker_telemetry_events
        WHERE company_id=${companyId}
          AND tracker_id=${tracker.id}
          AND event_type='ODOMETER'
          AND status='ACCEPTED'
        ORDER BY occurred_at DESC,id DESC
        LIMIT 1
      `))[0];
      const telemetryOdometerKm=latest?.odometer===null||latest?.odometer===undefined?null:km(latest.odometer,'persisted telemetry odometer');
      const derived=deriveTelemetryKmDivergence(authoritativeVehicleKm,telemetryOdometerKm);
      return{trackerId:tracker.id,vehicleId:vehicle.id,authoritativeVehicleKm,telemetryOdometerKm,...derived};
    });
  }
}
