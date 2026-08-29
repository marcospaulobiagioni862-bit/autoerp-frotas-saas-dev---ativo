import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { documentAiExtractions, fileAttachments } from '../db/schema';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { canQueueDriverDocumentIntakeCnh } from './driverDocumentIntakeAiPolicy';

export class DriverDocumentIntakeAiNotFoundError extends Error {}
export class DriverDocumentIntakeAiConflictError extends Error {}

function extractionKey(intakeId: string, checksum: string): string {
  return `driver-intake:${intakeId}:${checksum}`;
}

export async function enqueueDriverDocumentIntakeCnh(
  context: any,
  principal: AuthenticatedPrincipal,
  intakeId: string,
): Promise<{ item: any; created: boolean }> {
  const tx = context.getRawTransaction?.();
  if (!tx) throw new Error('Raw tenant transaction unavailable');

  const intakeResult: any = await tx.execute(
    `SELECT * FROM driver_document_intakes WHERE company_id = $1 AND id = $2 AND created_by = $3 LIMIT 1 FOR UPDATE`,
    [principal.companyId, intakeId, principal.userId],
  );
  const intakeRow = intakeResult.rows?.[0];
  if (!intakeRow) throw new DriverDocumentIntakeAiNotFoundError();

  const attachmentId = intakeRow.attachment_id ? String(intakeRow.attachment_id) : '';
  if (!attachmentId) throw new DriverDocumentIntakeAiConflictError();

  const attachmentRows = await tx.select().from(fileAttachments)
    .where(and(
      eq(fileAttachments.companyId, principal.companyId),
      eq(fileAttachments.id, attachmentId),
    ))
    .for('update')
    .limit(1);
  const attachment = attachmentRows[0];
  if (!attachment) throw new DriverDocumentIntakeAiNotFoundError();

  const checksum = String(attachment.checksum || '');
  const idempotencyKey = extractionKey(intakeId, checksum);

  if (String(intakeRow.status) === 'EXTRACTING') {
    const existingRows = await tx.select().from(documentAiExtractions)
      .where(and(
        eq(documentAiExtractions.companyId, principal.companyId),
        eq(documentAiExtractions.idempotencyKey, idempotencyKey),
      ))
      .limit(1);
    const existing = existingRows[0];
    if (!existing || existing.attachmentId !== attachment.id || existing.attachmentChecksum !== checksum) {
      throw new DriverDocumentIntakeAiConflictError();
    }
    return { item: existing, created: false };
  }

  const allowed = canQueueDriverDocumentIntakeCnh(
    {
      id: String(intakeRow.id),
      companyId: String(intakeRow.company_id),
      createdBy: String(intakeRow.created_by),
      status: String(intakeRow.status),
      attachmentId,
      expiresAt: new Date(intakeRow.expires_at).toISOString(),
      archivedAt: intakeRow.archived_at ? new Date(intakeRow.archived_at).toISOString() : undefined,
      consumedAt: intakeRow.consumed_at ? new Date(intakeRow.consumed_at).toISOString() : undefined,
    },
    {
      id: String(attachment.id),
      companyId: String(attachment.companyId),
      entityType: String(attachment.entityType),
      entityId: String(attachment.entityId),
      documentType: attachment.documentType || undefined,
      isArchived: Boolean(attachment.isArchived),
      contentState: String(attachment.contentState),
      storageProvider: String(attachment.storageProvider),
      storageKey: attachment.storageKey || undefined,
      checksum: attachment.checksum || undefined,
    },
    { companyId: principal.companyId, userId: principal.userId, nowIso: new Date().toISOString() },
  );
  if (!allowed) throw new DriverDocumentIntakeAiConflictError();

  const now = new Date().toISOString();
  const createdRows = await tx.insert(documentAiExtractions).values({
    id: randomUUID(),
    companyId: principal.companyId,
    attachmentId: attachment.id,
    attachmentChecksum: checksum,
    idempotencyKey,
    status: 'PENDING',
    requestedBy: principal.userId,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({
    target: [documentAiExtractions.companyId, documentAiExtractions.idempotencyKey],
  }).returning();

  let item = createdRows[0];
  const created = Boolean(item);
  if (!item) {
    const existingRows = await tx.select().from(documentAiExtractions)
      .where(and(
        eq(documentAiExtractions.companyId, principal.companyId),
        eq(documentAiExtractions.idempotencyKey, idempotencyKey),
      ))
      .limit(1);
    item = existingRows[0];
    if (!item || item.attachmentId !== attachment.id || item.attachmentChecksum !== checksum) {
      throw new DriverDocumentIntakeAiConflictError();
    }
  }

  const transition: any = await tx.execute(
    `UPDATE driver_document_intakes SET status = 'EXTRACTING', updated_at = $1 WHERE company_id = $2 AND id = $3 AND created_by = $4 AND status = 'DOCUMENT_UPLOADED' AND attachment_id = $5 RETURNING id`,
    [now, principal.companyId, intakeId, principal.userId, attachment.id],
  );
  if (!transition.rows?.[0]) throw new DriverDocumentIntakeAiConflictError();

  if (created) {
    await context.getAuditLogRepo().create({
      id: randomUUID(),
      companyId: principal.companyId,
      entityName: 'DocumentAiExtraction',
      entityId: item.id,
      action: AuditAction.CREATE,
      newState: JSON.stringify({
        event: 'AI_EXTRACTION_REQUESTED',
        attachmentId: attachment.id,
        attachmentChecksum: checksum,
        status: 'PENDING',
        source: 'DRIVER_DOCUMENT_INTAKE',
        businessMutationApplied: false,
      }),
      userId: principal.userId,
      userName: principal.name,
      timestamp: now,
    });
  }

  await context.getAuditLogRepo().create({
    id: randomUUID(),
    companyId: principal.companyId,
    entityName: 'DriverDocumentIntake',
    entityId: intakeId,
    action: AuditAction.UPDATE,
    previousState: JSON.stringify({ event: 'DOC_AI_QUEUE', status: 'DOCUMENT_UPLOADED' }),
    newState: JSON.stringify({ event: 'DOC_AI_QUEUE', status: 'EXTRACTING', extractionId: item.id }),
    userId: principal.userId,
    userName: principal.name,
    timestamp: now,
  });

  return { item, created };
}
