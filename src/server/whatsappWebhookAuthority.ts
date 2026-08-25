import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import {
  createWhatsappReplyTaskProposal,
  type WhatsappInboundTaskProposalRecord,
} from './whatsappInboundTaskProposalAuthority';

const PROVIDER_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const OUTBOX_ID = /^wao_[a-f0-9]{32}$/;
const EVENT_TYPES = new Set(['SENT', 'DELIVERED', 'READ', 'FAILED', 'REPLY_RECEIVED']);

type QueryResult = { rows?: unknown[] } | unknown[];

export type WhatsappWebhookEventType = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'REPLY_RECEIVED';

export interface IngestWhatsappWebhookEventInput {
  providerEventId: string;
  outboxId: string;
  eventType: WhatsappWebhookEventType;
  occurredAt: string;
  replyText?: string;
}

export interface WhatsappWebhookEventRecord {
  id: string;
  outboxId: string;
  eventType: WhatsappWebhookEventType;
  occurredAt: string;
  disposition: 'QUARANTINED';
  quarantineReason: 'OUTBOX_NOT_DISPATCHED' | 'OUTBOX_CANCELLED';
  receivedAt: string;
  providerCallApplied: false;
  businessMutationApplied: false;
  taskProposal?: WhatsappInboundTaskProposalRecord;
}

export class WhatsappWebhookValidationError extends Error {}
export class WhatsappWebhookNotFoundError extends Error {}
export class WhatsappWebhookConflictError extends Error {}

function rows(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function requiredIdentifier(value: unknown, pattern: RegExp): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!pattern.test(text)) throw new WhatsappWebhookValidationError('Invalid WhatsApp webhook event');
  return text;
}

function exactIso(value: unknown, referenceNow: Date): string {
  if (typeof value !== 'string') throw new WhatsappWebhookValidationError('Invalid WhatsApp webhook event');
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new WhatsappWebhookValidationError('Invalid WhatsApp webhook event');
  }
  if (!Number.isFinite(referenceNow.getTime()) || milliseconds > referenceNow.getTime() + 5 * 60 * 1000) {
    throw new WhatsappWebhookValidationError('Invalid WhatsApp webhook event');
  }
  return value;
}

function record(row: Record<string, unknown>, taskProposal?: WhatsappInboundTaskProposalRecord): WhatsappWebhookEventRecord {
  const occurredAt = new Date(String(row.occurred_at)).toISOString();
  const receivedAt = new Date(String(row.received_at)).toISOString();
  const eventType = String(row.event_type) as WhatsappWebhookEventType;
  const quarantineReason = String(row.quarantine_reason) as WhatsappWebhookEventRecord['quarantineReason'];
  if (!EVENT_TYPES.has(eventType) || !['OUTBOX_NOT_DISPATCHED', 'OUTBOX_CANCELLED'].includes(quarantineReason)) {
    throw new Error('Invalid persisted WhatsApp webhook event');
  }
  return {
    id: String(row.id),
    outboxId: String(row.outbox_id),
    eventType,
    occurredAt,
    disposition: 'QUARANTINED',
    quarantineReason,
    receivedAt,
    providerCallApplied: false,
    businessMutationApplied: false,
    taskProposal,
  };
}

export class WhatsappWebhookEventAuthority {
  static async ingest(
    companyId: string,
    input: IngestWhatsappWebhookEventInput,
    referenceNow = new Date(),
  ): Promise<{ item: WhatsappWebhookEventRecord; created: boolean }> {
    const providerEventId = requiredIdentifier(input.providerEventId, PROVIDER_EVENT_ID);
    const outboxId = requiredIdentifier(input.outboxId, OUTBOX_ID);
    const eventType = String(input.eventType || '') as WhatsappWebhookEventType;
    if (!EVENT_TYPES.has(eventType)) throw new WhatsappWebhookValidationError('Invalid WhatsApp webhook event');
    if (eventType === 'REPLY_RECEIVED' && input.replyText === undefined) throw new WhatsappWebhookValidationError('Invalid WhatsApp webhook event');
    if (eventType !== 'REPLY_RECEIVED' && input.replyText !== undefined) throw new WhatsappWebhookValidationError('Invalid WhatsApp webhook event');
    const occurredAt = exactIso(input.occurredAt, referenceNow);

    return UnitOfWork.run(companyId, async (context) => {
      const tx = context.getRawTransaction?.();
      if (!tx) throw new Error('WhatsApp webhook persistence unavailable');
      const outbox = rows(await tx.execute(sql`
        SELECT id,status,driver_id FROM whatsapp_outbox
        WHERE company_id=${companyId} AND id=${outboxId}
        LIMIT 1
      `))[0];
      if (!outbox) throw new WhatsappWebhookNotFoundError('WhatsApp outbox not found');
      const status = String(outbox.status);
      if (status !== 'HELD_PROVIDER_DISABLED' && status !== 'CANCELLED') {
        throw new WhatsappWebhookConflictError('Unsupported WhatsApp outbox status');
      }
      const quarantineReason = status === 'CANCELLED' ? 'OUTBOX_CANCELLED' : 'OUTBOX_NOT_DISPATCHED';
      const id = `whe_${createHash('sha256').update(`${companyId}:${providerEventId}`).digest('hex').slice(0, 32)}`;
      const inserted = rows(await tx.execute(sql`
        INSERT INTO whatsapp_webhook_events(
          id,company_id,provider_event_id,outbox_id,event_type,occurred_at,disposition,quarantine_reason
        ) VALUES(
          ${id},${companyId},${providerEventId},${outboxId},${eventType},${occurredAt},
          'QUARANTINED',${quarantineReason}
        )
        ON CONFLICT (company_id,provider_event_id) DO NOTHING
        RETURNING *
      `));
      if (inserted[0]) {
        const taskProposal = eventType === 'REPLY_RECEIVED'
          ? await createWhatsappReplyTaskProposal(tx, companyId, id, outboxId, String(outbox.driver_id), input.replyText)
          : undefined;
        return { item: record(inserted[0], taskProposal), created: true };
      }

      const existing = rows(await tx.execute(sql`
        SELECT * FROM whatsapp_webhook_events
        WHERE company_id=${companyId} AND provider_event_id=${providerEventId}
        LIMIT 1
      `))[0];
      if (!existing) throw new Error('WhatsApp webhook idempotency failure');
      if (
        String(existing.outbox_id) !== outboxId
        || String(existing.event_type) !== eventType
        || new Date(String(existing.occurred_at)).toISOString() !== occurredAt
      ) {
        throw new WhatsappWebhookConflictError('WhatsApp webhook event collision');
      }
      const taskProposal = eventType === 'REPLY_RECEIVED'
        ? await createWhatsappReplyTaskProposal(tx, companyId, String(existing.id), outboxId, String(outbox.driver_id), input.replyText)
        : undefined;
      return { item: record(existing, taskProposal), created: false };
    });
  }
}
