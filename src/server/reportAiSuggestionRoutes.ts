import { createHash, randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import {
  buildReportAiSuggestion,
  type ReportAiCandidate,
  type ReportAiScalar,
  type ReportAiSuggestion,
} from './reportAiSuggestion';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const STATUSES = new Set(['PENDING_REVIEW', 'CONFIRMED', 'REJECTED']);
const SUGGESTION_ID = /^rai_[a-f0-9]{32}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;

class ReportAiAuthorityValidationError extends Error {}
class ReportAiAuthorityNotFoundError extends Error {}
class ReportAiAuthorityConflictError extends Error {}

type QueryResult = { rows?: unknown[] } | unknown[];

function rows(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

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
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!principal.companyId || !principal.userId || !CANONICAL_ROLES.has(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  if (write && !WRITE_ROLES.has(role) && !permissions.includes('*') && !permissions.includes('REVIEW_REPORT_AI')) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function requiredSuggestionId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!SUGGESTION_ID.test(id)) throw new ReportAiAuthorityValidationError();
  return id;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = typeof value === 'string' ? value : '';
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid persisted report AI timestamp');
  return date.toISOString();
}

function asJsonObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid persisted report AI JSON');
  }
  return parsed as Record<string, unknown>;
}

export interface ReportAiSuggestionRecord {
  id: string;
  companyId: string;
  targetType: string;
  targetId: string | null;
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED';
  suggestion: ReportAiSuggestion;
  payloadHash: string;
  review: Record<string, unknown> | null;
  reviewHash: string | null;
  createdBy: string;
  reviewedBy: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  updatedAt: string;
}

function recordFrom(row: Record<string, unknown>): ReportAiSuggestionRecord {
  const status = String(row.status || '');
  if (!STATUSES.has(status)) throw new Error('Invalid persisted report AI status');
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    targetType: String(row.target_type),
    targetId: row.target_id === null ? null : String(row.target_id),
    status: status as ReportAiSuggestionRecord['status'],
    suggestion: asJsonObject(row.suggestion_payload) as unknown as ReportAiSuggestion,
    payloadHash: String(row.payload_hash),
    review: row.review_payload === null ? null : asJsonObject(row.review_payload),
    reviewHash: row.review_hash === null ? null : String(row.review_hash),
    createdBy: String(row.created_by),
    reviewedBy: row.reviewed_by === null ? null : String(row.reviewed_by),
    reviewNotes: row.review_notes === null ? null : String(row.review_notes),
    createdAt: asIso(row.created_at),
    reviewedAt: row.reviewed_at === null ? null : asIso(row.reviewed_at),
    updatedAt: asIso(row.updated_at),
  };
}

function validateSuggestion(companyId: string, suggestion: ReportAiSuggestion): void {
  if (
    !suggestion ||
    suggestion.companyId !== companyId ||
    !SUGGESTION_ID.test(suggestion.id) ||
    suggestion.decision !== 'HUMAN_CONFIRMATION_REQUIRED' ||
    typeof suggestion.targetType !== 'string' ||
    !Array.isArray(suggestion.suggestedFields) ||
    !Array.isArray(suggestion.missingFields) ||
    !Array.isArray(suggestion.warnings)
  ) {
    throw new ReportAiAuthorityValidationError();
  }
}

export async function persistReportAiSuggestion(
  companyId: string,
  actor: { userId: string; name: string },
  suggestion: ReportAiSuggestion,
): Promise<{ item: ReportAiSuggestionRecord; created: boolean }> {
  validateSuggestion(companyId, suggestion);
  const payloadHash = sha256(suggestion);
  return await UnitOfWork.run(companyId, async (context: any) => {
    const tx = context.getRawTransaction();
    const now = new Date().toISOString();
    const inserted = rows(await tx.execute(sql`
      INSERT INTO report_ai_suggestions (
        id, company_id, target_type, target_id, status, suggestion_payload,
        payload_hash, created_by, created_at, updated_at
      ) VALUES (
        ${suggestion.id}, ${companyId}, ${suggestion.targetType}, ${suggestion.targetId},
        'PENDING_REVIEW', ${JSON.stringify(suggestion)}::jsonb, ${payloadHash},
        ${actor.userId}, ${now}, ${now}
      )
      ON CONFLICT (company_id, id) DO NOTHING
      RETURNING *
    `));
    if (inserted[0]) {
      await context.getAuditLogRepo().create({
        id: randomUUID(),
        companyId,
        entityName: 'ReportAiSuggestion',
        entityId: suggestion.id,
        action: AuditAction.CREATE,
        newState: JSON.stringify({
          event: 'REPORT_AI_SUGGESTION_CREATED',
          targetType: suggestion.targetType,
          targetId: suggestion.targetId,
          suggestedFieldKeys: suggestion.suggestedFields.map((field) => field.field).sort(),
          missingFields: [...suggestion.missingFields].sort(),
          decision: suggestion.decision,
          businessMutationApplied: false,
        }),
        userId: actor.userId,
        userName: actor.name,
        timestamp: now,
      });
      return { item: recordFrom(inserted[0]), created: true };
    }
    const existing = rows(await tx.execute(sql`
      SELECT * FROM report_ai_suggestions
      WHERE company_id = ${companyId} AND id = ${suggestion.id}
      LIMIT 1
    `))[0];
    if (!existing || String(existing.payload_hash) !== payloadHash) {
      throw new ReportAiAuthorityConflictError();
    }
    return { item: recordFrom(existing), created: false };
  });
}

