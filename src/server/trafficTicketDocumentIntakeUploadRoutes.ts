import express,{type Express,type Request,type Response} from 'express';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {UnitOfWork} from '../db/uow';
import {AuditAction} from '../types/enums';
import type {AuthenticatedPrincipal} from './auth';
import {
  AttachmentStorageUnavailableError,AttachmentStorageValidationError,MAX_ATTACHMENT_BYTES,type AttachmentByteStorage,
} from './attachmentStorage';
import {createAttachmentStorageFromEnvironment} from './r2AttachmentStorage';

const ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const ALLOWED_MIME_TYPES=new Set(['application/pdf','image/jpeg','image/jpg','image/png','image/webp']);
class ValidationError extends Error{}
class NotFoundError extends Error{}
class ConflictError extends Error{}

function principalFrom(req:Request):AuthenticatedPrincipal|undefined{return (req as Request&{principal?:AuthenticatedPrincipal}).principal;}
function requirePrincipal(req:Request,res:Response):AuthenticatedPrincipal|null{
  const principal=principalFrom(req);if(!principal){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}
  const role=String(principal.role||'').toUpperCase(),permissions=Array.isArray(principal.permissions)?principal.permissions:[];
  if(!principal.companyId||!principal.userId||(!ROLES.has(role)&&!permissions.includes('*')&&!permissions.includes('TRAFFIC_TICKET_WRITE'))){res.status(403).json({error:'Forbidden'});return null;}
  return principal;
}
function header(req:Request,name:string,required=false):string|undefined{
  const raw=req.get(name);if(!raw){if(required)throw new ValidationError();return undefined;}
  let value:string;try{value=decodeURIComponent(raw).trim();}catch{throw new ValidationError();}
  if(!value&&required)throw new ValidationError();return value||undefined;
}
function fileName(value:string):string{
  if(value.length>180||value.includes('..')||value.includes('/')||value.includes('\\')||/[\u0000-\u001f]/.test(value))throw new ValidationError();return value;
}
function canonicalMime(value:string):string{return value==='image/jpg'?'image/jpeg':value;}
function detectedMime(bytes:Buffer):string|undefined{
  if(bytes.length>=4&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46)return'application/pdf';
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';
  if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return'image/png';
  if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';
  return undefined;
}
function sendError(res:Response,error:unknown):void{
  if(error instanceof ValidationError||error instanceof AttachmentStorageValidationError){res.status(400).json({error:'Invalid traffic ticket intake attachment'});return;}
  if(error instanceof NotFoundError){res.status(404).json({error:'Not found'});return;}
  if(error instanceof ConflictError){res.status(409).json({error:'Traffic ticket document intake conflict'});return;}
  if(error instanceof AttachmentStorageUnavailableError){res.status(503).json({error:'Attachment storage unavailable'});return;}
  console.error('AUTOERP_TRAFFIC_TICKET_INTAKE_UPLOAD_FAILURE',error);res.status(500).json({error:'Traffic ticket intake upload failed'});
}

