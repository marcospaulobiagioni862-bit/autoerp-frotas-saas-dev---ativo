import { AccountingRegime } from '../types/enums';
import { DREReport, VehicleProfitabilityReport } from '../types/reports';

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

function validateVehicleProfitabilityReport(value: unknown): VehicleProfitabilityReport {
  const report = asRecord(value);
  const numericFields = [
    'rentalIncome', 'kmExcessIncome', 'finesReimbursedIncome', 'otherIncome',
    'totalIncome', 'grossRevenue', 'maintenanceExpense', 'insuranceExpense',
    'trackerExpense', 'documentationExpense', 'finesCompanyExpense',
    'financingExpense', 'depreciationExpense', 'otherExpense', 'totalExpense',
    'totalExpenses', 'netProfit', 'profitMarginPercentage', 'marginPercentage',
    'costPerKm', 'revenuePerKm',
  ];
  if (
    typeof report.vehicleId !== 'string' ||
    typeof report.periodStart !== 'string' ||
    typeof report.periodEnd !== 'string' ||
    typeof report.regime !== 'string' ||
    numericFields.some((field) => !finite(report[field]))
  ) {
    throw new Error('Invalid vehicle profitability payload');
  }
  return report as unknown as VehicleProfitabilityReport;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) return payload.error;
  } catch {
    // Fail closed: reporting never falls back to browser financial repositories.
  }
  return fallback;
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
      throw new FinanceReportingApiError(
        response.status,
        await errorMessage(response, `DRE report request failed (${response.status})`)
      );
    }

    const payload = asRecord(await response.json());
    return validateDREReport(payload.report);
  }

  static async getVehicleProfitability(
    vehicleId: string,
    periodStart: string,
    periodEnd: string,
    regime: AccountingRegime
  ): Promise<VehicleProfitabilityReport> {
    const params = new URLSearchParams({ vehicleId, start: periodStart, end: periodEnd, regime });
    const response = await fetch(`/api/finance/reports/vehicle-profitability?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new FinanceReportingApiError(
        response.status,
        await errorMessage(response, `Vehicle profitability request failed (${response.status})`)
      );
    }

    const payload = asRecord(await response.json());
    return validateVehicleProfitabilityReport(payload.report);
  }
}
