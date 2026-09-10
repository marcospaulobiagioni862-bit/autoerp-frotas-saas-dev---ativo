import express,{type Express,type Request,type Response} from 'express';
import {createHash,randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {UnitOfWork} from '../db/uow';
import type {AuthenticatedPrincipal} from './auth';
import type {FileAttachment} from '../types/entities';
import {AuditAction} from '../types/enums';
import {hasDriverHealthPermission} from '../shared/security/driverHealthAuthorization';
import {
  AttachmentStorageNotFoundError,AttachmentStorageUnavailableError,AttachmentStorageValidationError,
  MAX_ATTACHMENT_BYTES,type AttachmentByteStorage,
} from './attachmentStorage';
import {createAttachmentStorageFromEnvironment} from './r2AttachmentStorage';
import {registerDriverDocumentIntakeRoutes} from './driverDocumentIntakeRoutes';
import {registerVehicleDocumentIntakeRoutes} from './vehicleDocumentIntakeRoutes';
import {getMoveFlexApprovedContractMaster} from '../domain/contracts/moveflexApprovedContractMaster';

type AttachmentAction='VIEW_ATTACHMENT'|'CREATE_ATTACHMENT'|'ARCHIVE_ATTACHMENT'|'RESTORE_ATTACHMENT'|'DELETE_ATTACHMENT';
const CANONICAL_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY']);
const DEFAULT_WRITE_ROLES=new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const CONTRACT_TEMPLATE_WRITE_ROLES=new Set(['ADMIN','MANAGER']);
const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED_MIME_TYPES=new Set(['application/pdf','image/jpeg','image/jpg','image/png','image/webp','video/mp4',DOCX_MIME]);
function canonicalMimeType(value:string):string{return value==='image/jpg'?'image/jpeg':value;}
function detectedMimeType(bytes:Buffer):string|undefined{
  const pdfHeader=Buffer.from('%PDF','ascii');
  const pdfPrefix=bytes.subarray(0,Math.min(bytes.length,1024));
  if(pdfPrefix.indexOf(pdfHeader)>=0)return'application/pdf';
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';
  if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return'image/png';
  if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';
  if(bytes.length>=12&&bytes.subarray(4,8).toString('ascii')==='ftyp')return'video/mp4';
  if(bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04){
    const archiveText=bytes.toString('latin1');
    if(archiveText.includes('[Content_Types].xml')&&archiveText.includes('word/document.xml'))return DOCX_MIME;
  }
  return undefined;
}
const ENTITY_TYPES=new Set(['Vehicle','Driver','DriverDocumentIntake','VehicleDocumentIntake','TrafficTicketDocumentIntake','VehicleInspection','Contract','ContractTemplate','HealthAndEmergency','TrafficTicket','MaintenanceWorkOrder','Insurance','Tracker']);
class AttachmentValidationError extends Error{}
class AttachmentNotFoundError extends Error{}
class AttachmentForbiddenError extends Error{}
class AttachmentConflictError extends Error{}
class ApprovedContractMasterAttachmentError extends Error{}

function principalFrom(req:Request):AuthenticatedPrincipal|undefined{return (req as Request&{principal?:AuthenticatedPrincipal}).principal;}
function hasAttachmentPermission(principal:AuthenticatedPrincipal,action:AttachmentAction):boolean{
  const role=String(principal.role||'').toUpperCase();if(!principal.userId||!principal.companyId||!CANONICAL_ROLES.has(role))return false;
  const permissions=Array.isArray(principal.permissions)?principal.permissions:[];if(permissions.includes('*')||permissions.includes(action))return true;
  if(action==='VIEW_ATTACHMENT')return true;
  if(action==='DELETE_ATTACHMENT')return role==='ADMIN';
  return DEFAULT_WRITE_ROLES.has(role);
}
function requireAttachmentPrincipal(req:Request,res:Response,action:AttachmentAction):AuthenticatedPrincipal|null{
  const principal=principalFrom(req);if(!principal){res.status(401).json({error:'Unauthorized: Authentication required'});return null;}
  if(!hasAttachmentPermission(principal,action)){res.status(403).json({error:'Forbidden'});return null;}return principal;
}
function header(req:Request,name:string,required=false):string|undefined{
  const raw=req.get(name);if(!raw){if(required)throw new AttachmentValidationError(`Missing ${name}`);return undefined;}
  let decoded:string;try{decoded=decodeURIComponent(raw);}catch{throw new AttachmentValidationError(`Invalid ${name}`);}
  decoded=decoded.trim();if(!decoded&&required)throw new AttachmentValidationError(`Missing ${name}`);return decoded||undefined;
}
function validateFilename(fileName:string):string{
  if(fileName.length>180||fileName.includes('..')||fileName.includes('/')||fileName.includes('\\')||/[\u0000-\u001f]/.test(fileName))throw new AttachmentValidationError('Invalid file name');return fileName;
}
function optionalIsoDate(value:string|undefined,field:string):string|undefined{
  if(!value)return undefined;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new AttachmentValidationError(`Invalid ${field}`);
  const parsed=new Date(`${value}T00:00:00Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new AttachmentValidationError(`Invalid ${field}`);return value;
}
function healthContext(principal:AuthenticatedPrincipal){return{userId:principal.userId,role:principal.role,active:true,companyId:principal.companyId,permissions:principal.permissions};}
async function validateEntity(tx:any,principal:AuthenticatedPrincipal,entityType:string,entityId:string,write:boolean):Promise<void>{
  if(!ENTITY_TYPES.has(entityType))throw new AttachmentValidationError('Invalid entity type');if(!entityId||entityId.length>120)throw new AttachmentValidationError('Invalid entity id');
  if(entityType==='Vehicle'){const item=await tx.getVehicleRepo().findByIdForCompany(principal.companyId,entityId);if(!item||item.isArchived)throw new AttachmentNotFoundError();return;}
  if(entityType==='VehicleInspection'){
    const raw=tx.getRawTransaction?.();if(!raw)throw new AttachmentForbiddenError();
    const result:any=await raw.execute(sql`
      SELECT id FROM vehicle_inspections
      WHERE company_id=${principal.companyId} AND id=${entityId}
      LIMIT 1
    `);
    if(!result.rows?.[0])throw new AttachmentNotFoundError();
    return;
  }
  if(entityType==='Contract'){const item=await tx.getContractRepo().findByIdForCompany(principal.companyId,entityId);if(!item||item.isArchived)throw new AttachmentNotFoundError();return;}
  if(entityType==='ContractTemplate'){
    if(write&&!CONTRACT_TEMPLATE_WRITE_ROLES.has(String(principal.role||'').toUpperCase()))throw new AttachmentForbiddenError();
    const item=await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId,entityId);if(!item||item.isArchived)throw new AttachmentNotFoundError();return;
  }
  if(entityType==='TrafficTicket'){const item=await tx.getTrafficTicketRepo().findByIdForCompany(principal.companyId,entityId);if(!item)throw new AttachmentNotFoundError();return;}
  if(entityType==='MaintenanceWorkOrder'){const item=await tx.getWorkOrderRepo().findByIdForCompany(principal.companyId,entityId);if(!item)throw new AttachmentNotFoundError();return;}
  if(entityType==='Insurance'){const item=await tx.getInsuranceRepo().findByIdForCompany(principal.companyId,entityId);if(!item)throw new AttachmentNotFoundError();return;}
  if(entityType==='Tracker'){const item=await tx.getTrackerRepo().findByIdForCompany(principal.companyId,entityId);if(!item)throw new AttachmentNotFoundError();return;}
  if(entityType==='VehicleDocumentIntake'){
    const raw=tx.getRawTransaction?.();if(!raw)throw new AttachmentForbiddenError();
    const result:any=await raw.execute(sql`
      SELECT created_by,status,expires_at,attachment_id,document_type
      FROM vehicle_document_intakes
      WHERE company_id=${principal.companyId} AND id=${entityId}
      LIMIT 1
    `);
    const item=result.rows?.[0];
    if(!item||String(item.created_by)!==principal.userId)throw new AttachmentNotFoundError();
    const status=String(item.status),expiresAt=new Date(item.expires_at).getTime();
    if(status==='ARCHIVED'||status==='CONSUMED'||!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new AttachmentNotFoundError();
    if(write&&(status!=='DRAFT'||item.attachment_id))throw new AttachmentForbiddenError();
    return;
  }
  if(entityType==='DriverDocumentIntake'){
    const raw=tx.getRawTransaction?.();if(!raw)throw new AttachmentForbiddenError();
    const result:any=await raw.execute(sql`
      SELECT created_by,status,expires_at,attachment_id
      FROM driver_document_intakes
      WHERE company_id=${principal.companyId} AND id=${entityId}
      LIMIT 1
    `);
    const item=result.rows?.[0];
    if(!item||String(item.created_by)!==principal.userId)throw new AttachmentNotFoundError();
    const status=String(item.status),expiresAt=new Date(item.expires_at).getTime();
    if(status==='ARCHIVED'||status==='CONSUMED'||!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new AttachmentNotFoundError();
    if(write&&(status!=='DRAFT'||item.attachment_id))throw new AttachmentForbiddenError();
    return;
  }
  if(entityType==='TrafficTicketDocumentIntake'){
    const raw=tx.getRawTransaction?.();if(!raw)throw new AttachmentForbiddenError();
    const result:any=await raw.execute(sql`
      SELECT created_by,status,expires_at,attachment_id
      FROM traffic_ticket_document_intakes
      WHERE company_id=${principal.companyId} AND id=${entityId}
      LIMIT 1
    `);
    const item=result.rows?.[0];
    if(!item||String(item.created_by)!==principal.userId)throw new AttachmentNotFoundError();
    const status=String(item.status),expiresAt=new Date(item.expires_at).getTime();
    if(status==='ARCHIVED'||status==='CONSUMED'||!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new AttachmentNotFoundError();
    if(write&&(status!=='DRAFT'||item.attachment_id))throw new AttachmentForbiddenError();
    return;
  }
  const driver=await tx.getDriverRepo().findByIdForCompany(principal.companyId,entityId);if(!driver||driver.isArchived)throw new AttachmentNotFoundError();
  if(entityType==='HealthAndEmergency'){const action=write?'EDIT_DRIVER_HEALTH':'VIEW_DRIVER_HEALTH';if(!hasDriverHealthPermission(action,healthContext(principal)))throw new AttachmentForbiddenError();}
}
function sendAttachmentError(res:Response,error:unknown):void{
  if(error instanceof ApprovedContractMasterAttachmentError){res.status(400).json({error:'O arquivo não corresponde ao arquivo mestre aprovado da MoveFlex.'});return;}
  if(error instanceof AttachmentForbiddenError){res.status(403).json({error:'Forbidden'});return;}
  if(error instanceof AttachmentConflictError){res.status(409).json({error:error.message||'Attachment is linked and cannot be deleted'});return;}
  if(error instanceof AttachmentNotFoundError||error instanceof AttachmentStorageNotFoundError){res.status(404).json({error:'Not found'});return;}
  if(error instanceof AttachmentValidationError||error instanceof AttachmentStorageValidationError){res.status(400).json({error:'Invalid attachment request'});return;}
  if(error instanceof AttachmentStorageUnavailableError){res.status(503).json({error:'Attachment storage unavailable'});return;}
  console.error('AUTOERP_ATTACHMENT_AUTHORITY_FAILURE',error);res.status(500).json({error:'Attachment operation failed'});
}
function auditState(item:FileAttachment):string{return JSON.stringify({entityType:item.entityType,entityId:item.entityId,documentType:item.documentType,fileName:item.fileName,fileSize:item.fileSize,mimeType:item.mimeType,checksum:item.checksum,storageProvider:item.storageProvider,contentState:item.contentState,isArchived:item.isArchived});}
async function assertPermanentDeleteAllowed(tx:any,principal:AuthenticatedPrincipal,item:FileAttachment):Promise<void>{
  if(item.entityType==='ContractTemplate')throw new AttachmentConflictError('Modelo de contrato em uso: arquive em vez de excluir definitivamente.');
  const raw=tx.getRawTransaction?.();if(!raw)throw new AttachmentForbiddenError();

  const linked:any=await raw.execute(sql`
    SELECT source FROM (
      SELECT 'documents' AS source WHERE EXISTS (SELECT 1 FROM documents WHERE company_id=${principal.companyId} AND attachment_id=${item.id})
      UNION ALL SELECT 'contract_artifacts' WHERE EXISTS (SELECT 1 FROM contract_artifacts WHERE company_id=${principal.companyId} AND attachment_id=${item.id})
      UNION ALL SELECT 'oil_change_records' WHERE EXISTS (SELECT 1 FROM oil_change_records WHERE company_id=${principal.companyId} AND attachment_id=${item.id})
      UNION ALL SELECT 'tire_records' WHERE EXISTS (SELECT 1 FROM tire_records WHERE company_id=${principal.companyId} AND attachment_id=${item.id})
    ) refs LIMIT 1
  `);
  if(linked.rows?.[0])throw new AttachmentConflictError('Documento vinculado ao ERP: arquive em vez de excluir definitivamente.');

  const intakeResult:any=await raw.execute(sql`
    SELECT intake_type,id,status,approved_extraction_id,business_id,consumed_at FROM (
      SELECT 'DRIVER' AS intake_type,id,status,approved_extraction_id,driver_id AS business_id,consumed_at
        FROM driver_document_intakes WHERE company_id=${principal.companyId} AND attachment_id=${item.id}
      UNION ALL
      SELECT 'VEHICLE',id,status,approved_extraction_id,vehicle_id AS business_id,consumed_at
        FROM vehicle_document_intakes WHERE company_id=${principal.companyId} AND attachment_id=${item.id}
      UNION ALL
      SELECT 'TRAFFIC_TICKET',id,status,approved_extraction_id,traffic_ticket_id AS business_id,consumed_at
        FROM traffic_ticket_document_intakes WHERE company_id=${principal.companyId} AND attachment_id=${item.id}
    ) intakes
  `);
  const intakes=intakeResult.rows||[];
  for(const intake of intakes){
    const status=String(intake.status||'');
    if(!['FAILED','ARCHIVED'].includes(status)||intake.approved_extraction_id||intake.business_id||intake.consumed_at){
      throw new AttachmentConflictError('Documento de entrada ainda está em uso: arquive em vez de excluir definitivamente.');
    }
  }

  const extractionResult:any=await raw.execute(sql`
    SELECT id,status,approved_at,proposed_fields,corrections
    FROM document_ai_extractions
    WHERE company_id=${principal.companyId} AND attachment_id=${item.id}
    FOR UPDATE
  `);
  const extractions=extractionResult.rows||[];
  for(const extraction of extractions){
    const proposed=extraction.proposed_fields&&typeof extraction.proposed_fields==='object'&&!Array.isArray(extraction.proposed_fields)?extraction.proposed_fields:{};
    const corrections=extraction.corrections&&typeof extraction.corrections==='object'&&!Array.isArray(extraction.corrections)?extraction.corrections:{};
    if(!['FAILED','REJECTED'].includes(String(extraction.status||''))||extraction.approved_at||Object.keys(proposed).length>0||Object.keys(corrections).length>0){
      throw new AttachmentConflictError('Documento possui extração ativa, aprovada ou dados aproveitados: arquive em vez de excluir definitivamente.');
    }
  }

  if(extractions.length>0){
    await raw.execute(sql`DELETE FROM document_ai_extractions WHERE company_id=${principal.companyId} AND attachment_id=${item.id}`);
  }
  if(intakes.length>0){
    await raw.execute(sql`DELETE FROM driver_document_intakes WHERE company_id=${principal.companyId} AND attachment_id=${item.id} AND status IN ('FAILED','ARCHIVED') AND driver_id IS NULL AND consumed_at IS NULL AND approved_extraction_id IS NULL`);
    await raw.execute(sql`DELETE FROM vehicle_document_intakes WHERE company_id=${principal.companyId} AND attachment_id=${item.id} AND status IN ('FAILED','ARCHIVED') AND vehicle_id IS NULL AND consumed_at IS NULL AND approved_extraction_id IS NULL`);
    await raw.execute(sql`DELETE FROM traffic_ticket_document_intakes WHERE company_id=${principal.companyId} AND attachment_id=${item.id} AND status IN ('FAILED','ARCHIVED') AND traffic_ticket_id IS NULL AND consumed_at IS NULL AND approved_extraction_id IS NULL`);
  }
}

export function registerAttachmentRoutes(app:Express,storage:AttachmentByteStorage=createAttachmentStorageFromEnvironment()):void{
  registerDriverDocumentIntakeRoutes(app);
  registerVehicleDocumentIntakeRoutes(app);
  app.get('/api/attachments/storage/status',(req,res)=>{
    const principal=requireAttachmentPrincipal(req,res,'VIEW_ATTACHMENT');if(!principal)return;
    const status=storage.getConfiguration();
    res.json({storage:status});
  });
  app.get('/api/attachments',async(req,res)=>{
    const principal=requireAttachmentPrincipal(req,res,'VIEW_ATTACHMENT');if(!principal)return;
    const entityType=typeof req.query.entityType==='string'?req.query.entityType.trim():'',entityId=typeof req.query.entityId==='string'?req.query.entityId.trim():'';
    try{const items=await UnitOfWork.run(principal.companyId,async tx=>{if(entityType||entityId){if(!entityType||!entityId)throw new AttachmentValidationError();await validateEntity(tx,principal,entityType,entityId,false);return await tx.getAttachmentRepo().findByEntity(principal.companyId,entityType,entityId);}const all=await tx.getAttachmentRepo().findAllByCompany(principal.companyId);return all.filter((item:FileAttachment)=>item.entityType!=='DriverDocumentIntake'&&item.entityType!=='VehicleDocumentIntake');});res.json({items});}catch(error){sendAttachmentError(res,error);}
  });
  app.get('/api/attachments/gallery',async(req,res)=>{
    const principal=requireAttachmentPrincipal(req,res,'VIEW_ATTACHMENT');if(!principal)return;
    const entityType=typeof req.query.entityType==='string'?req.query.entityType.trim():'';
    const entityId=typeof req.query.entityId==='string'?req.query.entityId.trim():'';
    try{
      if(entityType!=='Vehicle'&&entityType!=='Driver')throw new AttachmentValidationError('Invalid gallery entity type');
      if(!entityId)throw new AttachmentValidationError('Missing gallery entity id');
      const items=await UnitOfWork.run(principal.companyId,async tx=>{
        await validateEntity(tx,principal,entityType,entityId,false);
        return await tx.getAttachmentRepo().findEntityGallery(principal.companyId,entityType,entityId);
      });
      res.json({items});
    }catch(error){sendAttachmentError(res,error);}
  });
  app.get('/api/attachments/:id',async(req,res)=>{const principal=requireAttachmentPrincipal(req,res,'VIEW_ATTACHMENT');if(!principal)return;try{const item=await UnitOfWork.run(principal.companyId,async tx=>{const found=await tx.getAttachmentRepo().findByIdForCompany(principal.companyId,req.params.id);if(!found)throw new AttachmentNotFoundError();await validateEntity(tx,principal,found.entityType,found.entityId,false);return found;});res.json({item});}catch(error){sendAttachmentError(res,error);}});
  app.post('/api/attachments',express.raw({type:()=>true,limit:MAX_ATTACHMENT_BYTES}),async(req:Request,res:Response)=>{
    const principal=requireAttachmentPrincipal(req,res,'CREATE_ATTACHMENT');if(!principal)return;let storageKey:string|undefined;
    try{
      const entityType=header(req,'x-autoerp-entity-type',true)!,entityId=header(req,'x-autoerp-entity-id',true)!,documentType=header(req,'x-autoerp-document-type'),fileName=validateFilename(header(req,'x-autoerp-file-name',true)!);
      if(entityType==='DriverDocumentIntake'&&documentType?.trim().toUpperCase()!=='CNH')throw new AttachmentValidationError('Driver intake requires CNH');
      if(entityType==='VehicleDocumentIntake'){
        const normalizedDocumentType=String(documentType||'').trim().toUpperCase().replace(/[-/ ]/g,'_');
        if(!['CRLV','CRV','ATPV_E'].includes(normalizedDocumentType))throw new AttachmentValidationError('Vehicle intake requires CRLV, CRV or ATPV_E');
      }
      if(entityType==='ContractTemplate'&&documentType?.trim().toUpperCase()!=='CONTRACT_TEMPLATE_SOURCE')throw new AttachmentValidationError('Contract template requires source document type');
      const description=header(req,'x-autoerp-description'),issueDate=optionalIsoDate(header(req,'x-autoerp-issue-date'),'issueDate'),expirationDate=optionalIsoDate(header(req,'x-autoerp-expiration-date'),'expirationDate');
      const mimeType=String(req.get('content-type')||'').split(';',1)[0].trim().toLowerCase();if(!ALLOWED_MIME_TYPES.has(mimeType))throw new AttachmentValidationError('Invalid mime type');
      if(mimeType===DOCX_MIME&&entityType!=='ContractTemplate')throw new AttachmentValidationError('DOCX is only allowed for contract template source');
      if(entityType==='ContractTemplate'&&mimeType!=='application/pdf'&&mimeType!==DOCX_MIME)throw new AttachmentValidationError('Contract template source must be PDF or DOCX');
      if(!Buffer.isBuffer(req.body)||req.body.length===0)throw new AttachmentValidationError('Empty file');if(req.body.length>MAX_ATTACHMENT_BYTES){res.status(413).json({error:'Attachment too large'});return;}const detected=detectedMimeType(req.body);if(!detected||detected!==canonicalMimeType(mimeType))throw new AttachmentValidationError('File signature does not match mime type');
      await UnitOfWork.run(principal.companyId,async tx=>{
        await validateEntity(tx,principal,entityType,entityId,true);
        if(entityType==='ContractTemplate'){
          const template=await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId,entityId);
          const master=template?getMoveFlexApprovedContractMaster(template.templateKey):undefined;
          if(master){
            const checksum=createHash('sha256').update(req.body).digest('hex');
            if(
              mimeType!==DOCX_MIME||
              req.body.length!==master.fileSize||
              checksum!==master.sha256||
              template.contentMarkdown.trim()||
              !template.isCurrent||
              template.isArchived
            )throw new ApprovedContractMasterAttachmentError();
          }
        }
      });
      const id=randomUUID(),stored=await storage.write(principal.companyId,id,req.body);storageKey=stored.storageKey;const now=new Date().toISOString();
      const item=await UnitOfWork.run(principal.companyId,async tx=>{
        await validateEntity(tx,principal,entityType,entityId,true);
        if(entityType==='ContractTemplate'){
          const existing=await tx.getAttachmentRepo().findByEntity(principal.companyId,entityType,entityId);
          if(existing.some((candidate:FileAttachment)=>!candidate.isArchived&&candidate.documentType==='CONTRACT_TEMPLATE_SOURCE'))throw new AttachmentForbiddenError();
        }
        const created=await tx.getAttachmentRepo().create({id,companyId:principal.companyId,entityName:entityType,entityType,entityId,documentType,fileName,fileSize:stored.fileSize,mimeType,uploadedBy:principal.name,storageProvider:storage.provider,storageKey:stored.storageKey,checksum:stored.checksum,createdBy:principal.userId,isArchived:false,contentState:'AVAILABLE',description,issueDate,expirationDate,createdAt:now});
        if(entityType==='VehicleDocumentIntake'){
          const raw=tx.getRawTransaction?.();if(!raw)throw new AttachmentForbiddenError();
          const linked:any=await raw.execute(sql`
            UPDATE vehicle_document_intakes
            SET attachment_id=${created.id},status='DOCUMENT_UPLOADED',updated_at=${now}
            WHERE company_id=${principal.companyId}
              AND id=${entityId}
              AND created_by=${principal.userId}
              AND status='DRAFT'
              AND attachment_id IS NULL
              AND expires_at>NOW()
            RETURNING id
          `);
          if(!linked.rows?.[0])throw new AttachmentForbiddenError();
          await tx.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'VehicleDocumentIntake',entityId,action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,newState:JSON.stringify({event:'ATTACH_DOCUMENT',attachmentId:created.id,status:'DOCUMENT_UPLOADED'}),timestamp:now});
        }
        if(entityType==='DriverDocumentIntake'){
          const raw=tx.getRawTransaction?.();if(!raw)throw new AttachmentForbiddenError();
          const linked:any=await raw.execute(sql`
            UPDATE driver_document_intakes
            SET attachment_id=${created.id},status='DOCUMENT_UPLOADED',updated_at=${now}
            WHERE company_id=${principal.companyId}
              AND id=${entityId}
              AND created_by=${principal.userId}
              AND status='DRAFT'
              AND attachment_id IS NULL
              AND expires_at>NOW()
            RETURNING id
          `);
          if(!linked.rows?.[0])throw new AttachmentForbiddenError();
          await tx.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'DriverDocumentIntake',entityId,action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,newState:JSON.stringify({event:'ATTACH_DOCUMENT',attachmentId:created.id,status:'DOCUMENT_UPLOADED'}),timestamp:now});
        }
        await tx.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'FileAttachment',entityId:created.id,action:AuditAction.CREATE,newState:auditState(created),userId:principal.userId,userName:principal.name,timestamp:now});return created;
      });res.status(201).json({item});
    }catch(error){if(storageKey)await storage.remove(principal.companyId,storageKey).catch(cleanup=>console.error('AUTOERP_ATTACHMENT_COMPENSATION_FAILURE',cleanup));sendAttachmentError(res,error);}
  });
  app.get('/api/attachments/:id/content',async(req,res)=>{const principal=requireAttachmentPrincipal(req,res,'VIEW_ATTACHMENT');if(!principal)return;try{
    const item=await UnitOfWork.run(principal.companyId,async tx=>{const found=await tx.getAttachmentRepo().findByIdForCompany(principal.companyId,req.params.id);if(!found||found.isArchived)throw new AttachmentNotFoundError();await validateEntity(tx,principal,found.entityType,found.entityId,false);if(found.storageProvider!==storage.provider||found.contentState!=='AVAILABLE'||!found.storageKey)throw new AttachmentNotFoundError();return found;});
    const bytes=await storage.read(principal.companyId,item.storageKey!),checksum=createHash('sha256').update(bytes).digest('hex');if(bytes.length!==item.fileSize||!item.checksum||checksum!==item.checksum)throw new Error('Attachment integrity mismatch');
    await UnitOfWork.run(principal.companyId,async tx=>{await tx.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'FileAttachment',entityId:item.id,action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,newState:JSON.stringify({event:'DOWNLOAD',checksum}),timestamp:new Date().toISOString()});});
    const safeName=item.fileName.replace(/[\r\n"]/g,'_');res.setHeader('content-type',item.mimeType);res.setHeader('content-length',String(bytes.length));res.setHeader('content-disposition',`inline; filename="${safeName}"`);res.setHeader('x-content-type-options','nosniff');res.send(bytes);
  }catch(error){sendAttachmentError(res,error);}});
  app.delete('/api/attachments/:id',async(req,res)=>{
    const principal=requireAttachmentPrincipal(req,res,'DELETE_ATTACHMENT');if(!principal)return;
    let deletedItem:FileAttachment|undefined;
    try{
      deletedItem=await UnitOfWork.run(principal.companyId,async tx=>{
        const existing=await tx.getAttachmentRepo().findByIdForCompany(principal.companyId,req.params.id);
        if(!existing)throw new AttachmentNotFoundError();
        if(!['DriverDocumentIntake','VehicleDocumentIntake','TrafficTicketDocumentIntake'].includes(existing.entityType)){
          await validateEntity(tx,principal,existing.entityType,existing.entityId,false);
        }
        await assertPermanentDeleteAllowed(tx,principal,existing);
        const raw=tx.getRawTransaction?.();if(!raw)throw new AttachmentForbiddenError();
        const removed:any=await raw.execute(sql`DELETE FROM file_attachments WHERE company_id=${principal.companyId} AND id=${existing.id} RETURNING id`);
        if(!removed.rows?.[0])throw new AttachmentNotFoundError();
        await tx.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'FileAttachment',entityId:existing.id,action:AuditAction.DELETE,previousState:auditState(existing),newState:JSON.stringify({event:'PERMANENT_DELETE'}),userId:principal.userId,userName:principal.name,timestamp:new Date().toISOString()});
        return existing;
      });
      let storageRemoved=true;
      if(deletedItem.storageProvider===storage.provider&&deletedItem.contentState==='AVAILABLE'&&deletedItem.storageKey){
        try{await storage.remove(principal.companyId,deletedItem.storageKey);}
        catch(storageError){storageRemoved=false;console.error('AUTOERP_ATTACHMENT_DELETE_STORAGE_FAILURE',storageError);}
      }
      res.json({deleted:true,storageRemoved});
    }catch(error){sendAttachmentError(res,error);}
  });
  for(const lifecycle of[{path:'archive',action:'ARCHIVE_ATTACHMENT' as const,archived:true},{path:'restore',action:'RESTORE_ATTACHMENT' as const,archived:false}]){
    app.post(`/api/attachments/:id/${lifecycle.path}`,async(req,res)=>{const principal=requireAttachmentPrincipal(req,res,lifecycle.action);if(!principal)return;try{
      const item=await UnitOfWork.run(principal.companyId,async tx=>{const existing=await tx.getAttachmentRepo().findByIdForCompany(principal.companyId,req.params.id);if(!existing)throw new AttachmentNotFoundError();await validateEntity(tx,principal,existing.entityType,existing.entityId,true);if(existing.isArchived===lifecycle.archived)return existing;
        if(lifecycle.archived&&existing.entityType==='ContractTemplate'&&existing.documentType==='CONTRACT_TEMPLATE_SOURCE'){
          const template=await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId,existing.entityId);
          const master=template?getMoveFlexApprovedContractMaster(template.templateKey):undefined;
          if(master&&existing.checksum===master.sha256&&existing.fileSize===master.fileSize){
            throw new AttachmentConflictError('O arquivo mestre aprovado da MoveFlex é imutável e não pode ser arquivado.');
          }
        }
        const saved=await tx.getAttachmentRepo().updateForCompany(principal.companyId,existing.id,{isArchived:lifecycle.archived});if(!saved)throw new AttachmentNotFoundError();await tx.getAuditLogRepo().create({id:randomUUID(),companyId:principal.companyId,entityName:'FileAttachment',entityId:existing.id,action:AuditAction.UPDATE,previousState:JSON.stringify({isArchived:existing.isArchived}),newState:JSON.stringify({isArchived:saved.isArchived,event:lifecycle.path.toUpperCase()}),userId:principal.userId,userName:principal.name,timestamp:new Date().toISOString()});return saved;});res.json({item});
    }catch(error){sendAttachmentError(res,error);}});
  }
}
