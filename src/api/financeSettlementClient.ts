export interface SettlementAccountOption {
  id: string;
  name: string;
  type: string;
  currentBalance: number;
  status: string;
}

export interface SettlementPaymentMethodOption {
  id: string;
  name: string;
  active: boolean;
}

export interface SettlementOptions {
  accounts: SettlementAccountOption[];
  paymentMethods: SettlementPaymentMethodOption[];
}

export interface ReceiptDailyInterestQuote {
  daysOverdue: number;
  dailyInterestAmount: number;
  interestAmount: number;
  periodStartDate: string;
  effectiveDate: string;
  additionalInterest: number;
  totalAmount: number;
}

export interface SettlementCommandInput {
  dailyInterestAmount?: number;
  settleRemainingBalance?: boolean;
  interestAmount?: number;
  additionalAmount?: number;
  fineAmount?: number;
  discountAmount?: number;
  financialAccountId: string;
  paymentMethodId: string;
  paymentAmount: number;
  paymentDate: string;
  description?: string;
  idempotencyKey: string;
}

export function createSettlementIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `settlement-${cryptoApi.randomUUID()}`;
  }
  return `settlement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class FinanceSettlementApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceSettlementApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid settlement API response');
  }
  return value as JsonRecord;
}

function normalizeAccount(value: unknown): SettlementAccountOption {
  const row = asRecord(value);
  const currentBalance = Number(row.currentBalance);
  if (
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.type !== 'string' ||
    typeof row.status !== 'string' ||
    !Number.isFinite(currentBalance)
  ) {
    throw new Error('Invalid financial account response');
  }
  return { id: row.id, name: row.name, type: row.type, currentBalance, status: row.status };
}

function normalizePaymentMethod(value: unknown): SettlementPaymentMethodOption {
  const row = asRecord(value);
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.active !== 'boolean') {
    throw new Error('Invalid payment method response');
  }
  return { id: row.id, name: row.name, active: row.active };
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Settlement API request failed (${response.status})`;
    try {
      const payload = asRecord(await response.json());
      if (typeof payload.error === 'string' && payload.error) message = payload.error;
    } catch {
      // Fail closed; never use local persistence as fallback.
    }
    throw new FinanceSettlementApiError(response.status, message);
  }
  return await response.json();
}

function postJson(body: SettlementCommandInput): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export class FinanceSettlementClient {
  static async getOptions(): Promise<SettlementOptions> {
    const payload = asRecord(await requestJson('/api/finance/settlement-options'));
    if (!Array.isArray(payload.accounts) || !Array.isArray(payload.paymentMethods)) {
      throw new Error('Invalid settlement options response');
    }
    return {
      accounts: payload.accounts.map(normalizeAccount),
      paymentMethods: payload.paymentMethods.map(normalizePaymentMethod),
    };
  }

  static async getReceiptDailyInterestQuote(
    receivableId: string,
    effectiveDate: string,
    dailyInterestAmount: number
  ): Promise<ReceiptDailyInterestQuote> {
    const params = new URLSearchParams({ date: effectiveDate, daily: String(dailyInterestAmount) });
    const payload = asRecord(await requestJson(`/api/finance/receivables/${encodeURIComponent(receivableId)}/daily-interest-quote?${params.toString()}`));
    const row = asRecord(payload.quote);
    const quote: ReceiptDailyInterestQuote = {
      daysOverdue: Number(row.daysOverdue),
      dailyInterestAmount: Number(row.dailyInterestAmount),
      interestAmount: Number(row.interestAmount),
      periodStartDate: typeof row.periodStartDate === 'string' ? row.periodStartDate : '',
      effectiveDate: typeof row.effectiveDate === 'string' ? row.effectiveDate : effectiveDate,
      additionalInterest: Number(row.additionalInterest),
      totalAmount: Number(row.totalAmount),
    };
    if (
      !Number.isFinite(quote.daysOverdue) ||
      !Number.isFinite(quote.dailyInterestAmount) ||
      !Number.isFinite(quote.interestAmount) ||
      !Number.isFinite(quote.additionalInterest) ||
      !Number.isFinite(quote.totalAmount) ||
      !quote.periodStartDate ||
      !quote.effectiveDate
    ) {
      throw new Error('Invalid daily interest quote response');
    }
    return quote;
  }

  static async registerReceipt(receivableId: string, input: SettlementCommandInput): Promise<void> {
    await requestJson(`/api/finance/receivables/${encodeURIComponent(receivableId)}/receipt`, postJson(input));
  }

  static async registerPayment(payableId: string, input: SettlementCommandInput): Promise<void> {
    await requestJson(`/api/finance/payables/${encodeURIComponent(payableId)}/payment`, postJson(input));
  }
}
