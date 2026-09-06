import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { companies } from '../db/schema';
import { UnitOfWork } from '../db/uow';
import { ReceivableService } from '../domain/finance/ReceivableService';
import { PayableService } from '../domain/finance/PayableService';
import { IdempotencyService } from '../domain/services/IdempotencyService';
import { AuditAction, ContractStatus, OriginType, RecurringFrequency } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { advanceNextGenerationDate, calculatePeriodRef } from '../domain/finance/RecurringSchedule';
import { materializeInsuranceAlerts } from './insuranceAlerts';

export type RecurringRuleStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
export type RecurringRunStatus = 'CLAIMED' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
export type NotificationSeverity = 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS';

export interface ServerRecurringRule {
  id: string;
  companyId: string;
  originType?: OriginType;
  originId?: string;
  description: string;
  amount: number;
  frequency?: RecurringFrequency;
  startDate?: string;
  endDate?: string;
  nextGenerationDate?: string;
  lastGeneratedReference?: string;
  categoryId?: string;
  vehicleId?: string;
  driverId?: string;
  supplierId?: string;
  paymentMethodId?: string;
  status: RecurringRuleStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  legacyIncomplete: boolean;
}

export interface ServerRecurringRun {
  id: string;
  companyId: string;
  ruleId: string;
  scheduledFor: string;
  periodRef: string;
  status: RecurringRunStatus;
  attemptCount: number;
  startedAt: string;
  finishedAt?: string;
  resultEntityType?: string;
  resultEntityId?: string;
  errorCode?: string;
  errorMessage?: string;
  workerId?: string;
}

export interface ServerNotification {
  id: string;
  companyId: string;
  userId: string;
  eventType: string;
  dedupKey: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  entityType?: string;
  entityId?: string;
  alertStage?: string;
  createdAt: string;
  readAt?: string;
  createdBy: string;
}

export interface CreateRecurringRuleInput {
  originType: OriginType;
  originId?: string;
  description: string;
  amount: number;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  nextGenerationDate?: string;
  categoryId: string;
  vehicleId?: string;
  driverId?: string;
  supplierId?: string;
  paymentMethodId?: string;
}

export interface UpdateRecurringRuleInput {
  description?: string;
  amount?: number;
  frequency?: RecurringFrequency;
  startDate?: string;
  endDate?: string | null;
  nextGenerationDate?: string;
  categoryId?: string;
  vehicleId?: string | null;
  driverId?: string | null;
  supplierId?: string | null;
  paymentMethodId?: string | null;
}

const SYSTEM_USER_ID = 'system-recurring';
const SYSTEM_USER_NAME = 'Motor de Recorrência';
const MAX_GENERATIONS_PER_RULE_PER_CYCLE = 52;
const ALLOWED_ALERT_STAGES = new Set(['D90', 'D60', 'D30', 'D15', 'D7', 'D1', 'DUE_TODAY', 'POST_DUE']);

function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }
function dateOnly(value: unknown): string | undefined { if (value === null || value === undefined || value === '') return undefined; if (typeof value === 'string') return value.slice(0, 10); if (value instanceof Date) return value.toISOString().slice(0, 10); return String(value).slice(0, 10); }
function iso(value: unknown): string { if (typeof value === 'string') return value; if (value instanceof Date) return value.toISOString(); return new Date(String(value)).toISOString(); }
function optionalString(value: unknown): string | undefined { if (value === null || value === undefined || value === '') return undefined; return String(value); }

