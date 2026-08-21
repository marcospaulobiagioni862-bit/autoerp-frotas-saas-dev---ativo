import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { auditLogs } from '../db/schema';
import { AuditAction } from '../types/enums';
import type { AuditLog, CommunicationLog, Driver } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

const READ_ROLES = new Set([
  'ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'FINANCIAL_MANAGER', 'OPERATIONAL', 'READONLY',
]);
const WRITE_ROLES = new Set([
  'ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'FINANCIAL_MANAGER', 'OPERATIONAL',
]);
const COMMUNICATION_TYPES = new Set<CommunicationLog['type']>([
  'RENT_CHARGE', 'DUE_REMINDER', 'TICKET_ALERT', 'MAINTENANCE_ALERT', 'CUSTOM',
]);

class DetailValidationError extends Error {}
class DetailNotFoundError extends Error {}
class DetailConflictError extends Error {}

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
  const allowed = write ? WRITE_ROLES : READ_ROLES;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!permissions.includes('*') && !allowed.has(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function requiredText(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new DetailValidationError();
  return text;
}

function communicationType(value: unknown): CommunicationLog['type'] {
  const type = String(value || '') as CommunicationLog['type'];
  if (!COMMUNICATION_TYPES.has(type)) throw new DetailValidationError();
  return type;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof DetailValidationError) {
    res.status(400).json({ error: 'Invalid detail authority request' });
    return;
  }
  if (error instanceof DetailNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof DetailConflictError) {
    res.status(409).json({ error: 'Detail authority conflict' });
    return;
  }
  console.error('AUTOERP_DETAIL_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Detail authority operation failed' });
}

function valueAsJsonString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function mapAuditRow(row: any): AuditLog {
  let changes: Record<string, unknown> = {};
  if (typeof row.changes === 'string' && row.changes) {
    try {
      const parsed = JSON.parse(row.changes);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) changes = parsed;
    } catch {
      changes = {};
    }
  }
  const timestamp = row.timestamp instanceof Date
    ? row.timestamp.toISOString()
    : new Date(row.timestamp).toISOString();
  return {
    id: String(row.id),
    companyId: String(row.companyId),
    entityName: String(row.entityType),
    entityId: String(row.entityId),
    action: String(row.action) as AuditAction,
    previousState: valueAsJsonString(changes.previousState),
    newState: valueAsJsonString(changes.newState),
    userId: String(row.userId),
    userName: typeof changes.userName === 'string' && changes.userName ? changes.userName : String(row.userId),
    ipAddress: row.ipAddress ? String(row.ipAddress) : undefined,
    timestamp,
  };
}

function mapCommunicationRow(row: any, driver: Driver): CommunicationLog {
  const sentAt = row.sent_at instanceof Date ? row.sent_at.toISOString() : new Date(row.sent_at).toISOString();
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    driverId: String(row.driver_id),
    type: String(row.type) as CommunicationLog['type'],
    phone: driver.phone,
    message: String(row.message),
    user: row.created_by ? String(row.created_by) : 'SYSTEM',
    dateTime: sentAt,
    status: String(row.status) as CommunicationLog['status'],
  };
}

async function requireDriver(tx: any, companyId: string, driverId: string): Promise<Driver> {
  const driver = await tx.getDriverRepo().findByIdForCompany(companyId, driverId);
  if (!driver || driver.isArchived) throw new DetailNotFoundError();
  return driver;
}

