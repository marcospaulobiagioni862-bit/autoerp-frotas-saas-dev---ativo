export class FinanceOverdueApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceOverdueApiError';
  }
}

export type AgingObligationType = 'RECEIVABLE' | 'PAYABLE';

export interface DelinquentReceivableView {
  receivableId: string;
  originType: string;
  originId: string;
  driverId?: string;
  vehicleId?: string;
  contractId?: string;
  dueDate: string;
  daysOverdue: number;
  originalAmount: number;
  receivedAmount: number;
  lateFee: number;
  interest: number;
  updatedOutstandingAmount: number;
}

export interface AgingReportView {
  aVencer: number;
  oneToSeven: number;
  eightToFifteen: number;
  sixteenToThirty: number;
  thirtyOneToSixty: number;
  sixtyOneToNinety: number;
  overNinety: number;
}

type JsonRecord = Record<string, unknown>;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid overdue finance response');
  return value as JsonRecord;
}

function finite(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Invalid overdue finance amount');
  return parsed;
}

function date(value: unknown): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) throw new Error('Invalid overdue finance date');
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function validateDelinquent(value: unknown): DelinquentReceivableView {
  const item = asRecord(value);
  if (
    typeof item.receivableId !== 'string' || !item.receivableId ||
    typeof item.originType !== 'string' || typeof item.originId !== 'string' ||
    !Number.isInteger(Number(item.daysOverdue)) || Number(item.daysOverdue) <= 0
  ) throw new Error('Invalid delinquent receivable payload');

  return {
    receivableId: item.receivableId,
    originType: item.originType,
    originId: item.originId,
    driverId: optionalString(item.driverId),
    vehicleId: optionalString(item.vehicleId),
    contractId: optionalString(item.contractId),
    dueDate: date(item.dueDate),
    daysOverdue: Number(item.daysOverdue),
    originalAmount: finite(item.originalAmount),
    receivedAmount: finite(item.receivedAmount),
    lateFee: finite(item.lateFee),
    interest: finite(item.interest),
    updatedOutstandingAmount: finite(item.updatedOutstandingAmount),
  };
}

function validateAging(value: unknown): AgingReportView {
  const report = asRecord(value);
  return {
    aVencer: finite(report.aVencer),
    oneToSeven: finite(report['1_7']),
    eightToFifteen: finite(report['8_15']),
    sixteenToThirty: finite(report['16_30']),
    thirtyOneToSixty: finite(report['31_60']),
    sixtyOneToNinety: finite(report['61_90']),
    overNinety: finite(report['90_plus']),
  };
}

function processingDate(value: string): string {
  const normalized = date(value);
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    throw new Error('Invalid overdue finance date');
  }
  return normalized;
}

async function apiError(response: Response): Promise<FinanceOverdueApiError> {
  let message = `Overdue finance request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) message = payload.error;
  } catch {}
  return new FinanceOverdueApiError(response.status, message);
}

export class FinanceOverdueClient {
  static async getDelinquency(processingDateInput: string): Promise<DelinquentReceivableView[]> {
    const params = new URLSearchParams({ processingDate: processingDate(processingDateInput) });
    const response = await fetch(`/api/finance/overdue/delinquency?${params.toString()}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid delinquency response');
    return payload.items.map(validateDelinquent);
  }

  static async getAging(type: AgingObligationType, processingDateInput: string): Promise<AgingReportView> {
    if (type !== 'RECEIVABLE' && type !== 'PAYABLE') throw new Error('Invalid aging obligation type');
    const params = new URLSearchParams({ type, processingDate: processingDate(processingDateInput) });
    const response = await fetch(`/api/finance/overdue/aging?${params.toString()}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return validateAging(payload.report);
  }
}
