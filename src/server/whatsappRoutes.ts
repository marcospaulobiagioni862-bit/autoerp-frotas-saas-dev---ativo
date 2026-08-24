import { createHash, randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const DRIVER_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const OUTBOX_ID = /^wao_[a-f0-9]{32}$/;
const TEMPLATE_KEY = 'DRIVER_CNH_EXPIRY';

class WhatsappValidationError extends Error {}
class WhatsappNotFoundError extends Error {}
class WhatsappConsentRequiredError extends Error {}

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
  if (write && !WRITE_ROLES.has(role) && !permissions.includes('*') && !permissions.includes('MANAGE_WHATSAPP')) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function exactObject(value: unknown, allowed: Set<string>): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new WhatsappValidationError();
  }
  const item = value as Record<string, unknown>;
  if (!Object.keys(item).every((key) => allowed.has(key))) throw new WhatsappValidationError();
  return item;
}

function requiredDriverId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!DRIVER_ID.test(id)) throw new WhatsappValidationError();
  return id;
}

function requiredOutboxId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!OUTBOX_ID.test(id)) throw new WhatsappValidationError();
  return id;
}

function normalizeBrazilPhone(value: unknown): string {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  const national = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
    ? digits
    : (digits.length === 10 || digits.length === 11 ? `55${digits}` : '');
  if (!/^55\d{10,11}$/.test(national) || /^(\d)\1+$/.test(national)) {
    throw new WhatsappValidationError();
  }
  return `+${national}`;
}

function maskPhone(value: string): string {
  return `+55•••••••${value.slice(-4)}`;
}

function asIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid persisted WhatsApp timestamp');
  return date.toISOString();
}

function asObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid persisted WhatsApp payload');
  return parsed as Record<string, unknown>;
}

function consentRecord(row: Record<string, unknown>): Record<string, unknown> {
  return {
    driverId: String(row.driver_id),
    status: String(row.status),
    consentSource: String(row.consent_source),
    phoneMasked: maskPhone(String(row.phone_e164)),
    grantedAt: asIso(row.granted_at),
    revokedAt: asIso(row.revoked_at),
    updatedAt: asIso(row.updated_at),
  };
}

function outboxRecord(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(row.id),
    driverId: String(row.driver_id),
    templateKey: String(row.template_key),
    templateParameters: asObject(row.template_parameters),
    referenceType: String(row.reference_type),
    referenceId: String(row.reference_id),
    status: String(row.status),
    cancellationReason: row.cancellation_reason === null ? null : String(row.cancellation_reason),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    cancelledAt: asIso(row.cancelled_at),
    providerCallApplied: false,
  };
}

async function loadDriver(tx: any, companyId: string, driverId: string, lock = false): Promise<Record<string, unknown>> {
  const result = lock
    ? await tx.execute(sql`
        SELECT id, name, phone, whatsapp, cnh_expiration, status, is_archived
        FROM drivers
        WHERE company_id = ${companyId} AND id = ${driverId}
        FOR UPDATE
      `)
    : await tx.execute(sql`
        SELECT id, name, phone, whatsapp, cnh_expiration, status, is_archived
        FROM drivers
        WHERE company_id = ${companyId} AND id = ${driverId}
        LIMIT 1
      `);
  const selected = rows(result)[0];
  if (!selected || selected.is_archived === true || String(selected.status) === 'ARCHIVED') {
    throw new WhatsappNotFoundError();
  }
  return selected;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof WhatsappValidationError) {
    res.status(400).json({ error: 'Invalid WhatsApp request' });
    return;
  }
  if (error instanceof WhatsappNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof WhatsappConsentRequiredError) {
    res.status(409).json({ error: 'Current WhatsApp consent required' });
    return;
  }
  console.error('AUTOERP_WHATSAPP_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'WhatsApp operation failed' });
}