export function registerDetailAuthorityRoutes(app: Express): void {
  app.get('/api/detail-audit', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, false);
    if (!principal) return;
    try {
      const entityName = requiredText(req.query.entityName, 80);
      const entityId = requiredText(req.query.entityId, 200);
      const items = await UnitOfWork.run(principal.companyId, async (tx) => {
        const raw = tx.getRawTransaction();
        const rows = await raw
          .select()
          .from(auditLogs)
          .where(and(
            eq(auditLogs.companyId, principal.companyId),
            eq(auditLogs.entityType, entityName),
            eq(auditLogs.entityId, entityId),
          ))
          .orderBy(desc(auditLogs.timestamp))
          .limit(200);
        return rows.map(mapAuditRow);
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/drivers/:driverId/communications', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, false);
    if (!principal) return;
    try {
      const driverId = requiredText(req.params.driverId, 200);
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const driver = await requireDriver(tx, principal.companyId, driverId);
        const raw = tx.getRawTransaction();
        const query = await raw.execute(sql`
          SELECT id, company_id, driver_id, type, message, status, sent_at, created_by
          FROM communication_logs
          WHERE company_id = ${principal.companyId} AND driver_id = ${driverId}
          ORDER BY sent_at DESC, id DESC
          LIMIT 200
        `);
        return { driver, rows: query.rows as any[] };
      });
      res.json({ items: result.rows.map((row) => mapCommunicationRow(row, result.driver)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drivers/:driverId/communications', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const driverId = requiredText(req.params.driverId, 200);
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
      const forbidden = ['id', 'companyId', 'driverId', 'userId', 'userName', 'role', 'status', 'sentAt', 'createdBy', 'phone'];
      if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(body, key))) throw new DetailValidationError();
      const type = communicationType(body.type);
      const message = requiredText(body.message, 4000);
      const now = new Date().toISOString();
      const id = randomUUID();
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const driver = await requireDriver(tx, principal.companyId, driverId);
        const raw = tx.getRawTransaction();
        const inserted = await raw.execute(sql`
          INSERT INTO communication_logs(id, company_id, driver_id, type, message, status, sent_at, created_by)
          VALUES(${id}, ${principal.companyId}, ${driverId}, ${type}, ${message}, 'OPENED_IN_WHATSAPP', ${now}, ${principal.userId})
          RETURNING id, company_id, driver_id, type, message, status, sent_at, created_by
        `);
        await tx.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Driver',
          entityId: driverId,
          action: AuditAction.UPDATE,
          userId: principal.userId,
          userName: principal.name,
          newState: JSON.stringify({ event: 'COMMUNICATION_OPENED', communicationId: id, type }),
          timestamp: now,
        });
        return { driver, row: (inserted.rows as any[])[0] };
      });
      res.status(201).json({ item: mapCommunicationRow(result.row, result.driver) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/communications/:id/confirm-sent', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const id = requiredText(req.params.id, 200);
      const now = new Date().toISOString();
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const raw = tx.getRawTransaction();
        const existingQuery = await raw.execute(sql`
          SELECT id, company_id, driver_id, type, message, status, sent_at, created_by
          FROM communication_logs
          WHERE company_id = ${principal.companyId} AND id = ${id}
          LIMIT 1
        `);
        const existing = (existingQuery.rows as any[])[0];
        if (!existing || !existing.driver_id) throw new DetailNotFoundError();
        const driver = await requireDriver(tx, principal.companyId, String(existing.driver_id));
        if (existing.status === 'MANUALLY_CONFIRMED_SENT') return { driver, row: existing };
        if (existing.status !== 'OPENED_IN_WHATSAPP') throw new DetailConflictError();
        const updated = await raw.execute(sql`
          UPDATE communication_logs
          SET status = 'MANUALLY_CONFIRMED_SENT'
          WHERE company_id = ${principal.companyId} AND id = ${id} AND status = 'OPENED_IN_WHATSAPP'
          RETURNING id, company_id, driver_id, type, message, status, sent_at, created_by
        `);
        const row = (updated.rows as any[])[0];
        if (!row) throw new DetailConflictError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Driver',
          entityId: String(existing.driver_id),
          action: AuditAction.UPDATE,
          userId: principal.userId,
          userName: principal.name,
          newState: JSON.stringify({ event: 'COMMUNICATION_MANUALLY_CONFIRMED_SENT', communicationId: id }),
          timestamp: now,
        });
        return { driver, row };
      });
      res.json({ item: mapCommunicationRow(result.row, result.driver) });
    } catch (error) {
      sendError(res, error);
    }
  });
}
