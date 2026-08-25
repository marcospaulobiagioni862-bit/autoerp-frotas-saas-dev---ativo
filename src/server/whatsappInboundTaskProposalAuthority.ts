import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { OperationalAuthorityService } from './operationalAuthority';
import type { AuthenticatedPrincipal } from './auth';
import { AuditAction } from '../types/enums';

type QueryResult = { rows?: unknown[] } | unknown[];
type ReplyCategory = 'PAYMENT_QUESTION' | 'DOCUMENT_QUESTION' | 'MAINTENANCE_REPORT' | 'GENERAL';
type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface WhatsappInboundTaskProposalRecord {
  id: string;
  webhookEventId: string;
  outboxId: string;
  driverId: string;
  replyCategory: ReplyCategory;
  status: ProposalStatus;
  taskId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  rawReplyPersisted: false;
  businessMutationApplied: false;
}

export class WhatsappInboundProposalValidationError extends Error {}
export class WhatsappInboundProposalNotFoundError extends Error {}
export class WhatsappInboundProposalForbiddenError extends Error {}
export class WhatsappInboundProposalConflictError extends Error {}

function rows(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

function exactIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid persisted WhatsApp reply proposal');
  return date.toISOString();
}

function proposal(row: Record<string, unknown>): WhatsappInboundTaskProposalRecord {
  return {
    id: String(row.id),
    webhookEventId: String(row.webhook_event_id),
    outboxId: String(row.outbox_id),
    driverId: String(row.driver_id),
    replyCategory: String(row.reply_category) as ReplyCategory,
    status: String(row.status) as ProposalStatus,
    taskId: row.task_id ? String(row.task_id) : null,
    reviewedAt: exactIso(row.reviewed_at),
    createdAt: exactIso(row.created_at) as string,
    rawReplyPersisted: false,
    businessMutationApplied: false,
  };
}

function normalizeReplyText(value: unknown): string {
  if (typeof value !== 'string') throw new WhatsappInboundProposalValidationError('Invalid WhatsApp reply');
  const text = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new WhatsappInboundProposalValidationError('Invalid WhatsApp reply');
  }
  return text;
}

function classify(text: string): ReplyCategory {
  const value = text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/pagamento|pagar|boleto|pix|cobranca|vencimento/.test(value)) return 'PAYMENT_QUESTION';
  if (/documento|cnh|licenciamento|crlv|seguro/.test(value)) return 'DOCUMENT_QUESTION';
  if (/manutencao|oficina|pneu|oleo|freio|quebrou|defeito/.test(value)) return 'MAINTENANCE_REPORT';
  return 'GENERAL';
}

function assertRead(principal: AuthenticatedPrincipal): void {
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!principal.companyId || !principal.userId || (!new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY']).has(role) && !permissions.includes('*') && !permissions.includes('MANAGE_WHATSAPP'))) {
    throw new WhatsappInboundProposalForbiddenError('Forbidden');
  }
}

function assertWrite(principal: AuthenticatedPrincipal): void {
  assertRead(principal);
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']).has(role) && !permissions.includes('*') && !permissions.includes('MANAGE_WHATSAPP')) {
    throw new WhatsappInboundProposalForbiddenError('Forbidden');
  }
}

export function validateWhatsappReplyText(value: unknown): { normalized: string; category: ReplyCategory; digest: string } {
  const normalized = normalizeReplyText(value);
  return { normalized, category: classify(normalized), digest: createHash('sha256').update(normalized).digest('hex') };
}

export async function createWhatsappReplyTaskProposal(
  rawTx: any,
  companyId: string,
  webhookEventId: string,
  outboxId: string,
  driverId: string,
  replyText: unknown,
): Promise<WhatsappInboundTaskProposalRecord> {
  const classified = validateWhatsappReplyText(replyText);
  const id = `wrp_${createHash('sha256').update(`${companyId}:${webhookEventId}`).digest('hex').slice(0, 32)}`;
  const inserted = rows(await rawTx.execute(sql`
    INSERT INTO whatsapp_inbound_task_proposals(
      id,company_id,webhook_event_id,outbox_id,driver_id,reply_category,reply_digest
    ) VALUES(${id},${companyId},${webhookEventId},${outboxId},${driverId},${classified.category},${classified.digest})
    ON CONFLICT (company_id,webhook_event_id) DO NOTHING
    RETURNING *
  `));
  if (inserted[0]) return proposal(inserted[0]);
  const existing = rows(await rawTx.execute(sql`
    SELECT * FROM whatsapp_inbound_task_proposals
    WHERE company_id=${companyId} AND webhook_event_id=${webhookEventId}
    LIMIT 1
  `))[0];
  if (!existing || String(existing.reply_digest) !== classified.digest) throw new WhatsappInboundProposalConflictError('WhatsApp reply proposal collision');
  return proposal(existing);
}

