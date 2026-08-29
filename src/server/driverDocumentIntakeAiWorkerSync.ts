import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { AuditAction } from '../types/enums';

export type DriverDocumentIntakeWorkerTarget = 'REVIEW_REQUIRED' | 'FAILED';

export class DriverDocumentIntakeWorkerSyncError extends Error {
  constructor(message = 'DRIVER_DOCUMENT_INTAKE_WORKER_SYNC_FAILED') {
    super(message);
    this.name = 'DriverDocumentIntakeWorkerSyncError';
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

export async function syncDriverDocumentIntakeWorkerResult(
  context: any,
  input: {
    companyId: string;
    extractionId: string;
    attachmentId: string;
    targetStatus: DriverDocumentIntakeWorkerTarget;
    now: string;
    failureCode?: string;
  },
): Promise<boolean> {
  const tx = context.getRawTransaction?.();
  if (!tx) throw new DriverDocumentIntakeWorkerSyncError('RAW_TENANT_TRANSACTION_UNAVAILABLE');

  const attachmentResult = await tx.execute(sql`
    SELECT id, entity_type, entity_id
    FROM file_attachments
    WHERE company_id = ${input.companyId}
      AND id = ${input.attachmentId}
    LIMIT 1
    FOR UPDATE
  `);
  const attachment = rows(attachmentResult)[0];
  if (!attachment) throw new DriverDocumentIntakeWorkerSyncError('ATTACHMENT_NOT_FOUND');
  if (String(attachment.entity_type) !== 'DriverDocumentIntake') return false;

  const intakeId = String(attachment.entity_id || '');
  if (!intakeId) throw new DriverDocumentIntakeWorkerSyncError('INTAKE_ENTITY_ID_MISSING');

  const nextStatus = input.targetStatus;
  const updateResult = await tx.execute(sql`
    UPDATE driver_document_intakes
    SET status = ${nextStatus},
        updated_at = ${input.now}
    WHERE company_id = ${input.companyId}
      AND id = ${intakeId}
      AND attachment_id = ${input.attachmentId}
      AND status = 'EXTRACTING'
      AND archived_at IS NULL
      AND consumed_at IS NULL
    RETURNING id, created_by
  `);
  const updated = rows(updateResult)[0];
  if (!updated) throw new DriverDocumentIntakeWorkerSyncError('INTAKE_STATE_MISMATCH');

  await context.getAuditLogRepo().create({
    id: randomUUID(),
    companyId: input.companyId,
    entityName: 'DriverDocumentIntake',
    entityId: intakeId,
    action: AuditAction.UPDATE,
    previousState: JSON.stringify({ event: 'DOC_AI_WORKER_RESULT', status: 'EXTRACTING' }),
    newState: JSON.stringify({
      event: 'DOC_AI_WORKER_RESULT',
      status: nextStatus,
      extractionId: input.extractionId,
      ...(nextStatus === 'FAILED' && input.failureCode ? { failureCode: input.failureCode } : {}),
      businessMutationApplied: false,
    }),
    userId: 'SYSTEM_DOC_AI',
    userName: 'AutoERP Document AI Worker',
    timestamp: input.now,
  });

  return true;
}
