import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { TelemetryNotFoundError } from './telemetryAuthority';

export type TelemetryMovementState='UNAVAILABLE'|'MOVING'|'STOPPED'|'STALE';
export interface TelemetryMovementSummary {
  trackerId:string;
  vehicleId:string;
  state:TelemetryMovementState;
  latestOccurredAt:string|null;
  previousOccurredAt:string|null;
  distanceMeters:number|null;
  elapsedSeconds:number|null;
}

const FRESH_WINDOW_MS=2*60*60*1000;
const MOVING_DISTANCE_METERS=100;
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function coordinate(value:unknown,min:number,max:number):number{
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<min||parsed>max)throw new Error('Invalid persisted telemetry coordinate');
  return parsed;
}
function timestamp(value:unknown):string{
  const iso=new Date(value as string|number|Date).toISOString();
  if(!Number.isFinite(Date.parse(iso)))throw new Error('Invalid persisted telemetry timestamp');
  return iso;
}
function distanceMeters(aLat:number,aLng:number,bLat:number,bLng:number):number{
  const toRad=(value:number)=>value*Math.PI/180;
  const earth=6371000;
  const dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return earth*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
export function deriveTelemetryMovement(
  latest:{latitude:number;longitude:number;occurredAt:string}|null,
  previous:{latitude:number;longitude:number;occurredAt:string}|null,
  referenceNow=new Date(),
):Pick<TelemetryMovementSummary,'state'|'latestOccurredAt'|'previousOccurredAt'|'distanceMeters'|'elapsedSeconds'>{
  if(!latest)return{state:'UNAVAILABLE',latestOccurredAt:null,previousOccurredAt:null,distanceMeters:null,elapsedSeconds:null};
  const latestMs=Date.parse(latest.occurredAt),ageMs=referenceNow.getTime()-latestMs;
  if(!Number.isFinite(latestMs)||!Number.isFinite(ageMs)||ageMs<0)throw new Error('Invalid persisted telemetry timestamp');
  if(ageMs>FRESH_WINDOW_MS)return{state:'STALE',latestOccurredAt:new Date(latestMs).toISOString(),previousOccurredAt:previous?new Date(previous.occurredAt).toISOString():null,distanceMeters:null,elapsedSeconds:null};
  if(!previous)return{state:'UNAVAILABLE',latestOccurredAt:new Date(latestMs).toISOString(),previousOccurredAt:null,distanceMeters:null,elapsedSeconds:null};
  const previousMs=Date.parse(previous.occurredAt),elapsedMs=latestMs-previousMs;
  if(!Number.isFinite(previousMs)||elapsedMs<=0)throw new Error('Invalid persisted telemetry sequence');
  const distance=Math.round(distanceMeters(previous.latitude,previous.longitude,latest.latitude,latest.longitude));
  return{
    state:distance>MOVING_DISTANCE_METERS?'MOVING':'STOPPED',
    latestOccurredAt:new Date(latestMs).toISOString(),
    previousOccurredAt:new Date(previousMs).toISOString(),
    distanceMeters:distance,
    elapsedSeconds:Math.round(elapsedMs/1000),
  };
}

export class TelemetryMovementAdvisoryAuthority {
  static async get(companyId:string,trackerId:string,referenceNow=new Date()):Promise<TelemetryMovementSummary>{
    return await UnitOfWork.run(companyId,async tx=>{
      const tracker=await tx.getTrackerRepo().findByIdForCompany(companyId,trackerId);
      if(!tracker)throw new TelemetryNotFoundError('Tracker not found');
      const raw=tx.getRawTransaction?.();
      if(!raw)throw new Error('Telemetry persistence unavailable');
      const result=rows(await raw.execute(sql`
        SELECT occurred_at,raw_payload->>'latitude' AS latitude,raw_payload->>'longitude' AS longitude
        FROM tracker_telemetry_events
        WHERE company_id=${companyId}
          AND tracker_id=${trackerId}
          AND event_type='POSITION'
          AND status='ACCEPTED'
        ORDER BY occurred_at DESC,id DESC
        LIMIT 2
      `));
      const mapped=result.map(row=>({latitude:coordinate(row.latitude,-90,90),longitude:coordinate(row.longitude,-180,180),occurredAt:timestamp(row.occurred_at)}));
      const derived=deriveTelemetryMovement(mapped[0]??null,mapped[1]??null,referenceNow);
      return{trackerId,vehicleId:tracker.vehicleId,...derived};
    });
  }
}