export class WhatsappInboundTaskProposalAuthority {
  static async list(principal: AuthenticatedPrincipal, status?: ProposalStatus): Promise<WhatsappInboundTaskProposalRecord[]> {
    assertRead(principal);
    if (status && !new Set(['PENDING','APPROVED','REJECTED']).has(status)) throw new WhatsappInboundProposalValidationError('Invalid proposal status');
    return UnitOfWork.run(principal.companyId, async (context) => {
      const raw = context.getRawTransaction?.();
      if (!raw) throw new Error('WhatsApp reply proposal persistence unavailable');
      const result = await raw.execute(sql`
        SELECT * FROM whatsapp_inbound_task_proposals
        WHERE company_id=${principal.companyId}
          AND (${status || null}::text IS NULL OR status=${status || null})
        ORDER BY created_at DESC,id
        LIMIT 100
      `);
      return rows(result).map(proposal);
    });
  }

  static async review(
    principal: AuthenticatedPrincipal,
    proposalId: string,
    decision: 'APPROVE' | 'REJECT',
    reason: string,
  ): Promise<{ item: WhatsappInboundTaskProposalRecord; replay: boolean }> {
    assertWrite(principal);
    if (!/^wrp_[a-f0-9]{32}$/.test(proposalId) || !new Set(['APPROVE','REJECT']).has(decision)) throw new WhatsappInboundProposalValidationError('Invalid proposal review');
    const cleanReason = typeof reason === 'string' ? reason.trim().replace(/\s+/g, ' ') : '';
    if (cleanReason.length < 3 || cleanReason.length > 500) throw new WhatsappInboundProposalValidationError('Invalid proposal review');

    const current = await UnitOfWork.run(principal.companyId, async (context) => {
      const raw = context.getRawTransaction?.();
      if (!raw) throw new Error('WhatsApp reply proposal persistence unavailable');
      const row = rows(await raw.execute(sql`
        SELECT * FROM whatsapp_inbound_task_proposals
        WHERE company_id=${principal.companyId} AND id=${proposalId}
        FOR UPDATE
      `))[0];
      if (!row) throw new WhatsappInboundProposalNotFoundError('WhatsApp reply proposal not found');
      const item = proposal(row);
      if (item.status !== 'PENDING') {
        const expected = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        if (item.status !== expected) throw new WhatsappInboundProposalConflictError('WhatsApp reply proposal already reviewed');
        return item;
      }
      if (decision === 'REJECT') {
        const updated = rows(await raw.execute(sql`
          UPDATE whatsapp_inbound_task_proposals
          SET status='REJECTED',reviewed_by_user_id=${principal.userId},reviewed_by_name=${principal.name},
              review_reason=${cleanReason},reviewed_at=now(),updated_at=now()
          WHERE company_id=${principal.companyId} AND id=${proposalId} AND status='PENDING'
          RETURNING *
        `))[0];
        await context.getAuditLogRepo().create({
          id: randomUUID(),companyId:principal.companyId,entityName:'WhatsappInboundTaskProposal',entityId:proposalId,
          action:AuditAction.UPDATE,previousState:JSON.stringify(item),newState:JSON.stringify(proposal(updated)),
          userId:principal.userId,userName:principal.name,timestamp:new Date().toISOString(),
        });
        return proposal(updated);
      }
      return item;
    });

    if (current.status !== 'PENDING') return { item: current, replay: true };
    const task = await OperationalAuthorityService.createTask(principal, {
      title: 'Revisar resposta recebida via WhatsApp',
      description: `Resposta classificada como ${current.replyCategory}; conteúdo bruto não armazenado.`,
      category: 'OPERATIONAL_GENERAL',priority: 'P2',severity: 'MEDIUM',sourceType: 'ALERT',
      sourceId: current.id,entityType: 'DRIVER',entityId: current.driverId,
    }, `wa-reply-task-${current.id}`);

    const approved = await UnitOfWork.run(principal.companyId, async (context) => {
      const raw = context.getRawTransaction?.();
      if (!raw) throw new Error('WhatsApp reply proposal persistence unavailable');
      const beforeRow = rows(await raw.execute(sql`
        SELECT * FROM whatsapp_inbound_task_proposals
        WHERE company_id=${principal.companyId} AND id=${proposalId}
        FOR UPDATE
      `))[0];
      if (!beforeRow) throw new WhatsappInboundProposalNotFoundError('WhatsApp reply proposal not found');
      const before = proposal(beforeRow);
      if (before.status === 'APPROVED' && before.taskId === task.id) return before;
      if (before.status !== 'PENDING') throw new WhatsappInboundProposalConflictError('WhatsApp reply proposal already reviewed');
      const updated = rows(await raw.execute(sql`
        UPDATE whatsapp_inbound_task_proposals
        SET status='APPROVED',task_id=${task.id},reviewed_by_user_id=${principal.userId},reviewed_by_name=${principal.name},
            review_reason=${cleanReason},reviewed_at=now(),updated_at=now()
        WHERE company_id=${principal.companyId} AND id=${proposalId} AND status='PENDING'
        RETURNING *
      `))[0];
      const after = proposal(updated);
      await context.getAuditLogRepo().create({
        id:randomUUID(),companyId:principal.companyId,entityName:'WhatsappInboundTaskProposal',entityId:proposalId,
        action:AuditAction.UPDATE,previousState:JSON.stringify(before),newState:JSON.stringify(after),
        userId:principal.userId,userName:principal.name,timestamp:new Date().toISOString(),
      });
      return after;
    });
    return { item: approved, replay: false };
  }
}
