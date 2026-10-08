import { createHash, randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import {
  WhatsappWebhookAuthenticationError,
  WhatsappWebhookAuthority,
  WhatsappWebhookReplayError,
} from './whatsappWebhookAuth';
import {
  WhatsappWebhookConflictError,
  WhatsappWebhookEventAuthority,
  WhatsappWebhookNotFoundError,
  WhatsappWebhookValidationError,
  type WhatsappWebhookEventType,
} from './whatsappWebhookAuthority';
import {
  WhatsappInboundProposalConflictError,
  WhatsappInboundProposalForbiddenError,
  WhatsappInboundProposalNotFoundError,
  WhatsappInboundProposalValidationError,
  WhatsappInboundTaskProposalAuthority,
} from './whatsappInboundTaskProposalAuthority';
import {
  WhatsappObservabilityAuthority,
  WhatsappObservabilityForbiddenError,
} from './whatsappObservabilityAuthority';

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
  if (!principal.companyId || !principal.userId || !CANONICAL_ROLES.has(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  if (role === 'ADMIN') return principal;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*')) return principal;
  if (write && !permissions.includes('MANAGE_WHATSAPP')) {
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

function asStringArray(value: unknown): string[] {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) throw new Error('Invalid persisted WhatsApp template schema');
  return parsed;
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
    templateVersion: Number(row.template_version),
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


async function loadActiveTemplate(tx: any, companyId: string): Promise<{ version: number; parameterKeys: string[] }> {
  await tx.execute(sql`
    INSERT INTO whatsapp_template_catalog (
      company_id, template_key, version, status, body_text, parameter_keys
    ) VALUES (
      ${companyId}, ${TEMPLATE_KEY}, 1, 'ACTIVE',
      'Olá {{driverName}}, sua CNH vence em {{cnhExpiration}}.',
      '["driverName","cnhExpiration"]'::jsonb
    )
    ON CONFLICT (company_id, template_key, version) DO NOTHING
  `);
  const template = rows(await tx.execute(sql`
    SELECT version, parameter_keys
    FROM whatsapp_template_catalog
    WHERE company_id = ${companyId}
      AND template_key = ${TEMPLATE_KEY}
      AND status = 'ACTIVE'
    ORDER BY version DESC
    LIMIT 1
    FOR SHARE
  `))[0];
  if (!template) throw new WhatsappValidationError();
  const version = Number(template.version);
  const parameterKeys = asStringArray(template.parameter_keys).sort();
  if (!Number.isInteger(version) || version < 1) throw new Error('Invalid WhatsApp template version');
  if (JSON.stringify(parameterKeys) !== JSON.stringify(['cnhExpiration', 'driverName'])) {
    throw new Error('WhatsApp template parameter schema mismatch');
  }
  return { version, parameterKeys };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof WhatsappObservabilityForbiddenError) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (error instanceof WhatsappWebhookAuthenticationError) {
    res.status(401).json({ error: 'Invalid WhatsApp webhook' });
    return;
  }
  if (error instanceof WhatsappWebhookReplayError) {
    res.status(409).json({ error: 'WhatsApp webhook replay' });
    return;
  }
  if (error instanceof WhatsappWebhookValidationError) {
    res.status(400).json({ error: 'Invalid WhatsApp webhook event' });
    return;
  }
  if (error instanceof WhatsappWebhookNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof WhatsappWebhookConflictError) {
    res.status(409).json({ error: 'WhatsApp webhook conflict' });
    return;
  }
  if (error instanceof WhatsappInboundProposalValidationError) {
    res.status(400).json({ error: 'Invalid WhatsApp task proposal' });
    return;
  }
  if (error instanceof WhatsappInboundProposalNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof WhatsappInboundProposalForbiddenError) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (error instanceof WhatsappInboundProposalConflictError) {
    res.status(409).json({ error: 'WhatsApp task proposal conflict' });
    return;
  }
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
  app.post('/api/whatsapp/webhooks/synthetic', async (req: Request, res: Response) => {
    try {
      const body = exactObject(req.body, new Set(['providerEventId', 'outboxId', 'eventType', 'occurredAt', 'replyText']));
      const verified = WhatsappWebhookAuthority.verify({
        companyId: req.header('x-autoerp-company-id'),
        timestamp: req.header('x-autoerp-whatsapp-timestamp'),
        nonce: req.header('x-autoerp-whatsapp-nonce'),
        signature: req.header('x-autoerp-whatsapp-signature'),
      }, body);
      await WhatsappWebhookAuthority.claimNonce(verified);
      const result = await WhatsappWebhookEventAuthority.ingest(verified.companyId, {
        providerEventId: body.providerEventId as string,
        outboxId: body.outboxId as string,
        eventType: body.eventType as WhatsappWebhookEventType,
        occurredAt: body.occurredAt as string,
        replyText: body.replyText as string | undefined,
      });
      res.status(result.created ? 202 : 200).json({ accepted: true, created: result.created, item: result.item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/whatsapp/observability', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const item = await WhatsappObservabilityAuthority.get(
        principal,
        new Date(),
        typeof req.query.windowDays === 'string' ? req.query.windowDays : undefined,
      );
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/whatsapp/task-proposals', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const items = await WhatsappInboundTaskProposalAuthority.list(
        principal,
        status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined,
      );
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/whatsapp/task-proposals/:proposalId/review', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, true);
    if (!principal) return;
    try {
      const body = exactObject(req.body, new Set(['decision', 'reason']));
      const result = await WhatsappInboundTaskProposalAuthority.review(
        principal,
        String(req.params.proposalId || ''),
        body.decision as 'APPROVE' | 'REJECT',
        body.reason as string,
      );
      res.status(result.replay ? 200 : 201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

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

        const cancelledCount = 0; // Consent is informational only; it never cancels ERP outbox items.

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
      res.status(200).json(result);
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
        const driverName = String(driver.name || '').trim();
        const cnhExpiration = String(driver.cnh_expiration || '').slice(0, 10);
        if (!driverName || !/^\d{4}-\d{2}-\d{2}$/.test(cnhExpiration)) throw new WhatsappValidationError();
        const parameters = { driverName, cnhExpiration };
        const template = await loadActiveTemplate(tx, principal.companyId);
        if (JSON.stringify(template.parameterKeys) !== JSON.stringify(Object.keys(parameters).sort())) {
          throw new Error('WhatsApp template parameter schema mismatch');
        }
        const templateVersion = template.version;
        const material = JSON.stringify({
          companyId: principal.companyId,
          driverId,
          phone,
          templateKey: TEMPLATE_KEY,
          templateVersion,
          parameters,
          dispatchPolicy: 'ERP_DIRECT_NO_INTERNAL_CONSENT',
        });
        const idempotencyKey = createHash('sha256').update(material).digest('hex');
        const id = `wao_${idempotencyKey.slice(0, 32)}`;
        const now = new Date().toISOString();
        const inserted = rows(await tx.execute(sql`
          INSERT INTO whatsapp_outbox (
            id, company_id, driver_id, phone_e164, template_key, template_version, template_parameters,
            reference_type, reference_id, idempotency_key, status, requested_by,
            created_at, updated_at
          ) VALUES (
            ${id}, ${principal.companyId}, ${driverId}, ${phone}, ${TEMPLATE_KEY}, ${templateVersion},
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
              templateVersion,
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

  app.post('/api/whatsapp/wa-link', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const { templateType, entityId } = req.body || {};
      if (!['KM_REQUEST', 'TRAFFIC_TICKET', 'CNH_EXPIRY', 'RENT_BILLING'].includes(templateType) || typeof entityId !== 'string' || !entityId.trim()) {
        res.status(400).json({ error: 'Parâmetros inválidos para geração de link do WhatsApp' });
        return;
      }

      const result = await UnitOfWork.run(principal.companyId, async (context: any) => {
        const tx = context.getRawTransaction();
        let phoneRaw = '';
        let driverName = '';
        let message = '';
        let driverIdForAudit = '';

        if (templateType === 'KM_REQUEST') {
          let contractRow: any = null;
          let vehicleRow: any = null;

          const contractRes = rows(await tx.execute(sql`
            SELECT id, driver_id, vehicle_id, contract_number FROM contracts
            WHERE company_id = ${principal.companyId} AND id = ${entityId}
            LIMIT 1
          `));

          if (contractRes.length > 0) {
            contractRow = contractRes[0];
            const vRes = rows(await tx.execute(sql`
              SELECT id, plate FROM vehicles
              WHERE company_id = ${principal.companyId} AND id = ${contractRow.vehicle_id}
              LIMIT 1
            `));
            vehicleRow = vRes[0];
            driverIdForAudit = String(contractRow.driver_id);
          } else {
            const vRes = rows(await tx.execute(sql`
              SELECT id, plate, current_driver_id, current_contract_id FROM vehicles
              WHERE company_id = ${principal.companyId} AND id = ${entityId}
              LIMIT 1
            `));
            if (vRes.length === 0) throw new WhatsappNotFoundError();
            vehicleRow = vRes[0];
            driverIdForAudit = String(vehicleRow.current_driver_id || '');
            if (!driverIdForAudit) {
              const activeContractRes = rows(await tx.execute(sql`
                SELECT driver_id FROM contracts
                WHERE company_id = ${principal.companyId} AND vehicle_id = ${vehicleRow.id} AND status = 'ACTIVE'
                ORDER BY created_at DESC LIMIT 1
              `));
              if (activeContractRes.length > 0) {
                driverIdForAudit = String(activeContractRes[0].driver_id);
              }
            }
          }

          if (!driverIdForAudit) {
            throw new WhatsappValidationError();
          }

          const dRes = rows(await tx.execute(sql`
            SELECT id, name, phone, whatsapp FROM drivers
            WHERE company_id = ${principal.companyId} AND id = ${driverIdForAudit}
            LIMIT 1
          `));
          if (dRes.length === 0) throw new WhatsappNotFoundError();
          const driver = dRes[0];
          driverName = String(driver.name || 'Motorista');
          phoneRaw = String(driver.whatsapp || driver.phone || '');
          const plate = String(vehicleRow?.plate || 'do veículo');

          message = `Olá, ${driverName}! Precisamos atualizar a quilometragem do veículo ${plate}. Por favor, informe a quilometragem atual do veículo e envie uma foto legível do odômetro (painel).`;

        } else if (templateType === 'TRAFFIC_TICKET') {
          const ticketRes = rows(await tx.execute(sql`
            SELECT id, vehicle_id, driver_id, auto_number, organ_name, infraction_code, description,
                   infraction_date, infraction_location, due_date, original_amount, points, status
            FROM traffic_tickets
            WHERE company_id = ${principal.companyId} AND id = ${entityId}
            LIMIT 1
          `));
          if (ticketRes.length === 0) throw new WhatsappNotFoundError();
          const ticket = ticketRes[0];
          if (!ticket.driver_id) {
            throw new WhatsappValidationError();
          }
          driverIdForAudit = String(ticket.driver_id);

          const dRes = rows(await tx.execute(sql`
            SELECT id, name, phone, whatsapp FROM drivers
            WHERE company_id = ${principal.companyId} AND id = ${driverIdForAudit}
            LIMIT 1
          `));
          if (dRes.length === 0) throw new WhatsappNotFoundError();
          const driver = dRes[0];
          driverName = String(driver.name || 'Motorista');
          phoneRaw = String(driver.whatsapp || driver.phone || '');

          const vRes = rows(await tx.execute(sql`
            SELECT plate FROM vehicles WHERE company_id = ${principal.companyId} AND id = ${String(ticket.vehicle_id)} LIMIT 1
          `));
          const plate = String(vRes[0]?.plate || ticket.vehicle_id || '');

          const indicationRes = rows(await tx.execute(sql`
            SELECT indication_deadline FROM traffic_ticket_driver_indications
            WHERE company_id = ${principal.companyId} AND traffic_ticket_id = ${entityId}
            LIMIT 1
          `));
          const indicationDeadline = indicationRes[0]?.indication_deadline
            ? String(indicationRes[0].indication_deadline).slice(0, 10)
            : 'não informado';

          const amount = Number(ticket.original_amount || 0).toFixed(2).replace('.', ',');
          const autoNumber = String(ticket.auto_number || '');
          const infractionDate = String(ticket.infraction_date || '').slice(0, 10);
          const infractionLocation = String(ticket.infraction_location || 'não informado');
          const organName = String(ticket.organ_name || '');
          const infractionCode = String(ticket.infraction_code || '');
          const description = String(ticket.description || '');
          const points = String(ticket.points ?? 0);
          const dueDate = String(ticket.due_date || '').slice(0, 10);

          message = `Olá, ${driverName}! Identificamos a multa ${autoNumber} vinculada ao veículo ${plate}, ocorrida em ${infractionDate} em ${infractionLocation}. Órgão: ${organName} | Código: ${infractionCode} - ${description} | Pontos: ${points} | Valor: R$ ${amount} | Vencimento: ${dueDate} | Prazo para indicação de condutor: ${indicationDeadline}.`;

        } else if (templateType === 'CNH_EXPIRY') {
          const dRes = rows(await tx.execute(sql`
            SELECT id, name, phone, whatsapp, cnh_expiration FROM drivers
            WHERE company_id = ${principal.companyId} AND id = ${entityId}
            LIMIT 1
          `));
          if (dRes.length === 0) throw new WhatsappNotFoundError();
          const driver = dRes[0];
          driverIdForAudit = String(driver.id);
          driverName = String(driver.name || 'Motorista');
          phoneRaw = String(driver.whatsapp || driver.phone || '');
          const cnhExpiration = driver.cnh_expiration ? String(driver.cnh_expiration).slice(0, 10) : 'em breve';

          message = `Olá, ${driverName}! Sua CNH vencerá em ${cnhExpiration}. Por favor, providencie a renovação e nos envie a foto da CNH atualizada para manter seu cadastro e contrato regulares.`;
        } else if (templateType === 'RENT_BILLING') {
          const rRes = rows(await tx.execute(sql`
            SELECT id, company_id, driver_id, vehicle_id, contract_id, origin_type, description,
                   due_date, original_amount, balance_amount, status
            FROM account_receivables
            WHERE company_id = ${principal.companyId} AND id = ${entityId}
            LIMIT 1
          `));
          if (rRes.length === 0) throw new WhatsappNotFoundError();
          const receivable = rRes[0];
          if (!receivable.driver_id) {
            throw new WhatsappValidationError();
          }
          driverIdForAudit = String(receivable.driver_id);

          const dRes = rows(await tx.execute(sql`
            SELECT id, name, phone, whatsapp FROM drivers
            WHERE company_id = ${principal.companyId} AND id = ${driverIdForAudit}
            LIMIT 1
          `));
          if (dRes.length === 0) throw new WhatsappNotFoundError();
          const driver = dRes[0];
          driverName = String(driver.name || 'Motorista');
          phoneRaw = String(driver.whatsapp || driver.phone || '');

          let contextDesc = receivable.description ? String(receivable.description) : 'Aluguel';
          if (receivable.contract_id) {
            const cRes = rows(await tx.execute(sql`
              SELECT contract_number FROM contracts
              WHERE company_id = ${principal.companyId} AND id = ${receivable.contract_id}
              LIMIT 1
            `));
            if (cRes.length > 0 && cRes[0].contract_number) {
              contextDesc = `Contrato ${cRes[0].contract_number}`;
            }
          }

          const bankRes = rows(await tx.execute(sql`
            SELECT pix_key FROM financial_accounts
            WHERE company_id = ${principal.companyId} AND type = 'BANK' AND status = 'ACTIVE' AND pix_key IS NOT NULL AND pix_key <> ''
            LIMIT 1
          `));
          const pixKey = bankRes[0]?.pix_key ? String(bankRes[0].pix_key).trim() : '';

          const amountVal = Number(receivable.balance_amount ?? receivable.original_amount ?? 0);
          const amountStr = amountVal.toFixed(2).replace('.', ',');
          const rawDueDate = receivable.due_date ? String(receivable.due_date).slice(0, 10) : '';
          const dueDateBR = rawDueDate.includes('-') ? rawDueDate.split('-').reverse().join('/') : rawDueDate;

          const pixClause = pixKey ? ` Chave Pix para pagamento: ${pixKey}.` : '';
          message = `Olá, ${driverName}! Lembramos sobre o título referente a ${contextDesc}, no valor de R$ ${amountStr}, com vencimento em ${dueDateBR}.${pixClause} Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.`;
        }

        let phoneDigits = phoneRaw.replace(/\D/g, '');
        if (phoneDigits.length >= 10 && phoneDigits.length <= 11 && !phoneDigits.startsWith('55')) {
          phoneDigits = `55${phoneDigits}`;
        }
        if (!/^55\d{10,11}$/.test(phoneDigits) || /^55(\d)\1+$/.test(phoneDigits)) {
          throw new WhatsappValidationError();
        }

        const whatsappUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
        const now = new Date().toISOString();

        await context.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'WhatsappWaLink',
          entityId,
          action: AuditAction.UPDATE,
          userId: principal.userId,
          userName: principal.name,
          newState: JSON.stringify({
            event: 'WHATSAPP_WAME_LINK_GENERATED',
            templateType,
            entityId,
            driverId: driverIdForAudit,
            phone: phoneDigits,
            generatedAt: now,
          }),
          timestamp: now,
        });

        return {
          whatsappUrl,
          phone: phoneDigits,
          message,
          templateType,
        };
      });

      res.json(result);
    } catch (error) {
      if (error instanceof WhatsappNotFoundError) {
        res.status(404).json({ error: 'Entidade ou motorista não encontrado' });
        return;
      }
      if (error instanceof WhatsappValidationError) {
        res.status(400).json({ error: 'Telefone do motorista inválido ou motorista não vinculado' });
        return;
      }
      sendError(res, error);
    }
  });
}
