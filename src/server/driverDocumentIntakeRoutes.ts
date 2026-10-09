import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction, DocumentStatus, DriverStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { decideDriverCnhRenewal } from './driverCnhRenewalPolicy';
import { evaluateCnhStatus } from './driverCnhStatus';
import { projectApprovedCnhDriverDraft } from './driverDocumentIntakeApprovedCnhDraft';
import type { DriverDocumentIntakeState } from './driverDocumentIntakeAuthority';
import {
  DriverDocumentIntakeAiConflictError,
  DriverDocumentIntakeAiNotFoundError,
  enqueueDriverDocumentIntakeCnh,
} from './driverDocumentIntakeAiQueue';
import {
  dispatchDocumentAiExtractionFromEnvironment,
  isDocumentAiRuntimeAvailableFromEnvironment,
} from './documentAiRuntime';
import {
  DriverDocumentIntakePromotionConflictError,
  DriverDocumentIntakePromotionNotFoundError,
  promoteApprovedDriverDocumentIntake,
} from './driverDocumentIntakePromotion';

type DriverIntakeAction = 'VIEW_DRIVER' | 'CREATE_DRIVER' | 'PROCESS_DOCUMENT_AI';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const DEFAULT_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const INTAKE_TTL_MS = 24 * 60 * 60 * 1000;

class DriverDocumentIntakeValidationError extends Error {}
class DriverDocumentIntakeNotFoundError extends Error {}
class DriverDocumentIntakeConflictError extends Error {}
class DriverDocumentIntakeDuplicateCnhError extends Error {
  constructor(public readonly driverId: string) {
    super('CNH_ALREADY_REGISTERED');
  }
}
class DriverDocumentIntakeRenewalConflictError extends Error {
  constructor(
    public readonly code: 'CNH_RENEWAL_IDENTITY_CONFLICT' | 'CNH_RENEWAL_OLDER_THAN_CURRENT',
    public readonly driverId: string,
  ) {
    super(code);
  }
}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function hasPermission(principal: AuthenticatedPrincipal, action: DriverIntakeAction): boolean {
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId || !principal.companyId || !CANONICAL_ROLES.has(role)) return false;
  if (role === 'ADMIN') return true;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*') || permissions.includes(action)) return true;
  return false;
}

function requirePrincipal(req: Request, res: Response, action: DriverIntakeAction): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  if (!hasPermission(principal, action)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) throw new DriverDocumentIntakeValidationError();
  return parsed.toISOString();
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function requiredIntakeId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new DriverDocumentIntakeValidationError();
  return id;
}

function requiredEntityId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new DriverDocumentIntakeValidationError();
  return id;
}

function parsePromotion(body: unknown): { driverId: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DriverDocumentIntakeValidationError();
  const item = body as Record<string, unknown>;
  if (Object.keys(item).length !== 1 || !Object.prototype.hasOwnProperty.call(item, 'driverId')) {
    throw new DriverDocumentIntakeValidationError();
  }
  return { driverId: requiredEntityId(item.driverId) };
}

function requireEmptyBody(body: unknown): void {
  if (body === undefined || body === null) return;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body as Record<string, unknown>).length !== 0) {
    throw new DriverDocumentIntakeValidationError();
  }
}

function parseMaterialization(body: unknown): { expectedDriverId?: string } {
  if (body === undefined || body === null) return {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DriverDocumentIntakeValidationError();
  const item = body as Record<string, unknown>;
  const keys = Object.keys(item);
  if (keys.length === 0) return {};
  if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(item, 'expectedDriverId')) {
    throw new DriverDocumentIntakeValidationError();
  }
  return { expectedDriverId: requiredEntityId(item.expectedDriverId) };
}

function sanitizeExtraction(item: any) {
  return {
    id: String(item.id),
    attachmentId: String(item.attachmentId),
    attachmentChecksum: String(item.attachmentChecksum),
    status: String(item.status),
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  };
}

function scheduleDocumentAiExtraction(companyId: string, extractionId: string): void {
  setImmediate(() => {
    void dispatchDocumentAiExtractionFromEnvironment(
      companyId,
      extractionId,
      `driver-intake-${extractionId}`,
    ).catch(() => {
      console.error('AUTOERP_DOCUMENT_AI_DISPATCH_FAILURE');
    });
  });
}

