export interface FinanceOverviewSummary {
  totalReceivable: number;
  totalPayable: number;
  totalBalance: number;
}

export class FinanceOverviewApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceOverviewApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid finance overview response');
  }
  return value as JsonRecord;
}

function finiteNumber(record: JsonRecord, key: keyof FinanceOverviewSummary): number {
  const value = Number(record[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid finance overview field: ${key}`);
  }
  return value;
}

export class FinanceOverviewClient {
  static async getOverview(): Promise<FinanceOverviewSummary> {
    const response = await fetch('/api/finance/overview', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      let message = `Finance overview request failed (${response.status})`;
      try {
        const payload = asRecord(await response.json());
        if (typeof payload.error === 'string' && payload.error) {
          message = payload.error;
        }
      } catch {
        // Fail closed. Never fall back to browser financial repositories.
      }
      throw new FinanceOverviewApiError(response.status, message);
    }

    const payload = asRecord(await response.json());
    return {
      totalReceivable: finiteNumber(payload, 'totalReceivable'),
      totalPayable: finiteNumber(payload, 'totalPayable'),
      totalBalance: finiteNumber(payload, 'totalBalance'),
    };
  }
}