type ReviewDecision = 'CONFIRM' | 'REJECT';

interface ReviewInput {
  decision: ReviewDecision;
  corrections: Record<string, ReportAiScalar>;
  notes: string | null;
}

function exactObject(value: unknown, allowed: Set<string>): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ReportAiAuthorityValidationError();
  }
  const item = value as Record<string, unknown>;
  if (!Object.keys(item).every((key) => allowed.has(key))) throw new ReportAiAuthorityValidationError();
  return item;
}

function validScalar(value: unknown): value is ReportAiScalar {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.length <= 4_000;
}

function parseReview(value: unknown): ReviewInput {
  const body = exactObject(value, new Set(['decision', 'corrections', 'notes']));
  if (body.decision !== 'CONFIRM' && body.decision !== 'REJECT') throw new ReportAiAuthorityValidationError();
  const correctionsValue = body.corrections === undefined ? {} : exactObject(body.corrections, new Set(Object.keys(body.corrections as object)));
  const corrections: Record<string, ReportAiScalar> = {};
  for (const [field, correction] of Object.entries(correctionsValue)) {
    if (!FIELD.test(field) || !validScalar(correction)) throw new ReportAiAuthorityValidationError();
    corrections[field] = correction;
  }
  if (body.decision === 'REJECT' && Object.keys(corrections).length > 0) throw new ReportAiAuthorityValidationError();
  let notes: string | null = null;
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string') throw new ReportAiAuthorityValidationError();
    notes = body.notes.trim() || null;
    if (notes && notes.length > 2_000) throw new ReportAiAuthorityValidationError();
  }
  return { decision: body.decision, corrections, notes };
}

function buildReviewPayload(suggestion: ReportAiSuggestion, input: ReviewInput): Record<string, unknown> {
  const allowedFields = new Set([
    ...suggestion.suggestedFields.map((field) => field.field),
    ...suggestion.missingFields,
  ]);
  if (Object.keys(input.corrections).some((field) => !allowedFields.has(field))) {
    throw new ReportAiAuthorityValidationError();
  }
  const finalFields: Record<string, ReportAiScalar> = {};
  if (input.decision === 'CONFIRM') {
    for (const field of suggestion.suggestedFields) finalFields[field.field] = field.value;
    Object.assign(finalFields, input.corrections);
    if (Object.keys(finalFields).length === 0) throw new ReportAiAuthorityValidationError();
  }
  return {
    decision: input.decision,
    corrections: input.corrections,
    finalFields,
    businessMutationApplied: false,
  };
}

async function reviewSuggestion(
  principal: AuthenticatedPrincipal,
  id: string,
  input: ReviewInput,
): Promise<ReportAiSuggestionRecord> {
  return await UnitOfWork.run(principal.companyId, async (context: any) => {
    const tx = context.getRawTransaction();
    const currentRow = rows(await tx.execute(sql`
      SELECT * FROM report_ai_suggestions
      WHERE company_id = ${principal.companyId} AND id = ${id}
      FOR UPDATE
    `))[0];
    if (!currentRow) throw new ReportAiAuthorityNotFoundError();
    const current = recordFrom(currentRow);
    const review = buildReviewPayload(current.suggestion, input);
    const reviewHash = sha256({ review, notes: input.notes });
    const nextStatus = input.decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
    if (current.status !== 'PENDING_REVIEW') {
      if (current.status === nextStatus && current.reviewHash === reviewHash) return current;
      throw new ReportAiAuthorityConflictError();
    }
    const now = new Date().toISOString();
    const updated = rows(await tx.execute(sql`
      UPDATE report_ai_suggestions
      SET status = ${nextStatus},
          review_payload = ${JSON.stringify(review)}::jsonb,
          review_hash = ${reviewHash},
          reviewed_by = ${principal.userId},
          review_notes = ${input.notes},
          reviewed_at = ${now},
          updated_at = ${now}
      WHERE company_id = ${principal.companyId}
        AND id = ${id}
        AND status = 'PENDING_REVIEW'
      RETURNING *
    `))[0];
    if (!updated) throw new ReportAiAuthorityConflictError();
    await context.getAuditLogRepo().create({
      id: randomUUID(),
      companyId: principal.companyId,
      entityName: 'ReportAiSuggestion',
      entityId: id,
      action: AuditAction.UPDATE,
      previousState: JSON.stringify({ status: 'PENDING_REVIEW' }),
      newState: JSON.stringify({
        event: 'REPORT_AI_HUMAN_REVIEWED',
        status: nextStatus,
        reviewedBy: principal.userId,
        correctedFieldKeys: Object.keys(input.corrections).sort(),
        businessMutationApplied: false,
      }),
      userId: principal.userId,
      userName: principal.name,
      timestamp: now,
    });
    return recordFrom(updated);
  });
}

