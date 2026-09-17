import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { auditLogs, documentAiExtractions, fileAttachments } from '../db/schema';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import {
  DriverDocumentIntakeReviewSyncError,
  syncDriverDocumentIntakeHumanReview,
} from './driverDocumentIntakeAiReviewSync';
import {
  VehicleDocumentIntakeReviewSyncError,
  syncVehicleDocumentIntakeHumanReview,
} from './vehicleDocumentIntakeAiReviewSync';
import { DOCUMENT_AI_MAX_ATTEMPTS } from './documentAiQueue';
import { configuredDocumentAiStorageProvider, isDocumentAiAttachmentEligible } from './documentAiAttachmentPolicy';
import { createDocumentAiAttachmentStatusSnapshot, createDocumentAiObservabilitySnapshot } from './documentAiObservability';
import { dispatchDocumentAiExtractionFromEnvironment } from './documentAiRuntime';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const STATUSES = new Set(['PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'FAILED']);
export const DOCUMENT_AI_RATE_LIMIT_RETRY_COOLDOWN_MS = 60_000;

class DocumentAiValidationError extends Error {}
class DocumentAiForbiddenError extends Error {}
class DocumentAiNotFoundError extends Error {}
class DocumentAiConflictError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response, write = false): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(principal.role || '').toUpperCase();
  if (!principal.companyId || !principal.userId || !CANONICAL_ROLES.has(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  if (write && !WRITE_ROLES.has(role) && !principal.permissions?.includes('*') && !principal.permissions?.includes('PROCESS_DOCUMENT_AI')) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function exactObject(value: unknown, allowed: Set<string>): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DocumentAiValidationError();
  const item = value as Record<string, unknown>;
  if (!Object.keys(item).every((key) => allowed.has(key))) throw new DocumentAiValidationError();
  return item;
}

function requiredId(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(text)) throw new DocumentAiValidationError(`Invalid ${field}`);
  return text;
}

function parseCreate(body: unknown): { attachmentId: string; idempotencyKey: string } {
  const item = exactObject(body, new Set(['attachmentId', 'idempotencyKey']));
  const attachmentId = requiredId(item.attachmentId, 'attachmentId');
  const idempotencyKey = requiredId(item.idempotencyKey, 'idempotencyKey');
  if (idempotencyKey.length < 8) throw new DocumentAiValidationError('Invalid idempotencyKey');
  return { attachmentId, idempotencyKey };
}

function parseRetry(body: unknown): void {
  if (body === undefined || body === null) return;
  const item = exactObject(body, new Set());
  if (Object.keys(item).length !== 0) throw new DocumentAiValidationError();
}

function parseDiscardFailed(body: unknown): string[] | undefined {
  if (body === undefined || body === null) return undefined;
  const item = exactObject(body, new Set(['extractionIds']));
  if (item.extractionIds === undefined) return undefined;
  if (!Array.isArray(item.extractionIds) || item.extractionIds.length === 0 || item.extractionIds.length > 100) {
    throw new DocumentAiValidationError();
  }
  const ids = item.extractionIds.map((value) => requiredId(value, 'extractionId'));
  if (new Set(ids).size !== ids.length) throw new DocumentAiValidationError();
  return ids;
}

function parseStatus(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const status = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!STATUSES.has(status)) throw new DocumentAiValidationError();
  return status;
}

type ReviewDecision = 'APPROVE' | 'REJECT';
type ReviewInput = { decision: ReviewDecision; corrections: Record<string, unknown>; notes: string | null };

function validateCorrectionValue(value: unknown, depth: number, state: { nodes: number }): void {
  state.nodes += 1;
  if (state.nodes > 250 || depth > 5) throw new DocumentAiValidationError();
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > 4000) throw new DocumentAiValidationError();
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new DocumentAiValidationError();
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 50) throw new DocumentAiValidationError();
    for (const item of value) validateCorrectionValue(item, depth + 1, state);
    return;
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DocumentAiValidationError();
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!key || key.length > 120 || ['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new DocumentAiValidationError();
    }
    validateCorrectionValue(item, depth + 1, state);
  }
}

