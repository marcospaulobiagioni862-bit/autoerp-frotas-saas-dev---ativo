import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { syncTrafficTicketDocumentIntakeHumanReview } from './trafficTicketDocumentIntakeAiReviewSync';

export type VehicleDocumentIntakeReviewDecision='APPROVED'|'REJECTED';
export class VehicleDocumentIntakeReviewSyncError extends Error {}

function rows(result:any):Record<string,unknown>[] {
  if(Array.isArray(result)) return result;
  return Array.isArray(result?.rows)?result.rows:[];
}

export async function syncVehicleDocumentIntakeHumanReview(
  context:any,
  principal:AuthenticatedPrincipal,
  extraction:{id:string;attachmentId:string;status:VehicleDocumentIntakeReviewDecision;detectedDocumentType?:string|null},
  now:string,
):Promise<boolean>{
  const tx=context.getRawTransaction?.();
  if(!tx) throw new VehicleDocumentIntakeReviewSyncError('RAW_TENANT_TRANSACTION_UNAVAILABLE');
  const attachmentResult=await tx.execute(sql`
    SELECT id,entity_type,entity_id FROM file_attachments
    WHERE company_id=${principal.companyId} AND id=${extraction.attachmentId}
    LIMIT 1 FOR UPDATE
  `);
  const attachment=rows(attachmentResult)[0];
  if(!attachment) throw new VehicleDocumentIntakeReviewSyncError('ATTACHMENT_NOT_FOUND');
  if(String(attachment.entity_type)!=='VehicleDocumentIntake') {
    try{return await syncTrafficTicketDocumentIntakeHumanReview(context,principal,extraction,now);}
    catch(error){throw new VehicleDocumentIntakeReviewSyncError(error instanceof Error?error.message:'TRAFFIC_TICKET_INTAKE_REVIEW_SYNC_FAILED');}
  }

  const intakeId=String(attachment.entity_id||'');
  const intakeResult=await tx.execute(sql`
    SELECT id,created_by,status,document_type,attachment_id,approved_extraction_id,archived_at,consumed_at
    FROM vehicle_document_intakes
    WHERE company_id=${principal.companyId}
      AND id=${intakeId}
      AND attachment_id=${extraction.attachmentId}
      AND created_by=${principal.userId}
    LIMIT 1 FOR UPDATE
  `);
  const intake=rows(intakeResult)[0];
  if(!intake) throw new VehicleDocumentIntakeReviewSyncError('INTAKE_NOT_FOUND');
  if(intake.archived_at||intake.consumed_at) throw new VehicleDocumentIntakeReviewSyncError('INTAKE_FINALIZED');

  const expectedType=String(intake.document_type||'').toUpperCase();
  const detected=String(extraction.detectedDocumentType||'').toUpperCase();
  const target=extraction.status==='APPROVED'?'APPROVED':'FAILED';
  if(extraction.status==='APPROVED' && detected!==expectedType) throw new VehicleDocumentIntakeReviewSyncError('DOCUMENT_TYPE_MISMATCH');

  if(String(intake.status)===target){
    if(target==='APPROVED' && String(intake.approved_extraction_id||'')!==extraction.id){
      const updateApproved=await tx.execute(sql`
        UPDATE vehicle_document_intakes
        SET approved_extraction_id=${extraction.id},updated_at=${now}
        WHERE company_id=${principal.companyId}
          AND id=${intakeId}
          AND attachment_id=${extraction.attachmentId}
          AND created_by=${principal.userId}
          AND archived_at IS NULL AND consumed_at IS NULL
        RETURNING id
      `);
      if(rows(updateApproved).length!==1) throw new VehicleDocumentIntakeReviewSyncError('APPROVED_EXTRACTION_MISMATCH');
    }
    return true;
  }

  const validIntakeStatuses = new Set(['REVIEW_REQUIRED', 'COMPLETED', 'APPROVED']);
  if(!validIntakeStatuses.has(String(intake.status))) throw new VehicleDocumentIntakeReviewSyncError('INTAKE_STATE_MISMATCH');

  const approvedExtractionId=target==='APPROVED'?extraction.id:null;
  const update=await tx.execute(sql`
    UPDATE vehicle_document_intakes
    SET status=${target},approved_extraction_id=${approvedExtractionId},updated_at=${now}
    WHERE company_id=${principal.companyId}
      AND id=${intakeId}
      AND attachment_id=${extraction.attachmentId}
      AND created_by=${principal.userId}
      AND status IN ('REVIEW_REQUIRED', 'COMPLETED', 'APPROVED')
      AND archived_at IS NULL AND consumed_at IS NULL
    RETURNING id
  `);
  if(rows(update).length!==1) throw new VehicleDocumentIntakeReviewSyncError('INTAKE_STATE_MISMATCH');

  await context.getAuditLogRepo().create({
    id:randomUUID(),companyId:principal.companyId,entityName:'VehicleDocumentIntake',entityId:intakeId,
    action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,timestamp:now,
    previousState:JSON.stringify({event:'DOC_AI_HUMAN_REVIEW',status:'REVIEW_REQUIRED'}),
    newState:JSON.stringify({event:'DOC_AI_HUMAN_REVIEW',status:target,extractionId:extraction.id,approvedExtractionId,reviewedBy:principal.userId,businessMutationApplied:false}),
  });
  return true;
}
