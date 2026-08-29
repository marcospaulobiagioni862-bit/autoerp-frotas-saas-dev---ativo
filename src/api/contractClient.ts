import type { AccountReceivable, Contract } from '../types/entities';
import { ContractStatus, ObligationStatus, RecurringFrequency } from '../types/enums';

export class ContractApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ContractApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Contract payload');
  return value as JsonRecord;
}

const CONTRACT_STATUSES = new Set(Object.values(ContractStatus));
const PERIODICITIES = new Set(Object.values(RecurringFrequency));
const OBLIGATION_STATUSES = new Set(Object.values(ObligationStatus));

function isOptionalIntegerInRange(value: unknown, min: number, max: number): boolean {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max);
}

function validateContract(value: unknown): Contract {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.contractNumber !== 'string' || !item.contractNumber ||
    typeof item.driverId !== 'string' || !item.driverId ||
    typeof item.vehicleId !== 'string' || !item.vehicleId ||
    typeof item.startDate !== 'string' ||
    (item.endDate !== undefined && typeof item.endDate !== 'string') ||
    typeof item.status !== 'string' || !CONTRACT_STATUSES.has(item.status as ContractStatus) ||
    typeof item.rentalAmount !== 'number' || !Number.isFinite(item.rentalAmount) ||
    typeof item.billingPeriodicity !== 'string' || !PERIODICITIES.has(item.billingPeriodicity as RecurringFrequency) ||
    !isOptionalIntegerInRange(item.billingDueDayOfWeek, 0, 6) ||
    !isOptionalIntegerInRange(item.billingDueDayOfMonth, 1, 31) ||
    typeof item.securityDepositAmount !== 'number' || !Number.isFinite(item.securityDepositAmount) ||
    typeof item.franchiseKm !== 'number' || !Number.isFinite(item.franchiseKm) ||
    typeof item.excessKmRate !== 'number' || !Number.isFinite(item.excessKmRate) ||
    typeof item.signatureRequired !== 'boolean' ||
    typeof item.isArchived !== 'boolean' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string'
  ) throw new Error('Invalid Contract payload');

  for (const key of ['securityDepositId','paymentMethodId','templateId','generatedPdfUrl','signedContractUrl','notes'] as const) {
    if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Invalid Contract payload');
  }
  return item as unknown as Contract;
}

function validateReceivable(value: unknown): AccountReceivable {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.originId !== 'string' ||
    typeof item.description !== 'string' ||
    typeof item.originalAmount !== 'number' ||
    typeof item.updatedAmount !== 'number' ||
    typeof item.paidAmount !== 'number' ||
    typeof item.balanceAmount !== 'number' ||
    typeof item.dueDate !== 'string' ||
    typeof item.status !== 'string' || !OBLIGATION_STATUSES.has(item.status as ObligationStatus)
  ) throw new Error('Invalid Contract receivable payload');
  return item as unknown as AccountReceivable;
}

async function apiError(response: Response): Promise<ContractApiError> {
  let message = `Contract request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Preserve status and fail closed when the response body is malformed.
  }
  return new ContractApiError(response.status, message);
}

export interface ContractCreateInput {
  contractNumber?: string;
  driverId: string;
  vehicleId: string;
  startDate: string;
  endDate?: string;
  rentalAmount: number;
  billingPeriodicity: RecurringFrequency;
  billingDueDayOfWeek?: number;
  billingDueDayOfMonth?: number;
  securityDepositAmount?: number;
  franchiseKm?: number;
  excessKmRate?: number;
  paymentMethodId?: string;
  templateId?: string;
  notes?: string;
}

export type ContractUpdateInput = Partial<ContractCreateInput>;

async function requestItem(url: string, init?: RequestInit): Promise<Contract> {
  const response = await fetch(url, { credentials: 'include', ...init });
  if (!response.ok) throw await apiError(response);
  return validateContract(asRecord(await response.json()).item);
}

export class ContractClient {
  static async list(): Promise<Contract[]> {
    const response = await fetch('/api/contracts', { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid Contract list payload');
    return payload.items.map(validateContract);
  }

  static async get(id: string): Promise<Contract> {
    return requestItem(`/api/contracts/${encodeURIComponent(id)}`);
  }

  static async create(input: ContractCreateInput): Promise<Contract> {
    return requestItem('/api/contracts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  static async update(id: string, input: ContractUpdateInput): Promise<Contract> {
    return requestItem(`/api/contracts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  static async activate(id: string, categoryId: string): Promise<{ item: Contract; receivables: AccountReceivable[] }> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId }),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.receivables)) throw new Error('Invalid Contract activation payload');
    return { item: validateContract(payload.item), receivables: payload.receivables.map(validateReceivable) };
  }

  static async close(id: string, input: { closeDate?: string; reason?: string } = {}): Promise<Contract> {
    return requestItem(`/api/contracts/${encodeURIComponent(id)}/close`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }

  static async cancel(id: string, reason: string): Promise<Contract> {
    return requestItem(`/api/contracts/${encodeURIComponent(id)}/cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }),
    });
  }

  static async archive(id: string, reason?: string): Promise<Contract> {
    return requestItem(`/api/contracts/${encodeURIComponent(id)}/archive`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }),
    });
  }

  static async bill(id: string, dueDate: string, competenceDate: string | undefined, categoryId: string): Promise<AccountReceivable[]> {
    const response = await fetch(`/api/contracts/${encodeURIComponent(id)}/bill`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dueDate, competenceDate, categoryId }),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid Contract billing payload');
    return payload.items.map(validateReceivable);
  }
}
