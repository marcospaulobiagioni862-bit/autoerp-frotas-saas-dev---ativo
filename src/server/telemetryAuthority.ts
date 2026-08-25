import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export type TelemetryEventType='POSITION'|'ODOMETER'|'HEARTBEAT';
export type TelemetryEventStatus='ACCEPTED'|'QUARANTINED';
export type TelemetryReviewStatus='PENDING'|'ACKNOWLEDGED'|'DISMISSED';
export type TelemetryReviewDecision='ACKNOWLEDGED'|'DISMISSED';
export type TelemetryHealthStatus='NO_DATA'|'HEALTHY'|'STALE'|'OFFLINE'|'ATTENTION'|'INACTIVE';
export interface TelemetryEventSummary {
  id:string;
  trackerId:string;
  sourceEventId:string;
  eventType:TelemetryEventType;
  occurredAt:string;
  receivedAt:string;
  status:TelemetryEventStatus;
  quarantineReason:string|null;
  reviewStatus:TelemetryReviewStatus|null;
  reviewReason:string|null;
  reviewedAt:string|null;
}
export interface IngestTelemetryEventInput { trackerId:string; sourceEventId:string; eventType:TelemetryEventType; occurredAt:string; payload:Record<string,unknown>; }
export interface ReviewTelemetryEventInput { decision:TelemetryReviewDecision; reason:string; }
export interface TelemetryHealthSummary { trackerId:string;healthStatus:TelemetryHealthStatus;lastCommunicationAt:string|null;lastAcceptedEventAt:string|null;latestAcceptedEventType:TelemetryEventType|null;lastAcceptedOdometerKm:number|null;quarantinedLast24h:number; }
export interface TelemetryObservabilitySummary { trackerId:string;retentionDays:number;generatedAt:string;retentionCutoffAt:string;totalEvents:number;acceptedEvents:number;quarantinedEvents:number;pendingReviewEvents:number;retentionEligibleEvents:number;oldestReceivedAt:string|null;newestReceivedAt:string|null; }
export class TelemetryValidationError extends Error {}
export class TelemetryNotFoundError extends Error {}
export class TelemetryConflictError extends Error {}
const MAX_ODOMETER_DELTA_KM=1000;
const DEFAULT_TELEMETRY_RETENTION_DAYS=90;
export function resolveTelemetryRetentionDays(value:unknown):number{const parsed=typeof value==='string'&&value.trim()!==''?Number(value):Number.NaN;return Number.isInteger(parsed)&&parsed>=30&&parsed<=3650?parsed:DEFAULT_TELEMETRY_RETENTION_DAYS;}
function safeCount(value:unknown):number{const parsed=Number(value??0);if(!Number.isInteger(parsed)||parsed<0)throw new Error('Invalid telemetry aggregate');return parsed;}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function text(value:unknown,max:number):string{const s=typeof value==='string'?value.trim():'';if(!s||s.length>max)throw new TelemetryValidationError('Invalid telemetry field');return s;}
function reviewReason(value:unknown):string{const result=text(value,500);if(result.length<3)throw new TelemetryValidationError('Invalid review reason');return result;}
function date(value:unknown):string{const s=typeof value==='string'?value.trim():'';const ms=Date.parse(s);if(!s||!Number.isFinite(ms)||ms>Date.now()+5*60*1000)throw new TelemetryValidationError('Invalid telemetry timestamp');return new Date(ms).toISOString();}
function type(value:unknown):TelemetryEventType{if(value==='POSITION'||value==='ODOMETER'||value==='HEARTBEAT')return value;throw new TelemetryValidationError('Invalid telemetry event type');}
function decision(value:unknown):TelemetryReviewDecision{if(value==='ACKNOWLEDGED'||value==='DISMISSED')return value;throw new TelemetryValidationError('Invalid telemetry review decision');}
function payload(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new TelemetryValidationError('Invalid telemetry payload');const item=value as Record<string,unknown>;if(['companyId','vehicleId','status','financialAccountId','amount'].some(key=>Object.prototype.hasOwnProperty.call(item,key)))throw new TelemetryValidationError('Protected telemetry payload');return item;}
function isoOrNull(value:unknown):string|null{return value===null||value===undefined?null:new Date(value as string|number|Date).toISOString();}
function map(row:any):TelemetryEventSummary{return{
  id:String(row.id),
  trackerId:String(row.tracker_id),
  sourceEventId:String(row.source_event_id),
  eventType:String(row.event_type) as TelemetryEventType,
  occurredAt:new Date(row.occurred_at).toISOString(),
  receivedAt:new Date(row.received_at).toISOString(),
  status:String(row.status) as TelemetryEventStatus,
  quarantineReason:row.quarantine_reason===null?null:String(row.quarantine_reason),
  reviewStatus:row.review_status===null?null:String(row.review_status) as TelemetryReviewStatus,
  reviewReason:row.review_reason===null?null:String(row.review_reason),
  reviewedAt:isoOrNull(row.reviewed_at),
};}
function odometer(input:Record<string,unknown>):number|null{if(input.odometerKm===undefined)return null;const value=Number(input.odometerKm);if(!Number.isFinite(value)||value<0||value>9999999)throw new TelemetryValidationError('Invalid telemetry odometer');return Math.round(value*1000)/1000;}
export function deriveTelemetryHealthStatus(trackerStatus:string,lastCommunicationAt:string|null,quarantinedLast24h:number,referenceNow=new Date()):TelemetryHealthStatus{if(trackerStatus!=='ACTIVE')return'INACTIVE';if(!lastCommunicationAt)return'NO_DATA';if(quarantinedLast24h>0)return'ATTENTION';const ageMs=referenceNow.getTime()-Date.parse(lastCommunicationAt);if(!Number.isFinite(ageMs)||ageMs<0)return'ATTENTION';if(ageMs<=2*60*60*1000)return'HEALTHY';if(ageMs<=24*60*60*1000)return'STALE';return'OFFLINE';}
const summaryColumns=sql`id,tracker_id,source_event_id,event_type,occurred_at,received_at,status,quarantine_reason,review_status,review_reason,reviewed_at`;
export class TelemetryAuthorityService {
  static async ingest(actor:AuthenticatedPrincipal,input:IngestTelemetryEventInput):Promise<{item:TelemetryEventSummary;created:boolean}>{
    return await UnitOfWork.run(actor.companyId,async tx=>{
      const trackerId=text(input.trackerId,160),sourceEventId=text(input.sourceEventId,200),eventType=type(input.eventType),occurredAt=date(input.occurredAt),rawPayload=payload(input.payload);
      const tracker=await tx.getTrackerRepo().findByIdForCompanyWithLock(actor.companyId,trackerId);
      if(!tracker||tracker.status!=='ACTIVE')throw new TelemetryNotFoundError('Active tracker not found');
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Telemetry persistence unavailable');
      const existing=rows(await raw.execute(sql`SELECT ${summaryColumns} FROM tracker_telemetry_events WHERE company_id=${actor.companyId} AND tracker_id=${trackerId} AND source_event_id=${sourceEventId} LIMIT 1`))[0];
      if(existing)return{item:map(existing),created:false};
      const value=eventType==='ODOMETER'?odometer(rawPayload):null;
      let quarantineReason:string|null=null;
      if(eventType==='ODOMETER'&&value===null)throw new TelemetryValidationError('Odometer event requires odometerKm');
      if(typeof rawPayload.imei==='string'&&rawPayload.imei.replace(/\D/g,'')!==tracker.imei)quarantineReason='IMEI_MISMATCH';
      if(value!==null&&!quarantineReason){
        const previous=rows(await raw.execute(sql`SELECT raw_payload->>'odometerKm' AS odometer FROM tracker_telemetry_events WHERE company_id=${actor.companyId} AND tracker_id=${trackerId} AND event_type='ODOMETER' AND status='ACCEPTED' ORDER BY occurred_at DESC,id DESC LIMIT 1`))[0];
        if(previous?.odometer!==undefined&&previous.odometer!==null){const last=Number(previous.odometer);if(value<last)quarantineReason='ODOMETER_REGRESSION';else if(value-last>MAX_ODOMETER_DELTA_KM)quarantineReason='ODOMETER_ANOMALOUS_JUMP';}
      }
      const now=new Date().toISOString(),id=randomUUID(),status:TelemetryEventStatus=quarantineReason?'QUARANTINED':'ACCEPTED',reviewStatus=status==='QUARANTINED'?'PENDING':null;
      const inserted=rows(await raw.execute(sql`INSERT INTO tracker_telemetry_events(id,company_id,tracker_id,source_event_id,event_type,occurred_at,received_at,status,quarantine_reason,review_status,raw_payload,created_by,created_at) VALUES(${id},${actor.companyId},${trackerId},${sourceEventId},${eventType},${occurredAt},${now},${status},${quarantineReason},${reviewStatus},${JSON.stringify(rawPayload)}::jsonb,${actor.userId},${now}) RETURNING ${summaryColumns}`))[0];
      await tx.getAuditLogRepo().create({id:randomUUID(),companyId:actor.companyId,entityName:'TrackerTelemetryEvent',entityId:id,action:AuditAction.CREATE,userId:actor.userId,userName:actor.name,timestamp:now,newState:JSON.stringify({trackerId,eventType,status,quarantineReason,sourceEventId})});
      return{item:map(inserted),created:true};
    });
  }
  static async list(companyId:string,trackerId:string,limit=50):Promise<TelemetryEventSummary[]>{
    return await UnitOfWork.run(companyId,async tx=>{const safeTrackerId=text(trackerId,160),tracker=await tx.getTrackerRepo().findByIdForCompany(companyId,safeTrackerId);if(!tracker)throw new TelemetryNotFoundError('Tracker not found');const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Telemetry persistence unavailable');const safeLimit=Number.isInteger(limit)&&limit>0&&limit<=100?limit:50;return rows(await raw.execute(sql`SELECT ${summaryColumns} FROM tracker_telemetry_events WHERE company_id=${companyId} AND tracker_id=${safeTrackerId} ORDER BY received_at DESC,id DESC LIMIT ${safeLimit}`)).map(map);});
  }
  static async review(actor:AuthenticatedPrincipal,trackerId:string,eventId:string,input:ReviewTelemetryEventInput):Promise<{item:TelemetryEventSummary;changed:boolean}>{
    return await UnitOfWork.run(actor.companyId,async tx=>{
      const safeTrackerId=text(trackerId,160),safeEventId=text(eventId,160),safeDecision=decision(input.decision),safeReason=reviewReason(input.reason);
      const tracker=await tx.getTrackerRepo().findByIdForCompany(actor.companyId,safeTrackerId);if(!tracker)throw new TelemetryNotFoundError('Tracker not found');
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Telemetry persistence unavailable');
      const current=rows(await raw.execute(sql`SELECT ${summaryColumns} FROM tracker_telemetry_events WHERE company_id=${actor.companyId} AND tracker_id=${safeTrackerId} AND id=${safeEventId} FOR UPDATE`))[0];
      if(!current||current.status!=='QUARANTINED')throw new TelemetryNotFoundError('Quarantined event not found');
      if(current.review_status!=='PENDING'){
        if(current.review_status===safeDecision&&current.review_reason===safeReason)return{item:map(current),changed:false};
        throw new TelemetryConflictError('Telemetry event already reviewed');
      }
      const now=new Date().toISOString();
      const updated=rows(await raw.execute(sql`UPDATE tracker_telemetry_events SET review_status=${safeDecision},review_reason=${safeReason},reviewed_by=${actor.userId},reviewed_at=${now} WHERE company_id=${actor.companyId} AND tracker_id=${safeTrackerId} AND id=${safeEventId} AND status='QUARANTINED' AND review_status='PENDING' RETURNING ${summaryColumns}`))[0];
      if(!updated)throw new TelemetryConflictError('Telemetry review conflict');
      await tx.getAuditLogRepo().create({id:randomUUID(),companyId:actor.companyId,entityName:'TrackerTelemetryEvent',entityId:safeEventId,action:AuditAction.UPDATE,userId:actor.userId,userName:actor.name,timestamp:now,previousState:JSON.stringify({reviewStatus:'PENDING'}),newState:JSON.stringify({trackerId:safeTrackerId,reviewStatus:safeDecision,reviewReason:safeReason})});
      return{item:map(updated),changed:true};
    });
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
  static async observability(companyId:string,trackerId:string,referenceNow=new Date(),rawRetentionDays=process.env.TELEMETRY_RETENTION_DAYS):Promise<TelemetryObservabilitySummary>{
    return await UnitOfWork.run(companyId,async tx=>{
      const safeTrackerId=text(trackerId,160),tracker=await tx.getTrackerRepo().findByIdForCompany(companyId,safeTrackerId);if(!tracker)throw new TelemetryNotFoundError('Tracker not found');
      const raw=tx.getRawTransaction?.();if(!raw)throw new Error('Telemetry persistence unavailable');
      const retentionDays=resolveTelemetryRetentionDays(rawRetentionDays),generatedAt=referenceNow.toISOString(),retentionCutoffAt=new Date(referenceNow.getTime()-retentionDays*24*60*60*1000).toISOString();
      const row=rows(await raw.execute(sql`
        SELECT
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE status='ACCEPTED')::int AS accepted_events,
          COUNT(*) FILTER (WHERE status='QUARANTINED')::int AS quarantined_events,
          COUNT(*) FILTER (WHERE status='QUARANTINED' AND review_status='PENDING')::int AS pending_review_events,
          COUNT(*) FILTER (WHERE received_at<${retentionCutoffAt})::int AS retention_eligible_events,
          MIN(received_at) AS oldest_received_at,
          MAX(received_at) AS newest_received_at
        FROM tracker_telemetry_events
        WHERE company_id=${companyId} AND tracker_id=${safeTrackerId}
      `))[0]||{};
      const totalEvents=safeCount(row.total_events),acceptedEvents=safeCount(row.accepted_events),quarantinedEvents=safeCount(row.quarantined_events),pendingReviewEvents=safeCount(row.pending_review_events),retentionEligibleEvents=safeCount(row.retention_eligible_events);
      if(acceptedEvents+quarantinedEvents!==totalEvents||pendingReviewEvents>quarantinedEvents||retentionEligibleEvents>totalEvents)throw new Error('Inconsistent telemetry aggregate');
      return{trackerId:safeTrackerId,retentionDays,generatedAt,retentionCutoffAt,totalEvents,acceptedEvents,quarantinedEvents,pendingReviewEvents,retentionEligibleEvents,oldestReceivedAt:isoOrNull(row.oldest_received_at),newestReceivedAt:isoOrNull(row.newest_received_at)};
    });
  }

}
