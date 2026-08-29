import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import type { DriverDocumentIntakeState } from './driverDocumentIntakeAuthority';

type DriverIntakeAction = 'VIEW_DRIVER' | 'CREATE_DRIVER';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const DEFAULT_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const INTAKE_TTL_MS = 24 * 60 * 60 * 1000;

class DriverDocumentIntakeValidationError extends Error {}
class DriverDocumentIntakeNotFoundError extends Error {}
class DriverDocumentIntakeConflictError extends Error {}

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
  if (error instanceof DriverDocumentIntakeValidationError) {
    res.status(400).json({ error: 'Invalid driver document intake request' });
    return;
  }
  if (error instanceof DriverDocumentIntakeNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof DriverDocumentIntakeConflictError) {
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

  app.get('/api/driver-document-intakes/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_DRIVER');
    if (!principal) return;
    const intakeId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!intakeId || intakeId.length > 120) {
      sendError(res, new DriverDocumentIntakeValidationError());
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
