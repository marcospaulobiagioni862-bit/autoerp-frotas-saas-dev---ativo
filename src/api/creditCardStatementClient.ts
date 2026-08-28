export type CreditCardStatementStatus = 'OPEN' | 'CLOSED' | 'PARTIALLY_PAID' | 'PAID';

export interface CreditCardProfileSummary {
  id: string;
  financialAccountId: string;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
  active: boolean;
}

export interface CreditCardStatementSummary {
  id: string;
  creditCardProfileId: string;
  cycleRef: string;
  closingDate: string;
  dueDate: string;
  status: CreditCardStatementStatus;
  originalAmount: number;
  adjustmentAmount: number;
  interestAmount: number;
  fineAmount: number;
  discountAmount: number;
  paidAmount: number;
  balanceAmount: number;
  isOverdue: boolean;
  overdueDays: number;
}

export interface CreditCardStatementItemDetail {
  id: string;
  financialTransactionId: string;
  payableId: string | null;
  originType: string;
  originId: string;
  originalAmount: number;
  adjustmentAmount: number;
  finalAmount: number;
}

export interface CreditCardStatementPaymentDetail {
  id: string;
  financialTransactionId: string;
  amount: number;
  createdAt: string;
}

export interface CreditCardStatementAdjustmentDetail {
  id: string;
  interestAmount: number;
  fineAmount: number;
  discountAmount: number;
  reason: string;
  createdAt: string;
}

export interface CreditCardStatementCreditDetail {
  id: string;
  statementItemId: string;
  financialTransactionId: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface CreditCardStatementDetail {
  statement: CreditCardStatementSummary;
  items: CreditCardStatementItemDetail[];
  payments: CreditCardStatementPaymentDetail[];
  adjustments: CreditCardStatementAdjustmentDetail[];
  credits: CreditCardStatementCreditDetail[];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid credit-card response');
  return value as JsonRecord;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid credit-card field: ${field}`);
  return value.trim();
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field);
}

function money(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid credit-card numeric field: ${field}`);
  return parsed;
}

function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid credit-card integer field: ${field}`);
  return parsed;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid credit-card boolean field: ${field}`);
  return value;
}

function isoDate(value: unknown, field: string): string {
  const normalized = text(value, field).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`Invalid credit-card date field: ${field}`);
  return normalized;
}

function timestamp(value: unknown, field: string): string {
  const normalized = text(value, field);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`Invalid credit-card timestamp field: ${field}`);
  return normalized;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid credit-card collection: ${field}`);
  return value;
}

function normalizeProfile(value: unknown): CreditCardProfileSummary {
  const item = record(value);
  const closingDay = integer(item.closing_day, 'closing_day');
  const dueDay = integer(item.due_day, 'due_day');
  if (closingDay < 1 || closingDay > 31 || dueDay < 1 || dueDay > 31) throw new Error('Invalid credit-card profile day');
  return {
    id: text(item.id, 'id'),
    financialAccountId: text(item.financial_account_id, 'financial_account_id'),
    creditLimit: money(item.credit_limit, 'credit_limit'),
    closingDay,
    dueDay,
    active: boolean(item.active, 'active'),
  };
}

function normalizeStatement(value: unknown): CreditCardStatementSummary {
  const item = record(value);
  const status = text(item.status, 'status') as CreditCardStatementStatus;
  if (!['OPEN', 'CLOSED', 'PARTIALLY_PAID', 'PAID'].includes(status)) throw new Error('Invalid credit-card statement status');
  const overdueDays = integer(item.overdue_days, 'overdue_days');
  if (overdueDays < 0) throw new Error('Invalid overdue days');
  return {
    id: text(item.id, 'id'),
    creditCardProfileId: text(item.credit_card_profile_id, 'credit_card_profile_id'),
    cycleRef: text(item.cycle_ref, 'cycle_ref'),
    closingDate: isoDate(item.closing_date, 'closing_date'),
    dueDate: isoDate(item.due_date, 'due_date'),
    status,
    originalAmount: money(item.original_amount, 'original_amount'),
    adjustmentAmount: money(item.adjustment_amount, 'adjustment_amount'),
    interestAmount: money(item.interest_amount, 'interest_amount'),
    fineAmount: money(item.fine_amount, 'fine_amount'),
    discountAmount: money(item.discount_amount, 'discount_amount'),
    paidAmount: money(item.paid_amount, 'paid_amount'),
    balanceAmount: money(item.balance_amount, 'balance_amount'),
    isOverdue: boolean(item.is_overdue, 'is_overdue'),
    overdueDays,
  };
}

function normalizeStatementItem(value: unknown): CreditCardStatementItemDetail {
  const item = record(value);
  return {
    id: text(item.id, 'item.id'),
    financialTransactionId: text(item.financial_transaction_id, 'item.financial_transaction_id'),
    payableId: nullableText(item.payable_id, 'item.payable_id'),
    originType: text(item.origin_type, 'item.origin_type'),
    originId: text(item.origin_id, 'item.origin_id'),
    originalAmount: money(item.original_amount, 'item.original_amount'),
    adjustmentAmount: money(item.adjustment_amount, 'item.adjustment_amount'),
    finalAmount: money(item.final_amount, 'item.final_amount'),
  };
}

function normalizePayment(value: unknown): CreditCardStatementPaymentDetail {
  const item = record(value);
  return {
    id: text(item.id, 'payment.id'),
    financialTransactionId: text(item.financial_transaction_id, 'payment.financial_transaction_id'),
    amount: money(item.amount, 'payment.amount'),
    createdAt: timestamp(item.created_at, 'payment.created_at'),
  };
}

function normalizeAdjustment(value: unknown): CreditCardStatementAdjustmentDetail {
  const item = record(value);
  return {
    id: text(item.id, 'adjustment.id'),
    interestAmount: money(item.interest_amount, 'adjustment.interest_amount'),
    fineAmount: money(item.fine_amount, 'adjustment.fine_amount'),
    discountAmount: money(item.discount_amount, 'adjustment.discount_amount'),
    reason: text(item.reason, 'adjustment.reason'),
    createdAt: timestamp(item.created_at, 'adjustment.created_at'),
  };
}

function normalizeCredit(value: unknown): CreditCardStatementCreditDetail {
  const item = record(value);
  return {
    id: text(item.id, 'credit.id'),
    statementItemId: text(item.statement_item_id, 'credit.statement_item_id'),
    financialTransactionId: text(item.financial_transaction_id, 'credit.financial_transaction_id'),
    amount: money(item.amount, 'credit.amount'),
    reason: text(item.reason, 'credit.reason'),
    createdAt: timestamp(item.created_at, 'credit.created_at'),
  };
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Credit-card request failed (${response.status})`;
    try {
      const payload = record(await response.json());
      if (typeof payload.error === 'string' && payload.error) message = payload.error;
    } catch {
      // Fail closed: do not replace server authority with browser persistence or guessed data.
    }
    throw new Error(message);
  }
  return await response.json();
}

