import { FinancialPeriod } from '../types/entities';
import { FinancialPeriodStatus } from '../types/enums';

export class FinancePeriodApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinancePeriodApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid financial period response');
  }
  return value as JsonRecord;
}

function optionalString(value: unknown): value is string | undefined | null {
  return value === undefined || value === null || typeof value === 'string';
}

function validatePeriod(value: unknown): FinancialPeriod {
  const period = asRecord(value);
  if (
    typeof period.id !== 'string' ||
    typeof period.companyId !== 'string' ||
    typeof period.startDate !== 'string' ||
    typeof period.endDate !== 'string' ||
    (period.status !== FinancialPeriodStatus.OPEN && period.status !== FinancialPeriodStatus.CLOSED) ||
    !optionalString(period.closedAt) ||
    !optionalString(period.closedBy) ||
    !optionalString(period.reopenedAt) ||
    !optionalString(period.reopenedBy) ||
    !optionalString(period.reopenReason) ||
    typeof period.createdAt !== 'string' ||
    typeof period.updatedAt !== 'string'
  ) {
    throw new Error('Invalid financial period payload');
  }
  return period as unknown as FinancialPeriod;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) return payload.error;
  } catch {
    // Financial-period administration never falls back to browser/local state.
  }
  return fallback;
}

export class FinancePeriodClient {
  static async list(): Promise<FinancialPeriod[]> {
    const response = await fetch('/api/finance/periods', {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new FinancePeriodApiError(
        response.status,
        await errorMessage(response, `Financial periods request failed (${response.status})`)
      );
    }

    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid financial periods list payload');
    return payload.items.map(validatePeriod);
  }

  static async close(startDate: string, endDate: string): Promise<FinancialPeriod> {
    const response = await fetch('/api/finance/periods/close', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate }),
    });
    if (!response.ok) {
      throw new FinancePeriodApiError(
        response.status,
        await errorMessage(response, `Financial period close failed (${response.status})`)
      );
    }

    const payload = asRecord(await response.json());
    return validatePeriod(payload.item);
  }

  static async reopen(periodId: string, reason: string): Promise<FinancialPeriod> {
    const response = await fetch(`/api/finance/periods/${encodeURIComponent(periodId)}/reopen`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      throw new FinancePeriodApiError(
        response.status,
        await errorMessage(response, `Financial period reopen failed (${response.status})`)
      );
    }

    const payload = asRecord(await response.json());
    return validatePeriod(payload.item);
  }
}