export function registerWhatsappRoutes(app: Express): void {
  app.get('/api/whatsapp/consents/:driverId', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const driverId = requiredDriverId(req.params.driverId);
      const item = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        await loadDriver(tx, principal.companyId, driverId);
        const current = rows(await tx.execute(sql`
          SELECT * FROM whatsapp_consents
          WHERE company_id = ${principal.companyId} AND driver_id = ${driverId}
          LIMIT 1
        `))[0];
        return current ? consentRecord(current) : null;
      });
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/whatsapp/consents/:driverId', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const driverId = requiredDriverId(req.params.driverId);
      const body = exactObject(req.body, new Set(['decision']));
      if (body.decision !== 'GRANT' && body.decision !== 'REVOKE') throw new WhatsappValidationError();
      const result = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const driver = await loadDriver(tx, principal.companyId, driverId, true);
        const phone = normalizeBrazilPhone(driver.whatsapp || driver.phone);
        const current = rows(await tx.execute(sql`
          SELECT * FROM whatsapp_consents
          WHERE company_id = ${principal.companyId} AND driver_id = ${driverId}
          FOR UPDATE
        `))[0];
        const nextStatus = body.decision === 'GRANT' ? 'GRANTED' : 'REVOKED';
        const stateChanged = !current || String(current.status) !== nextStatus || String(current.phone_e164) !== phone;
        const now = new Date().toISOString();

        let persisted = current;
        if (stateChanged && nextStatus === 'GRANTED') {
          persisted = rows(await tx.execute(sql`
            INSERT INTO whatsapp_consents (
              company_id, driver_id, phone_e164, status, consent_source,
              granted_by, granted_at, revoked_by, revoked_at, created_at, updated_at
            ) VALUES (
              ${principal.companyId}, ${driverId}, ${phone}, 'GRANTED', 'ERP_MANUAL',
              ${principal.userId}, ${now}, NULL, NULL, ${now}, ${now}
            )
            ON CONFLICT (company_id, driver_id) DO UPDATE SET
              phone_e164 = EXCLUDED.phone_e164,
              status = 'GRANTED',
              consent_source = 'ERP_MANUAL',
              granted_by = EXCLUDED.granted_by,
              granted_at = EXCLUDED.granted_at,
              revoked_by = NULL,
              revoked_at = NULL,
              updated_at = EXCLUDED.updated_at
            RETURNING *
          `))[0];
        } else if (stateChanged) {
          persisted = rows(await tx.execute(sql`
            INSERT INTO whatsapp_consents (
              company_id, driver_id, phone_e164, status, consent_source,
              revoked_by, revoked_at, created_at, updated_at
            ) VALUES (
              ${principal.companyId}, ${driverId}, ${phone}, 'REVOKED', 'ERP_MANUAL',
              ${principal.userId}, ${now}, ${now}, ${now}
            )
            ON CONFLICT (company_id, driver_id) DO UPDATE SET
              phone_e164 = EXCLUDED.phone_e164,
              status = 'REVOKED',
              consent_source = 'ERP_MANUAL',
              revoked_by = EXCLUDED.revoked_by,
              revoked_at = EXCLUDED.revoked_at,
              updated_at = EXCLUDED.updated_at
            RETURNING *
          `))[0];
        }

        let cancelledCount = 0;
        if (nextStatus === 'REVOKED') {
          const cancelled = rows(await tx.execute(sql`
            UPDATE whatsapp_outbox
            SET status = 'CANCELLED',
                cancelled_by = ${principal.userId},
                cancellation_reason = 'CONSENT_REVOKED',
                cancelled_at = ${now},
                updated_at = ${now}
            WHERE company_id = ${principal.companyId}
              AND driver_id = ${driverId}
              AND status = 'HELD_PROVIDER_DISABLED'
            RETURNING id
          `));
          cancelledCount = cancelled.length;
        }

        if (stateChanged || cancelledCount > 0) {
          await context.getAuditLogRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            entityName: 'WhatsappConsent',
            entityId: driverId,
            action: AuditAction.UPDATE,
            previousState: current ? JSON.stringify({ status: current.status, phoneLast4: String(current.phone_e164).slice(-4) }) : undefined,
            newState: JSON.stringify({
              event: nextStatus === 'GRANTED' ? 'WHATSAPP_CONSENT_GRANTED' : 'WHATSAPP_CONSENT_REVOKED',
              status: nextStatus,
              phoneLast4: phone.slice(-4),
              cancelledHeldItems: cancelledCount,
              providerCallApplied: false,
            }),
            userId: principal.userId,
            userName: principal.name,
            timestamp: now,
          });
        }
        if (!persisted) throw new Error('WhatsApp consent persistence failed');
        return { item: consentRecord(persisted), changed: stateChanged, cancelledHeldItems: cancelledCount };
      });
      res.status(result.changed ? 200 : 200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/whatsapp/outbox', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const body = exactObject(req.body, new Set(['driverId', 'templateKey']));
      const driverId = requiredDriverId(body.driverId);
      if (body.templateKey !== TEMPLATE_KEY) throw new WhatsappValidationError();
      const result = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const driver = await loadDriver(tx, principal.companyId, driverId, true);
        const phone = normalizeBrazilPhone(driver.whatsapp || driver.phone);
        const consent = rows(await tx.execute(sql`
          SELECT * FROM whatsapp_consents
          WHERE company_id = ${principal.companyId} AND driver_id = ${driverId}
          FOR UPDATE
        `))[0];
        if (!consent || consent.status !== 'GRANTED' || consent.phone_e164 !== phone) {
          throw new WhatsappConsentRequiredError();
        }
        const driverName = String(driver.name || '').trim();
        const cnhExpiration = String(driver.cnh_expiration || '').slice(0, 10);
        if (!driverName || !/^\d{4}-\d{2}-\d{2}$/.test(cnhExpiration)) throw new WhatsappValidationError();
        const parameters = { driverName, cnhExpiration };
        const consentGrantedAt = asIso(consent.granted_at);
        if (!consentGrantedAt) throw new WhatsappConsentRequiredError();
        const material = JSON.stringify({
          companyId: principal.companyId,
          driverId,
          phone,
          templateKey: TEMPLATE_KEY,
          parameters,
          consentGrantedAt,
        });
        const idempotencyKey = createHash('sha256').update(material).digest('hex');
        const id = `wao_${idempotencyKey.slice(0, 32)}`;
        const now = new Date().toISOString();
        const inserted = rows(await tx.execute(sql`
          INSERT INTO whatsapp_outbox (
            id, company_id, driver_id, phone_e164, template_key, template_parameters,
            reference_type, reference_id, idempotency_key, status, requested_by,
            created_at, updated_at
          ) VALUES (
            ${id}, ${principal.companyId}, ${driverId}, ${phone}, ${TEMPLATE_KEY},
            ${JSON.stringify(parameters)}::jsonb, 'DRIVER', ${driverId}, ${idempotencyKey},
            'HELD_PROVIDER_DISABLED', ${principal.userId}, ${now}, ${now}
          )
          ON CONFLICT (company_id, idempotency_key) DO NOTHING
          RETURNING *
        `));
        if (inserted[0]) {
          await context.getAuditLogRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            entityName: 'WhatsappOutbox',
            entityId: id,
            action: AuditAction.CREATE,
            newState: JSON.stringify({
              event: 'WHATSAPP_OUTBOX_HELD',
              driverId,
              templateKey: TEMPLATE_KEY,
              status: 'HELD_PROVIDER_DISABLED',
              phoneLast4: phone.slice(-4),
              providerCallApplied: false,
            }),
            userId: principal.userId,
            userName: principal.name,
            timestamp: now,
          });
          return { item: outboxRecord(inserted[0]), created: true };
        }
        const existing = rows(await tx.execute(sql`
          SELECT * FROM whatsapp_outbox
          WHERE company_id = ${principal.companyId} AND idempotency_key = ${idempotencyKey}
          LIMIT 1
        `))[0];
        if (!existing) throw new Error('WhatsApp outbox idempotency failure');
        return { item: outboxRecord(existing), created: false };
      });
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/whatsapp/outbox', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      if (Object.keys(req.query).length > 0) throw new WhatsappValidationError();
      const items = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        return rows(await tx.execute(sql`
          SELECT * FROM whatsapp_outbox
          WHERE company_id = ${principal.companyId}
          ORDER BY created_at DESC
          LIMIT 100
        `)).map(outboxRecord);
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/whatsapp/outbox/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const id = requiredOutboxId(req.params.id);
      const item = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        const current = rows(await tx.execute(sql`
          SELECT * FROM whatsapp_outbox
          WHERE company_id = ${principal.companyId} AND id = ${id}
          LIMIT 1
        `))[0];
        if (!current) throw new WhatsappNotFoundError();
        return outboxRecord(current);
      });
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });
}
