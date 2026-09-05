import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import {
  TrafficTicketDocumentIntakeAiConflictError,
  TrafficTicketDocumentIntakeAiNotFoundError,
  enqueueTrafficTicketDocumentIntake,
} from './trafficTicketDocumentIntakeAiQueue';
import {
  dispatchDocumentAiExtractionFromEnvironment,
  isDocumentAiRuntimeAvailableFromEnvironment,
} from './documentAiRuntime';

const ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY']);
const WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const TTL_MS=24*60*60*1000;
const DRAFT_FIELDS=new Set([
  'plate','noticeNumber','organName','infractionCode','description','infractionDate','infractionTime','infractionLocation',
  'dueDate','discountDueDate','amount','discountAmount','points',
]);

class ValidationError extends Error {}
class NotFoundError extends Error {}
class ConflictError extends Error {}

function principalFrom(req:Request):AuthenticatedPrincipal|undefined {
  return (req as Request&{principal?:AuthenticatedPrincipal}).principal;
}
function requirePrincipal(req:Request,res:Response,write=false):AuthenticatedPrincipal|null {
  const principal=principalFrom(req);
  if(!principal){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}
  const role=String(principal.role||'').toUpperCase(),permissions=Array.isArray(principal.permissions)?principal.permissions:[];
  if(!principal.companyId||!principal.userId||!ROLES.has(role)){res.status(403).json({error:'Forbidden'});return null;}
  if(write&&!WRITE_ROLES.has(role)&&!permissions.includes('*')&&!permissions.includes('TRAFFIC_TICKET_WRITE')&&!permissions.includes('PROCESS_DOCUMENT_AI')){
    res.status(403).json({error:'Forbidden'});return null;
  }
  return principal;
}
function requireEmptyBody(body:unknown):void {
  if(body===undefined||body===null)return;
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body as Record<string,unknown>).length!==0)throw new ValidationError();
}
function record(value:unknown):Record<string,unknown>{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function map(row:any){
  return {
    id:String(row.id),companyId:String(row.company_id),createdBy:String(row.created_by),status:String(row.status),
    idempotencyKey:String(row.idempotency_key),documentType:String(row.document_type),
    attachmentId:row.attachment_id?String(row.attachment_id):undefined,
    approvedExtractionId:row.approved_extraction_id?String(row.approved_extraction_id):undefined,
    trafficTicketId:row.traffic_ticket_id?String(row.traffic_ticket_id):undefined,
    expiresAt:new Date(row.expires_at).toISOString(),consumedAt:row.consumed_at?new Date(row.consumed_at).toISOString():undefined,
    archivedAt:row.archived_at?new Date(row.archived_at).toISOString():undefined,
    createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),
  };
}
function sanitizeExtraction(item:any){
  return {id:String(item.id),attachmentId:String(item.attachmentId),attachmentChecksum:String(item.attachmentChecksum),status:String(item.status),createdAt:new Date(item.createdAt).toISOString(),updatedAt:new Date(item.updatedAt).toISOString()};
}
function projectDraft(proposedFields:unknown,corrections:unknown):Record<string,string|number>{
  const merged={...record(proposedFields),...record(corrections)},draft:Record<string,string|number>={};
  for(const [key,value] of Object.entries(merged)){
    if(!DRAFT_FIELDS.has(key))continue;
    if(typeof value==='string'){const clean=value.trim();if(clean)draft[key]=clean;}
    else if(typeof value==='number'&&Number.isFinite(value))draft[key]=value;
  }
  return draft;
}
function normalizedPlate(value:unknown):string|undefined{
  if(typeof value!=='string'||!value.trim())return undefined;
  const plate=value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)?plate:undefined;
}
async function approvedDraft(context:any,principal:AuthenticatedPrincipal,intakeId:string){
  const tx=context.getRawTransaction?.();if(!tx)throw new Error('Raw tenant transaction unavailable');
  const result:any=await tx.execute(sql`
    SELECT intake.status AS intake_status,intake.attachment_id,intake.approved_extraction_id,
      extraction.id AS extraction_id,extraction.attachment_id AS extraction_attachment_id,extraction.status AS extraction_status,
      extraction.detected_document_type,extraction.proposed_fields,extraction.corrections
    FROM traffic_ticket_document_intakes intake
    JOIN document_ai_extractions extraction ON extraction.company_id=intake.company_id AND extraction.id=intake.approved_extraction_id
    WHERE intake.company_id=${principal.companyId} AND intake.id=${intakeId} AND intake.created_by=${principal.userId}
    LIMIT 1
  `);
  const row=result.rows?.[0];if(!row)throw new NotFoundError();
  if(String(row.intake_status)!=='APPROVED'||!row.attachment_id||!row.approved_extraction_id||
    String(row.approved_extraction_id)!==String(row.extraction_id)||String(row.attachment_id)!==String(row.extraction_attachment_id)||
    String(row.extraction_status)!=='APPROVED'||String(row.detected_document_type||'').toUpperCase()!=='TRAFFIC_TICKET')throw new ConflictError();
  const fields=projectDraft(row.proposed_fields,row.corrections);if(Object.keys(fields).length===0)throw new ConflictError();
  return {documentType:'TRAFFIC_TICKET',fields};
}
async function suggestions(context:any,principal:AuthenticatedPrincipal,intakeId:string){
  const draft=await approvedDraft(context,principal,intakeId),tx=context.getRawTransaction?.();if(!tx)throw new Error('Raw tenant transaction unavailable');
  const plate=normalizedPlate(draft.fields.plate);if(!plate)return {plate:undefined,vehicle:undefined,contract:undefined,driver:undefined,ambiguous:false};
  const vehicleResult:any=await tx.execute(sql`
    SELECT id,plate,brand,model FROM vehicles
    WHERE company_id=${principal.companyId} AND plate=${plate} AND is_archived=false LIMIT 2
  `);
  const vehicles=Array.isArray(vehicleResult.rows)?vehicleResult.rows:[];
  if(vehicles.length!==1)return {plate,vehicle:undefined,contract:undefined,driver:undefined,ambiguous:vehicles.length>1};
  const vehicle=vehicles[0],date=typeof draft.fields.infractionDate==='string'?draft.fields.infractionDate:'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return {plate,vehicle:{id:String(vehicle.id),plate:String(vehicle.plate),brand:String(vehicle.brand||''),model:String(vehicle.model||'')},contract:undefined,driver:undefined,ambiguous:false};
  const contractResult:any=await tx.execute(sql`
    SELECT contract.id,contract.contract_number,contract.driver_id,driver.name AS driver_name
    FROM contracts contract
    LEFT JOIN drivers driver ON driver.company_id=contract.company_id AND driver.id=contract.driver_id AND driver.is_archived=false
    WHERE contract.company_id=${principal.companyId} AND contract.vehicle_id=${String(vehicle.id)} AND contract.is_archived=false
      AND contract.status NOT IN ('DRAFT','AWAITING_SIGNATURE','CANCELLED','ARCHIVED')
      AND contract.start_date<=${date} AND (contract.end_date IS NULL OR contract.end_date>=${date})
    ORDER BY contract.start_date DESC,contract.id
  `);
  const matches=Array.isArray(contractResult.rows)?contractResult.rows:[];
  const base={plate,vehicle:{id:String(vehicle.id),plate:String(vehicle.plate),brand:String(vehicle.brand||''),model:String(vehicle.model||'')}};
  if(matches.length!==1)return {...base,contract:undefined,driver:undefined,ambiguous:matches.length>1};
  const match=matches[0];
  return {...base,contract:{id:String(match.id),number:String(match.contract_number||'')},driver:match.driver_id?{id:String(match.driver_id),name:String(match.driver_name||'')}:undefined,ambiguous:false};
}
function schedule(companyId:string,extractionId:string):void{
  setImmediate(()=>{void dispatchDocumentAiExtractionFromEnvironment(companyId,extractionId,`traffic-ticket-intake-${extractionId}`).catch(()=>console.error('AUTOERP_TRAFFIC_TICKET_DOCUMENT_AI_DISPATCH_FAILURE'));});
}
function sendError(res:Response,error:unknown):void{
  if(error instanceof ValidationError){res.status(400).json({error:'Invalid traffic ticket document intake request'});return;}
  if(error instanceof NotFoundError||error instanceof TrafficTicketDocumentIntakeAiNotFoundError){res.status(404).json({error:'Not found'});return;}
  if(error instanceof ConflictError||error instanceof TrafficTicketDocumentIntakeAiConflictError){res.status(409).json({error:'Traffic ticket document intake conflict'});return;}
  console.error('AUTOERP_TRAFFIC_TICKET_DOCUMENT_INTAKE_FAILURE',error);res.status(500).json({error:'Traffic ticket document intake operation failed'});
}

