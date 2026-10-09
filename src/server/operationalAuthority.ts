import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import type {
  Task, TaskCategory, TaskEntityType, TaskPriority, TaskSeverity, TaskSourceType, TaskStatus,
} from '../domain/workflow/types';
import type {
  CreateIncidentParams, IncidentCategory, IncidentPriority, IncidentSeverity, IncidentSource,
  IncidentStatus, ProductionIncident,
} from '../domain/incident-management/types';
import type {
  ExecutiveOperationsSnapshot, OperationalBottleneckItem, OperationalKPIs, OperationalRecommendation,
  OperationalRiskItem, OperationalRiskScore, PriorityActionItem,
} from '../domain/operations/types';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export class OperationalValidationError extends Error {}
export class OperationalNotFoundError extends Error {}
export class OperationalForbiddenError extends Error {}
export class OperationalConflictError extends Error {}

export interface CreateOperationalTaskInput {
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  severity: TaskSeverity;
  sourceType: TaskSourceType;
  sourceId: string;
  entityType: TaskEntityType;
  entityId: string;
  assignedUserId?: string;
  assignedTeam?: string;
  dueAt?: string;
}

export interface TaskEventInput {
  type: 'COMMENT' | 'DOCUMENT' | 'IMAGE' | 'PDF' | 'NOTE';
  content: string;
  url?: string;
}

export interface CreateOperationalIncidentInput extends Omit<CreateIncidentParams, 'companyId' | 'reportedBy' | 'idempotencyKey' | 'correlationId'> {
  fingerprint?: string;
}

export interface IncidentTransitionInput {
  status: IncidentStatus;
  comment?: string;
  rootCause?: string;
  resolutionSummary?: string;
}

export interface TaskTransitionInput {
  status: TaskStatus;
  reason?: string;
  assignedUserId?: string;
}

const READ_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const TASK_CATEGORIES = new Set<TaskCategory>(['DOCUMENT','INSURANCE','TRACKER','MAINTENANCE','FINE','CONTRACT','RETURN','INCIDENT','DATA_QUALITY','CLOSING_DAILY','CLOSING_MONTHLY','SLA','OPERATIONAL_GENERAL']);
const TASK_PRIORITIES = new Set<TaskPriority>(['P0','P1','P2','P3']);
const TASK_SEVERITIES = new Set<TaskSeverity>(['CRITICAL','HIGH','MEDIUM','LOW']);
const TASK_SOURCES = new Set<TaskSourceType>(['VEHICLE_DOCUMENT','DRIVER_DOCUMENT','INSURANCE','TRACKER','MAINTENANCE','TRAFFIC_TICKET','CONTRACT','VEHICLE','DRIVER','INCIDENT','DATA_QUALITY_ISSUE','ALERT','DAILY_CLOSING','MONTHLY_CLOSING','MANUAL']);
const TASK_ENTITIES = new Set<TaskEntityType>(['VEHICLE','DRIVER','CONTRACT','MAINTENANCE','TRAFFIC_TICKET','DOCUMENT','INSURANCE','TRACKER','INCIDENT','DATA_QUALITY','SYSTEM']);
const TASK_STATUSES = new Set<TaskStatus>(['OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','WAITING_VALIDATION','COMPLETED','CLOSED','CANCELLED','REOPENED']);
const INCIDENT_SEVERITIES = new Set<IncidentSeverity>(['SEV0','SEV1','SEV2','SEV3','SEV4']);
const INCIDENT_PRIORITIES = new Set<IncidentPriority>(['P0','P1','P2','P3']);
const INCIDENT_STATUSES = new Set<IncidentStatus>(['DETECTED','TRIAGED','ACKNOWLEDGED','INVESTIGATING','CONTAINING','MITIGATED','RESOLVED','VALIDATING','CLOSED','ESCALATED','REOPENED','CANCELLED']);
const INCIDENT_SOURCES = new Set<IncidentSource>(['OBSERVABILITY','MANUAL','SYSTEM_HEALTH','BACKUP_SERVICE','OPERATIONAL_ALERT','GOVERNANCE','SECURITY']);
const INCIDENT_CATEGORIES = new Set<IncidentCategory>(['SYSTEM_OUTAGE','DATA_CORRUPTION','SECURITY_BREACH','PERFORMANCE_DEGRADATION','INTEGRATION_FAILURE','OPERATIONAL_ERROR','INFRASTRUCTURE','FINANCIAL_ATTEMPT_BLOCKED']);

