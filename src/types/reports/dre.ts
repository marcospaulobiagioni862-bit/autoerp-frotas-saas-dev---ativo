import { AccountingRegime } from '../enums';

export interface DREItem {
  code: string;
  description: string;
  amount: number;
  isTotal?: boolean;
  children?: DREItem[];
}

export interface DREReport {
  periodStart: string;
  periodEnd: string;
  regime: AccountingRegime;
  grossRevenue: DREItem; // Receita Bruta
  deductions: DREItem; // Impostos/Descontos
  netRevenue: DREItem; // Receita Líquida
  directCosts: DREItem; // Custos Operacionais Diretos
  grossProfit: DREItem; // Lucro Bruto
  operatingExpenses: DREItem; // Despesas Administrativas e Fixas
  operatingProfit: DREItem; // Lucro Operacional
  financialResult: DREItem; // Resultado Financeiro (Juros, Multas cobradas)
  netIncome: DREItem; // Lucro Líquido do Exercício
  netProfit?: number;
  breakdown?: {
    maintenanceCosts?: number;
    insuranceCosts?: number;
    trackerCosts?: number;
    trafficTicketCosts?: number;
    otherCosts?: number;
  };
}
