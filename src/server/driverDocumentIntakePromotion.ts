import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { projectApprovedCnhDriverDraft } from './driverDocumentIntakeApprovedCnhDraft';

export class DriverDocumentIntakePromotionNotFoundError extends Error {}
export class DriverDocumentIntakePromotionConflictError extends Error {}

type QueryResult = { rows?: unknown[] } | unknown[];

function rows(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function digits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function dateOnly(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  const parsed = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

async function auditAttachmentRelink(
  context: any,
  principal: AuthenticatedPrincipal,
  attachmentId: string,
  intakeId: string,
  driverId: string,
  now: string,
  event = 'PROMOTE_DRIVER_CNH',
): Promise<void> {
  await context.getAuditLogRepo().create({
    id: randomUUID(),
    companyId: principal.companyId,
    entityName: 'FileAttachment',
    entityId: attachmentId,
    action: AuditAction.UPDATE,
    previousState: JSON.stringify({ entityType: 'DriverDocumentIntake', entityId: intakeId }),
    newState: JSON.stringify({ event, entityType: 'Driver', entityId: driverId }),
    userId: principal.userId,
    userName: principal.name,
    timestamp: now,
  });
}

export async function promoteApprovedDriverDocumentIntake(
  context: any,
  principal: AuthenticatedPrincipal,
  intakeId: string,
  driverId: string,
): Promise<{ driverId: string; attachmentId: string; promoted: boolean }> {
  const tx = context.getRawTransaction?.();
  if (!tx) throw new DriverDocumentIntakePromotionConflictError('RAW_TENANT_TRANSACTION_UNAVAILABLE');

  const result = await tx.execute(sql`
    SELECT
      intake.status AS intake_status,
      intake.created_by,
      intake.attachment_id,
      intake.approved_extraction_id,
      intake.driver_id,
      intake.expires_at,
      intake.consumed_at,
      extraction.id AS extraction_id,
      extraction.attachment_id AS extraction_attachment_id,
      extraction.status AS extraction_status,
      extraction.detected_document_type,
      extraction.proposed_fields,
      extraction.corrections,
      attachment.entity_type,
      attachment.entity_id,
      attachment.document_type,
      attachment.content_state,
      attachment.is_archived
    FROM driver_document_intakes intake
    JOIN document_ai_extractions extraction
      ON extraction.company_id = intake.company_id
     AND extraction.id = intake.approved_extraction_id
    JOIN file_attachments attachment
      ON attachment.company_id = intake.company_id
     AND attachment.id = intake.attachment_id
    WHERE intake.company_id = ${principal.companyId}
      AND intake.id = ${intakeId}
      AND intake.created_by = ${principal.userId}
    LIMIT 1
    FOR UPDATE OF intake, attachment
  `);
  const row = rows(result)[0];
  if (!row) throw new DriverDocumentIntakePromotionNotFoundError();

  const attachmentId = text(row.attachment_id);
  const approvedExtractionId = text(row.approved_extraction_id);
  if (
    !attachmentId ||
    !approvedExtractionId ||
    approvedExtractionId !== text(row.extraction_id) ||
    attachmentId !== text(row.extraction_attachment_id) ||
    text(row.extraction_status) !== 'APPROVED' ||
    text(row.detected_document_type).toUpperCase() !== 'CNH'
  ) throw new DriverDocumentIntakePromotionConflictError('INTAKE_EXTRACTION_MISMATCH');

  let driver = await context.getDriverRepo().findByIdForCompany(principal.companyId, driverId);
  if (!driver || driver.isArchived) throw new DriverDocumentIntakePromotionNotFoundError();

  const attachmentOnDriver = text(row.entity_type) === 'Driver' && text(row.entity_id) === driver.id;
  const attachmentOnIntake = text(row.entity_type) === 'DriverDocumentIntake' && text(row.entity_id) === intakeId;
  const attachmentIsUsable =
    text(row.document_type).toUpperCase() === 'CNH' &&
    text(row.content_state) === 'AVAILABLE' &&
    row.is_archived !== true;

  if (text(row.intake_status) === 'CONSUMED') {
    if (text(row.driver_id) !== driver.id || !row.consumed_at) {
      throw new DriverDocumentIntakePromotionConflictError('CONSUMED_BY_DIFFERENT_DRIVER');
    }
    if (attachmentOnDriver) {
      return { driverId: driver.id, attachmentId, promoted: false };
    }
    if (!attachmentOnIntake || !attachmentIsUsable) {
      throw new DriverDocumentIntakePromotionConflictError('CONSUMED_ATTACHMENT_MISMATCH');
    }

    const recoveredAt = new Date().toISOString();
    const recovered = await tx.execute(sql`
      UPDATE file_attachments
      SET entity_name = 'Driver',
          entity_type = 'Driver',
          entity_id = ${driver.id}
      WHERE company_id = ${principal.companyId}
        AND id = ${attachmentId}
        AND entity_type = 'DriverDocumentIntake'
        AND entity_id = ${intakeId}
        AND document_type = 'CNH'
        AND content_state = 'AVAILABLE'
        AND is_archived = false
      RETURNING id
    `);
    if (rows(recovered).length !== 1) {
      throw new DriverDocumentIntakePromotionConflictError('CONSUMED_ATTACHMENT_RECOVERY_FAILED');
    }
    await auditAttachmentRelink(context, principal, attachmentId, intakeId, driver.id, recoveredAt, 'RECOVER_CONSUMED_DRIVER_CNH');
    return { driverId: driver.id, attachmentId, promoted: false };
  }

  const expiresAt = new Date(String(row.expires_at)).getTime();
  if (
    text(row.intake_status) !== 'APPROVED' ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
    (!attachmentOnIntake && !attachmentOnDriver) ||
    !attachmentIsUsable
  ) throw new DriverDocumentIntakePromotionConflictError('INTAKE_NOT_PROMOTABLE');

  const approved = projectApprovedCnhDriverDraft({
    status: text(row.extraction_status),
    detectedDocumentType: text(row.detected_document_type),
    proposedFields: row.proposed_fields,
    corrections: row.corrections,
  });

  if (
    !approved.cnhNumber || digits(approved.cnhNumber) !== digits(driver.cnhNumber) ||
    !approved.cnhExpiration || dateOnly(approved.cnhExpiration) !== dateOnly(driver.cnhExpiration) ||
    (approved.cpf && digits(approved.cpf) !== digits(driver.cpf)) ||
    (approved.birthDate && dateOnly(approved.birthDate) !== dateOnly(driver.birthDate))
  ) throw new DriverDocumentIntakePromotionConflictError('DRIVER_CNH_IDENTITY_MISMATCH');

  const now = new Date().toISOString();
  if (approved.cnhEar !== undefined && driver.cnhEar !== approved.cnhEar) {
    const previousEar = driver.cnhEar;
    const updated = await context.getDriverRepo().updateForCompany(principal.companyId, driver.id, {
      ...driver,
      cnhEar: approved.cnhEar,
      updatedAt: now,
    });
    if (!updated) throw new DriverDocumentIntakePromotionConflictError('DRIVER_CNH_EAR_UPDATE_FAILED');
    driver = updated;
    await context.getAuditLogRepo().create({
      id: randomUUID(),
      companyId: principal.companyId,
      entityName: 'Driver',
      entityId: driver.id,
      action: AuditAction.UPDATE,
      previousState: JSON.stringify({ cnhEar: previousEar ?? null }),
      newState: JSON.stringify({ event: 'UPDATE_CNH_EAR_FROM_APPROVED_CNH', cnhEar: approved.cnhEar }),
      userId: principal.userId,
      userName: principal.name,
      timestamp: now,
    });
  }

  if (attachmentOnIntake) {
    const attachmentUpdate = await tx.execute(sql`
      UPDATE file_attachments
      SET entity_name = 'Driver',
          entity_type = 'Driver',
          entity_id = ${driver.id}
      WHERE company_id = ${principal.companyId}
        AND id = ${attachmentId}
        AND entity_type = 'DriverDocumentIntake'
        AND entity_id = ${intakeId}
        AND document_type = 'CNH'
        AND content_state = 'AVAILABLE'
        AND is_archived = false
      RETURNING id
    `);
    if (rows(attachmentUpdate).length !== 1) {
      throw new DriverDocumentIntakePromotionConflictError('ATTACHMENT_RELINK_FAILED');
    }
    await auditAttachmentRelink(context, principal, attachmentId, intakeId, driver.id, now);
  }

  const intakeUpdate = await tx.execute(sql`
    UPDATE driver_document_intakes
    SET status = 'CONSUMED',
        driver_id = ${driver.id},
        consumed_at = ${now},
        updated_at = ${now}
    WHERE company_id = ${principal.companyId}
      AND id = ${intakeId}
      AND created_by = ${principal.userId}
      AND status = 'APPROVED'
      AND attachment_id = ${attachmentId}
      AND approved_extraction_id = ${approvedExtractionId}
      AND driver_id IS NULL
      AND consumed_at IS NULL
    RETURNING id
  `);
  if (rows(intakeUpdate).length !== 1) {
    throw new DriverDocumentIntakePromotionConflictError('INTAKE_CONSUME_FAILED');
  }

  await context.getAuditLogRepo().create({
    id: randomUUID(),
    companyId: principal.companyId,
    entityName: 'DriverDocumentIntake',
    entityId: intakeId,
    action: AuditAction.UPDATE,
    previousState: JSON.stringify({ status: 'APPROVED' }),
    newState: JSON.stringify({ event: attachmentOnDriver ? 'RECOVER_ALREADY_RELINKED_DRIVER_CNH' : 'PROMOTE_TO_DRIVER', status: 'CONSUMED', driverId: driver.id, attachmentId }),
    userId: principal.userId,
    userName: principal.name,
    timestamp: now,
  });

  return { driverId: driver.id, attachmentId, promoted: true };
}