function mapRule(row: any): ServerRecurringRule {
  const originType = optionalString(row.origin_type) as OriginType | undefined;
  const frequency = optionalString(row.frequency) as RecurringFrequency | undefined;
  const startDate = dateOnly(row.start_date); const nextGenerationDate = dateOnly(row.next_generation_date); const categoryId = optionalString(row.category_id);
  return { id:String(row.id),companyId:String(row.company_id),originType,originId:optionalString(row.origin_id),description:String(row.description||''),amount:Number(row.amount||0),frequency,startDate,endDate:dateOnly(row.end_date),nextGenerationDate,lastGeneratedReference:optionalString(row.last_generated_reference),categoryId,vehicleId:optionalString(row.vehicle_id),driverId:optionalString(row.driver_id),supplierId:optionalString(row.supplier_id),paymentMethodId:optionalString(row.payment_method_id),status:String(row.status||'PAUSED') as RecurringRuleStatus,createdBy:optionalString(row.created_by),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),legacyIncomplete:!originType||!frequency||!startDate||!nextGenerationDate||!categoryId };
}
function mapRun(row:any):ServerRecurringRun{return{id:String(row.id),companyId:String(row.company_id),ruleId:String(row.rule_id),scheduledFor:dateOnly(row.scheduled_for)||'',periodRef:String(row.period_ref),status:String(row.status) as RecurringRunStatus,attemptCount:Number(row.attempt_count||0),startedAt:iso(row.started_at),finishedAt:row.finished_at?iso(row.finished_at):undefined,resultEntityType:optionalString(row.result_entity_type),resultEntityId:optionalString(row.result_entity_id),errorCode:optionalString(row.error_code),errorMessage:optionalString(row.error_message),workerId:optionalString(row.worker_id)};}
function mapNotification(row:any):ServerNotification{return{id:String(row.id),companyId:String(row.company_id),userId:String(row.user_id),eventType:String(row.event_type),dedupKey:String(row.dedup_key),title:String(row.title),message:String(row.message),severity:String(row.severity) as NotificationSeverity,entityType:optionalString(row.entity_type),entityId:optionalString(row.entity_id),alertStage:optionalString(row.alert_stage),createdAt:iso(row.created_at),readAt:row.read_at?iso(row.read_at):undefined,createdBy:String(row.created_by||'SYSTEM')};}
function sanitizeFailure(error:unknown):{code:string;message:string}{const raw=error instanceof Error?error.message:'Recurring processing failed';const message=raw.replace(/[\r\n\t]+/g,' ').slice(0,400);if(message.includes('período financeiro')||message.includes('período'))return{code:'FINANCIAL_PERIOD_CLOSED',message};if(message.startsWith('Acesso negado:'))return{code:'AUTHORIZATION_DENIED',message};if(message.includes('não encontrado')||message.includes('não encontrada'))return{code:'ORIGIN_NOT_FOUND',message};return{code:'RECURRING_PROCESSING_ERROR',message};}
function severityForStage(stage:string):NotificationSeverity{if(stage==='POST_DUE')return'DANGER';if(stage==='DUE_TODAY'||stage==='D1'||stage==='D7')return'WARNING';return'INFO';}
function notificationMessage(document:any):string{const stage=String(document.alertStage||'');const subject=document.documentType||'Documento';if(stage==='POST_DUE')return`${subject} está vencido e requer regularização.`;if(stage==='DUE_TODAY')return`${subject} vence hoje.`;const days=typeof document.daysToExpiration==='number'?document.daysToExpiration:undefined;return days!==undefined?`${subject} vence em ${days} dia(s).`:`${subject} possui vencimento próximo.`;}

async function validateRuleReferences(txContext:any,rawTx:any,companyId:string,input:CreateRecurringRuleInput|ServerRecurringRule):Promise<void>{
  if(input.vehicleId){const vehicle=await txContext.getVehicleRepo().findByIdForCompany(companyId,input.vehicleId);if(!vehicle||vehicle.isArchived)throw new Error('Veículo não encontrado');}
  if(input.driverId){const driver=await txContext.getDriverRepo().findByIdForCompany(companyId,input.driverId);if(!driver||driver.isArchived)throw new Error('Motorista não encontrado');}
  if(!input.categoryId)throw new Error('Categoria financeira não encontrada');
  if(input.originType===OriginType.CONTRACT_RENT){
    if(!input.originId)throw new Error('Contrato não encontrado');
    const contract=await txContext.getContractRepo().findByIdForCompany(companyId,input.originId);
    if(!contract||contract.isArchived)throw new Error('Contrato não encontrado');
    if(input.vehicleId&&contract.vehicleId!==input.vehicleId)throw new Error('Contrato e veículo divergentes');
    if(input.driverId&&contract.driverId!==input.driverId)throw new Error('Contrato e motorista divergentes');
    const contractStart=dateOnly(contract.startDate),contractEnd=dateOnly(contract.endDate);
    if(contractStart&&input.startDate&&input.startDate<contractStart)throw new Error('Regra recorrente inicia antes do contrato');
    if(contractEnd&&input.startDate&&input.startDate>contractEnd)throw new Error('Regra recorrente inicia após o término do contrato');
    if(contractEnd&&input.endDate&&input.endDate>contractEnd)throw new Error('Regra recorrente termina após o contrato');
    if(contractEnd&&input.nextGenerationDate&&input.nextGenerationDate>contractEnd)throw new Error('Próxima geração recorrente ultrapassa o contrato');
    const financialAuthority=rows(await rawTx.execute(sql`SELECT category_id FROM account_receivables WHERE company_id=${companyId} AND contract_id=${input.originId} AND origin_type='CONTRACT_RENT' AND status <> 'CANCELLED' ORDER BY competence_date DESC,created_at DESC,id DESC LIMIT 1`));
    if(financialAuthority.length===0)throw new Error('Contrato sem cobrança financeira autoritativa');
    if(String(financialAuthority[0].category_id)!==input.categoryId)throw new Error('Categoria recorrente divergente da cobrança autoritativa do contrato');
  }
  if(input.originType===OriginType.TRACKER){const category=rows(await rawTx.execute(sql`SELECT id,type FROM financial_categories WHERE company_id=${companyId} AND id=${input.categoryId} AND active=true LIMIT 1`));if(category.length===0)throw new Error('Categoria financeira não encontrada');const categoryType=String(category[0].type||'');if(!['EXPENSE','BOTH'].includes(categoryType))throw new Error('Categoria financeira incompatível com despesa recorrente');if(!input.originId)throw new Error('Rastreador não encontrado');const trackerRows=rows(await rawTx.execute(sql`SELECT id,vehicle_id,status FROM trackers WHERE company_id=${companyId} AND id=${input.originId} LIMIT 1`));const tracker=trackerRows[0];if(!tracker)throw new Error('Rastreador não encontrado');if(input.vehicleId&&tracker.vehicle_id!==input.vehicleId)throw new Error('Rastreador e veículo divergentes');}
}