function parseReview(body: unknown): ReviewInput {
  const item = exactObject(body, new Set(['decision', 'corrections', 'notes']));
  if (item.decision !== 'APPROVE' && item.decision !== 'REJECT') throw new DocumentAiValidationError();
  const corrections = item.corrections === undefined ? {} : item.corrections;
  if (!corrections || typeof corrections !== 'object' || Array.isArray(corrections)) {
    throw new DocumentAiValidationError();
  }
  validateCorrectionValue(corrections, 0, { nodes: 0 });
  if (JSON.stringify(corrections).length > 20_000) throw new DocumentAiValidationError();
  let notes: string | null = null;
  if (item.notes !== undefined) {
    if (typeof item.notes !== 'string') throw new DocumentAiValidationError();
    notes = item.notes.trim() || null;
    if (notes && notes.length > 2000) throw new DocumentAiValidationError();
  }
  return { decision: item.decision, corrections: corrections as Record<string, unknown>, notes };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function syncDocumentIntakeHumanReview(
  context: any,
  principal: AuthenticatedPrincipal,
  extraction: { id: string; attachmentId: string; status: 'APPROVED' | 'REJECTED'; detectedDocumentType?: string | null },
  now: string,
): Promise<void> {
  const driverHandled = await syncDriverDocumentIntakeHumanReview(context, principal, extraction, now);
  if (!driverHandled) await syncVehicleDocumentIntakeHumanReview(context, principal, extraction, now);
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof DocumentAiValidationError) {
    res.status(400).json({ error: 'Invalid document AI request' });
    return;
  }
  if (error instanceof DocumentAiForbiddenError) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (error instanceof DocumentAiNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof DocumentAiConflictError || error instanceof DriverDocumentIntakeReviewSyncError || error instanceof VehicleDocumentIntakeReviewSyncError) {
    res.status(409).json({ error: 'Document AI conflict' });
    return;
  }
  console.error('AUTOERP_DOCUMENT_AI_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Document AI operation failed' });
}

type SanitizedExtractionHistoryItem = {
  status: string;
  attemptCount: number;
  failureCode: string | null;
  updatedAt: string;
};

function sanitizeExtractionAuditHistory(changes: unknown, timestamp: unknown): SanitizedExtractionHistoryItem | null {
  if (typeof changes !== 'string' || typeof timestamp !== 'string') return null;
  let parsed: unknown;
  try { parsed = JSON.parse(changes); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const nextRaw = record.newState;
  let next: Record<string, unknown> | null = null;
  try {
    const candidate = typeof nextRaw === 'string' ? JSON.parse(nextRaw) : nextRaw;
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) next = candidate as Record<string, unknown>;
  } catch { return null; }
  if (!next) return null;
  const event = String(next.event || '');
  const status = String(next.status || '');
  if (!new Set(['AI_EXTRACTION_REQUESTED', 'AI_EXTRACTION_RETRY_REQUESTED', 'AI_EXTRACTION_REVIEWED']).has(event)
    || !new Set(['PENDING', 'APPROVED', 'REJECTED']).has(status)) return null;
  const attemptCount = Number(next.attemptCount ?? 0);
  if (!Number.isInteger(attemptCount) || attemptCount < 0) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return { status, attemptCount, failureCode: null, updatedAt: date.toISOString() };
}

