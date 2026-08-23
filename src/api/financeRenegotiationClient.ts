import type { AccountPayable, AccountReceivable } from '../types/entities';
import {
  isRenegotiationInstallmentFrequency,
  type RenegotiationInstallmentFrequency,
} from '../shared/utils/renegotiationSchedule';

export interface ReceivableRenegotiationInput {
  obligationIds: string[];
  newTotalAmount: number;
  installmentsCount: number;
  firstDueDate: string;
  installmentFrequency: RenegotiationInstallmentFrequency;
  categoryId: string;
  description: string;
}

export interface PayableRenegotiationInput extends ReceivableRenegotiationInput {
  idempotencyKey: string;
}

export class FinanceRenegotiationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceRenegotiationApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid renegotiation API response');
  }
  return value as JsonRecord;
}

function normalizeObligation<T extends AccountReceivable | AccountPayable>(value: unknown, kind: 'receivable' | 'payable'): T {
  const row = asRecord(value);
  const originalAmount = Number(row.originalAmount);
  const updatedAmount = Number(row.updatedAmount);
  const paidAmount = Number(row.paidAmount);
  const balanceAmount = Number(row.balanceAmount);
  if (
    typeof row.id !== 'string' ||
    typeof row.companyId !== 'string' ||
    typeof row.description !== 'string' ||
    typeof row.status !== 'string' ||
    typeof row.dueDate !== 'string' ||
    typeof row.competenceDate !== 'string' ||
    !Number.isFinite(originalAmount) ||
    !Number.isFinite(updatedAmount) ||
    !Number.isFinite(paidAmount) ||
    !Number.isFinite(balanceAmount)
  ) {
    throw new Error(`Invalid renegotiated ${kind} response`);
  }
  return {
    ...row,
    originalAmount,
    updatedAmount,
    paidAmount,
    balanceAmount,
    discountAmount: Number(row.discountAmount ?? 0),
    fineAmount: Number(row.fineAmount ?? 0),
    interestAmount: Number(row.interestAmount ?? 0),
    dueDate: row.dueDate.slice(0, 10),
    competenceDate: row.competenceDate.slice(0, 10),
  } as unknown as T;
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Renegotiation API request failed (${response.status})`;
    try {
      const payload = asRecord(await response.json());
      if (typeof payload.error === 'string' && payload.error) message = payload.error;
    } catch {
      // Fail closed; never fall back to local FinanceEngine.
    }
    throw new FinanceRenegotiationApiError(response.status, message);
  }
  return await response.json();
}

function validateCommon(input: ReceivableRenegotiationInput): void {
  if (!isRenegotiationInstallmentFrequency(input.installmentFrequency)) {
    throw new Error('Invalid renegotiation installment frequency');
  }
  if (!input.categoryId.trim()) {
    throw new Error('Renegotiation category is required');
  }
}

export class FinanceRenegotiationClient {
  static async renegotiateReceivables(input: ReceivableRenegotiationInput): Promise<AccountReceivable[]> {
    validateCommon(input);
    const payload = asRecord(await requestJson('/api/finance/receivables/renegotiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }));
    if (!Array.isArray(payload.items)) {
      throw new Error('Invalid renegotiation items response');
    }
    return payload.items.map((item) => normalizeObligation<AccountReceivable>(item, 'receivable'));
  }

  static async renegotiatePayables(input: PayableRenegotiationInput): Promise<AccountPayable[]> {
    validateCommon(input);
    const key = input.idempotencyKey.trim();
    if (!key || key.length > 160) {
      throw new Error('Payable renegotiation idempotency key is required');
    }
    const payload = asRecord(await requestJson('/api/finance/payables/renegotiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, idempotencyKey: key }),
    }));
    if (!Array.isArray(payload.items)) {
      throw new Error('Invalid payable renegotiation items response');
    }
    return payload.items.map((item) => normalizeObligation<AccountPayable>(item, 'payable'));
  }
}
