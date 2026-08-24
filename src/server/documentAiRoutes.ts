import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { documentAiExtractions, fileAttachments } from '../db/schema';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { DOCUMENT_AI_MAX_ATTEMPTS } from './documentAiQueue';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const STATUSES = new Set(['PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'FAILED']);

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
  if (error instanceof DocumentAiConflictError) {
    res.status(409).json({ error: 'Document AI conflict' });
    return;
  }
  console.error('AUTOERP_DOCUMENT_AI_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Document AI operation failed' });
}

export function registerDocumentAiRoutes(app: Express): void {
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
        if (
          !attachment || attachment.isArchived || attachment.storageProvider !== 'SERVER_FS' ||
          attachment.contentState !== 'AVAILABLE' || !attachment.storageKey ||
          !attachment.checksum || !/^[a-f0-9]{64}$/.test(attachment.checksum)
        ) throw new DocumentAiNotFoundError();

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
      res.status(result.created ? 201 : 200).json(result);
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

        const attachmentRows = await tx.select().from(fileAttachments)
          .where(and(
            eq(fileAttachments.companyId, principal.companyId),
            eq(fileAttachments.id, current.attachmentId),
          ))
          .for('update')
          .limit(1);
        const attachment = attachmentRows[0];
        if (
          !attachment || attachment.isArchived || attachment.storageProvider !== 'SERVER_FS' ||
          attachment.contentState !== 'AVAILABLE' || !attachment.storageKey ||
          attachment.checksum !== current.attachmentChecksum
        ) throw new DocumentAiConflictError();

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
        if (current.status === targetStatus) {
          const samePayload =
            stableJson(current.corrections ?? {}) === stableJson(input.corrections) &&
            (current.reviewNotes ?? null) === input.notes;
          if (!samePayload) throw new DocumentAiConflictError();
          return { item: current, idempotent: true };
        }
        if (current.status !== 'REVIEW_REQUIRED') throw new DocumentAiConflictError();

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
          eq(documentAiExtractions.status, 'REVIEW_REQUIRED'),
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