export function registerTrafficTicketDocumentIntakeRoutes(app:Express):void{
  app.post('/api/traffic-ticket-document-intakes',async(req:Request,res:Response)=>{
    const principal=requirePrincipal(req,res,true);if(!principal)return;
    const key=typeof req.body?.idempotencyKey==='string'?req.body.idempotencyKey.trim():'';
    if(!key||key.length>200){sendError(res,new ValidationError());return;}
    try{
      const result=await UnitOfWork.run(principal.companyId,async context=>{
        const tx=context.getRawTransaction?.();if(!tx)throw new Error('Raw tenant transaction unavailable');
        const existingResult:any=await tx.execute(sql`SELECT * FROM traffic_ticket_document_intakes WHERE company_id=${principal.companyId} AND idempotency_key=${key} LIMIT 1`);
        const existing=existingResult.rows?.[0];
        if(existing){if(String(existing.created_by)!==principal.userId)throw new ConflictError();return {item:map(existing),created:false};}
        const id=randomUUID(),now=new Date(),expiresAt=new Date(now.getTime()+TTL_MS);
        const inserted:any=await tx.execute(sql`
          INSERT INTO traffic_ticket_document_intakes(id,company_id,created_by,status,idempotency_key,document_type,expires_at,created_at,updated_at)
          VALUES(${id},${principal.companyId},${principal.userId},'DRAFT',${key},'TRAFFIC_TICKET',${expiresAt.toISOString()},${now.toISOString()},${now.toISOString()})
          ON CONFLICT(company_id,idempotency_key) DO NOTHING RETURNING *
        `);
        const row=inserted.rows?.[0];if(!row)throw new ConflictError();const item=map(row);
        await context.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'TrafficTicketDocumentIntake',entityId:item.id,action:AuditAction.CREATE,newState:JSON.stringify({event:'CREATE',status:'DRAFT',documentType:'TRAFFIC_TICKET',businessMutationApplied:false}),userId:principal.userId,userName:principal.name,timestamp:now.toISOString()});
        return {item,created:true};
      });
      res.status(result.created?201:200).json({item:result.item});
    }catch(error){sendError(res,error);}
  });

  app.post('/api/traffic-ticket-document-intakes/:id/document-ai',async(req:Request,res:Response)=>{
    const principal=requirePrincipal(req,res,true);if(!principal)return;
    try{
      requireEmptyBody(req.body);
      if(!isDocumentAiRuntimeAvailableFromEnvironment()){
        res.status(503).json({error:'Análise automática de multa indisponível neste ambiente.',code:'DOCUMENT_AI_RUNTIME_UNAVAILABLE'});return;
      }
      const intakeId=String(req.params.id||'').trim();if(!intakeId)throw new ValidationError();
      const result=await UnitOfWork.run(principal.companyId,async context=>enqueueTrafficTicketDocumentIntake(context,principal,intakeId));
      schedule(principal.companyId,String(result.item.id));
      res.status(result.created?201:200).json({item:sanitizeExtraction(result.item),created:result.created});
    }catch(error){sendError(res,error);}
  });

  app.get('/api/traffic-ticket-document-intakes/:id/approved-draft',async(req:Request,res:Response)=>{
    const principal=requirePrincipal(req,res,false);if(!principal)return;
    try{const intakeId=String(req.params.id||'').trim();if(!intakeId)throw new ValidationError();const draft=await UnitOfWork.run(principal.companyId,async context=>approvedDraft(context,principal,intakeId));res.json({draft});}
    catch(error){sendError(res,error);}
  });

  app.get('/api/traffic-ticket-document-intakes/:id/suggestions',async(req:Request,res:Response)=>{
    const principal=requirePrincipal(req,res,false);if(!principal)return;
    try{const intakeId=String(req.params.id||'').trim();if(!intakeId)throw new ValidationError();const item=await UnitOfWork.run(principal.companyId,async context=>suggestions(context,principal,intakeId));res.json({item});}
    catch(error){sendError(res,error);}
  });
}
