import type { FinancialTransaction } from '../types/entities';
import {
  FinanceSettlementClient,
  type SettlementOptions,
} from './financeSettlementClient';

export interface TransferCommandInput {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  transferDate: string;
  paymentMethodId: string;
  description: string;
  idempotencyKey: string;
}

export function createTransferIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `transfer-${cryptoApi.randomUUID()}`;
  }
  return `transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface ReversalCommandInput {
  reversalAmount: number;
  reason: string;
  idempotencyKey: string;
}

export function createReversalIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `reversal-${cryptoApi.randomUUID()}`;
  }
  return `reversal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class FinanceTransactionApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceTransactionApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid transaction API response');
  }
  return value as JsonRecord;
}

function numberField(record: JsonRecord, key: string): number {
  const value = Number(record[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid transaction API numeric field: ${key}`);
  }
  return value;
}

function dateField(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`Invalid transaction API date field: ${key}`);
  }
  return value.slice(0, 10);
}

function normalizeTransaction(value: unknown): FinancialTransaction {
  const record = asRecord(value);
  if (
    typeof record.id !== 'string' ||
    typeof record.companyId !== 'string' ||
    typeof record.financialAccountId !== 'string' ||
    typeof record.type !== 'string' ||
    typeof record.paymentMethodId !== 'string' ||
    typeof record.description !== 'string' ||
    typeof record.isReversed !== 'boolean'
  ) {
    throw new Error('Invalid financial transaction response');
  }

  return {
    ...record,
    amount: numberField(record, 'amount'),
    transactionDate: dateField(record, 'transactionDate'),
    competenceDate: dateField(record, 'competenceDate'),
  } as unknown as FinancialTransaction;
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Transaction API request failed (${response.status})`;
    try {
      const payload = asRecord(await response.json());
      if (typeof payload.error === 'string' && payload.error) message = payload.error;
    } catch {
      // Fail closed. Never fall back to browser persistence.
    }
    throw new FinanceTransactionApiError(response.status, message);
  }
  return await response.json();
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function obligationHistoryParams(type: 'RECEIVABLE' | 'PAYABLE', obligationId: string): string {
  const id = obligationId.trim();
  if (!id) throw new Error('Invalid obligation id');
  const params = new URLSearchParams(type === 'RECEIVABLE' ? { receivableId: id } : { payableId: id });
  return params.toString();
}

export class FinanceTransactionClient {
  static async getOptions(): Promise<SettlementOptions> {
    return FinanceSettlementClient.getOptions();
  }

  static async listTransactions(): Promise<FinancialTransaction[]> {
    const payload = asRecord(await requestJson('/api/finance/transactions'));
    if (!Array.isArray(payload.items)) {
      throw new Error('Invalid transaction list response');
    }
    return payload.items.map(normalizeTransaction);
  }

  static async listByObligation(type: 'RECEIVABLE' | 'PAYABLE', obligationId: string): Promise<FinancialTransaction[]> {
    const payload = asRecord(await requestJson(`/api/finance/transactions/by-obligation?${obligationHistoryParams(type, obligationId)}`));
    if (!Array.isArray(payload.items)) throw new Error('Invalid obligation transaction history response');
    return payload.items.map(normalizeTransaction);
  }

  static async transfer(input: TransferCommandInput): Promise<FinancialTransaction> {
    const payload = asRecord(await requestJson('/api/finance/transfers', postJson(input)));
    return normalizeTransaction(payload.item);
  }

  static async reverse(transactionId: string, input: ReversalCommandInput): Promise<FinancialTransaction> {
    const payload = asRecord(await requestJson(
      `/api/finance/transactions/${encodeURIComponent(transactionId)}/reverse`,
      postJson(input)
    ));
    return normalizeTransaction(payload.item);
  }
}