async function loadApprovedCnhDraft(context: any, principal: AuthenticatedPrincipal, intakeId: string) {
  const tx = context.getRawTransaction?.();
  if (!tx) throw new Error('Raw tenant transaction unavailable');
  const result: any = await tx.execute(sql`
    SELECT
      intake.status AS intake_status,
      intake.attachment_id,
      intake.approved_extraction_id,
      extraction.id AS extraction_id,
      extraction.attachment_id AS extraction_attachment_id,
      extraction.status AS extraction_status,
      extraction.detected_document_type,
      extraction.proposed_fields,
      extraction.corrections
    FROM driver_document_intakes intake
    JOIN document_ai_extractions extraction
      ON extraction.company_id = intake.company_id
     AND extraction.id = intake.approved_extraction_id
    WHERE intake.company_id = ${principal.companyId}
      AND intake.id = ${intakeId}
      AND intake.created_by = ${principal.userId}
    LIMIT 1
    FOR UPDATE OF intake
  `);
  const row = result.rows?.[0];
  if (!row) throw new DriverDocumentIntakeNotFoundError();
  if (
    String(row.intake_status) !== 'APPROVED' ||
    !row.attachment_id || !row.approved_extraction_id ||
    String(row.approved_extraction_id) !== String(row.extraction_id) ||
    String(row.attachment_id) !== String(row.extraction_attachment_id) ||
    String(row.extraction_status) !== 'APPROVED' ||
    String(row.detected_document_type || '').toUpperCase() !== 'CNH'
  ) throw new DriverDocumentIntakeConflictError('APPROVED_DRAFT_STATE_MISMATCH');

  const projected = projectApprovedCnhDriverDraft({
    status: String(row.extraction_status),
    detectedDocumentType: String(row.detected_document_type),
    proposedFields: row.proposed_fields,
    corrections: row.corrections,
  });
  if (Object.keys(projected).length === 0) throw new DriverDocumentIntakeConflictError('APPROVED_DRAFT_EMPTY');
  return projected;
}

export function mapDriverDocumentIntakeRow(row: any): DriverDocumentIntakeState {
  if (!row) throw new DriverDocumentIntakeValidationError();
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    createdBy: String(row.created_by),
    status: String(row.status) as DriverDocumentIntakeState['status'],
    idempotencyKey: String(row.idempotency_key),
    attachmentId: optionalText(row.attachment_id),
    approvedExtractionId: optionalText(row.approved_extraction_id),
    driverId: optionalText(row.driver_id),
    expiresAt: iso(row.expires_at),
    consumedAt: row.consumed_at ? iso(row.consumed_at) : undefined,
    archivedAt: row.archived_at ? iso(row.archived_at) : undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function safeConflictCode(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : '';
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(raw) ? raw : 'DRIVER_DOCUMENT_INTAKE_CONFLICT';
}

function isArchivedDriverIdentityConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === '23505'
    && candidate.message === 'Archived driver identity conflicts with CPF/CNH combination';
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof DriverDocumentIntakeRenewalConflictError) {
    const message = error.code === 'CNH_RENEWAL_OLDER_THAN_CURRENT'
      ? 'A CNH enviada tem validade menor que a CNH vigente. O cadastro atual não foi alterado.'
      : 'Os dados da CNH enviada não correspondem de forma segura ao mesmo motorista. Revise a identidade antes de continuar.';
    res.status(409).json({ error: message, code: error.code, driverId: error.driverId });
    return;
  }
  if (error instanceof DriverDocumentIntakeDuplicateCnhError) {
    res.status(409).json({
      error: 'Esta CNH já está cadastrada. Abra o cadastro existente antes de substituir ou reenviar o documento.',
      code: 'CNH_ALREADY_REGISTERED',
      driverId: error.driverId,
    });
    return;
  }
  if (isArchivedDriverIdentityConflict(error)) {
    console.warn('AUTOERP_DRIVER_DOCUMENT_INTAKE_CONFLICT', 'ARCHIVED_DRIVER_IDENTITY_CONFLICT');
    res.status(409).json({
      error: 'Já existem cadastros arquivados associados ao CPF ou à CNH informados. Revise os cadastros arquivados antes de continuar.',
      code: 'ARCHIVED_DRIVER_IDENTITY_CONFLICT',
    });
    return;
  }
  if (error instanceof DriverDocumentIntakeValidationError) {
    res.status(400).json({ error: 'Invalid driver document intake request' });
    return;
  }
  if (
    error instanceof DriverDocumentIntakeNotFoundError ||
    error instanceof DriverDocumentIntakeAiNotFoundError ||
    error instanceof DriverDocumentIntakePromotionNotFoundError
  ) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (
    error instanceof DriverDocumentIntakeConflictError ||
    error instanceof DriverDocumentIntakeAiConflictError ||
    error instanceof DriverDocumentIntakePromotionConflictError
  ) {
    const code = safeConflictCode(error);
    console.warn('AUTOERP_DRIVER_DOCUMENT_INTAKE_CONFLICT', code);
    res.status(409).json({ error: 'Driver document intake conflict', code });
    return;
  }
  console.error('AUTOERP_DRIVER_DOCUMENT_INTAKE_FAILURE', error);
  res.status(500).json({ error: 'Driver document intake operation failed' });
}