function parseStatus(value: unknown): ReportAiSuggestionRecord['status'] | undefined {
  if (value === undefined) return undefined;
  const status = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!STATUSES.has(status)) throw new ReportAiAuthorityValidationError();
  return status as ReportAiSuggestionRecord['status'];
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ReportAiAuthorityValidationError) {
    res.status(400).json({ error: 'Invalid report AI request' });
    return;
  }
  if (error instanceof ReportAiAuthorityNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof ReportAiAuthorityConflictError) {
    res.status(409).json({ error: 'Report AI conflict' });
    return;
  }
  console.error('AUTOERP_REPORT_AI_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Report AI operation failed' });
}

export function registerReportAiSuggestionRoutes(app: Express): void {
  app.post('/api/report-ai/suggestions/driver-summary', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const body = exactObject(req.body, new Set(['driverId']));
      const driverId = typeof body.driverId === 'string' ? body.driverId.trim() : '';
      if (!driverId || driverId.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(driverId)) {
        throw new ReportAiAuthorityValidationError();
      }
      const driver = await UnitOfWork.run(principal.companyId, async (context: any) =>
        await context.getDriverRepo().findByIdForCompany(principal.companyId, driverId),
      );
      if (!driver || driver.isArchived) throw new ReportAiAuthorityNotFoundError();

      const candidates: ReportAiCandidate[] = [];
      const add = (
        field: string,
        value: ReportAiScalar | undefined,
        sensitivity: ReportAiCandidate['sensitivity'] = 'GENERAL',
      ): void => {
        if (value === undefined || value === null || value === '') return;
        candidates.push({
          companyId: principal.companyId,
          field,
          value,
          sensitivity,
          source: {
            kind: 'POSTGRES',
            entityType: 'Driver',
            entityId: driver.id,
            observedAt: driver.updatedAt,
            confidence: null,
            reviewedAt: null,
          },
        });
      };
      add('driverName', driver.fullName);
      add('cnhNumber', driver.cnhNumber, 'CONTRACTUAL');
      add('cnhCategory', driver.cnhCategory, 'CONTRACTUAL');
      add('cnhExpiration', driver.cnhExpiration, 'CONTRACTUAL');
      add('phone', driver.phone);
      add('whatsapp', driver.whatsapp);
      add('email', driver.email);
      add('city', driver.address?.city);
      add('state', driver.address?.state);
      add('status', driver.status);
      add('currentVehicleId', driver.currentVehicleId, 'CONTRACTUAL');
      add('currentContractId', driver.currentContractId, 'CONTRACTUAL');

      const suggestion = buildReportAiSuggestion({
        companyId: principal.companyId,
        targetType: 'DRIVER_SUMMARY',
        targetId: driver.id,
        allowedFields: [
          'driverName', 'cnhNumber', 'cnhCategory', 'cnhExpiration', 'phone', 'whatsapp',
          'email', 'city', 'state', 'status', 'currentVehicleId', 'currentContractId',
        ],
        requiredFields: ['driverName', 'cnhNumber', 'cnhExpiration', 'status'],
        candidates,
      });
      const result = await persistReportAiSuggestion(principal.companyId, {
        userId: principal.userId,
        name: principal.name,
      }, suggestion);
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/report-ai/suggestions', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const status = parseStatus(req.query.status);
      const items = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const result = status
          ? await tx.execute(sql`
              SELECT * FROM report_ai_suggestions
              WHERE company_id = ${principal.companyId} AND status = ${status}
              ORDER BY created_at DESC, id
              LIMIT 100
            `)
          : await tx.execute(sql`
              SELECT * FROM report_ai_suggestions
              WHERE company_id = ${principal.companyId}
              ORDER BY created_at DESC, id
              LIMIT 100
            `);
        return rows(result).map(recordFrom);
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/report-ai/suggestions/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const id = requiredSuggestionId(req.params.id);
      const item = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const found = rows(await tx.execute(sql`
          SELECT * FROM report_ai_suggestions
          WHERE company_id = ${principal.companyId} AND id = ${id}
          LIMIT 1
        `))[0];
        if (!found) throw new ReportAiAuthorityNotFoundError();
        return recordFrom(found);
      });
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/report-ai/suggestions/:id/review', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const id = requiredSuggestionId(req.params.id);
      const input = parseReview(req.body);
      const item = await reviewSuggestion(principal, id, input);
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });
}
