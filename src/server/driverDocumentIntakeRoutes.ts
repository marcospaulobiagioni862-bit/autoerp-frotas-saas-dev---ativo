import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction, DocumentStatus, DriverStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
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

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function hasPermission(principal: AuthenticatedPrincipal, action: DriverIntakeAction): boolean {
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId || !principal.companyId || !CANONICAL_ROLES.has(role)) return false;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*') || permissions.includes(action)) return true;
  if (action === 'VIEW_DRIVER') return true;
  return DEFAULT_WRITE_ROLES.has(role);
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

function evaluateCnhStatus(expiration: string): DocumentStatus {
  const end = new Date(`${expiration}T00:00:00Z`).getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.ceil((end - today) / 86_400_000);
  if (days < 0) return DocumentStatus.EXPIRED;
  if (days <= 30) return DocumentStatus.EXPIRING_SOON;
  return DocumentStatus.VALID;
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
  ) throw new DriverDocumentIntakeConflictError();

  const projected = projectApprovedCnhDriverDraft({
    status: String(row.extraction_status),
    detectedDocumentType: String(row.detected_document_type),
    proposedFields: row.proposed_fields,
    corrections: row.corrections,
  });
  if (Object.keys(projected).length === 0) throw new DriverDocumentIntakeConflictError();
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

function sendError(res: Response, error: unknown): void {
  if (error instanceof DriverDocumentIntakeDuplicateCnhError) {
    res.status(409).json({
      error: 'Esta CNH já está cadastrada. Abra o cadastro existente antes de substituir ou reenviar o documento.',
      code: 'CNH_ALREADY_REGISTERED',
      driverId: error.driverId,
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
    res.status(409).json({ error: 'Driver document intake conflict' });
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
          if (String(existing.created_by) !== principal.userId) throw new DriverDocumentIntakeConflictError();
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
          if (!winner || String(winner.created_by) !== principal.userId) throw new DriverDocumentIntakeConflictError();
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
      requireEmptyBody(req.body);
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
          return {
            driverId: String(intake.driver_id),
            attachmentId: String(intake.attachment_id),
            created: false,
          };
        }

        const draft = await loadApprovedCnhDraft(context, principal, intakeId);
        if (
          !draft.fullName || !draft.cpf || !draft.birthDate || !draft.cnhNumber ||
          !draft.cnhCategory || !draft.cnhExpiration
        ) throw new DriverDocumentIntakeConflictError();

        const repo = context.getDriverRepo();
        const byCpf = await repo.findByCpf(principal.companyId, draft.cpf);
        if (byCpf) throw new DriverDocumentIntakeDuplicateCnhError(byCpf.id);
        const byCnh = await repo.findByCnh(principal.companyId, draft.cnhNumber);
        if (byCnh) throw new DriverDocumentIntakeDuplicateCnhError(byCnh.id);

        const now = new Date().toISOString();
        const cnhStatus = evaluateCnhStatus(draft.cnhExpiration);
        const created = await repo.create({
          id: randomUUID(),
          companyId: principal.companyId,
          fullName: draft.fullName,
          cpf: draft.cpf,
          rg: draft.rg,
          birthDate: draft.birthDate,
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
          cnhNumber: draft.cnhNumber,
          cnhCategory: draft.cnhCategory,
          cnhExpiration: draft.cnhExpiration,
          cnhStatus,
          appPlatforms: [],
          status: cnhStatus === DocumentStatus.EXPIRED ? DriverStatus.BLOCKED : DriverStatus.PENDING_DOCS,
          photoUrl: undefined,
          notes: 'Cadastro inicial criado pela aprovação da CNH. Dados complementares pendentes.',
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });

        await context.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Driver',
          entityId: created.id,
          action: AuditAction.CREATE,
          newState: JSON.stringify({
            event: 'CREATE_FROM_APPROVED_CNH',
            status: created.status,
            cnhNumber: created.cnhNumber,
          }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });

        const promotion = await promoteApprovedDriverDocumentIntake(context, principal, intakeId, created.id);
        return {
          driverId: created.id,
          attachmentId: promotion.attachmentId,
          created: true,
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
