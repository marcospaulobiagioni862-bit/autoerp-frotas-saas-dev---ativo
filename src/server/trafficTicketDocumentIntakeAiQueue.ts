import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { documentAiExtractions, fileAttachments } from '../db/schema';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export class TrafficTicketDocumentIntakeAiNotFoundError extends Error {}
export class TrafficTicketDocumentIntakeAiConflictError extends Error {}

export function trafficTicketDocumentIntakeExtractionKey(intakeId:string,checksum:string):string {
  return `traffic-ticket-intake:${intakeId}:${checksum}`;
}

export async function enqueueTrafficTicketDocumentIntake(
  context:any,
  principal:AuthenticatedPrincipal,
  intakeId:string,
):Promise<{item:any;created:boolean}> {
  const tx=context.getRawTransaction?.();
  if(!tx) throw new Error('Raw tenant transaction unavailable');
  const result:any=await tx.execute(sql`
    SELECT * FROM traffic_ticket_document_intakes
    WHERE company_id=${principal.companyId} AND id=${intakeId} AND created_by=${principal.userId}
    LIMIT 1 FOR UPDATE
  `);
  const intake=result.rows?.[0];
  if(!intake) throw new TrafficTicketDocumentIntakeAiNotFoundError();
  if(String(intake.status)!=='DOCUMENT_UPLOADED'&&String(intake.status)!=='EXTRACTING') throw new TrafficTicketDocumentIntakeAiConflictError();
  const attachmentId=intake.attachment_id?String(intake.attachment_id):'';
  if(!attachmentId) throw new TrafficTicketDocumentIntakeAiConflictError();

  const attachments=await tx.select().from(fileAttachments).where(and(
    eq(fileAttachments.companyId,principal.companyId),eq(fileAttachments.id,attachmentId),
  )).for('update').limit(1);
  const attachment=attachments[0];
  if(!attachment) throw new TrafficTicketDocumentIntakeAiNotFoundError();
  if(String(attachment.entityType)!=='TrafficTicketDocumentIntake'||String(attachment.entityId)!==intakeId||
    Boolean(attachment.isArchived)||String(attachment.contentState)!=='AVAILABLE'||String(attachment.documentType||'')!=='TRAFFIC_TICKET') {
    throw new TrafficTicketDocumentIntakeAiConflictError();
  }
  const checksum=String(attachment.checksum||'');
  if(!/^[a-f0-9]{64}$/.test(checksum)) throw new TrafficTicketDocumentIntakeAiConflictError();
  const idempotencyKey=trafficTicketDocumentIntakeExtractionKey(intakeId,checksum);

  if(String(intake.status)==='EXTRACTING') {
    const existing=await tx.select().from(documentAiExtractions).where(and(
      eq(documentAiExtractions.companyId,principal.companyId),eq(documentAiExtractions.idempotencyKey,idempotencyKey),
    )).limit(1);
    if(!existing[0]||existing[0].attachmentId!==attachmentId) throw new TrafficTicketDocumentIntakeAiConflictError();
    return {item:existing[0],created:false};
  }

  const now=new Date().toISOString();
  const createdRows=await tx.insert(documentAiExtractions).values({
    id:randomUUID(),companyId:principal.companyId,attachmentId,attachmentChecksum:checksum,idempotencyKey,
    status:'PENDING',requestedBy:principal.userId,createdAt:now,updatedAt:now,
  }).onConflictDoNothing({target:[documentAiExtractions.companyId,documentAiExtractions.idempotencyKey]}).returning();
  let item=createdRows[0];const created=Boolean(item);
  if(!item) {
    const existing=await tx.select().from(documentAiExtractions).where(and(
      eq(documentAiExtractions.companyId,principal.companyId),eq(documentAiExtractions.idempotencyKey,idempotencyKey),
    )).limit(1);
    item=existing[0];
    if(!item||item.attachmentId!==attachmentId||item.attachmentChecksum!==checksum) throw new TrafficTicketDocumentIntakeAiConflictError();
  }
  const transitioned:any=await tx.execute(sql`
    UPDATE traffic_ticket_document_intakes SET status='EXTRACTING',updated_at=${now}
    WHERE company_id=${principal.companyId} AND id=${intakeId} AND created_by=${principal.userId}
      AND status='DOCUMENT_UPLOADED' AND attachment_id=${attachmentId}
    RETURNING id
  `);
  if(!transitioned.rows?.[0]) throw new TrafficTicketDocumentIntakeAiConflictError();
  if(created) await context.getAuditLogRepo().create({
    id:randomUUID(),companyId:principal.companyId,entityName:'DocumentAiExtraction',entityId:item.id,action:AuditAction.CREATE,
    userId:principal.userId,userName:principal.name,timestamp:now,
    newState:JSON.stringify({event:'AI_EXTRACTION_REQUESTED',source:'TRAFFIC_TICKET_DOCUMENT_INTAKE',attachmentId,status:'PENDING',businessMutationApplied:false}),
  });
  await context.getAuditLogRepo().create({
    id:randomUUID(),companyId:principal.companyId,entityName:'TrafficTicketDocumentIntake',entityId:intakeId,action:AuditAction.UPDATE,
    userId:principal.userId,userName:principal.name,timestamp:now,
    previousState:JSON.stringify({event:'DOC_AI_QUEUE',status:'DOCUMENT_UPLOADED'}),
    newState:JSON.stringify({event:'DOC_AI_QUEUE',status:'EXTRACTING',extractionId:item.id,businessMutationApplied:false}),
  });
  return {item,created};
}
