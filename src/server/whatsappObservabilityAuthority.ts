import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import type { AuthenticatedPrincipal } from './auth';

const DEFAULT_WINDOW_DAYS = 30;
const READ_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);

type QueryResult = { rows?: unknown[] } | unknown[];

export interface WhatsappObservabilitySummary {
  generatedAt: string;
  windowDays: number;
  windowStartAt: string;
  outbox: { total: number; heldProviderDisabled: number; cancelled: number };
  webhookEvents: { total: number; sent: number; delivered: number; read: number; failed: number; repliesReceived: number };
  taskProposals: { total: number; pending: number; approved: number; rejected: number; oldestPendingCreatedAt: string | null };
  providerEnabled: false;
  automaticBusinessMutationApplied: false;
}

export class WhatsappObservabilityForbiddenError extends Error {}

function rows(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function safeCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error('Invalid WhatsApp observability aggregate');
  return parsed;
}

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid WhatsApp observability timestamp');
  return date.toISOString();
}

function assertRead(principal: AuthenticatedPrincipal): void {
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!principal.companyId || !principal.userId
    || (!READ_ROLES.has(role) && !permissions.includes('*') && !permissions.includes('MANAGE_WHATSAPP'))) {
    throw new WhatsappObservabilityForbiddenError('Forbidden');
  }
}

export function resolveWhatsappObservabilityWindowDays(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 365 ? parsed : DEFAULT_WINDOW_DAYS;
}

export class WhatsappObservabilityAuthority {
  static async get(
    principal: AuthenticatedPrincipal,
    referenceNow = new Date(),
    rawWindowDays?: unknown,
  ): Promise<WhatsappObservabilitySummary> {
    assertRead(principal);
    if (!Number.isFinite(referenceNow.getTime())) throw new Error('Invalid WhatsApp observability reference time');
    const windowDays = resolveWhatsappObservabilityWindowDays(rawWindowDays);
    const generatedAt = referenceNow.toISOString();
    const windowStartAt = new Date(referenceNow.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    return UnitOfWork.run(principal.companyId, async (context) => {
      const raw = context.getRawTransaction?.();
      if (!raw) throw new Error('WhatsApp observability persistence unavailable');
      const row = rows(await raw.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM whatsapp_outbox WHERE company_id=${principal.companyId} AND created_at>=${windowStartAt}) AS outbox_total,
          (SELECT COUNT(*)::int FROM whatsapp_outbox WHERE company_id=${principal.companyId} AND created_at>=${windowStartAt} AND status='HELD_PROVIDER_DISABLED') AS outbox_held,
          (SELECT COUNT(*)::int FROM whatsapp_outbox WHERE company_id=${principal.companyId} AND created_at>=${windowStartAt} AND status='CANCELLED') AS outbox_cancelled,
          (SELECT COUNT(*)::int FROM whatsapp_webhook_events WHERE company_id=${principal.companyId} AND received_at>=${windowStartAt}) AS webhook_total,
          (SELECT COUNT(*)::int FROM whatsapp_webhook_events WHERE company_id=${principal.companyId} AND received_at>=${windowStartAt} AND event_type='SENT') AS webhook_sent,
          (SELECT COUNT(*)::int FROM whatsapp_webhook_events WHERE company_id=${principal.companyId} AND received_at>=${windowStartAt} AND event_type='DELIVERED') AS webhook_delivered,
          (SELECT COUNT(*)::int FROM whatsapp_webhook_events WHERE company_id=${principal.companyId} AND received_at>=${windowStartAt} AND event_type='READ') AS webhook_read,
          (SELECT COUNT(*)::int FROM whatsapp_webhook_events WHERE company_id=${principal.companyId} AND received_at>=${windowStartAt} AND event_type='FAILED') AS webhook_failed,
          (SELECT COUNT(*)::int FROM whatsapp_webhook_events WHERE company_id=${principal.companyId} AND received_at>=${windowStartAt} AND event_type='REPLY_RECEIVED') AS webhook_replies,
          (SELECT COUNT(*)::int FROM whatsapp_inbound_task_proposals WHERE company_id=${principal.companyId} AND created_at>=${windowStartAt}) AS proposals_total,
          (SELECT COUNT(*)::int FROM whatsapp_inbound_task_proposals WHERE company_id=${principal.companyId} AND created_at>=${windowStartAt} AND status='PENDING') AS proposals_pending,
          (SELECT COUNT(*)::int FROM whatsapp_inbound_task_proposals WHERE company_id=${principal.companyId} AND created_at>=${windowStartAt} AND status='APPROVED') AS proposals_approved,
          (SELECT COUNT(*)::int FROM whatsapp_inbound_task_proposals WHERE company_id=${principal.companyId} AND created_at>=${windowStartAt} AND status='REJECTED') AS proposals_rejected,
          (SELECT MIN(created_at) FROM whatsapp_inbound_task_proposals WHERE company_id=${principal.companyId} AND created_at>=${windowStartAt} AND status='PENDING') AS oldest_pending_created_at
      `))[0] || {};

      const outbox = { total: safeCount(row.outbox_total), heldProviderDisabled: safeCount(row.outbox_held), cancelled: safeCount(row.outbox_cancelled) };
      const webhookEvents = {
        total: safeCount(row.webhook_total), sent: safeCount(row.webhook_sent), delivered: safeCount(row.webhook_delivered),
        read: safeCount(row.webhook_read), failed: safeCount(row.webhook_failed), repliesReceived: safeCount(row.webhook_replies),
      };
      const taskProposals = {
        total: safeCount(row.proposals_total), pending: safeCount(row.proposals_pending), approved: safeCount(row.proposals_approved),
        rejected: safeCount(row.proposals_rejected), oldestPendingCreatedAt: isoOrNull(row.oldest_pending_created_at),
      };
      if (outbox.heldProviderDisabled + outbox.cancelled !== outbox.total
        || webhookEvents.sent + webhookEvents.delivered + webhookEvents.read + webhookEvents.failed + webhookEvents.repliesReceived !== webhookEvents.total
        || taskProposals.pending + taskProposals.approved + taskProposals.rejected !== taskProposals.total) {
        throw new Error('Inconsistent WhatsApp observability aggregate');
      }
      return { generatedAt, windowDays, windowStartAt, outbox, webhookEvents, taskProposals, providerEnabled: false, automaticBusinessMutationApplied: false };
    });
  }
}
