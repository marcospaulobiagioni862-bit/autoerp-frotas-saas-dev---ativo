import type { AccountPayable, AccountReceivable } from '../types/entities';

export interface CreateReceivableRequest {
  originType: string;
  originId: string;
  vehicleId?: string;
  driverId?: string;
  contractId?: string;
  categoryId: string;
  description: string;
  totalAmount: number;
  dueDate: string;
  competenceDate?: string;
  competenceMode?: import('../shared/utils/installmentCompetence').InstallmentCompetenceMode;
  installmentCompetenceDates?: string[];
  installmentsCount?: number;
  recurrenceDaysInterval?: number;
}

export interface CreatePayableRequest extends CreateReceivableRequest {
  supplierId?: string;
  idempotencyKey?: string;
}

export class FinanceObligationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceObligationApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid finance API response');
  }
  return value as JsonRecord;
}

function numberField(record: JsonRecord, key: string): number {
  const value = Number(record[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid finance API numeric field: ${key}`);
  }
  return value;
}

function dateField(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`Invalid finance API date field: ${key}`);
  }
  return value.slice(0, 10);
}

function normalizeReceivable(value: unknown): AccountReceivable {
  const record = asRecord(value);
  return {
    ...record,
    originalAmount: numberField(record, 'originalAmount'),
    discountAmount: numberField(record, 'discountAmount'),
    fineAmount: numberField(record, 'fineAmount'),
    interestAmount: numberField(record, 'interestAmount'),
    additionalAmount: record.additionalAmount == null ? 0 : numberField(record, 'additionalAmount'),
    updatedAmount: numberField(record, 'updatedAmount'),
    paidAmount: numberField(record, 'paidAmount'),
    balanceAmount: numberField(record, 'balanceAmount'),
    dueDate: dateField(record, 'dueDate'),
    competenceDate: dateField(record, 'competenceDate'),
  } as unknown as AccountReceivable;
}

function normalizePayable(value: unknown): AccountPayable {
  const record = asRecord(value);
  return {
    ...record,
    originalAmount: numberField(record, 'originalAmount'),
    discountAmount: numberField(record, 'discountAmount'),
    fineAmount: numberField(record, 'fineAmount'),
    interestAmount: numberField(record, 'interestAmount'),
    additionalAmount: record.additionalAmount == null ? 0 : numberField(record, 'additionalAmount'),
    updatedAmount: numberField(record, 'updatedAmount'),
    paidAmount: numberField(record, 'paidAmount'),
    balanceAmount: numberField(record, 'balanceAmount'),
    dueDate: dateField(record, 'dueDate'),
    competenceDate: dateField(record, 'competenceDate'),
  } as unknown as AccountPayable;
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Finance API request failed (${response.status})`;
    try {
      const payload = asRecord(await response.json());
      if (typeof payload.error === 'string' && payload.error) message = payload.error;
    } catch {
      // Fail closed; no local fallback.
    }
    throw new FinanceObligationApiError(response.status, message);
  }
  return await response.json();
}

function jsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function itemsFromPayload(payload: unknown): unknown[] {
  const record = asRecord(payload);
  if (!Array.isArray(record.items)) throw new Error('Invalid finance API items response');
  return record.items;
}

export class FinanceObligationClient {
  static async listReceivables(): Promise<AccountReceivable[]> {
    return itemsFromPayload(await requestJson('/api/finance/receivables')).map(normalizeReceivable);
  }

  static async createReceivable(input: CreateReceivableRequest): Promise<AccountReceivable[]> {
    return itemsFromPayload(await requestJson('/api/finance/receivables', jsonRequest(input))).map(normalizeReceivable);
  }

  static async cancelReceivable(id: string, reason: string): Promise<AccountReceivable> {
    const payload = asRecord(await requestJson(`/api/finance/receivables/${encodeURIComponent(id)}/cancel`, jsonRequest({ reason })));
    return normalizeReceivable(payload.item);
  }

  static async listPayables(): Promise<AccountPayable[]> {
    return itemsFromPayload(await requestJson('/api/finance/payables')).map(normalizePayable);
  }

  static async createPayable(input: CreatePayableRequest): Promise<AccountPayable[]> {
    return itemsFromPayload(await requestJson('/api/finance/payables', jsonRequest(input))).map(normalizePayable);
  }

  static async cancelPayable(id: string, reason: string): Promise<AccountPayable> {
    const payload = asRecord(await requestJson(`/api/finance/payables/${encodeURIComponent(id)}/cancel`, jsonRequest({ reason })));
    return normalizePayable(payload.item);
  }
}