export function createCreditCardPaymentIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return `card-payment-${cryptoApi.randomUUID()}`;
  return `card-payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class CreditCardStatementClient {
  static async listProfiles(): Promise<CreditCardProfileSummary[]> {
    const payload = record(await requestJson('/api/finance/credit-cards/profiles'));
    if (!Array.isArray(payload.items)) throw new Error('Invalid credit-card profile list');
    return payload.items.map(normalizeProfile);
  }

  static async listStatements(profileId?: string): Promise<CreditCardStatementSummary[]> {
    const cleanProfileId = profileId?.trim();
    const suffix = cleanProfileId ? `?profileId=${encodeURIComponent(cleanProfileId)}` : '';
    const payload = record(await requestJson(`/api/finance/credit-cards/statements${suffix}`));
    if (!Array.isArray(payload.items)) throw new Error('Invalid credit-card statement list');
    return payload.items.map(normalizeStatement);
  }

  static async closeStatement(statementId: string): Promise<void> {
    const cleanStatementId = statementId.trim();
    if (!cleanStatementId) throw new Error('Statement id is required');
    const payload = record(await requestJson(`/api/finance/credit-cards/statements/${encodeURIComponent(cleanStatementId)}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }));
    record(payload.item);
  }

  static async payStatement(statementId: string, financialTransactionId: string, idempotencyKey: string): Promise<void> {
    const cleanStatementId = statementId.trim();
    const cleanTransactionId = financialTransactionId.trim();
    const cleanIdempotencyKey = idempotencyKey.trim();
    if (!cleanStatementId) throw new Error('Statement id is required');
    if (!cleanTransactionId) throw new Error('Financial transaction id is required');
    if (!cleanIdempotencyKey) throw new Error('Idempotency key is required');
    const payload = record(await requestJson(`/api/finance/credit-cards/statements/${encodeURIComponent(cleanStatementId)}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ financialTransactionId: cleanTransactionId, idempotencyKey: cleanIdempotencyKey }),
    }));
    record(payload.item);
  }

  static async getStatementDetail(statementId: string): Promise<CreditCardStatementDetail> {
    const cleanStatementId = statementId.trim();
    if (!cleanStatementId) throw new Error('Statement id is required');
    const payload = record(await requestJson(`/api/finance/credit-cards/statements/${encodeURIComponent(cleanStatementId)}/detail`));
    return {
      statement: normalizeStatement(payload.statement),
      items: list(payload.items, 'items').map(normalizeStatementItem),
      payments: list(payload.payments, 'payments').map(normalizePayment),
      adjustments: list(payload.adjustments, 'adjustments').map(normalizeAdjustment),
      credits: list(payload.credits, 'credits').map(normalizeCredit),
    };
  }
}
