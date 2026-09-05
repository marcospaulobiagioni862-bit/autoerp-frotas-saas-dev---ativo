import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export type TrafficTicketDocumentIntakeReviewDecision='APPROVED'|'REJECTED';
export class TrafficTicketDocumentIntakeReviewSyncError extends Error {}

function rows(result:any):Record<string,unknown>[] {
  if(Array.isArray(result)) return result;
  return Array.isArray(result?.rows)?result.rows:[];
}

export async function syncTrafficTicketDocumentIntakeHumanReview(
  context:any,
  principal:AuthenticatedPrincipal,
  extraction:{id:string;attachmentId:string;status:TrafficTicketDocumentIntakeReviewDecision;detectedDocumentType?:string|null},
  now:string,
):Promise<boolean>{
  const tx=context.getRawTransaction?.();
  if(!tx) throw new TrafficTicketDocumentIntakeReviewSyncError('RAW_TENANT_TRANSACTION_UNAVAILABLE');
  const attachmentResult=await tx.execute(sql`
    SELECT id,entity_type,entity_id FROM file_attachments
    WHERE company_id=${principal.companyId} AND id=${extraction.attachmentId}
    LIMIT 1 FOR UPDATE
  `);
  const attachment=rows(attachmentResult)[0];
  if(!attachment) throw new TrafficTicketDocumentIntakeReviewSyncError('ATTACHMENT_NOT_FOUND');
  if(String(attachment.entity_type)!=='TrafficTicketDocumentIntake') return false;

  const intakeId=String(attachment.entity_id||'');
  const intakeResult=await tx.execute(sql`
    SELECT id,created_by,status,document_type,attachment_id,approved_extraction_id,archived_at,consumed_at
    FROM traffic_ticket_document_intakes
    WHERE company_id=${principal.companyId} AND id=${intakeId}
      AND attachment_id=${extraction.attachmentId} AND created_by=${principal.userId}
    LIMIT 1 FOR UPDATE
  `);
  const intake=rows(intakeResult)[0];
  if(!intake) throw new TrafficTicketDocumentIntakeReviewSyncError('INTAKE_NOT_FOUND');
  if(intake.archived_at||intake.consumed_at) throw new TrafficTicketDocumentIntakeReviewSyncError('INTAKE_FINALIZED');

  const detected=String(extraction.detectedDocumentType||'').toUpperCase();
  const target=extraction.status==='APPROVED'?'APPROVED':'FAILED';
  if(extraction.status==='APPROVED'&&detected!=='TRAFFIC_TICKET') throw new TrafficTicketDocumentIntakeReviewSyncError('DOCUMENT_TYPE_MISMATCH');
  if(String(intake.document_type)!=='TRAFFIC_TICKET') throw new TrafficTicketDocumentIntakeReviewSyncError('DOCUMENT_TYPE_MISMATCH');

  if(String(intake.status)===target){
    if(target==='APPROVED'&&String(intake.approved_extraction_id||'')!==extraction.id) throw new TrafficTicketDocumentIntakeReviewSyncError('APPROVED_EXTRACTION_MISMATCH');
    return true;
  }
  if(String(intake.status)!=='REVIEW_REQUIRED') throw new TrafficTicketDocumentIntakeReviewSyncError('INTAKE_STATE_MISMATCH');

  const approvedExtractionId=target==='APPROVED'?extraction.id:null;
  const update=await tx.execute(sql`
    UPDATE traffic_ticket_document_intakes
    SET status=${target},approved_extraction_id=${approvedExtractionId},updated_at=${now}
    WHERE company_id=${principal.companyId} AND id=${intakeId}
      AND attachment_id=${extraction.attachmentId} AND created_by=${principal.userId}
      AND status='REVIEW_REQUIRED' AND archived_at IS NULL AND consumed_at IS NULL
    RETURNING id
  `);
  if(rows(update).length!==1) throw new TrafficTicketDocumentIntakeReviewSyncError('INTAKE_STATE_MISMATCH');

  await context.getAuditLogRepo().create({
    id:randomUUID(),companyId:principal.companyId,entityName:'TrafficTicketDocumentIntake',entityId:intakeId,
    action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,timestamp:now,
    previousState:JSON.stringify({event:'DOC_AI_HUMAN_REVIEW',status:'REVIEW_REQUIRED'}),
    newState:JSON.stringify({event:'DOC_AI_HUMAN_REVIEW',status:target,extractionId:extraction.id,approvedExtractionId,reviewedBy:principal.userId,businessMutationApplied:false}),
  });
  return true;
}