export function registerDocumentAiRoutes(app: Express): void {
  const configuredStorageProvider = configuredDocumentAiStorageProvider(process.env.ATTACHMENT_STORAGE_PROVIDER);

  app.post('/api/document-ai/extractions', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const input = parseCreate(req.body);
      const result = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const attachments = await tx.select().from(fileAttachments)
          .where(and(
            eq(fileAttachments.companyId, principal.companyId),
            eq(fileAttachments.id, input.attachmentId),
          ))
          .limit(1);
        const attachment = attachments[0];
        if (!isDocumentAiAttachmentEligible(attachment, configuredStorageProvider)) {
          throw new DocumentAiNotFoundError();
        }

        const now = new Date().toISOString();
        const createdRows = await tx.insert(documentAiExtractions).values({
          id: randomUUID(),
          companyId: principal.companyId,
          attachmentId: attachment.id,
          attachmentChecksum: attachment.checksum,
          idempotencyKey: input.idempotencyKey,
          status: 'PENDING',
          requestedBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing({
          target: [documentAiExtractions.companyId, documentAiExtractions.idempotencyKey],
        }).returning();

        if (createdRows[0]) {
          await context.getAuditLogRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            entityName: 'DocumentAiExtraction',
            entityId: createdRows[0].id,
            action: AuditAction.CREATE,
            newState: JSON.stringify({
              event: 'AI_EXTRACTION_REQUESTED',
              attachmentId: attachment.id,
              attachmentChecksum: attachment.checksum,
              status: 'PENDING',
            }),
            userId: principal.userId,
            userName: principal.name,
            timestamp: now,
          });
          return { item: createdRows[0], created: true };
        }

        const existingRows = await tx.select().from(documentAiExtractions)
          .where(and(
            eq(documentAiExtractions.companyId, principal.companyId),
            eq(documentAiExtractions.idempotencyKey, input.idempotencyKey),
          ))
          .limit(1);
        const existing = existingRows[0];
        if (!existing || existing.attachmentId !== attachment.id || existing.attachmentChecksum !== attachment.checksum) {
          throw new DocumentAiConflictError();
        }
        return { item: existing, created: false };
      });
      if (result.created && result.item) {
        void dispatchDocumentAiExtractionFromEnvironment(principal.companyId, result.item.id, 'doc-ai-inline')
          .catch((err) => console.error('AUTOERP_DOCUMENT_AI_INLINE_DISPATCH_FAILURE', err));
      }
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/document-ai/extractions/discard-failed', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const requestedIds = parseDiscardFailed(req.body);
      const result = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const failedRows = await tx.select().from(documentAiExtractions)
          .where(and(
            eq(documentAiExtractions.companyId, principal.companyId),
            eq(documentAiExtractions.status, 'FAILED'),
          ))
          .for('update');
        const requested = requestedIds ? new Set(requestedIds) : null;
        if (requested && failedRows.some((row: any) => requested.has(row.id)) === false) {
          throw new DocumentAiNotFoundError();
        }

        const isDiscardable = (row: any): boolean => {
          if (row.status !== 'FAILED') return false;
          const proposed = row.proposedFields && typeof row.proposedFields === 'object' && !Array.isArray(row.proposedFields)
            ? row.proposedFields as Record<string, unknown>
            : {};
          const corrections = row.corrections && typeof row.corrections === 'object' && !Array.isArray(row.corrections)
            ? row.corrections as Record<string, unknown>
            : {};
          return Object.keys(proposed).length === 0 && Object.keys(corrections).length === 0 && !row.approvedAt;
        };
        const candidates = failedRows.filter((row: any) => (
          (!requested || requested.has(row.id)) && isDiscardable(row)
        ));

        const discardedIds: string[] = [];
        const archivedAttachmentIds: string[] = [];
        const protectedLinks: Array<{
          extractionId: string;
          attachmentId: string;
          entityType: string;
          entityId: string;
          reason: 'ACTIVE_ENTITY_LINK' | 'ATTACHMENT_UNAVAILABLE';
        }> = [];
        const processedAttachments = new Set<string>();
        const now = new Date().toISOString();

        for (const candidate of candidates) {
          if (processedAttachments.has(candidate.attachmentId)) continue;
          processedAttachments.add(candidate.attachmentId);
          const attachmentRows = await tx.select().from(fileAttachments)
            .where(and(
              eq(fileAttachments.companyId, principal.companyId),
              eq(fileAttachments.id, candidate.attachmentId),
            ))
            .for('update')
            .limit(1);
          const attachment = attachmentRows[0];
          if (!attachment || attachment.isArchived) {
            protectedLinks.push({
              extractionId: candidate.id,
              attachmentId: candidate.attachmentId,
              entityType: attachment?.entityType || 'Attachment',
              entityId: attachment?.entityId || candidate.attachmentId,
              reason: 'ATTACHMENT_UNAVAILABLE',
            });
            continue;
          }
          if (attachment.entityType !== 'DriverDocumentIntake') {
            protectedLinks.push({
              extractionId: candidate.id,
              attachmentId: candidate.attachmentId,
              entityType: attachment.entityType,
              entityId: attachment.entityId,
              reason: 'ACTIVE_ENTITY_LINK',
            });
            continue;
          }

          const relatedRows = await tx.select().from(documentAiExtractions)
            .where(and(
              eq(documentAiExtractions.companyId, principal.companyId),
              eq(documentAiExtractions.attachmentId, candidate.attachmentId),
            ))
            .for('update');
          const eligibleRelated = relatedRows.filter((row: any) => (
            isDiscardable(row) && (!requested || requested.has(row.id))
          ));
          if (eligibleRelated.length === 0) continue;
          const canArchiveAttachment = relatedRows.every((row: any) => (
            isDiscardable(row) && (!requested || requested.has(row.id))
          ));

          for (const failed of eligibleRelated) {
            const updatedRows = await tx.update(documentAiExtractions).set({
              status: 'REJECTED',
              reviewedBy: principal.userId,
              reviewedAt: now,
              reviewNotes: 'Falha descartável removida da fila operacional.',
              updatedAt: now,
            }).where(and(
              eq(documentAiExtractions.companyId, principal.companyId),
              eq(documentAiExtractions.id, failed.id),
              eq(documentAiExtractions.status, 'FAILED'),
            )).returning({ id: documentAiExtractions.id });
            if (updatedRows[0]) discardedIds.push(updatedRows[0].id);
          }

          if (canArchiveAttachment && eligibleRelated.every((row: any) => discardedIds.includes(row.id))) {
            const archivedRows = await tx.update(fileAttachments).set({ isArchived: true })
              .where(and(
                eq(fileAttachments.companyId, principal.companyId),
                eq(fileAttachments.id, candidate.attachmentId),
                eq(fileAttachments.isArchived, false),
              )).returning({ id: fileAttachments.id });
            if (archivedRows[0]) archivedAttachmentIds.push(archivedRows[0].id);
          }
        }

        if (discardedIds.length > 0) {
          await context.getAuditLogRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            entityName: 'DocumentAiExtractionCleanup',
            entityId: randomUUID(),
            action: AuditAction.UPDATE,
            newState: JSON.stringify({
              event: 'AI_FAILED_EXTRACTIONS_DISCARDED',
              discardedCount: discardedIds.length,
              archivedAttachmentCount: archivedAttachmentIds.length,
              extractionIds: discardedIds.sort(),
              businessMutationApplied: false,
            }),
            userId: principal.userId,
            userName: principal.name,
            timestamp: now,
          });
        }
        return {
          discarded: discardedIds.length,
          attachmentsArchived: archivedAttachmentIds.length,
          protected: protectedLinks,
        };
      });
      res.status(200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/document-ai/extractions/:id/retry', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const id = requiredId(req.params.id, 'id');
      parseRetry(req.body);
      const item = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const extractionRows = await tx.select().from(documentAiExtractions)
          .where(and(
            eq(documentAiExtractions.companyId, principal.companyId),
            eq(documentAiExtractions.id, id),
          ))
          .for('update')
          .limit(1);
        const current = extractionRows[0];
        if (!current) throw new DocumentAiNotFoundError();
        if (current.status !== 'FAILED' || current.attemptCount >= DOCUMENT_AI_MAX_ATTEMPTS) {
          throw new DocumentAiConflictError();
        }
        if (current.failureCode === 'PROVIDER_RATE_LIMITED') {
          const failedAt = new Date(current.completedAt || current.updatedAt).getTime();
          if (!Number.isFinite(failedAt) || Date.now() - failedAt < DOCUMENT_AI_RATE_LIMIT_RETRY_COOLDOWN_MS) {
            throw new DocumentAiConflictError();
          }
        }

        const attachmentRows = await tx.select().from(fileAttachments)
          .where(and(
            eq(fileAttachments.companyId, principal.companyId),
            eq(fileAttachments.id, current.attachmentId),
          ))
          .for('update')
          .limit(1);
        const attachment = attachmentRows[0];
        if (!isDocumentAiAttachmentEligible(attachment, configuredStorageProvider, current.attachmentChecksum)) {
          throw new DocumentAiConflictError();
        }

        const now = new Date().toISOString();
        const updatedRows = await tx.update(documentAiExtractions).set({
          status: 'PENDING',
          workerId: null,
          processingStartedAt: null,
          completedAt: null,
          failureCode: null,
          provider: null,
          model: null,
          modelVersion: null,
          detectedDocumentType: null,
          rawExtraction: {},
          proposedFields: {},
          fieldConfidence: {},
          updatedAt: now,
        }).where(and(
          eq(documentAiExtractions.companyId, principal.companyId),
          eq(documentAiExtractions.id, id),
          eq(documentAiExtractions.status, 'FAILED'),
        )).returning();
        const updated = updatedRows[0];
        if (!updated) throw new DocumentAiConflictError();

        await context.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'DocumentAiExtraction',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          previousState: JSON.stringify({
            event: 'AI_EXTRACTION_FAILED',
            status: current.status,
            failureCode: current.failureCode,
            attemptCount: current.attemptCount,
          }),
          newState: JSON.stringify({
            event: 'AI_EXTRACTION_RETRY_REQUESTED',
            status: 'PENDING',
            attemptCount: current.attemptCount,
            maxAttempts: DOCUMENT_AI_MAX_ATTEMPTS,
            businessMutationApplied: false,
          }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });
        return updated;
      });
      res.status(200).json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/document-ai/extractions/:id/review', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const id = requiredId(req.params.id, 'id');
      const input = parseReview(req.body);
      const result = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const rows = await tx.select().from(documentAiExtractions)
          .where(and(
            eq(documentAiExtractions.companyId, principal.companyId),
            eq(documentAiExtractions.id, id),
          ))
          .for('update')
          .limit(1);
        const current = rows[0];
        if (!current) throw new DocumentAiNotFoundError();

        const targetStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        if (current.status === 'APPROVED' || current.status === 'REJECTED') {
          if (current.status === targetStatus) {
            const samePayload =
              stableJson(current.corrections ?? {}) === stableJson(input.corrections) &&
              (current.reviewNotes ?? null) === input.notes;
            if (samePayload) {
              await syncDocumentIntakeHumanReview(context, principal, {
                id: current.id,
                attachmentId: current.attachmentId,
                status: targetStatus,
                detectedDocumentType: current.detectedDocumentType,
              }, new Date().toISOString());
              return { item: current, idempotent: true };
            }
          }
          throw new DocumentAiConflictError();
        }

        const validReviewStatuses = new Set(['REVIEW_REQUIRED', 'COMPLETED']);
        if (!validReviewStatuses.has(current.status)) throw new DocumentAiConflictError();

        const now = new Date().toISOString();
        const updatedRows = await tx.update(documentAiExtractions).set({
          status: targetStatus,
          reviewedBy: principal.userId,
          reviewedAt: now,
          corrections: input.corrections,
          reviewNotes: input.notes,
          approvedAt: targetStatus === 'APPROVED' ? now : null,
          updatedAt: now,
        }).where(and(
          eq(documentAiExtractions.companyId, principal.companyId),
          eq(documentAiExtractions.id, id),
        )).returning();
        const updated = updatedRows[0];
        if (!updated) throw new DocumentAiConflictError();

        await syncDocumentIntakeHumanReview(context, principal, {
          id: updated.id,
          attachmentId: updated.attachmentId,
          status: targetStatus,
          detectedDocumentType: updated.detectedDocumentType,
        }, now);

        await context.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'DocumentAiExtraction',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          previousState: JSON.stringify({
            event: 'AI_EXTRACTION_REVIEW_STARTED',
            status: current.status,
          }),
          newState: JSON.stringify({
            event: 'AI_EXTRACTION_REVIEWED',
            status: targetStatus,
            reviewedBy: principal.userId,
            reviewedAt: now,
            correctionKeys: Object.keys(input.corrections).sort(),
            hasReviewNotes: Boolean(input.notes),
            businessMutationApplied: false,
          }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });

        return { item: updated, idempotent: false };
      });
      res.status(200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/document-ai/attachments/:attachmentId/history', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      if (Object.keys(req.query).length !== 0) throw new DocumentAiValidationError();
      const attachmentId = requiredId(req.params.attachmentId, 'attachmentId');
      const items = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const extractions = await tx.select({ id: documentAiExtractions.id }).from(documentAiExtractions)
          .where(and(eq(documentAiExtractions.companyId, principal.companyId), eq(documentAiExtractions.attachmentId, attachmentId)));
        if (extractions.length === 0) throw new DocumentAiNotFoundError();
        const ids = extractions.map((item: { id: string }) => item.id);
        const auditRows = await tx.select({
          entityId: auditLogs.entityId,
          changes: auditLogs.changes,
          timestamp: auditLogs.timestamp,
        }).from(auditLogs)
          .where(and(eq(auditLogs.companyId, principal.companyId), eq(auditLogs.entityType, 'DocumentAiExtraction')))
          .orderBy(asc(auditLogs.timestamp));
        const allowed = new Set(ids);
        return auditRows
          .filter((row: { entityId: string }) => allowed.has(row.entityId))
          .map((row: { changes: unknown; timestamp: unknown }) => sanitizeExtractionAuditHistory(row.changes, row.timestamp))
          .filter((item: SanitizedExtractionHistoryItem | null): item is SanitizedExtractionHistoryItem => item !== null);
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/document-ai/attachment-statuses', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      if (Object.keys(req.query).length !== 0) throw new DocumentAiValidationError();
      const rows = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        return await tx.select({
          attachmentId: documentAiExtractions.attachmentId,
          status: documentAiExtractions.status,
          attemptCount: documentAiExtractions.attemptCount,
          failureCode: documentAiExtractions.failureCode,
          updatedAt: documentAiExtractions.updatedAt,
        }).from(documentAiExtractions)
          .where(eq(documentAiExtractions.companyId, principal.companyId))
          .orderBy(desc(documentAiExtractions.updatedAt));
      });
      res.json(createDocumentAiAttachmentStatusSnapshot(rows));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/document-ai/observability', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      if (Object.keys(req.query).length !== 0) throw new DocumentAiValidationError();
      const rows = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        return await tx.select({
          status: documentAiExtractions.status,
          count: count(),
        }).from(documentAiExtractions)
          .where(eq(documentAiExtractions.companyId, principal.companyId))
          .groupBy(documentAiExtractions.status);
      });
      res.json(createDocumentAiObservabilitySnapshot(rows));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/document-ai/extractions', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      if (!Object.keys(req.query).every((key) => key === 'status')) throw new DocumentAiValidationError();
      const status = parseStatus(req.query.status);
      const items = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const where = status
          ? and(eq(documentAiExtractions.companyId, principal.companyId), eq(documentAiExtractions.status, status))
          : eq(documentAiExtractions.companyId, principal.companyId);
        return await tx.select().from(documentAiExtractions).where(where).orderBy(desc(documentAiExtractions.createdAt));
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/document-ai/extractions/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const id = requiredId(req.params.id, 'id');
      const item = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const rows = await tx.select().from(documentAiExtractions)
          .where(and(eq(documentAiExtractions.companyId, principal.companyId), eq(documentAiExtractions.id, id)))
          .limit(1);
        return rows[0];
      });
      if (!item) throw new DocumentAiNotFoundError();
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });
}
