import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

type Action = 'VIEW_VEHICLE' | 'CREATE_VEHICLE';
const ROLES = new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY']);
const WRITE_ROLES = new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const DOCUMENT_TYPES = new Set(['CRLV','CRV','ATPV_E']);
const TTL_MS = 24 * 60 * 60 * 1000;

class ValidationError extends Error {}
class NotFoundError extends Error {}
class ConflictError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}
function requirePrincipal(req: Request, res: Response, action: Action): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) { res.status(401).json({ error: 'Unauthorized: Authentication required' }); return null; }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  const allowed = !!principal.userId && !!principal.companyId && ROLES.has(role) &&
    (permissions.includes('*') || permissions.includes(action) || action === 'VIEW_VEHICLE' || WRITE_ROLES.has(role));
  if (!allowed) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return principal;
}
function documentType(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase().replace(/[-/ ]/g, '_') : '';
  if (!DOCUMENT_TYPES.has(normalized)) throw new ValidationError();
  return normalized;
}
function map(row: any) {
  return {
    id: String(row.id), companyId: String(row.company_id), createdBy: String(row.created_by),
    status: String(row.status), idempotencyKey: String(row.idempotency_key),
    documentType: String(row.document_type), attachmentId: row.attachment_id ? String(row.attachment_id) : undefined,
    approvedExtractionId: row.approved_extraction_id ? String(row.approved_extraction_id) : undefined,
    vehicleId: row.vehicle_id ? String(row.vehicle_id) : undefined,
    expiresAt: new Date(row.expires_at).toISOString(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : undefined,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
function sendError(res: Response, error: unknown): void {
  if (error instanceof ValidationError) { res.status(400).json({ error: 'Invalid vehicle document intake request' }); return; }
  if (error instanceof NotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
  if (error instanceof ConflictError) { res.status(409).json({ error: 'Vehicle document intake conflict' }); return; }
  console.error('AUTOERP_VEHICLE_DOCUMENT_INTAKE_FAILURE', error);
  res.status(500).json({ error: 'Vehicle document intake operation failed' });
}

export function registerVehicleDocumentIntakeRoutes(app: Express): void {
  app.post('/api/vehicle-document-intakes', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'CREATE_VEHICLE'); if (!principal) return;
    const key = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    if (!key || key.length > 200) { sendError(res, new ValidationError()); return; }
    let type: string; try { type = documentType(req.body?.documentType); } catch (error) { sendError(res, error); return; }
    try {
      const result = await UnitOfWork.run(principal.companyId, async (context) => {
        const tx = context.getRawTransaction?.(); if (!tx) throw new Error('Raw tenant transaction unavailable');
        const existingResult: any = await tx.execute(sql`
          SELECT * FROM vehicle_document_intakes
          WHERE company_id=${principal.companyId} AND idempotency_key=${key}
          LIMIT 1
        `);
        const existing = existingResult.rows?.[0];
        if (existing) {
          if (String(existing.created_by) !== principal.userId || String(existing.document_type) !== type) throw new ConflictError();
          return { item: map(existing), created: false };
        }
        const id = randomUUID(), now = new Date(), expiresAt = new Date(now.getTime() + TTL_MS);
        const insertedResult: any = await tx.execute(sql`
          INSERT INTO vehicle_document_intakes
            (id,company_id,created_by,status,idempotency_key,document_type,expires_at,created_at,updated_at)
          VALUES
            (${id},${principal.companyId},${principal.userId},'DRAFT',${key},${type},${expiresAt.toISOString()},${now.toISOString()},${now.toISOString()})
          ON CONFLICT (company_id,idempotency_key) DO NOTHING
          RETURNING *
        `);
        const row = insertedResult.rows?.[0];
        if (!row) throw new ConflictError();
        const item = map(row);
        await context.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'VehicleDocumentIntake', entityId: item.id,
          action: AuditAction.CREATE, newState: JSON.stringify({ event: 'CREATE', status: item.status, documentType: item.documentType }),
          userId: principal.userId, userName: principal.name, timestamp: now.toISOString(),
        });
        return { item, created: true };
      });
      res.status(result.created ? 201 : 200).json({ item: result.item });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/vehicle-document-intakes/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_VEHICLE'); if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (context) => {
        const tx = context.getRawTransaction?.(); if (!tx) throw new Error('Raw tenant transaction unavailable');
        const result: any = await tx.execute(sql`
          SELECT * FROM vehicle_document_intakes
          WHERE company_id=${principal.companyId} AND id=${req.params.id} AND created_by=${principal.userId}
          LIMIT 1
        `);
        if (!result.rows?.[0]) throw new NotFoundError();
        return map(result.rows[0]);
      });
      res.json({ item });
    } catch (error) { sendError(res, error); }
  });
}