export function registerDriverDocumentIntakeRoutes(app: Express): void {
  app.post('/api/driver-document-intakes', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'CREATE_DRIVER');
    if (!principal) return;
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    if (!idempotencyKey || idempotencyKey.length > 200) {
      sendError(res, new DriverDocumentIntakeValidationError());
      return;
    }

    try {
      const result = await UnitOfWork.run(principal.companyId, async (context) => {
        const tx = context.getRawTransaction?.();
        if (!tx) throw new Error('Raw tenant transaction unavailable');

        const existingResult: any = await tx.execute(sql`
          SELECT * FROM driver_document_intakes
          WHERE company_id = ${principal.companyId} AND idempotency_key = ${idempotencyKey}
          LIMIT 1
        `);
        const existing = existingResult.rows?.[0];
        if (existing) {
          if (String(existing.created_by) !== principal.userId) throw new DriverDocumentIntakeConflictError('IDEMPOTENCY_OWNER_MISMATCH');
          return { item: mapDriverDocumentIntakeRow(existing), created: false };
        }

        const id = randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + INTAKE_TTL_MS);
        const insertedResult: any = await tx.execute(sql`
          INSERT INTO driver_document_intakes (
            id, company_id, created_by, status, idempotency_key, expires_at, created_at, updated_at
          ) VALUES (
            ${id}, ${principal.companyId}, ${principal.userId}, 'DRAFT', ${idempotencyKey},
            ${expiresAt.toISOString()}, ${now.toISOString()}, ${now.toISOString()}
          )
          ON CONFLICT (company_id, idempotency_key) DO NOTHING
          RETURNING *
        `);
        const inserted = insertedResult.rows?.[0];
        if (!inserted) {
          const winnerResult: any = await tx.execute(sql`
            SELECT * FROM driver_document_intakes
            WHERE company_id = ${principal.companyId} AND idempotency_key = ${idempotencyKey}
            LIMIT 1
          `);
          const winner = winnerResult.rows?.[0];
          if (!winner || String(winner.created_by) !== principal.userId) throw new DriverDocumentIntakeConflictError('IDEMPOTENCY_WINNER_MISMATCH');
          return { item: mapDriverDocumentIntakeRow(winner), created: false };
        }

        const item = mapDriverDocumentIntakeRow(inserted);
        await context.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'DriverDocumentIntake',
          entityId: item.id,
          action: AuditAction.CREATE,
          newState: JSON.stringify({ event: 'CREATE', status: item.status, expiresAt: item.expiresAt }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now.toISOString(),
        });
        return { item, created: true };
      });
      res.status(result.created ? 201 : 200).json({ item: result.item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/driver-document-intakes/:id/document-ai', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'PROCESS_DOCUMENT_AI');
    if (!principal) return;
    try {
      const intakeId = requiredIntakeId(req.params.id);
      requireEmptyBody(req.body);
      if (!isDocumentAiRuntimeAvailableFromEnvironment()) {
        res.status(503).json({
          error: 'Análise automática de CNH indisponível neste ambiente. Configure o Document AI antes de tentar novamente.',
          code: 'DOCUMENT_AI_RUNTIME_UNAVAILABLE',
        });
        return;
      }
      const result = await UnitOfWork.run(principal.companyId, async (context) => (
        enqueueDriverDocumentIntakeCnh(context, principal, intakeId)
      ));
      scheduleDocumentAiExtraction(principal.companyId, String(result.item.id));
      res.status(result.created ? 201 : 200).json({ item: sanitizeExtraction(result.item), created: result.created });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/driver-document-intakes/:id/approved-cnh-draft', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_DRIVER');
    if (!principal) return;
    try {
      const intakeId = requiredIntakeId(req.params.id);
      const draft = await UnitOfWork.run(principal.companyId, async (context) =>
        loadApprovedCnhDraft(context, principal, intakeId)
      );
      res.json({ draft });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/driver-document-intakes/:id/materialize-driver', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'CREATE_DRIVER');
    if (!principal) return;
    try {
      const intakeId = requiredIntakeId(req.params.id);
      const { expectedDriverId } = parseMaterialization(req.body);
      const result = await UnitOfWork.run(principal.companyId, async (context) => {
        const tx = context.getRawTransaction?.();
        if (!tx) throw new Error('Raw tenant transaction unavailable');

        const intakeResult: any = await tx.execute(sql`
          SELECT status, driver_id, attachment_id
          FROM driver_document_intakes
          WHERE company_id = ${principal.companyId}
            AND id = ${intakeId}
            AND created_by = ${principal.userId}
          LIMIT 1
          FOR UPDATE
        `);
        const intake = intakeResult.rows?.[0];
        if (!intake) throw new DriverDocumentIntakeNotFoundError();
        if (String(intake.status) === 'CONSUMED' && intake.driver_id && intake.attachment_id) {
          if (expectedDriverId && String(intake.driver_id) !== expectedDriverId) {
            throw new DriverDocumentIntakeRenewalConflictError('CNH_RENEWAL_IDENTITY_CONFLICT', expectedDriverId);
          }
          return {
            driverId: String(intake.driver_id),
            attachmentId: String(intake.attachment_id),
            created: false,
          };
        }

        const draft = await loadApprovedCnhDraft(context, principal, intakeId);
        const cpf = draft.cpf || `PENDING-CPF-${intakeId}`;
        const cnhNumber = draft.cnhNumber || `PENDING-CNH-${intakeId}`;
        const repo = context.getDriverRepo();
        const byCpf = draft.cpf ? await repo.findByCpf(principal.companyId, draft.cpf) : null;
        const byCnh = draft.cnhNumber ? await repo.findByCnh(principal.companyId, draft.cnhNumber) : null;
        const renewal = decideDriverCnhRenewal(draft, byCpf, byCnh);
        if (expectedDriverId && (
          renewal.kind === 'NEW' ||
          renewal.kind === 'IDENTITY_CONFLICT' ||
          renewal.driver.id !== expectedDriverId
        )) {
          throw new DriverDocumentIntakeRenewalConflictError('CNH_RENEWAL_IDENTITY_CONFLICT', expectedDriverId);
        }

        const now = new Date().toISOString();
        const cnhStatus = draft.cnhExpiration ? evaluateCnhStatus(draft.cnhExpiration) : DocumentStatus.PENDING;

        if (renewal.kind !== 'NEW') {
          if (renewal.kind === 'IDENTITY_CONFLICT') {
            throw new DriverDocumentIntakeRenewalConflictError('CNH_RENEWAL_IDENTITY_CONFLICT', renewal.driver.id);
          }
          if (renewal.kind === 'OLDER') {
            throw new DriverDocumentIntakeRenewalConflictError('CNH_RENEWAL_OLDER_THAN_CURRENT', renewal.driver.id);
          }
          if (renewal.kind === 'DUPLICATE_WITHOUT_VALIDITY' || renewal.kind === 'REPLAY') {
            throw new DriverDocumentIntakeDuplicateCnhError(renewal.driver.id);
          }

          let target = renewal.driver;
          if (renewal.kind === 'RENEW') {
            const updated = await repo.updateForCompany(principal.companyId, renewal.driver.id, {
              cnhExpiration: draft.cnhExpiration!,
              cnhCategory: draft.cnhCategory || renewal.driver.cnhCategory,
              cnhEar: draft.cnhEar === undefined ? renewal.driver.cnhEar : draft.cnhEar,
              cnhStatus,
              rg: draft.rg || renewal.driver.rg,
              updatedAt: now,
            });
            if (!updated) throw new DriverDocumentIntakeNotFoundError();
            target = updated;
            await context.getAuditLogRepo().create({
              id: randomUUID(),
              companyId: principal.companyId,
              entityName: 'Driver',
              entityId: renewal.driver.id,
              action: AuditAction.UPDATE,
              previousState: JSON.stringify({
                event: 'CNH_RENEWAL',
                cnhExpiration: renewal.driver.cnhExpiration,
                cnhCategory: renewal.driver.cnhCategory,
                cnhStatus: renewal.driver.cnhStatus,
              }),
              newState: JSON.stringify({
                event: 'CNH_RENEWAL',
                cnhExpiration: updated.cnhExpiration,
                cnhCategory: updated.cnhCategory,
                cnhStatus: updated.cnhStatus,
              }),
              userId: principal.userId,
              userName: principal.name,
              timestamp: now,
            });
          }

          const promotion = await promoteApprovedDriverDocumentIntake(context, principal, intakeId, target.id);
          await tx.execute(sql`
            UPDATE file_attachments
            SET is_archived = true,
                updated_at = ${now}
            WHERE company_id = ${principal.companyId}
              AND entity_type = 'Driver'
              AND entity_id = ${target.id}
              AND UPPER(document_type) = 'CNH'
              AND id != ${promotion.attachmentId}
              AND is_archived = false
          `);
          return {
            driverId: target.id,
            attachmentId: promotion.attachmentId,
            created: false,
          };
        }

        const candidateId = randomUUID();
        const materialized = await repo.create({
          id: candidateId,
          companyId: principal.companyId,
          fullName: draft.fullName || 'Cadastro pendente - CNH aprovada',
          cpf,
          rg: draft.rg,
          birthDate: draft.birthDate || '',
          phone: '',
          whatsapp: '',
          email: undefined,
          address: {
            street: '',
            number: '',
            neighborhood: '',
            city: '',
            state: '',
            zipCode: '',
          },
          cnhNumber,
          cnhCategory: draft.cnhCategory || '',
          cnhExpiration: draft.cnhExpiration || '',
          cnhEar: draft.cnhEar,
          cnhStatus,
          appPlatforms: [],
          status: cnhStatus === DocumentStatus.EXPIRED ? DriverStatus.BLOCKED : DriverStatus.PENDING_DOCS,
          photoUrl: undefined,
          notes: 'Cadastro criado/restaurado pela aprovação da CNH. Dados complementares pendentes.',
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        const restored = materialized.id !== candidateId;

        await context.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Driver',
          entityId: materialized.id,
          action: restored ? AuditAction.UPDATE : AuditAction.CREATE,
          newState: JSON.stringify({
            event: restored ? 'RESTORE_FROM_APPROVED_CNH' : 'CREATE_FROM_APPROVED_CNH',
            status: materialized.status,
            cnhNumber: materialized.cnhNumber,
          }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });

        const promotion = await promoteApprovedDriverDocumentIntake(context, principal, intakeId, materialized.id);
        await tx.execute(sql`
          UPDATE file_attachments
          SET is_archived = true,
              updated_at = ${now}
          WHERE company_id = ${principal.companyId}
            AND entity_type = 'Driver'
            AND entity_id = ${materialized.id}
            AND UPPER(document_type) = 'CNH'
            AND id != ${promotion.attachmentId}
            AND is_archived = false
        `);
        return {
          driverId: materialized.id,
          attachmentId: promotion.attachmentId,
          created: !restored,
        };
      });
      res.status(result.created ? 201 : 200).json({ item: result });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/driver-document-intakes/:id/promote', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'CREATE_DRIVER');
    if (!principal) return;
    try {
      const intakeId = requiredIntakeId(req.params.id);
      const { driverId } = parsePromotion(req.body);
      const result = await UnitOfWork.run(principal.companyId, async (context) =>
        promoteApprovedDriverDocumentIntake(context, principal, intakeId, driverId)
      );
      res.status(200).json({ item: result });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/driver-document-intakes/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_DRIVER');
    if (!principal) return;
    let intakeId: string;
    try {
      intakeId = requiredIntakeId(req.params.id);
    } catch (error) {
      sendError(res, error);
      return;
    }

    try {
      const item = await UnitOfWork.run(principal.companyId, async (context) => {
        const tx = context.getRawTransaction?.();
        if (!tx) throw new Error('Raw tenant transaction unavailable');
        const result: any = await tx.execute(sql`
          SELECT * FROM driver_document_intakes
          WHERE company_id = ${principal.companyId}
            AND id = ${intakeId}
            AND created_by = ${principal.userId}
          LIMIT 1
        `);
        const row = result.rows?.[0];
        if (!row) throw new DriverDocumentIntakeNotFoundError();
        return mapDriverDocumentIntakeRow(row);
      });
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });
}
