import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export type TelemetryEventType='POSITION'|'ODOMETER'|'HEARTBEAT';
export type TelemetryEventStatus='ACCEPTED'|'QUARANTINED';
export type TelemetryHealthStatus='NO_DATA'|'HEALTHY'|'STALE'|'OFFLINE'|'ATTENTION'|'INACTIVE';
export interface TelemetryEventSummary { id:string; trackerId:string; sourceEventId:string; eventType:TelemetryEventType; occurredAt:string; receivedAt:string; status:TelemetryEventStatus; quarantineReason:string|null; }
export interface IngestTelemetryEventInput { trackerId:string; sourceEventId:string; eventType:TelemetryEventType; occurredAt:string; payload:Record<string,unknown>; }
export interface TelemetryHealthSummary { trackerId:string;healthStatus:TelemetryHealthStatus;lastCommunicationAt:string|null;lastAcceptedEventAt:string|null;latestAcceptedEventType:TelemetryEventType|null;lastAcceptedOdometerKm:number|null;quarantinedLast24h:number; }
export class TelemetryValidationError extends Error {}
export class TelemetryNotFoundError extends Error {}
export class TelemetryConflictError extends Error {}
const MAX_ODOMETER_DELTA_KM=1000;
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function text(value:unknown,max:number):string{const s=typeof value==='string'?value.trim():'';if(!s||s.length>max)throw new TelemetryValidationError('Invalid telemetry field');return s;}
function date(value:unknown):string{const s=typeof value==='string'?value.trim():'';const ms=Date.parse(s);if(!s||!Number.isFinite(ms)||ms>Date.now()+5*60*1000)throw new TelemetryValidationError('Invalid telemetry timestamp');return new Date(ms).toISOString();}
function type(value:unknown):TelemetryEventType{if(value==='POSITION'||value==='ODOMETER'||value==='HEARTBEAT')return value;throw new TelemetryValidationError('Invalid telemetry event type');}
function payload(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new TelemetryValidationError('Invalid telemetry payload');const item=value as Record<string,unknown>;if(['companyId','vehicleId','status','financialAccountId','amount'].some(key=>Object.prototype.hasOwnProperty.call(item,key)))throw new TelemetryValidationError('Protected telemetry payload');return item;}
function map(row:any):TelemetryEventSummary{return{id:String(row.id),trackerId:String(row.tracker_id),sourceEventId:String(row.source_event_id),eventType:String(row.event_type) as TelemetryEventType,occurredAt:new Date(row.occurred_at).toISOString(),receivedAt:new Date(row.received_at).toISOString(),status:String(row.status) as TelemetryEventStatus,quarantineReason:row.quarantine_reason===null?null:String(row.quarantine_reason)};}
function odometer(input:Record<string,unknown>):number|null{if(input.odometerKm===undefined)return null;const value=Number(input.odometerKm);if(!Number.isFinite(value)||value<0||value>9999999)throw new TelemetryValidationError('Invalid telemetry odometer');return Math.round(value*1000)/1000;}
function isoOrNull(value:unknown):string|null{return value===null||value===undefined?null:new Date(value as string|number|Date).toISOString();}
export function deriveTelemetryHealthStatus(trackerStatus:string,lastCommunicationAt:string|null,quarantinedLast24h:number,referenceNow=new Date()):TelemetryHealthStatus{if(trackerStatus!=='ACTIVE')return'INACTIVE';if(!lastCommunicationAt)return'NO_DATA';if(quarantinedLast24h>0)return'ATTENTION';const ageMs=referenceNow.getTime()-Date.parse(lastCommunicationAt);if(!Number.isFinite(ageMs)||ageMs<0)return'ATTENTION';if(ageMs<=2*60*60*1000)return'HEALTHY';if(ageMs<=24*60*60*1000)return'STALE';return'OFFLINE';}
export class TelemetryAuthorityService {
  static async ingest(actor:AuthenticatedPrincipal,input:IngestTelemetryEventInput):Promise<{item:TelemetryEventSummary;created:boolean}>{
    return await UnitOfWork.run(actor.companyId,async tx=>{
      const trackerId=text(input.trackerId,160),sourceEventId=text(input.sourceEventId,200),eventType=type(input.eventType),occurredAt=date(input.occurredAt),rawPayload=payload(input.payload);
      const tracker=await tx.getTrackerRepo().findByIdForCompanyWithLock(actor.companyId,trackerId);
      if(!tracker||tracker.status!=='ACTIVE')throw new TelemetryNotFoundError('Active tracker not found');
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Telemetry persistence unavailable');
      const existing=rows(await raw.execute(sql`SELECT id,tracker_id,source_event_id,event_type,occurred_at,received_at,status,quarantine_reason FROM tracker_telemetry_events WHERE company_id=${actor.companyId} AND tracker_id=${trackerId} AND source_event_id=${sourceEventId} LIMIT 1`))[0];
      if(existing)return{item:map(existing),created:false};
      const value=eventType==='ODOMETER'?odometer(rawPayload):null;
      let quarantineReason:string|null=null;
      if(eventType==='ODOMETER'&&value===null)throw new TelemetryValidationError('Odometer event requires odometerKm');
      if(typeof rawPayload.imei==='string'&&rawPayload.imei.replace(/\D/g,'')!==tracker.imei)quarantineReason='IMEI_MISMATCH';
      if(value!==null&&!quarantineReason){
        const previous=rows(await raw.execute(sql`SELECT raw_payload->>'odometerKm' AS odometer FROM tracker_telemetry_events WHERE company_id=${actor.companyId} AND tracker_id=${trackerId} AND event_type='ODOMETER' AND status='ACCEPTED' ORDER BY occurred_at DESC,id DESC LIMIT 1`))[0];
        if(previous?.odometer!==undefined&&previous.odometer!==null){const last=Number(previous.odometer);if(value<last)quarantineReason='ODOMETER_REGRESSION';else if(value-last>MAX_ODOMETER_DELTA_KM)quarantineReason='ODOMETER_ANOMALOUS_JUMP';}
      }
      const now=new Date().toISOString(),id=randomUUID(),status:TelemetryEventStatus=quarantineReason?'QUARANTINED':'ACCEPTED';
      const inserted=rows(await raw.execute(sql`INSERT INTO tracker_telemetry_events(id,company_id,tracker_id,source_event_id,event_type,occurred_at,received_at,status,quarantine_reason,raw_payload,created_by,created_at) VALUES(${id},${actor.companyId},${trackerId},${sourceEventId},${eventType},${occurredAt},${now},${status},${quarantineReason},${JSON.stringify(rawPayload)}::jsonb,${actor.userId},${now}) RETURNING id,tracker_id,source_event_id,event_type,occurred_at,received_at,status,quarantine_reason`))[0];
      await tx.getAuditLogRepo().create({id:randomUUID(),companyId:actor.companyId,entityName:'TrackerTelemetryEvent',entityId:id,action:AuditAction.CREATE,userId:actor.userId,userName:actor.name,timestamp:now,newState:JSON.stringify({trackerId,eventType,status,quarantineReason,sourceEventId})});
      return{item:map(inserted),created:true};
    });
  }
  static async list(companyId:string,trackerId:string,limit=50):Promise<TelemetryEventSummary[]>{
    return await UnitOfWork.run(companyId,async tx=>{const tracker=await tx.getTrackerRepo().findByIdForCompany(companyId,text(trackerId,160));if(!tracker)throw new TelemetryNotFoundError('Tracker not found');const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Telemetry persistence unavailable');const safeLimit=Number.isInteger(limit)&&limit>0&&limit<=100?limit:50;return rows(await raw.execute(sql`SELECT id,tracker_id,source_event_id,event_type,occurred_at,received_at,status,quarantine_reason FROM tracker_telemetry_events WHERE company_id=${companyId} AND tracker_id=${trackerId} ORDER BY received_at DESC,id DESC LIMIT ${safeLimit}`)).map(map);});
  }
  static async health(companyId:string,trackerId:string,referenceNow=new Date()):Promise<TelemetryHealthSummary>{
    return await UnitOfWork.run(companyId,async tx=>{
      const safeTrackerId=text(trackerId,160),tracker=await tx.getTrackerRepo().findByIdForCompany(companyId,safeTrackerId);if(!tracker)throw new TelemetryNotFoundError('Tracker not found');
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Telemetry persistence unavailable');
      const cutoff=new Date(referenceNow.getTime()-24*60*60*1000).toISOString();
      const row=rows(await raw.execute(sql`
        SELECT
          MAX(received_at) AS last_communication_at,
          MAX(received_at) FILTER (WHERE status='ACCEPTED') AS last_accepted_event_at,
          (SELECT event_type FROM tracker_telemetry_events e2 WHERE e2.company_id=${companyId} AND e2.tracker_id=${safeTrackerId} AND e2.status='ACCEPTED' ORDER BY e2.received_at DESC,e2.id DESC LIMIT 1) AS latest_accepted_event_type,
          (SELECT raw_payload->>'odometerKm' FROM tracker_telemetry_events e3 WHERE e3.company_id=${companyId} AND e3.tracker_id=${safeTrackerId} AND e3.status='ACCEPTED' AND e3.event_type='ODOMETER' ORDER BY e3.occurred_at DESC,e3.id DESC LIMIT 1) AS last_accepted_odometer,
          COUNT(*) FILTER (WHERE status='QUARANTINED' AND received_at>=${cutoff})::int AS quarantined_last_24h
        FROM tracker_telemetry_events
        WHERE company_id=${companyId} AND tracker_id=${safeTrackerId}
      `))[0]||{};
      const lastCommunicationAt=isoOrNull(row.last_communication_at),lastAcceptedEventAt=isoOrNull(row.last_accepted_event_at),quarantinedLast24h=Number(row.quarantined_last_24h||0);
      const rawOdometer=row.last_accepted_odometer,lastAcceptedOdometerKm=rawOdometer===null||rawOdometer===undefined?null:Number(rawOdometer);
      if(lastAcceptedOdometerKm!==null&&(!Number.isFinite(lastAcceptedOdometerKm)||lastAcceptedOdometerKm<0))throw new Error('Invalid persisted telemetry odometer');
      const latestAcceptedEventType=row.latest_accepted_event_type===null||row.latest_accepted_event_type===undefined?null:type(String(row.latest_accepted_event_type));
      return{trackerId:safeTrackerId,healthStatus:deriveTelemetryHealthStatus(String(tracker.status),lastCommunicationAt,quarantinedLast24h,referenceNow),lastCommunicationAt,lastAcceptedEventAt,latestAcceptedEventType,lastAcceptedOdometerKm,quarantinedLast24h};
    });
  }
}