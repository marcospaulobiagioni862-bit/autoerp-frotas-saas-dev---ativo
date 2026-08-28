import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { TelemetryNotFoundError } from './telemetryAuthority';

export type TelemetryLocationFreshness='UNAVAILABLE'|'FRESH'|'STALE'|'OFFLINE';
export interface SanitizedTelemetryLocation {
  trackerId:string;
  vehicleId:string;
  latitude:number|null;
  longitude:number|null;
  occurredAt:string|null;
  freshness:TelemetryLocationFreshness;
}

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function coordinate(value:unknown,min:number,max:number):number{
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<min||parsed>max)throw new Error('Invalid persisted telemetry coordinate');
  return Math.round(parsed*1000)/1000;
}
export function deriveTelemetryLocationFreshness(occurredAt:string|null,referenceNow=new Date()):TelemetryLocationFreshness{
  if(!occurredAt)return'UNAVAILABLE';
  const occurredMs=Date.parse(occurredAt),ageMs=referenceNow.getTime()-occurredMs;
  if(!Number.isFinite(occurredMs)||!Number.isFinite(ageMs)||ageMs<0)throw new Error('Invalid persisted telemetry timestamp');
  if(ageMs<=2*60*60*1000)return'FRESH';
  if(ageMs<=24*60*60*1000)return'STALE';
  return'OFFLINE';
}
export class SanitizedTelemetryLocationAuthority {
  static async get(companyId:string,trackerId:string,referenceNow=new Date()):Promise<SanitizedTelemetryLocation>{
    return await UnitOfWork.run(companyId,async tx=>{
      const tracker=await tx.getTrackerRepo().findByIdForCompany(companyId,trackerId);
      if(!tracker)throw new TelemetryNotFoundError('Tracker not found');
      const raw=tx.getRawTransaction?.();
      if(!raw)throw new Error('Telemetry persistence unavailable');
      const row=rows(await raw.execute(sql`
        SELECT occurred_at,raw_payload->>'latitude' AS latitude,raw_payload->>'longitude' AS longitude
        FROM tracker_telemetry_events
        WHERE company_id=${companyId}
          AND tracker_id=${trackerId}
          AND event_type='POSITION'
          AND status='ACCEPTED'
        ORDER BY occurred_at DESC,id DESC
        LIMIT 1
      `))[0];
      if(!row)return{trackerId,vehicleId:tracker.vehicleId,latitude:null,longitude:null,occurredAt:null,freshness:'UNAVAILABLE'};
      const occurredAt=new Date(row.occurred_at).toISOString();
      return{
        trackerId,
        vehicleId:tracker.vehicleId,
        latitude:coordinate(row.latitude,-90,90),
        longitude:coordinate(row.longitude,-180,180),
        occurredAt,
        freshness:deriveTelemetryLocationFreshness(occurredAt,referenceNow),
      };
    });
  }
}
