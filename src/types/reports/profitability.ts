import { AccountingRegime } from '../enums';

export interface VehicleProfitabilityReport {
  vehicleId: string;
  plate: string;
  model: string;
  brand: string;
  status: string;
  regime: AccountingRegime;
  periodStart: string;
  periodEnd: string;
  kmTraveledPeriod: number;
  // Income Breakdown
  rentalIncome: number;
  kmExcessIncome: number;
  finesReimbursedIncome: number;
  otherIncome: number;
  totalIncome: number;
  // Expense Breakdown
  maintenanceExpense: number;
  insuranceExpense: number;
  trackerExpense: number;
  documentationExpense: number;
  finesCompanyExpense: number;
  financingExpense: number;
  depreciationExpense: number;
  otherExpense: number;
  totalExpense: number;
  // Result
  netProfit: number;
  profitMarginPercentage: number;
  costPerKm: number;
  revenuePerKm: number;
}