const TASK_TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  OPEN: new Set(['ASSIGNED','IN_PROGRESS','CANCELLED']),
  ASSIGNED: new Set(['IN_PROGRESS','BLOCKED','CANCELLED']),
  IN_PROGRESS: new Set(['BLOCKED','WAITING_VALIDATION','COMPLETED','CANCELLED']),
  BLOCKED: new Set(['IN_PROGRESS','CANCELLED']),
  WAITING_VALIDATION: new Set(['IN_PROGRESS','COMPLETED','CANCELLED']),
  COMPLETED: new Set(['CLOSED','REOPENED']),
  CLOSED: new Set(['REOPENED']),
  CANCELLED: new Set(['REOPENED']),
  REOPENED: new Set(['ASSIGNED','IN_PROGRESS','BLOCKED','CANCELLED']),
};
const INCIDENT_TRANSITIONS: Record<IncidentStatus, ReadonlySet<IncidentStatus>> = {
  DETECTED: new Set(['TRIAGED','ACKNOWLEDGED','ESCALATED','CANCELLED']),
  TRIAGED: new Set(['ACKNOWLEDGED','INVESTIGATING','ESCALATED','CANCELLED']),
  ACKNOWLEDGED: new Set(['INVESTIGATING','CONTAINING','ESCALATED','CANCELLED']),
  INVESTIGATING: new Set(['CONTAINING','MITIGATED','RESOLVED','ESCALATED']),
  CONTAINING: new Set(['MITIGATED','RESOLVED','ESCALATED']),
  MITIGATED: new Set(['VALIDATING','RESOLVED','REOPENED']),
  RESOLVED: new Set(['VALIDATING','CLOSED','REOPENED']),
  VALIDATING: new Set(['CLOSED','REOPENED']),
  ESCALATED: new Set(['INVESTIGATING','CONTAINING','RESOLVED']),
  CLOSED: new Set(['REOPENED']),
  REOPENED: new Set(['INVESTIGATING','CONTAINING','ESCALATED']),
  CANCELLED: new Set(['REOPENED']),
};

function resultRows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }
function nonEmpty(value: unknown, field: string, max = 4000): string {
  const item = typeof value === 'string' ? value.trim() : '';
  if (!item || item.length > max) throw new OperationalValidationError(`Invalid ${field}`);
  return item;
}
function optional(value: unknown, max = 4000): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const item = String(value).trim();
  if (!item || item.length > max) throw new OperationalValidationError('Invalid optional value');
  return item;
}
function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value || '');
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text;
}
function nullableIso(value: unknown): string | undefined { return value ? iso(value) : undefined; }
function parseJson(value: unknown): any {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return null; } }
  return value ?? null;
}
function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function fingerprint(input: CreateOperationalIncidentInput): string {
  if (input.fingerprint) return nonEmpty(input.fingerprint, 'fingerprint', 300).toLowerCase();
  return createHash('sha256').update([
    input.category, input.severity, input.affectedModule || '', input.affectedEntityType || '', input.affectedEntityId || '', input.title.trim().toLowerCase(),
  ].join('|')).digest('hex');
}
function assertRead(principal: AuthenticatedPrincipal): void {
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!principal.userId || !principal.companyId || (!READ_ROLES.has(role) && !permissions.includes('*') && !permissions.includes('OPERATIONS_READ'))) {
    throw new OperationalForbiddenError('Acesso negado: operações sem permissão de leitura');
  }
}
function assertWrite(principal: AuthenticatedPrincipal): void {
  assertRead(principal);
  const role = String(principal.role || '').toUpperCase();
  if (role === 'ADMIN') return;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!permissions.includes('*') && !permissions.includes('OPERATIONS_WRITE')) {
    throw new OperationalForbiddenError('Acesso negado: operações sem permissão de escrita');
  }
}
function requireIdempotencyKey(value: string): string {
  const key = nonEmpty(value, 'idempotency key', 200);
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new OperationalValidationError('Invalid idempotency key');
  return key;
}
async function idempotent<T>(rawTx: any, principal: AuthenticatedPrincipal, keyValue: string, operation: string, request: unknown, execute: () => Promise<T>, resource: (value: T) => { type?: string; id?: string } = () => ({})): Promise<T> {
  const key = requireIdempotencyKey(keyValue);
  const hash = requestHash(request);
  const claim = await rawTx.execute(sql`
    INSERT INTO operational_command_idempotency(company_id,idempotency_key,operation,request_hash,created_by_user_id)
    VALUES (${principal.companyId},${key},${operation},${hash},${principal.userId})
    ON CONFLICT (company_id,idempotency_key) DO NOTHING
    RETURNING idempotency_key
  `);
  if (resultRows(claim).length === 0) {
    const existingResult = await rawTx.execute(sql`
      SELECT operation,request_hash,response_json FROM operational_command_idempotency
      WHERE company_id=${principal.companyId} AND idempotency_key=${key} LIMIT 1
    `);
    const existing = resultRows(existingResult)[0];
    if (!existing || String(existing.operation) !== operation || String(existing.request_hash) !== hash) {
      throw new OperationalConflictError('Idempotency key reused with another command');
    }
    const stored = parseJson(existing.response_json);
    if (stored === null) throw new OperationalConflictError('Idempotent command has no committed response');
    return stored as T;
  }
  const value = await execute();
  const resourceInfo = resource(value);
  await rawTx.execute(sql`
    UPDATE operational_command_idempotency
       SET response_json=CAST(${JSON.stringify(value)} AS jsonb),resource_type=${resourceInfo.type || null},resource_id=${resourceInfo.id || null}
     WHERE company_id=${principal.companyId} AND idempotency_key=${key}
  `);
  return value;
}
async function audit(tx: any, principal: AuthenticatedPrincipal, action: AuditAction, entityName: string, entityId: string, before: unknown, after: unknown): Promise<void> {
  await tx.getAuditLogRepo().create({
    id: randomUUID(), companyId: principal.companyId, entityName, entityId, action,
    previousState: before ? JSON.stringify(before) : undefined, newState: JSON.stringify(after),
    userId: principal.userId, userName: principal.name, timestamp: new Date().toISOString(),
  });
}

