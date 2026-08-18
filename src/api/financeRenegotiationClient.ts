import type { AccountReceivable } from '../types/entities';

export interface ReceivableRenegotiationInput {
  obligationIds: string[];
  newTotalAmount: number;
  installmentsCount: number;
  firstDueDate: string;
  categoryId: string;
  description: string;
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

function normalizeReceivable(value: unknown): AccountReceivable {
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
    throw new Error('Invalid renegotiated receivable response');
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
  } as unknown as AccountReceivable;
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

export class FinanceRenegotiationClient {
  static async renegotiateReceivables(input: ReceivableRenegotiationInput): Promise<AccountReceivable[]> {
    const payload = asRecord(await requestJson('/api/finance/receivables/renegotiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }));
    if (!Array.isArray(payload.items)) {
      throw new Error('Invalid renegotiation items response');
    }
    return payload.items.map(normalizeReceivable);
  }
}
