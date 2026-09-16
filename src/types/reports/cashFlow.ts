export interface CashFlowDaily {
  date: string;
  openingBalance: number;
  realizedIncomes: number;
  realizedExpenses: number;
  realizedNet: number;
  closingBalance: number;
  predictedIncomes: number;
  predictedExpenses: number;
  predictedClosingBalance: number;
}

export interface CashFlowReport {
  periodStart: string;
  periodEnd: string;
  initialCashBalance: number;
  totalRealizedIncomes: number;
  totalRealizedExpenses: number;
  finalRealizedCashBalance: number;
  dailyFlows: CashFlowDaily[];
}
