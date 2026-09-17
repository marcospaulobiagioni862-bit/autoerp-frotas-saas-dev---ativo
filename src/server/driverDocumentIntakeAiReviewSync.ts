import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export type DriverDocumentIntakeReviewDecision = 'APPROVED' | 'REJECTED';

export class DriverDocumentIntakeReviewSyncError extends Error {
  constructor(message = 'DRIVER_DOCUMENT_INTAKE_REVIEW_SYNC_FAILED') {
    super(message);
    this.name = 'DriverDocumentIntakeReviewSyncError';
  }
}

type QueryResult = { rows?: unknown[] } | unknown[];

function rows(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

export function resolveDriverDocumentIntakeReviewTransition(input: {
  entityType: string;
  intakeStatus: string;
  extractionStatus: DriverDocumentIntakeReviewDecision;
  detectedDocumentType?: string | null;
  approvedExtractionId?: string | null;
  extractionId: string;
}): { status: 'APPROVED' | 'FAILED'; approvedExtractionId: string | null } | null {
  if (input.entityType !== 'DriverDocumentIntake') return null;

  if (input.intakeStatus === 'APPROVED') {
    if (input.extractionStatus === 'APPROVED') {
      if (input.approvedExtractionId !== input.extractionId) {
        throw new DriverDocumentIntakeReviewSyncError('APPROVED_EXTRACTION_MISMATCH');
      }
      return { status: 'APPROVED', approvedExtractionId: input.extractionId };
    }
    throw new DriverDocumentIntakeReviewSyncError('INTAKE_STATE_MISMATCH');
  }

  if (input.extractionStatus === 'APPROVED') {
    if (String(input.detectedDocumentType || '').toUpperCase() !== 'CNH') {
      throw new DriverDocumentIntakeReviewSyncError('INTAKE_APPROVAL_REQUIRES_CNH');
    }
    const validStatuses = new Set(['REVIEW_REQUIRED', 'COMPLETED']);
    if (!validStatuses.has(input.intakeStatus)) {
      throw new DriverDocumentIntakeReviewSyncError('INTAKE_STATE_MISMATCH');
    }
    return { status: 'APPROVED', approvedExtractionId: input.extractionId };
  }

  if (input.intakeStatus === 'FAILED') return { status: 'FAILED', approvedExtractionId: null };
  const validStatuses = new Set(['REVIEW_REQUIRED', 'COMPLETED']);
  if (!validStatuses.has(input.intakeStatus)) {
    throw new DriverDocumentIntakeReviewSyncError('INTAKE_STATE_MISMATCH');
  }
  return { status: 'FAILED', approvedExtractionId: null };
}

export async function syncDriverDocumentIntakeHumanReview(
  context: any,
  principal: AuthenticatedPrincipal,
  extraction: {
    id: string;
    attachmentId: string;
    status: DriverDocumentIntakeReviewDecision;
    detectedDocumentType?: string | null;
  },
  now: string,
): Promise<boolean> {
  const tx = context.getRawTransaction?.();
  if (!tx) throw new DriverDocumentIntakeReviewSyncError('RAW_TENANT_TRANSACTION_UNAVAILABLE');

  const attachmentResult = await tx.execute(sql`
    SELECT id, entity_type, entity_id
    FROM file_attachments
    WHERE company_id = ${principal.companyId}
      AND id = ${extraction.attachmentId}
    LIMIT 1
    FOR UPDATE
  `);
  const attachment = rows(attachmentResult)[0];
  if (!attachment) throw new DriverDocumentIntakeReviewSyncError('ATTACHMENT_NOT_FOUND');
  if (String(attachment.entity_type) !== 'DriverDocumentIntake') return false;

  const intakeId = String(attachment.entity_id || '');
  if (!intakeId) throw new DriverDocumentIntakeReviewSyncError('INTAKE_ENTITY_ID_MISSING');

  const intakeResult = await tx.execute(sql`
    SELECT id, created_by, status, attachment_id, approved_extraction_id, archived_at, consumed_at
    FROM driver_document_intakes
    WHERE company_id = ${principal.companyId}
      AND id = ${intakeId}
      AND attachment_id = ${extraction.attachmentId}
      AND created_by = ${principal.userId}
    LIMIT 1
    FOR UPDATE
  `);
  const intake = rows(intakeResult)[0];
  if (!intake) throw new DriverDocumentIntakeReviewSyncError('INTAKE_NOT_FOUND');
  if (intake.archived_at || intake.consumed_at) throw new DriverDocumentIntakeReviewSyncError('INTAKE_FINALIZED');

  const transition = resolveDriverDocumentIntakeReviewTransition({
    entityType: String(attachment.entity_type),
    intakeStatus: String(intake.status),
    extractionStatus: extraction.status,
    detectedDocumentType: extraction.detectedDocumentType,
    approvedExtractionId: intake.approved_extraction_id ? String(intake.approved_extraction_id) : null,
    extractionId: extraction.id,
  });
  if (!transition) return false;

  if (
    String(intake.status) === transition.status &&
    (transition.status !== 'APPROVED' || String(intake.approved_extraction_id || '') === extraction.id)
  ) {
    return true;
  }

  const updateResult = await tx.execute(sql`
    UPDATE driver_document_intakes
    SET status = ${transition.status},
        approved_extraction_id = ${transition.approvedExtractionId},
        updated_at = ${now}
    WHERE company_id = ${principal.companyId}
      AND id = ${intakeId}
      AND attachment_id = ${extraction.attachmentId}
      AND created_by = ${principal.userId}
      AND status IN ('REVIEW_REQUIRED', 'COMPLETED')
      AND archived_at IS NULL
      AND consumed_at IS NULL
    RETURNING id
  `);
  if (rows(updateResult).length !== 1) {
    throw new DriverDocumentIntakeReviewSyncError('INTAKE_STATE_MISMATCH');
  }

  await context.getAuditLogRepo().create({
    id: randomUUID(),
    companyId: principal.companyId,
    entityName: 'DriverDocumentIntake',
    entityId: intakeId,
    action: AuditAction.UPDATE,
    previousState: JSON.stringify({ event: 'DOC_AI_HUMAN_REVIEW', status: String(intake.status) }),
    newState: JSON.stringify({
      event: 'DOC_AI_HUMAN_REVIEW',
      status: transition.status,
      extractionId: extraction.id,
      approvedExtractionId: transition.approvedExtractionId,
      reviewedBy: principal.userId,
      businessMutationApplied: false,
    }),
    userId: principal.userId,
    userName: principal.name,
    timestamp: now,
  });

  return true;
}