function taskFromRow(row: any, evidences: Task['evidences'] = []): Task {
  return {
    id:String(row.id),companyId:String(row.company_id),title:String(row.title),description:String(row.description),
    category:String(row.category) as TaskCategory,priority:String(row.priority) as TaskPriority,severity:String(row.severity) as TaskSeverity,status:String(row.status) as TaskStatus,
    sourceType:String(row.source_type) as TaskSourceType,sourceId:String(row.source_id),entityType:String(row.entity_type) as TaskEntityType,entityId:String(row.entity_id),
    assignedUserId:row.assigned_user_id?String(row.assigned_user_id):undefined,assignedTeam:row.assigned_team?String(row.assigned_team):undefined,
    createdBy:String(row.created_by_name || row.created_by_user_id),createdAt:iso(row.created_at),startedAt:nullableIso(row.started_at),dueAt:iso(row.due_at),
    completedAt:nullableIso(row.completed_at),validatedAt:nullableIso(row.validated_at),validatorUserId:row.validator_user_id?String(row.validator_user_id):undefined,
    correlationId:String(row.correlation_id),evidences,resolution:row.resolution?String(row.resolution):undefined,blockedReason:row.blocked_reason?String(row.blocked_reason):undefined,
    updatedAt:iso(row.updated_at),idempotencyKey:String(row.idempotency_key),
  };
}
function incidentFromRow(row: any): ProductionIncident {
  return {
    id:String(row.id),companyId:String(row.company_id),correlationId:String(row.correlation_id),title:String(row.title),description:String(row.description),
    severity:String(row.severity) as IncidentSeverity,priority:String(row.priority) as IncidentPriority,status:String(row.status) as IncidentStatus,
    source:String(row.source) as IncidentSource,category:String(row.category) as IncidentCategory,detectedAt:iso(row.detected_at),
    acknowledgedAt:nullableIso(row.acknowledged_at),containedAt:nullableIso(row.contained_at),resolvedAt:nullableIso(row.resolved_at),closedAt:nullableIso(row.closed_at),
    reportedBy:String(row.reported_by_name || row.reported_by_user_id),assignedTo:row.assigned_to?String(row.assigned_to):undefined,
    commanderId:row.commander_id?String(row.commander_id):undefined,technicalLeadId:row.technical_lead_id?String(row.technical_lead_id):undefined,
    operationsLeadId:row.operations_lead_id?String(row.operations_lead_id):undefined,communicationsLeadId:row.communications_lead_id?String(row.communications_lead_id):undefined,
    affectedModule:row.affected_module?String(row.affected_module):undefined,affectedEntityType:row.affected_entity_type?String(row.affected_entity_type):undefined,
    affectedEntityId:row.affected_entity_id?String(row.affected_entity_id):undefined,impactDescription:String(row.impact_description),
    slaDeadline:nullableIso(row.sla_deadline),slaStatus:String(row.sla_status) as ProductionIncident['slaStatus'],rootCause:row.root_cause?String(row.root_cause):undefined,
    resolutionSummary:row.resolution_summary?String(row.resolution_summary):undefined,idempotencyKey:String(row.idempotency_key),incidentFingerprint:String(row.incident_fingerprint),
    createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),
  };
}
async function findTaskForUpdate(rawTx:any,companyId:string,id:string):Promise<any>{
  const result=await rawTx.execute(sql`SELECT * FROM operational_tasks WHERE company_id=${companyId} AND id=${id} FOR UPDATE`);
  const row=resultRows(result)[0];if(!row)throw new OperationalNotFoundError('Task not found');return row;
}
async function findIncidentForUpdate(rawTx:any,companyId:string,id:string):Promise<any>{
  const result=await rawTx.execute(sql`SELECT * FROM operational_incidents WHERE company_id=${companyId} AND id=${id} FOR UPDATE`);
  const row=resultRows(result)[0];if(!row)throw new OperationalNotFoundError('Incident not found');return row;
}
async function transitionTaskRaw(tx:any,rawTx:any,principal:AuthenticatedPrincipal,id:string,input:TaskTransitionInput):Promise<Task>{
  if(!TASK_STATUSES.has(input.status))throw new OperationalValidationError('Invalid task status');
  const beforeRow=await findTaskForUpdate(rawTx,principal.companyId,id);const before=taskFromRow(beforeRow);const current=before.status;
  if(current===input.status)return before;if(!TASK_TRANSITIONS[current]?.has(input.status))throw new OperationalConflictError(`Invalid task transition ${current} -> ${input.status}`);
  const now=new Date().toISOString();const startedAt=input.status==='IN_PROGRESS'&&!before.startedAt?now:before.startedAt;
  const completedAt=input.status==='COMPLETED'?now:(input.status==='REOPENED'?undefined:before.completedAt);
  const blockedReason=input.status==='BLOCKED'?nonEmpty(input.reason,'blocked reason',2000):undefined;
  const assignedUserId=input.assignedUserId||before.assignedUserId;
  const result=await rawTx.execute(sql`
    UPDATE operational_tasks SET status=${input.status},assigned_user_id=${assignedUserId || null},started_at=${startedAt || null},completed_at=${completedAt || null},
      blocked_reason=${blockedReason || null},resolution=${input.status==='COMPLETED'?optional(input.reason,4000)||before.resolution||null:before.resolution||null},
      version=version+1,updated_at=${now}
    WHERE company_id=${principal.companyId} AND id=${id} RETURNING *
  `);const after=taskFromRow(resultRows(result)[0]);
  await rawTx.execute(sql`INSERT INTO operational_task_events(id,company_id,task_id,event_type,content,metadata,actor_user_id,actor_name,created_at)
    VALUES(${randomUUID()},${principal.companyId},${id},'STATUS',${input.reason||`${current} -> ${input.status}`},CAST(${JSON.stringify({fromStatus:current,toStatus:input.status})} AS jsonb),${principal.userId},${principal.name},${now})`);
  await audit(tx,principal,AuditAction.UPDATE,'OperationalTask',id,before,after);return after;
}
async function transitionIncidentRaw(tx:any,rawTx:any,principal:AuthenticatedPrincipal,id:string,input:IncidentTransitionInput):Promise<ProductionIncident>{
  if(!INCIDENT_STATUSES.has(input.status))throw new OperationalValidationError('Invalid incident status');
  const beforeRow=await findIncidentForUpdate(rawTx,principal.companyId,id);const before=incidentFromRow(beforeRow);const current=before.status;
  if(current===input.status)return before;if(!INCIDENT_TRANSITIONS[current]?.has(input.status))throw new OperationalConflictError(`Invalid incident transition ${current} -> ${input.status}`);
  const now=new Date().toISOString();
  const ack=input.status==='ACKNOWLEDGED'&&!before.acknowledgedAt?now:before.acknowledgedAt;
  const contained=(input.status==='CONTAINING'||input.status==='MITIGATED')&&!before.containedAt?now:before.containedAt;
  const resolved=input.status==='RESOLVED'?now:(input.status==='REOPENED'?undefined:before.resolvedAt);
  const closed=input.status==='CLOSED'?now:(input.status==='REOPENED'?undefined:before.closedAt);
  const result=await rawTx.execute(sql`UPDATE operational_incidents SET status=${input.status},acknowledged_at=${ack||null},contained_at=${contained||null},resolved_at=${resolved||null},closed_at=${closed||null},
    root_cause=${input.rootCause||before.rootCause||null},resolution_summary=${input.resolutionSummary||before.resolutionSummary||null},version=version+1,updated_at=${now}
    WHERE company_id=${principal.companyId} AND id=${id} RETURNING *`);
  const after=incidentFromRow(resultRows(result)[0]);
  await rawTx.execute(sql`INSERT INTO operational_incident_actions(id,company_id,incident_id,action,from_status,to_status,comment,correlation_id,metadata,actor_user_id,actor_name,created_at)
    VALUES(${randomUUID()},${principal.companyId},${id},'STATUS_TRANSITION',${current},${input.status},${input.comment||null},${after.correlationId},CAST(${JSON.stringify({rootCause:input.rootCause,resolutionSummary:input.resolutionSummary})} AS jsonb),${principal.userId},${principal.name},${now})`);
  await audit(tx,principal,AuditAction.UPDATE,'OperationalIncident',id,before,after);return after;
}

