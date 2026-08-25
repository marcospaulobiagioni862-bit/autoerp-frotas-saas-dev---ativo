import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export type TelemetryEventType='POSITION'|'ODOMETER'|'HEARTBEAT';
export type TelemetryEventStatus='ACCEPTED'|'QUARANTINED';
export interface TelemetryEventSummary { id:string; trackerId:string; sourceEventId:string; eventType:TelemetryEventType; occurredAt:string; receivedAt:string; status:TelemetryEventStatus; quarantineReason:string|null; }
export interface IngestTelemetryEventInput { trackerId:string; sourceEventId:string; eventType:TelemetryEventType; occurredAt:string; payload:Record<string,unknown>; }
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
}