import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { TelemetryNotFoundError } from './telemetryAuthority';

export type TelemetryOperationalLocationState='UNAVAILABLE'|'FRESH'|'STALE';
export interface TelemetryOperationalLocationSummary{
  trackerId:string;
  vehicleId:string;
  latitude:number|null;
  longitude:number|null;
  occurredAt:string|null;
  ageMinutes:number|null;
  state:TelemetryOperationalLocationState;
}
export const TELEMETRY_LOCATION_FRESH_MINUTES=120;
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function coordinate(value:unknown,min:number,max:number,label:string):number{
  const parsed=Number(value);if(!Number.isFinite(parsed)||parsed<min||parsed>max)throw new Error(`Invalid telemetry ${label}`);return Math.round(parsed*100000)/100000;
}
export function deriveTelemetryOperationalLocation(latitude:unknown,longitude:unknown,occurredAt:string|null,referenceNow=new Date()):Pick<TelemetryOperationalLocationSummary,'latitude'|'longitude'|'occurredAt'|'ageMinutes'|'state'>{
  if(latitude===null||latitude===undefined||longitude===null||longitude===undefined||!occurredAt)return{latitude:null,longitude:null,occurredAt:null,ageMinutes:null,state:'UNAVAILABLE'};
  const lat=coordinate(latitude,-90,90,'latitude'),lng=coordinate(longitude,-180,180,'longitude'),ms=Date.parse(occurredAt);
  if(!Number.isFinite(ms))throw new Error('Invalid telemetry location timestamp');
  const ageMinutes=Math.max(0,Math.floor((referenceNow.getTime()-ms)/60000));
  return{latitude:lat,longitude:lng,occurredAt:new Date(ms).toISOString(),ageMinutes,state:ageMinutes<=TELEMETRY_LOCATION_FRESH_MINUTES?'FRESH':'STALE'};
}
export class TelemetryOperationalLocationAuthority{
  static async get(companyId:string,trackerId:string,referenceNow=new Date()):Promise<TelemetryOperationalLocationSummary>{
    return await UnitOfWork.run(companyId,async tx=>{
      const tracker=await tx.getTrackerRepo().findByIdForCompany(companyId,trackerId);if(!tracker)throw new TelemetryNotFoundError('Tracker not found');
      const vehicle=await tx.getVehicleRepo().findByIdForCompany(companyId,tracker.vehicleId);if(!vehicle||vehicle.isArchived)throw new TelemetryNotFoundError('Vehicle not found');
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Telemetry persistence unavailable');
      const row=rows(await raw.execute(sql`
        SELECT raw_payload->>'latitude' AS latitude,raw_payload->>'longitude' AS longitude,occurred_at
        FROM tracker_telemetry_events
        WHERE company_id=${companyId} AND tracker_id=${tracker.id} AND event_type='POSITION' AND status='ACCEPTED'
        ORDER BY occurred_at DESC,id DESC LIMIT 1
      `))[0];
      const derived=deriveTelemetryOperationalLocation(row?.latitude,row?.longitude,row?.occurred_at?new Date(row.occurred_at).toISOString():null,referenceNow);
      return{trackerId:tracker.id,vehicleId:vehicle.id,...derived};
    });
  }
}