async function currentOriginState(txContext:any,rawTx:any,companyId:string,rule:ServerRecurringRule,scheduledFor:string):Promise<'ELIGIBLE'|'DEFERRED'|'COMPLETED'>{
  if(rule.originType===OriginType.CONTRACT_RENT){if(!rule.originId)return'COMPLETED';const contract=await txContext.getContractRepo().findByIdForCompany(companyId,rule.originId);if(!contract||contract.isArchived)return'COMPLETED';const status=String(contract.status);if(new Set<string>([ContractStatus.DRAFT,ContractStatus.AWAITING_SIGNATURE,ContractStatus.SUSPENDED]).has(status))return'DEFERRED';if(new Set<string>([ContractStatus.CLOSED,ContractStatus.FINISHED,ContractStatus.CANCELLED,ContractStatus.ARCHIVED]).has(status))return'COMPLETED';const contractEnd=dateOnly(contract.endDate);if(contractEnd&&scheduledFor>contractEnd)return'COMPLETED';return'ELIGIBLE';}
  if(rule.originType===OriginType.TRACKER){if(!rule.originId)return'COMPLETED';const trackerRows=rows(await rawTx.execute(sql`SELECT status FROM trackers WHERE company_id=${companyId} AND id=${rule.originId} LIMIT 1`));if(trackerRows.length===0||trackerRows[0].status!=='ACTIVE')return'COMPLETED';}
  return'ELIGIBLE';
}

class OccurrenceFailure extends Error{constructor(message:string,readonly companyId:string,readonly ruleId:string,readonly scheduledFor:string,readonly periodRef:string,readonly workerId:string){super(message);this.name='OccurrenceFailure';}}

