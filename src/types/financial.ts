export * from './reports';
import { AccountingRegime } from './enums';

export interface FinancialSummary {
  periodStart: string;
  periodEnd: string;
  regime: AccountingRegime;
  totalIncome: number;
  totalExpense: number;
  netResult: number;
  profitMarginPercentage: number;
  totalReceivablesPending: number;
  totalReceivablesOverdue: number;
  totalPayablesPending: number;
  totalPayablesOverdue: number;
  occupancyRatePercentage: number;
  activeContractsCount: number;
  totalVehiclesCount: number;
}