export function registerTrafficTicketDocumentIntakeUploadRoutes(
  app:Express,
  storage:AttachmentByteStorage=createAttachmentStorageFromEnvironment(),
):void{
  app.post('/api/traffic-ticket-document-intakes/:id/attachment',express.raw({type:()=>true,limit:MAX_ATTACHMENT_BYTES}),async(req:Request,res:Response)=>{
    const principal=requirePrincipal(req,res);if(!principal)return;let storageKey:string|undefined;
    try{
      const intakeId=String(req.params.id||'').trim();if(!intakeId||intakeId.length>120)throw new ValidationError();
      const name=fileName(header(req,'x-autoerp-file-name',true)!);
      const mime=String(req.get('content-type')||'').split(';',1)[0].trim().toLowerCase();
      if(!ALLOWED_MIME_TYPES.has(mime))throw new ValidationError();
      if(!Buffer.isBuffer(req.body)||req.body.length===0)throw new ValidationError();
      if(req.body.length>MAX_ATTACHMENT_BYTES){res.status(413).json({error:'Attachment too large'});return;}
      const detected=detectedMime(req.body);if(!detected||detected!==canonicalMime(mime))throw new ValidationError();

      await UnitOfWork.run(principal.companyId,async context=>{
        const tx=context.getRawTransaction?.();if(!tx)throw new Error('Raw tenant transaction unavailable');
        const result:any=await tx.execute(sql`
          SELECT id,status,created_by,attachment_id,expires_at FROM traffic_ticket_document_intakes
          WHERE company_id=${principal.companyId} AND id=${intakeId} LIMIT 1
        `);
        const intake=result.rows?.[0];if(!intake||String(intake.created_by)!==principal.userId)throw new NotFoundError();
        if(String(intake.status)!=='DRAFT'||intake.attachment_id||new Date(intake.expires_at).getTime()<=Date.now())throw new ConflictError();
      });

      const attachmentId=randomUUID(),stored=await storage.write(principal.companyId,attachmentId,req.body);storageKey=stored.storageKey;
      const item=await UnitOfWork.run(principal.companyId,async context=>{
        const tx=context.getRawTransaction?.();if(!tx)throw new Error('Raw tenant transaction unavailable');
        const locked:any=await tx.execute(sql`
          SELECT id,status,created_by,attachment_id,expires_at FROM traffic_ticket_document_intakes
          WHERE company_id=${principal.companyId} AND id=${intakeId} LIMIT 1 FOR UPDATE
        `);
        const intake=locked.rows?.[0];if(!intake||String(intake.created_by)!==principal.userId)throw new NotFoundError();
        if(String(intake.status)!=='DRAFT'||intake.attachment_id||new Date(intake.expires_at).getTime()<=Date.now())throw new ConflictError();
        const now=new Date().toISOString();
        const created=await context.getAttachmentRepo().create({
          id:attachmentId,companyId:principal.companyId,entityName:'TrafficTicketDocumentIntake',entityType:'TrafficTicketDocumentIntake',entityId:intakeId,
          documentType:'TRAFFIC_TICKET',fileName:name,fileSize:stored.fileSize,mimeType:mime,uploadedBy:principal.name,
          storageProvider:storage.provider,storageKey:stored.storageKey,checksum:stored.checksum,createdBy:principal.userId,
          isArchived:false,contentState:'AVAILABLE',createdAt:now,
        });
        const linked:any=await tx.execute(sql`
          UPDATE traffic_ticket_document_intakes SET attachment_id=${created.id},status='DOCUMENT_UPLOADED',updated_at=${now}
          WHERE company_id=${principal.companyId} AND id=${intakeId} AND created_by=${principal.userId}
            AND status='DRAFT' AND attachment_id IS NULL AND expires_at>NOW()
          RETURNING id
        `);
        if(!linked.rows?.[0])throw new ConflictError();
        await context.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'FileAttachment',entityId:created.id,action:AuditAction.CREATE,newState:JSON.stringify({entityType:'TrafficTicketDocumentIntake',entityId:intakeId,documentType:'TRAFFIC_TICKET',fileName:name,fileSize:stored.fileSize,mimeType:mime,checksum:stored.checksum,storageProvider:storage.provider,contentState:'AVAILABLE',isArchived:false}),userId:principal.userId,userName:principal.name,timestamp:now});
        await context.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'TrafficTicketDocumentIntake',entityId:intakeId,action:AuditAction.UPDATE,previousState:JSON.stringify({status:'DRAFT'}),newState:JSON.stringify({event:'ATTACH_DOCUMENT',attachmentId:created.id,status:'DOCUMENT_UPLOADED',businessMutationApplied:false}),userId:principal.userId,userName:principal.name,timestamp:now});
        return created;
      });
      res.status(201).json({item});
    }catch(error){if(storageKey)await storage.remove(principal.companyId,storageKey).catch(cleanup=>console.error('AUTOERP_TRAFFIC_TICKET_INTAKE_UPLOAD_COMPENSATION_FAILURE',cleanup));sendError(res,error);}
  });
}