export class RecurringAuthorityService{
  static async listRules(companyId:string):Promise<ServerRecurringRule[]>{return await UnitOfWork.run(companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Recurring persistence unavailable');const result=await rawTx.execute(sql`SELECT * FROM recurring_rules WHERE company_id=${companyId} ORDER BY created_at DESC,id DESC`);return rows(result).map(mapRule);});}
  static async getRule(companyId:string,id:string):Promise<ServerRecurringRule|null>{return await UnitOfWork.run(companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Recurring persistence unavailable');const result=await rawTx.execute(sql`SELECT * FROM recurring_rules WHERE company_id=${companyId} AND id=${id} LIMIT 1`);return rows(result)[0]?mapRule(rows(result)[0]):null;});}
  static async listRuns(companyId:string,ruleId:string):Promise<ServerRecurringRun[]>{return await UnitOfWork.run(companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Recurring persistence unavailable');const rule=rows(await rawTx.execute(sql`SELECT id FROM recurring_rules WHERE company_id=${companyId} AND id=${ruleId} LIMIT 1`));if(rule.length===0)throw new Error('Regra recorrente não encontrada');const result=await rawTx.execute(sql`SELECT * FROM recurring_rule_runs WHERE company_id=${companyId} AND rule_id=${ruleId} ORDER BY scheduled_for DESC,started_at DESC`);return rows(result).map(mapRun);});}

  static async createRule(principal:AuthenticatedPrincipal,input:CreateRecurringRuleInput):Promise<ServerRecurringRule>{return await UnitOfWork.run(principal.companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Recurring persistence unavailable');await validateRuleReferences(txContext,rawTx,principal.companyId,input);const id=randomUUID(),now=new Date().toISOString(),nextGenerationDate=input.nextGenerationDate||input.startDate;const result=await rawTx.execute(sql`INSERT INTO recurring_rules(id,company_id,description,amount,interval,active,next_execution,origin_type,origin_id,frequency,start_date,end_date,next_generation_date,category_id,vehicle_id,driver_id,supplier_id,payment_method_id,status,created_by,created_at,updated_at) VALUES(${id},${principal.companyId},${input.description},${String(input.amount)},${input.frequency},true,${nextGenerationDate},${input.originType},${input.originId||null},${input.frequency},${input.startDate},${input.endDate||null},${nextGenerationDate},${input.categoryId},${input.vehicleId||null},${input.driverId||null},${input.supplierId||null},${input.paymentMethodId||null},'ACTIVE',${principal.userId},${now},${now}) RETURNING *`);const created=mapRule(rows(result)[0]);await txContext.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'RecurringRule',entityId:id,action:AuditAction.CREATE,newState:JSON.stringify(created),userId:principal.userId,userName:principal.name,timestamp:now});return created;});}

  static async updateRule(principal:AuthenticatedPrincipal,id:string,input:UpdateRecurringRuleInput):Promise<ServerRecurringRule>{return await UnitOfWork.run(principal.companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Recurring persistence unavailable');const locked=rows(await rawTx.execute(sql`SELECT * FROM recurring_rules WHERE company_id=${principal.companyId} AND id=${id} FOR UPDATE`));if(locked.length===0)throw new Error('Regra recorrente não encontrada');const current=mapRule(locked[0]);if(current.status==='CANCELLED'||current.status==='COMPLETED')throw new Error('Regra recorrente não pode mais ser editada');if(current.legacyIncomplete)throw new Error('Regra legada incompleta deve ser recriada com semântica financeira explícita');const candidate:ServerRecurringRule={...current,description:input.description??current.description,amount:input.amount??current.amount,frequency:input.frequency??current.frequency,startDate:input.startDate??current.startDate,endDate:input.endDate===null?undefined:(input.endDate??current.endDate),nextGenerationDate:input.nextGenerationDate??current.nextGenerationDate,categoryId:input.categoryId??current.categoryId,vehicleId:input.vehicleId===null?undefined:(input.vehicleId??current.vehicleId),driverId:input.driverId===null?undefined:(input.driverId??current.driverId),supplierId:input.supplierId===null?undefined:(input.supplierId??current.supplierId),paymentMethodId:input.paymentMethodId===null?undefined:(input.paymentMethodId??current.paymentMethodId)};if(!candidate.frequency||!candidate.startDate||!candidate.nextGenerationDate||!candidate.categoryId||!candidate.originType)throw new Error('Regra recorrente incompleta');if(candidate.endDate&&candidate.endDate<candidate.startDate)throw new Error('Regra recorrente possui intervalo de datas inválido');if(candidate.nextGenerationDate<candidate.startDate||(candidate.endDate&&candidate.nextGenerationDate>candidate.endDate))throw new Error('Regra recorrente possui próxima geração fora da vigência');await validateRuleReferences(txContext,rawTx,principal.companyId,candidate);const now=new Date().toISOString();const result=await rawTx.execute(sql`UPDATE recurring_rules SET description=${candidate.description},amount=${String(candidate.amount)},interval=${candidate.frequency},frequency=${candidate.frequency},start_date=${candidate.startDate},end_date=${candidate.endDate||null},next_generation_date=${candidate.nextGenerationDate},next_execution=${candidate.nextGenerationDate},category_id=${candidate.categoryId},vehicle_id=${candidate.vehicleId||null},driver_id=${candidate.driverId||null},supplier_id=${candidate.supplierId||null},payment_method_id=${candidate.paymentMethodId||null},updated_at=${now} WHERE company_id=${principal.companyId} AND id=${id} RETURNING *`);const updated=mapRule(rows(result)[0]);await txContext.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'RecurringRule',entityId:id,action:AuditAction.UPDATE,previousState:JSON.stringify(current),newState:JSON.stringify(updated),userId:principal.userId,userName:principal.name,timestamp:now});return updated;});}

  static async setLifecycle(principal:AuthenticatedPrincipal,id:string,action:'pause'|'resume'|'cancel'):Promise<ServerRecurringRule>{return await UnitOfWork.run(principal.companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Recurring persistence unavailable');const locked=rows(await rawTx.execute(sql`SELECT * FROM recurring_rules WHERE company_id=${principal.companyId} AND id=${id} FOR UPDATE`));if(locked.length===0)throw new Error('Regra recorrente não encontrada');const current=mapRule(locked[0]);let status:RecurringRuleStatus;if(action==='pause'){if(current.status!=='ACTIVE')return current;status='PAUSED';}else if(action==='resume'){if(current.status==='ACTIVE')return current;if(current.status!=='PAUSED'||current.legacyIncomplete)throw new Error('Regra recorrente não pode ser retomada');status='ACTIVE';}else{if(current.status==='CANCELLED')return current;if(current.status==='COMPLETED')throw new Error('Regra recorrente concluída não pode ser cancelada');status='CANCELLED';}const now=new Date().toISOString();const result=await rawTx.execute(sql`UPDATE recurring_rules SET status=${status},active=${status==='ACTIVE'},updated_at=${now} WHERE company_id=${principal.companyId} AND id=${id} RETURNING *`);const updated=mapRule(rows(result)[0]);await txContext.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'RecurringRule',entityId:id,action:AuditAction.UPDATE,previousState:JSON.stringify(current),newState:JSON.stringify(updated),userId:principal.userId,userName:principal.name,timestamp:now});return updated;});}

  private static async dueRuleIds(companyId:string,processingDate:string):Promise<string[]>{return await UnitOfWork.run(companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Recurring persistence unavailable');const result=await rawTx.execute(sql`SELECT id FROM recurring_rules WHERE company_id=${companyId} AND status='ACTIVE' AND start_date<=${processingDate} AND next_generation_date<=${processingDate} ORDER BY next_generation_date,id`);return rows(result).map(row=>String(row.id));});}
  private static async recordFailure(error:OccurrenceFailure):Promise<void>{const failure=sanitizeFailure(error);await UnitOfWork.run(error.companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)return;const now=new Date().toISOString();await rawTx.execute(sql`INSERT INTO recurring_rule_runs(id,company_id,rule_id,scheduled_for,period_ref,status,attempt_count,started_at,finished_at,error_code,error_message,worker_id) VALUES(${randomUUID()},${error.companyId},${error.ruleId},${error.scheduledFor},${error.periodRef},'FAILED',1,${now},${now},${failure.code},${failure.message},${error.workerId}) ON CONFLICT(company_id,rule_id,period_ref) DO UPDATE SET status='FAILED',attempt_count=recurring_rule_runs.attempt_count+1,finished_at=EXCLUDED.finished_at,error_code=EXCLUDED.error_code,error_message=EXCLUDED.error_message,worker_id=EXCLUDED.worker_id`);},{trustedSystemActor:'RECURRING'});}

  private static async processOne(companyId:string,ruleId:string,processingDate:string,workerId:string):Promise<'PROCESSED'|'DEFERRED'|'DONE'|'LOCKED'>{
    let failureContext:{scheduledFor:string;periodRef:string}|undefined;
    try{return await UnitOfWork.run(companyId,async txContext=>{
      const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Recurring persistence unavailable');
      const locked=rows(await rawTx.execute(sql`SELECT * FROM recurring_rules WHERE company_id=${companyId} AND id=${ruleId} AND status='ACTIVE' AND next_generation_date<=${processingDate} FOR UPDATE SKIP LOCKED`));if(locked.length===0)return'LOCKED';
      const rule=mapRule(locked[0]);if(rule.legacyIncomplete||!rule.frequency||!rule.nextGenerationDate||!rule.categoryId||!rule.originType){const now=new Date().toISOString();await rawTx.execute(sql`UPDATE recurring_rules SET status='PAUSED',active=false,updated_at=${now} WHERE company_id=${companyId} AND id=${ruleId}`);return'DONE';}
      const scheduledFor=rule.nextGenerationDate,periodRef=calculatePeriodRef(rule.frequency,scheduledFor);failureContext={scheduledFor,periodRef};
      if(rule.endDate&&scheduledFor>rule.endDate){const now=new Date().toISOString();await rawTx.execute(sql`UPDATE recurring_rules SET status='COMPLETED',active=false,updated_at=${now} WHERE company_id=${companyId} AND id=${ruleId}`);await txContext.getAuditLogRepo().create({id:randomUUID(),companyId,entityName:'RecurringRule',entityId:ruleId,action:AuditAction.UPDATE,previousState:JSON.stringify(rule),newState:JSON.stringify({status:'COMPLETED',reason:'END_DATE_REACHED'}),userId:SYSTEM_USER_ID,userName:SYSTEM_USER_NAME,timestamp:now});return'DONE';}
      const state=await currentOriginState(txContext,rawTx,companyId,rule,scheduledFor);
      if(state==='DEFERRED'){const now=new Date().toISOString();await rawTx.execute(sql`INSERT INTO recurring_rule_runs(id,company_id,rule_id,scheduled_for,period_ref,status,attempt_count,started_at,finished_at,error_code,error_message,worker_id) VALUES(${randomUUID()},${companyId},${ruleId},${scheduledFor},${periodRef},'SKIPPED',1,${now},${now},'ORIGIN_TEMPORARILY_INELIGIBLE','Origem temporariamente inelegível; ocorrência preservada para nova tentativa.',${workerId}) ON CONFLICT(company_id,rule_id,period_ref) DO UPDATE SET status='SKIPPED',attempt_count=recurring_rule_runs.attempt_count+1,finished_at=EXCLUDED.finished_at,error_code=EXCLUDED.error_code,error_message=EXCLUDED.error_message,worker_id=EXCLUDED.worker_id`);return'DEFERRED';}
      if(state==='COMPLETED'){const now=new Date().toISOString();await rawTx.execute(sql`UPDATE recurring_rules SET status='COMPLETED',active=false,updated_at=${now} WHERE company_id=${companyId} AND id=${ruleId}`);await rawTx.execute(sql`INSERT INTO recurring_rule_runs(id,company_id,rule_id,scheduled_for,period_ref,status,attempt_count,started_at,finished_at,error_code,error_message,worker_id) VALUES(${randomUUID()},${companyId},${ruleId},${scheduledFor},${periodRef},'SKIPPED',1,${now},${now},'ORIGIN_COMPLETED','Origem encerrada/inativa; regra concluída.',${workerId}) ON CONFLICT(company_id,rule_id,period_ref) DO NOTHING`);return'DONE';}
      await validateRuleReferences(txContext,rawTx,companyId,rule);const isIncome=rule.originType===OriginType.CONTRACT_RENT;const originId=isIncome&&rule.originId?`${rule.originId}:${scheduledFor}`:(rule.originId||rule.id);const idempotencyKey=IdempotencyService.buildKey(rule.originType,originId,1,scheduledFor,companyId),legacyKey=IdempotencyService.buildLegacyKey(rule.originType,originId,1,scheduledFor);const targetRepo=isIncome?txContext.getReceivableRepo():txContext.getPayableRepo();const existingByPeriod=isIncome?rows(await rawTx.execute(sql`SELECT * FROM account_receivables WHERE company_id=${companyId} AND origin_type=${rule.originType} AND contract_id=${rule.originId} AND period_ref=${periodRef} AND status <> 'CANCELLED' LIMIT 1`)):rows(await rawTx.execute(sql`SELECT * FROM account_payables WHERE company_id=${companyId} AND origin_type=${rule.originType} AND origin_id=${originId} AND period_ref=${periodRef} AND status <> 'CANCELLED' LIMIT 1`));let existing:any=existingByPeriod[0];if(!existing)existing=await targetRepo.findByIdempotencyKey(idempotencyKey);if(!existing)existing=await targetRepo.findByIdempotencyKey(legacyKey);
      const startedAt=new Date().toISOString();await rawTx.execute(sql`INSERT INTO recurring_rule_runs(id,company_id,rule_id,scheduled_for,period_ref,status,attempt_count,started_at,worker_id,lease_token) VALUES(${randomUUID()},${companyId},${ruleId},${scheduledFor},${periodRef},'CLAIMED',1,${startedAt},${workerId},${randomUUID()}) ON CONFLICT(company_id,rule_id,period_ref) DO UPDATE SET status='CLAIMED',attempt_count=recurring_rule_runs.attempt_count+1,started_at=EXCLUDED.started_at,finished_at=NULL,error_code=NULL,error_message=NULL,worker_id=EXCLUDED.worker_id,lease_token=EXCLUDED.lease_token`);
      let resultEntity:any=existing,generated=false;if(!existing){if(isIncome){const created=await ReceivableService.create({companyId,originType:rule.originType,originId,vehicleId:rule.vehicleId,driverId:rule.driverId,contractId:rule.originId,categoryId:rule.categoryId,description:rule.description,totalAmount:rule.amount,dueDate:scheduledFor,competenceDate:scheduledFor,userId:SYSTEM_USER_ID,userName:SYSTEM_USER_NAME},txContext);resultEntity=created[0];}else{const created=await PayableService.create({companyId,originType:rule.originType,originId,vehicleId:rule.vehicleId,supplierId:rule.supplierId,driverId:rule.driverId,categoryId:rule.categoryId,description:rule.description,totalAmount:rule.amount,dueDate:scheduledFor,competenceDate:scheduledFor,userId:SYSTEM_USER_ID,userName:SYSTEM_USER_NAME},txContext);resultEntity=created[0];}generated=true;}
      if(!resultEntity?.id)throw new Error('Título financeiro recorrente não foi persistido');if(isIncome)await rawTx.execute(sql`UPDATE account_receivables SET period_ref=${periodRef},updated_at=now() WHERE company_id=${companyId} AND id=${resultEntity.id} AND (period_ref IS NULL OR period_ref=${periodRef})`);else await rawTx.execute(sql`UPDATE account_payables SET period_ref=${periodRef},updated_at=now() WHERE company_id=${companyId} AND id=${resultEntity.id} AND (period_ref IS NULL OR period_ref=${periodRef})`);
      const nextGenerationDate=advanceNextGenerationDate(scheduledFor,rule.frequency),completed=Boolean(rule.endDate&&nextGenerationDate>rule.endDate),finalStatus:RecurringRuleStatus=completed?'COMPLETED':'ACTIVE',finishedAt=new Date().toISOString();await rawTx.execute(sql`UPDATE recurring_rules SET last_generated_reference=${periodRef},next_generation_date=${nextGenerationDate},next_execution=${nextGenerationDate},status=${finalStatus},active=${finalStatus==='ACTIVE'},updated_at=${finishedAt} WHERE company_id=${companyId} AND id=${ruleId}`);await rawTx.execute(sql`UPDATE recurring_rule_runs SET status=${generated?'SUCCEEDED':'SKIPPED'},finished_at=${finishedAt},result_entity_type=${isIncome?'AccountReceivable':'AccountPayable'},result_entity_id=${resultEntity.id},error_code=${generated?null:'ALREADY_EXISTS'},error_message=${generated?null:'Título já existia pela idempotência financeira.'} WHERE company_id=${companyId} AND rule_id=${ruleId} AND period_ref=${periodRef}`);await txContext.getAuditLogRepo().create({id:randomUUID(),companyId,entityName:'RecurringRule',entityId:ruleId,action:AuditAction.UPDATE,previousState:JSON.stringify({nextGenerationDate:scheduledFor,status:rule.status}),newState:JSON.stringify({lastGeneratedReference:periodRef,nextGenerationDate,status:finalStatus,resultEntityId:resultEntity.id}),userId:SYSTEM_USER_ID,userName:SYSTEM_USER_NAME,timestamp:finishedAt});return'PROCESSED';
    },{financialPeriodLock:'SHARED',trustedSystemActor:'RECURRING'});}catch(error){if(failureContext){const occurrenceError=new OccurrenceFailure(error instanceof Error?error.message:'Recurring processing failed',companyId,ruleId,failureContext.scheduledFor,failureContext.periodRef,workerId);await this.recordFailure(occurrenceError);throw occurrenceError;}throw error;}
  }

  static async processTenant(companyId:string,processingDate:string,workerId:string):Promise<{processed:number;failed:number;deferred:number}>{const ids=await this.dueRuleIds(companyId,processingDate);let processed=0,failed=0,deferred=0;for(const ruleId of ids){for(let attempt=0;attempt<MAX_GENERATIONS_PER_RULE_PER_CYCLE;attempt++){try{const result=await this.processOne(companyId,ruleId,processingDate,workerId);if(result==='PROCESSED'){processed++;continue;}if(result==='DEFERRED')deferred++;break;}catch(error){failed++;console.error('AUTOERP_RECURRING_OCCURRENCE_FAILURE',{companyId,ruleId,error:sanitizeFailure(error)});break;}}}return{processed,failed,deferred};}

  static async materializeDocumentAlerts(companyId:string):Promise<number>{return await UnitOfWork.run(companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Notification persistence unavailable');const documents=(await txContext.getDocumentRepo().findAllByCompany(companyId,{currentOnly:true,includeArchived:false})).filter((item:any)=>ALLOWED_ALERT_STAGES.has(String(item.alertStage||'')));if(documents.length===0)return 0;const userResult=await rawTx.execute(sql`SELECT id FROM users WHERE company_id=${companyId} AND active=true AND role IN ('ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY','FINANCIAL_MANAGER')`);const userIds=rows(userResult).map(row=>String(row.id));let inserted=0;for(const document of documents){const stage=String(document.alertStage);for(const userId of userIds){const dedupKey=`DOCUMENT_ALERT:${document.id}:V${document.versionNumber}:${stage}`;const result=await rawTx.execute(sql`INSERT INTO notifications(id,company_id,user_id,event_type,dedup_key,title,message,severity,entity_type,entity_id,alert_stage,created_at,created_by) VALUES(${randomUUID()},${companyId},${userId},'DOCUMENT_EXPIRATION',${dedupKey},${`Documento: ${document.documentType}`},${notificationMessage(document)},${severityForStage(stage)},'Document',${document.id},${stage},${new Date().toISOString()},'SYSTEM') ON CONFLICT(company_id,user_id,dedup_key) DO NOTHING RETURNING id`);inserted+=rows(result).length;}}return inserted;},{trustedSystemActor:'RECURRING'});}

  static async listNotifications(companyId:string,userId:string,limit=50):Promise<ServerNotification[]>{const safeLimit=Math.min(100,Math.max(1,Math.trunc(limit)));return await UnitOfWork.run(companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Notification persistence unavailable');const result=await rawTx.execute(sql`SELECT * FROM notifications WHERE company_id=${companyId} AND user_id=${userId} ORDER BY created_at DESC,id DESC LIMIT ${safeLimit}`);return rows(result).map(mapNotification);});}
  static async unreadCount(companyId:string,userId:string):Promise<number>{return await UnitOfWork.run(companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Notification persistence unavailable');const result=await rawTx.execute(sql`SELECT count(*)::int AS count FROM notifications WHERE company_id=${companyId} AND user_id=${userId} AND read_at IS NULL`);return Number(rows(result)[0]?.count||0);});}
  static async markNotificationRead(companyId:string,userId:string,id:string):Promise<ServerNotification|null>{return await UnitOfWork.run(companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Notification persistence unavailable');const result=await rawTx.execute(sql`UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE company_id=${companyId} AND user_id=${userId} AND id=${id} RETURNING *`);return rows(result)[0]?mapNotification(rows(result)[0]):null;});}
  static async markAllNotificationsRead(companyId:string,userId:string):Promise<number>{return await UnitOfWork.run(companyId,async txContext=>{const rawTx=txContext.getRawTransaction?.();if(!rawTx)throw new Error('Notification persistence unavailable');const result=await rawTx.execute(sql`UPDATE notifications SET read_at=now() WHERE company_id=${companyId} AND user_id=${userId} AND read_at IS NULL RETURNING id`);return rows(result).length;});}
}

export interface RecurringSchedulerOptions{pollIntervalMs?:number;clock?:()=>Date;workerId?:string;}
let schedulerStarted=false,schedulerRunning=false;let schedulerTimer:NodeJS.Timeout|undefined;
export function startRecurringScheduler(options:RecurringSchedulerOptions={}):void{
  if(schedulerStarted||process.env.NODE_ENV==='test')return;schedulerStarted=true;if(process.env.RECURRING_SCHEDULER_ENABLED==='false'){console.warn('AUTOERP_RECURRING_SCHEDULER_DISABLED');return;}
  const configuredInterval=options.pollIntervalMs??Number(process.env.RECURRING_SCHEDULER_POLL_MS||60_000),interval=Number.isFinite(configuredInterval)?Math.max(5_000,configuredInterval):60_000,clock=options.clock||(()=>new Date()),workerId=options.workerId||process.env.RECURRING_WORKER_ID||`autoerp-${process.pid}`;
  const cycle=async()=>{if(schedulerRunning)return;schedulerRunning=true;try{const processingDate=clock().toISOString().slice(0,10);const activeCompanies=await db.select({id:companies.id}).from(companies).where(eq(companies.status,'ACTIVE'));for(const company of activeCompanies){try{await RecurringAuthorityService.processTenant(company.id,processingDate,workerId);await RecurringAuthorityService.materializeDocumentAlerts(company.id);await materializeInsuranceAlerts(company.id,processingDate);}catch(error){console.error('AUTOERP_RECURRING_TENANT_CYCLE_FAILURE',{companyId:company.id,error:sanitizeFailure(error)});}}}catch(error){console.error('AUTOERP_RECURRING_SCHEDULER_FAILURE',sanitizeFailure(error));}finally{schedulerRunning=false;}};
  schedulerTimer=setInterval(()=>{void cycle();},interval);schedulerTimer.unref?.();const initialTimer=setTimeout(()=>{void cycle();},Math.min(1_000,interval));initialTimer.unref?.();
}
export function stopRecurringSchedulerForTests():void{if(schedulerTimer)clearInterval(schedulerTimer);schedulerTimer=undefined;schedulerStarted=false;schedulerRunning=false;}