function riskLevel(score:number):OperationalRiskScore['level']{return score>=80?'CRÍTICO':score>=60?'ALTO RISCO':score>=40?'ATENÇÃO':score>=20?'BOM':'EXCELENTE';}
function countBy(rows:any[],value:string):number{return Number(rows.find(row=>String(row.status)===value)?.count||0);}

export class OperationalAuthorityService {
  static async listTasks(principal:AuthenticatedPrincipal,filters:{status?:TaskStatus;priority?:TaskPriority;search?:string}={}):Promise<Task[]>{
    assertRead(principal);return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();
      const result=await raw.execute(sql`SELECT * FROM operational_tasks WHERE company_id=${principal.companyId}
        AND (${filters.status||null}::text IS NULL OR status=${filters.status||null}) AND (${filters.priority||null}::text IS NULL OR priority=${filters.priority||null})
        AND (${filters.search?.trim()||null}::text IS NULL OR title ILIKE ${filters.search?`%${filters.search.trim()}%`:null} OR description ILIKE ${filters.search?`%${filters.search.trim()}%`:null})
        ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,due_at,id`);
      return resultRows(result).map(row=>taskFromRow(row));
    });
  }
  static async createTask(principal:AuthenticatedPrincipal,input:CreateOperationalTaskInput,key:string):Promise<Task>{
    assertWrite(principal);const title=nonEmpty(input.title,'title',300),description=nonEmpty(input.description,'description',4000);
    if(!TASK_CATEGORIES.has(input.category)||!TASK_PRIORITIES.has(input.priority)||!TASK_SEVERITIES.has(input.severity)||!TASK_SOURCES.has(input.sourceType)||!TASK_ENTITIES.has(input.entityType))throw new OperationalValidationError('Invalid task classification');
    const sourceId=nonEmpty(input.sourceId,'sourceId',300),entityId=nonEmpty(input.entityId,'entityId',300);const dueAt=input.dueAt?iso(input.dueAt):new Date(Date.now()+24*60*60*1000).toISOString();if(new Date(dueAt).getTime()<Date.now()-1000)throw new OperationalValidationError('Task due date is in the past');
    return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();return await idempotent(raw,principal,key,'CREATE_TASK',{...input,title,description,sourceId,entityId,dueAt},async()=>{
      const now=new Date().toISOString(),id=randomUUID(),correlationId=randomUUID();const result=await raw.execute(sql`INSERT INTO operational_tasks(
        id,company_id,title,description,category,priority,severity,status,source_type,source_id,entity_type,entity_id,assigned_user_id,assigned_team,created_by_user_id,created_by_name,due_at,correlation_id,idempotency_key,created_at,updated_at)
        VALUES(${id},${principal.companyId},${title},${description},${input.category},${input.priority},${input.severity},${input.assignedUserId?'ASSIGNED':'OPEN'},${input.sourceType},${sourceId},${input.entityType},${entityId},${input.assignedUserId||null},${input.assignedTeam||null},${principal.userId},${principal.name},${dueAt},${correlationId},${key},${now},${now}) RETURNING *`);
      const task=taskFromRow(resultRows(result)[0]);await audit(tx,principal,AuditAction.CREATE,'OperationalTask',id,null,task);return task;
    },value=>({type:'TASK',id:value.id}));});
  }
  static async transitionTask(principal:AuthenticatedPrincipal,id:string,input:TaskTransitionInput,key:string):Promise<Task>{
    assertWrite(principal);nonEmpty(id,'task id',200);return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();return await idempotent(raw,principal,key,'TRANSITION_TASK',{id,input},async()=>await transitionTaskRaw(tx,raw,principal,id,input),value=>({type:'TASK',id:value.id}));});
  }
  static async addTaskEvent(principal:AuthenticatedPrincipal,id:string,input:TaskEventInput,key:string):Promise<Task>{
    assertWrite(principal);if(!new Set(['COMMENT','DOCUMENT','IMAGE','PDF','NOTE']).has(input.type))throw new OperationalValidationError('Invalid task event');const content=nonEmpty(input.content,'content',5000);return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();return await idempotent(raw,principal,key,'ADD_TASK_EVENT',{id,input:{...input,content}},async()=>{
      const row=await findTaskForUpdate(raw,principal.companyId,id);const now=new Date().toISOString();await raw.execute(sql`INSERT INTO operational_task_events(id,company_id,task_id,event_type,content,url,actor_user_id,actor_name,created_at) VALUES(${randomUUID()},${principal.companyId},${id},${input.type},${content},${input.url||null},${principal.userId},${principal.name},${now})`);
      await raw.execute(sql`UPDATE operational_tasks SET version=version+1,updated_at=${now} WHERE company_id=${principal.companyId} AND id=${id}`);const refreshed=await findTaskForUpdate(raw,principal.companyId,id);const task=taskFromRow(refreshed);await audit(tx,principal,AuditAction.UPDATE,'OperationalTask',id,taskFromRow(row),task);return task;
    },value=>({type:'TASK',id:value.id}));});
  }

  static async listIncidents(principal:AuthenticatedPrincipal,filters:{status?:IncidentStatus;severity?:IncidentSeverity;search?:string}={}):Promise<ProductionIncident[]>{
    assertRead(principal);return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();const result=await raw.execute(sql`SELECT * FROM operational_incidents WHERE company_id=${principal.companyId}
      AND (${filters.status||null}::text IS NULL OR status=${filters.status||null}) AND (${filters.severity||null}::text IS NULL OR severity=${filters.severity||null})
      AND (${filters.search?.trim()||null}::text IS NULL OR title ILIKE ${filters.search?`%${filters.search.trim()}%`:null} OR description ILIKE ${filters.search?`%${filters.search.trim()}%`:null})
      ORDER BY CASE severity WHEN 'SEV0' THEN 0 WHEN 'SEV1' THEN 1 WHEN 'SEV2' THEN 2 WHEN 'SEV3' THEN 3 ELSE 4 END,detected_at DESC,id`);return resultRows(result).map(incidentFromRow);});
  }
  static async createIncident(principal:AuthenticatedPrincipal,input:CreateOperationalIncidentInput,key:string):Promise<ProductionIncident>{
    assertWrite(principal);const title=nonEmpty(input.title,'title',300),description=nonEmpty(input.description,'description',5000),impact=optional(input.impactDescription,4000)||description;
    if(!INCIDENT_SEVERITIES.has(input.severity)||!INCIDENT_PRIORITIES.has(input.priority)||!INCIDENT_SOURCES.has(input.source)||!INCIDENT_CATEGORIES.has(input.category))throw new OperationalValidationError('Invalid incident classification');const fp=fingerprint(input);
    return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();return await idempotent(raw,principal,key,'CREATE_INCIDENT',{...input,title,description,impact,fp},async()=>{
      const now=new Date().toISOString(),id=randomUUID(),correlationId=randomUUID(),slaDeadline=input.slaDeadlineMinutes?new Date(Date.now()+input.slaDeadlineMinutes*60000).toISOString():null;
      try{const result=await raw.execute(sql`INSERT INTO operational_incidents(id,company_id,correlation_id,title,description,severity,priority,status,source,category,detected_at,reported_by_user_id,reported_by_name,assigned_to,commander_id,affected_module,affected_entity_type,affected_entity_id,impact_description,sla_deadline,sla_status,idempotency_key,incident_fingerprint,created_at,updated_at)
        VALUES(${id},${principal.companyId},${correlationId},${title},${description},${input.severity},${input.priority},'DETECTED',${input.source},${input.category},${now},${principal.userId},${principal.name},${input.assignedTo||null},${input.commanderId||null},${input.affectedModule||null},${input.affectedEntityType||null},${input.affectedEntityId||null},${impact},${slaDeadline},'ON_TRACK',${key},${fp},${now},${now}) RETURNING *`);const incident=incidentFromRow(resultRows(result)[0]);
        await raw.execute(sql`INSERT INTO operational_incident_actions(id,company_id,incident_id,action,correlation_id,metadata,actor_user_id,actor_name,created_at) VALUES(${randomUUID()},${principal.companyId},${id},'CREATED',${correlationId},'{}'::jsonb,${principal.userId},${principal.name},${now})`);await audit(tx,principal,AuditAction.CREATE,'OperationalIncident',id,null,incident);return incident;
      }catch(error:any){if(error?.code==='23505'||error?.cause?.code==='23505')throw new OperationalConflictError('Active incident with same fingerprint already exists');throw error;}
    },value=>({type:'INCIDENT',id:value.id}));});
  }
  static async transitionIncident(principal:AuthenticatedPrincipal,id:string,input:IncidentTransitionInput,key:string):Promise<ProductionIncident>{
    assertWrite(principal);return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();return await idempotent(raw,principal,key,'TRANSITION_INCIDENT',{id,input},async()=>await transitionIncidentRaw(tx,raw,principal,id,input),value=>({type:'INCIDENT',id:value.id}));});
  }
  static async addIncidentAction(principal:AuthenticatedPrincipal,id:string,action:string,comment:string|undefined,key:string):Promise<ProductionIncident>{
    assertWrite(principal);const cleanAction=nonEmpty(action,'action',120),cleanComment=optional(comment,4000);return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();return await idempotent(raw,principal,key,'ADD_INCIDENT_ACTION',{id,action:cleanAction,comment:cleanComment},async()=>{
      const row=await findIncidentForUpdate(raw,principal.companyId,id);const before=incidentFromRow(row),now=new Date().toISOString();await raw.execute(sql`INSERT INTO operational_incident_actions(id,company_id,incident_id,action,comment,correlation_id,metadata,actor_user_id,actor_name,created_at) VALUES(${randomUUID()},${principal.companyId},${id},${cleanAction},${cleanComment||null},${before.correlationId},'{}'::jsonb,${principal.userId},${principal.name},${now})`);await raw.execute(sql`UPDATE operational_incidents SET version=version+1,updated_at=${now} WHERE company_id=${principal.companyId} AND id=${id}`);const refreshed=await findIncidentForUpdate(raw,principal.companyId,id);const incident=incidentFromRow(refreshed);await audit(tx,principal,AuditAction.UPDATE,'OperationalIncident',id,before,incident);return incident;
    },value=>({type:'INCIDENT',id:value.id}));});
  }

  static async getExecutiveSnapshot(principal:AuthenticatedPrincipal):Promise<ExecutiveOperationsSnapshot>{
    assertRead(principal);return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();const now=new Date().toISOString();
      const taskAgg=await raw.execute(sql`SELECT status,count(*)::int AS count FROM operational_tasks WHERE company_id=${principal.companyId} GROUP BY status`);
      const incidentAgg=await raw.execute(sql`SELECT status,severity,count(*)::int AS count FROM operational_incidents WHERE company_id=${principal.companyId} GROUP BY status,severity`);
      const vehicleAgg=await raw.execute(sql`SELECT status,count(*)::int AS count FROM vehicles WHERE company_id=${principal.companyId} AND is_archived=false GROUP BY status`);
      const contractAgg=await raw.execute(sql`SELECT status,count(*)::int AS count FROM contracts WHERE company_id=${principal.companyId} AND is_archived=false GROUP BY status`);
      const userAgg=await raw.execute(sql`SELECT count(*)::int AS count FROM users WHERE company_id=${principal.companyId} AND active=true`);
      const priorityTaskResult=await raw.execute(sql`SELECT * FROM operational_tasks WHERE company_id=${principal.companyId} AND status NOT IN ('COMPLETED','CLOSED','CANCELLED') ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,due_at LIMIT 8`);
      const criticalIncidentResult=await raw.execute(sql`SELECT * FROM operational_incidents WHERE company_id=${principal.companyId} AND status NOT IN ('RESOLVED','CLOSED','CANCELLED') ORDER BY CASE severity WHEN 'SEV0' THEN 0 WHEN 'SEV1' THEN 1 WHEN 'SEV2' THEN 2 WHEN 'SEV3' THEN 3 ELSE 4 END,detected_at LIMIT 6`);
      const taskCounts=resultRows(taskAgg),incidentCounts=resultRows(incidentAgg),vehicleCounts=resultRows(vehicleAgg),contractCounts=resultRows(contractAgg);const users=Number(resultRows(userAgg)[0]?.count||0);
      const openTasks=taskCounts.filter(r=>!['COMPLETED','CLOSED','CANCELLED'].includes(String(r.status))).reduce((s,r)=>s+Number(r.count||0),0);const blocked=countBy(taskCounts,'BLOCKED');const completed=countBy(taskCounts,'COMPLETED')+countBy(taskCounts,'CLOSED');
      const overdueResult=await raw.execute(sql`SELECT count(*)::int AS count FROM operational_tasks WHERE company_id=${principal.companyId} AND status NOT IN ('COMPLETED','CLOSED','CANCELLED') AND due_at<now()`);const overdue=Number(resultRows(overdueResult)[0]?.count||0);
      const activeIncidents=incidentCounts.filter(r=>!['RESOLVED','CLOSED','CANCELLED'].includes(String(r.status))).reduce((s,r)=>s+Number(r.count||0),0);const criticalIncidents=incidentCounts.filter(r=>['SEV0','SEV1'].includes(String(r.severity))&&!['RESOLVED','CLOSED','CANCELLED'].includes(String(r.status))).reduce((s,r)=>s+Number(r.count||0),0);
      const totalVehicles=vehicleCounts.reduce((s,r)=>s+Number(r.count||0),0),available=countBy(vehicleCounts,'AVAILABLE'),rented=countBy(vehicleCounts,'RENTED')+countBy(vehicleCounts,'RENTED_OUT'),maintenance=countBy(vehicleCounts,'MAINTENANCE')+countBy(vehicleCounts,'IN_MAINTENANCE');const unavailable=Math.max(0,totalVehicles-available-rented-maintenance);const activeContracts=countBy(contractCounts,'ACTIVE');
      const backlogScore=Math.min(100,openTasks*5+overdue*10+blocked*10),incidentScore=Math.min(100,activeIncidents*8+criticalIncidents*20),unavailabilityScore=totalVehicles?Math.round((unavailable/totalVehicles)*100):0;const risk=Math.min(100,Math.round(backlogScore*.45+incidentScore*.4+unavailabilityScore*.15));
      const riskScore:OperationalRiskScore={score:risk,level:riskLevel(risk),factors:{backlogScore,slaScore:Math.min(100,overdue*10),incidentScore,unavailabilityScore,maintenanceScore:totalVehicles?Math.round((maintenance/totalVehicles)*100):0,documentScore:0,contractScore:0,overloadScore:0,dataQualityScore:0,recurrenceScore:0}};
      const kpis:OperationalKPIs={openTasks,completedTasks:completed,blockedTasks:blocked,backlogCount:openTasks,overdueActivitiesCount:overdue,todayActivitiesCount:0,slaCompliancePercent:openTasks?Math.max(0,Math.round(100-(overdue/openTasks)*100)):100,slaAtRiskCount:0,slaBreachedCount:overdue,avgCompletionTimeHours:0,activeUsersCount:users,availableUsersCount:users,overloadedUsersCount:0,avgProductivityPercent:openTasks+completed?Math.round((completed/(openTasks+completed))*100):100,totalVehicles,availableVehiclesCount:available,rentedVehiclesCount:rented,maintenanceVehiclesCount:maintenance,unavailableVehiclesCount:unavailable,fleetUtilizationPercent:totalVehicles?Math.round((rented/totalVehicles)*100):0,vehiclesWithIssuesCount:maintenance+unavailable,activeContractsCount:activeContracts,expiringContractsCount:0,contractsWithIssuesCount:0,contractsWithIncidentsCount:0,activeIncidentsCount:activeIncidents,criticalIncidentsCount:criticalIncidents,recurringIncidentsCount:0,mttrMinutes:0,mttdMinutes:0};
      const priorityTasks=resultRows(priorityTaskResult).map(row=>taskFromRow(row)),criticalRows=resultRows(criticalIncidentResult).map(incidentFromRow);const priorities:PriorityActionItem[]=[...priorityTasks.map(t=>({id:`task-${t.id}`,title:`[TAREFA] ${t.title}`,reason:t.status==='BLOCKED'?'Tarefa bloqueada':'Tarefa prioritária pendente',priority:t.priority,responsibleUserId:t.assignedUserId,dueDate:t.dueAt,slaStatus:new Date(t.dueAt)<new Date()?'BREACHED' as const:'OK' as const,entityType:'TASK',entityId:t.id,impact:'Impacta a execução operacional.',recommendation:t.status==='BLOCKED'?'Desbloquear e retomar.':'Iniciar ou concluir a tarefa.',quickActionType:t.status==='BLOCKED'?'UNBLOCK_TASK':'START_TASK'})),...criticalRows.map(i=>({id:`incident-${i.id}`,title:`[INCIDENTE ${i.severity}] ${i.title}`,reason:'Incidente ativo requer tratamento',priority:i.priority,responsibleUserId:i.commanderId,entityType:'INCIDENT',entityId:i.id,impact:i.impactDescription,recommendation:'Investigar, mitigar e resolver.',quickActionType:'RESOLVE_INCIDENT'}))].slice(0,10);
      const bottlenecks:OperationalBottleneckItem[]=priorityTasks.filter(t=>t.status==='BLOCKED').slice(0,5).map(t=>({id:`b-${t.id}`,companyId:principal.companyId,category:'TASK',severity:t.priority==='P0'?'CRITICAL':'HIGH',entityType:'TASK',entityId:t.id,title:t.title,description:t.blockedReason||'Tarefa bloqueada',detectedAt:t.updatedAt,impactScore:t.priority==='P0'?95:75,durationHours:Math.max(0,Math.round((Date.now()-new Date(t.updatedAt).getTime())/3600000)),responsibleUserId:t.assignedUserId,recommendedAction:'Remover bloqueio e retomar execução.',status:'ACTIVE'}));
      const risks:OperationalRiskItem[]=criticalRows.slice(0,5).map(i=>({id:`r-${i.id}`,companyId:principal.companyId,category:'INCIDENT_RISK',severity:i.severity==='SEV0'?'CRITICAL':i.severity==='SEV1'?'HIGH':'MEDIUM',title:i.title,cause:i.description,entityType:'INCIDENT',entityId:i.id,responsibleUserId:i.commanderId,recommendedAction:'Mitigar e resolver o incidente.',riskScore:i.severity==='SEV0'?100:i.severity==='SEV1'?85:60}));
      const recommendations:OperationalRecommendation[]=[];if(overdue>0)recommendations.push({id:randomUUID(),companyId:principal.companyId,title:'Reduzir tarefas vencidas',description:`Existem ${overdue} tarefas vencidas.`,severity:overdue>5?'HIGH':'MEDIUM',category:'TASK',recommendedAction:'Repriorizar e atribuir responsáveis.',impactEstimate:'Reduz backlog e risco de SLA.',createdAt:now});if(criticalIncidents>0)recommendations.push({id:randomUUID(),companyId:principal.companyId,title:'Tratar incidentes críticos',description:`Existem ${criticalIncidents} incidentes críticos ativos.`,severity:'CRITICAL',category:'INCIDENT',recommendedAction:'Acionar resposta operacional imediata.',impactEstimate:'Reduz risco de indisponibilidade.',createdAt:now});
      const snapshot:ExecutiveOperationsSnapshot={id:randomUUID(),companyId:principal.companyId,generatedAt:now,correlationId:randomUUID(),snapshotType:'ON_DEMAND',healthScore:Math.max(0,100-risk),operationalRiskScore:riskScore,kpis,activeTasks:openTasks,blockedTasks:blocked,overdueTasks:overdue,slaWarnings:0,slaBreaches:overdue,openIncidents:activeIncidents,criticalIncidents,pendingActions:openTasks,todayActivities:0,overdueActivities:overdue,availableVehicles:available,rentedVehicles:rented,maintenanceVehicles:maintenance,unavailableVehicles:unavailable,activeContracts,contractsWithIssues:0,usersAvailable:users,usersOverloaded:0,backlog:openTasks,topPriorityActions:priorities,topBottlenecks:bottlenecks,topRisks:risks,recommendations};
      await raw.execute(sql`INSERT INTO executive_operation_snapshots(id,company_id,correlation_id,snapshot_type,payload,generated_by_user_id,generated_at) VALUES(${snapshot.id},${principal.companyId},${snapshot.correlationId},${snapshot.snapshotType},CAST(${JSON.stringify(snapshot)} AS jsonb),${principal.userId},${now})`);return snapshot;
    });
  }

  static async executeQuickAction(principal:AuthenticatedPrincipal,actionType:string,entityId:string,reason:string|undefined,key:string):Promise<{success:true;message:string;item?:Task|ProductionIncident}>{
    assertWrite(principal);const type=nonEmpty(actionType,'actionType',80),id=nonEmpty(entityId,'entityId',200);return await UnitOfWork.run(principal.companyId,async tx=>{const raw=tx.getRawTransaction();return await idempotent(raw,principal,key,'EXECUTIVE_QUICK_ACTION',{type,id,reason},async()=>{
      if(type==='START_TASK'){const item=await transitionTaskRaw(tx,raw,principal,id,{status:'IN_PROGRESS',reason:reason||'Iniciado via Central Executiva'});return {success:true as const,message:'Tarefa iniciada com sucesso.',item};}
      if(type==='UNBLOCK_TASK'){const item=await transitionTaskRaw(tx,raw,principal,id,{status:'IN_PROGRESS',reason:reason||'Desbloqueado via Central Executiva'});return {success:true as const,message:'Tarefa desbloqueada com sucesso.',item};}
      if(type==='RESOLVE_INCIDENT'){const current=incidentFromRow(await findIncidentForUpdate(raw,principal.companyId,id));let item=current;if(!['RESOLVED','CLOSED'].includes(current.status)){const target:IncidentStatus=['DETECTED','TRIAGED','ACKNOWLEDGED'].includes(current.status)?'INVESTIGATING':current.status;if(target!==current.status)item=await transitionIncidentRaw(tx,raw,principal,id,{status:target,comment:reason||'Tratamento iniciado via Central Executiva'});if(item.status==='INVESTIGATING'||item.status==='CONTAINING'||item.status==='MITIGATED'||item.status==='ESCALATED')item=await transitionIncidentRaw(tx,raw,principal,id,{status:'RESOLVED',comment:reason||'Resolvido via Central Executiva',rootCause:reason||'Tratado pela operação',resolutionSummary:'Ação rápida server-side executada.'});}return {success:true as const,message:'Incidente tratado com sucesso.',item};}
      throw new OperationalValidationError('Unsupported executive quick action');
    },value=>({type:'EXECUTIVE_ACTION',id:('item' in value&&value.item?.id)||id}));});
  }
}
