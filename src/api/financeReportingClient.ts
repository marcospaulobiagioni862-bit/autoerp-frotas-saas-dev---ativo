import { AccountingRegime } from '../types/enums';
import { DREReport } from '../types/reports';

export class FinanceReportingApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FinanceReportingApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid finance reporting response');
  }
  return value as JsonRecord;
}

function finite(value: unknown): boolean {
  return Number.isFinite(Number(value));
}

function validateDREReport(value: unknown): DREReport {
  const report = asRecord(value);
  const grossRevenue = asRecord(report.grossRevenue);
  const directCosts = asRecord(report.directCosts);
  const netIncome = asRecord(report.netIncome);
  if (
    typeof report.periodStart !== 'string' ||
    typeof report.periodEnd !== 'string' ||
    typeof report.regime !== 'string' ||
    !finite(grossRevenue.amount) ||
    !finite(directCosts.amount) ||
    !finite(netIncome.amount) ||
    !finite(report.netProfit)
  ) {
    throw new Error('Invalid DRE report payload');
  }
  return report as unknown as DREReport;
}

export class FinanceReportingClient {
  static async getDRE(
    periodStart: string,
    periodEnd: string,
    regime: AccountingRegime
  ): Promise<DREReport> {
    const params = new URLSearchParams({ start: periodStart, end: periodEnd, regime });
    const response = await fetch(`/api/finance/reports/dre?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      let message = `DRE report request failed (${response.status})`;
      try {
        const payload = asRecord(await response.json());
        if (typeof payload.error === 'string' && payload.error) message = payload.error;
      } catch {
        // Fail closed: reporting never falls back to browser financial repositories.
      }
      throw new FinanceReportingApiError(response.status, message);
    }

    const payload = asRecord(await response.json());
    return validateDREReport(payload.report);
  }
}
