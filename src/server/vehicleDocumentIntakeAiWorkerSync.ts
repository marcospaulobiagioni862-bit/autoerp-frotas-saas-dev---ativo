import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { AuditAction } from '../types/enums';
import { syncTrafficTicketDocumentIntakeWorkerResult } from './trafficTicketDocumentIntakeAiWorkerSync';

export type VehicleDocumentIntakeWorkerTarget='REVIEW_REQUIRED'|'FAILED';
export class VehicleDocumentIntakeWorkerSyncError extends Error {}

function rows(result:any):Record<string,unknown>[] {
  if(Array.isArray(result)) return result;
  return Array.isArray(result?.rows)?result.rows:[];
}

export async function syncVehicleDocumentIntakeWorkerResult(
  context:any,
  input:{companyId:string;extractionId:string;attachmentId:string;targetStatus:VehicleDocumentIntakeWorkerTarget;now:string;failureCode?:string},
):Promise<boolean>{
  const tx=context.getRawTransaction?.();
  if(!tx) throw new VehicleDocumentIntakeWorkerSyncError('RAW_TENANT_TRANSACTION_UNAVAILABLE');
  const attachmentResult=await tx.execute(sql`
    SELECT id,entity_type,entity_id FROM file_attachments
    WHERE company_id=${input.companyId} AND id=${input.attachmentId}
    LIMIT 1 FOR UPDATE
  `);
  const attachment=rows(attachmentResult)[0];
  if(!attachment) throw new VehicleDocumentIntakeWorkerSyncError('ATTACHMENT_NOT_FOUND');
  if(String(attachment.entity_type)!=='VehicleDocumentIntake') {
    try{return await syncTrafficTicketDocumentIntakeWorkerResult(context,input);}
    catch(error){throw new VehicleDocumentIntakeWorkerSyncError(error instanceof Error?error.message:'TRAFFIC_TICKET_INTAKE_SYNC_FAILED');}
  }
  const intakeId=String(attachment.entity_id||'');
  if(!intakeId) throw new VehicleDocumentIntakeWorkerSyncError('INTAKE_ENTITY_ID_MISSING');

  const intakeResult=await tx.execute(sql`
    SELECT status FROM vehicle_document_intakes
    WHERE company_id=${input.companyId}
      AND id=${intakeId}
      AND attachment_id=${input.attachmentId}
      AND archived_at IS NULL AND consumed_at IS NULL
    LIMIT 1 FOR UPDATE
  `);
  const intake=rows(intakeResult)[0];
  if(!intake) throw new VehicleDocumentIntakeWorkerSyncError('INTAKE_NOT_FOUND');
  if(String(intake.status)!=='EXTRACTING') throw new VehicleDocumentIntakeWorkerSyncError('INTAKE_STATE_MISMATCH');

  const update=await tx.execute(sql`
    UPDATE vehicle_document_intakes
    SET status=${input.targetStatus},updated_at=${input.now}
    WHERE company_id=${input.companyId}
      AND id=${intakeId}
      AND attachment_id=${input.attachmentId}
      AND status='EXTRACTING'
      AND archived_at IS NULL AND consumed_at IS NULL
    RETURNING id
  `);
  if(rows(update).length!==1) throw new VehicleDocumentIntakeWorkerSyncError('INTAKE_STATE_MISMATCH');

  await context.getAuditLogRepo().create({
    id:randomUUID(),companyId:input.companyId,entityName:'VehicleDocumentIntake',entityId:intakeId,
    action:AuditAction.UPDATE,userId:'SYSTEM_DOC_AI',userName:'AutoERP Document AI Worker',timestamp:input.now,
    previousState:JSON.stringify({event:'DOC_AI_WORKER_RESULT',status:'EXTRACTING'}),
    newState:JSON.stringify({event:'DOC_AI_WORKER_RESULT',status:input.targetStatus,extractionId:input.extractionId,...(input.failureCode?{failureCode:input.failureCode}:{}),businessMutationApplied:false}),
  });
  return true;
}
