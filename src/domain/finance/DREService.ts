import { ITransactionContext } from './ITransactionContext';
import {
  AccountReceivableRepository,
  AccountPayableRepository,
  FinancialTransactionRepository,
  FinancialCategoryRepository,
} from '../../persistence/repositories/localRepositories';
import { AccountingRegime, TransactionType, ObligationStatus, OriginType } from '../../types/enums';
import { DREReport, DREItem } from '../../types/reports';
import { AccountPayable, FinancialCategory } from '../../types/entities';
import { roundCurrency } from '../../shared/utils/currency';

type DRECostBreakdown = {
  maintenanceCosts: number;
  insuranceCosts: number;
  trackerCosts: number;
  trafficTicketCosts: number;
  otherCosts: number;
};

export class DREService {
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();
  private static txRepo = new FinancialTransactionRepository();
  private static categoryRepo = new FinancialCategoryRepository();

  private static addExpenseToBreakdown(
    breakdown: DRECostBreakdown,
    originType: OriginType | string | undefined,
    amount: number,
    category?: FinancialCategory
  ): void {
    if (category) {
      const name = category.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (/multa|infracao/.test(name)) breakdown.trafficTicketCosts += amount;
      else if (/manutencao|peca|oficina/.test(name)) breakdown.maintenanceCosts += amount;
      else if (/seguro/.test(name)) breakdown.insuranceCosts += amount;
      else if (/rastrea|telemetria/.test(name)) breakdown.trackerCosts += amount;
      else breakdown.otherCosts += amount;
      return;
    }
    switch (originType) {
      case OriginType.MAINTENANCE:
        breakdown.maintenanceCosts += amount;
        break;
      case OriginType.INSURANCE:
        breakdown.insuranceCosts += amount;
        break;
      case OriginType.TRACKER:
        breakdown.trackerCosts += amount;
        break;
      case OriginType.TRAFFIC_TICKET_COMPANY:
      case OriginType.TRAFFIC_TICKET_NIC:
        breakdown.trafficTicketCosts += amount;
        break;
      default:
        breakdown.otherCosts += amount;
        break;
    }
  }

  public static async getDREReport(
    companyId: string,
    periodStart: string,
    periodEnd: string,
    regime: AccountingRegime = AccountingRegime.ACCRUAL,
    txContext?: ITransactionContext
  ): Promise<DREReport> {
    if (regime !== AccountingRegime.CASH && regime !== AccountingRegime.ACCRUAL) {
      throw new Error('Unsupported accounting regime');
    }

    let grossRevenueAmount = 0;
    let deductionsAmount = 0;
    let directCostsAmount = 0;
    let operatingExpensesAmount = 0;
    let financialResultAmount = 0;
    const breakdown: DRECostBreakdown = {
      maintenanceCosts: 0,
      insuranceCosts: 0,
      trackerCosts: 0,
      trafficTicketCosts: 0,
      otherCosts: 0,
    };

    const categories = txContext?.getFinancialCategories
      ? await txContext.getFinancialCategories()
      : txContext ? [] : await this.categoryRepo.findAllForCompany(companyId);
    const categoriesById = new Map(categories.filter((item) => item.companyId === companyId).map((item) => [item.id, item]));

    const dateKey = (value?: string) => (value || '').slice(0, 10);

    if (regime === AccountingRegime.ACCRUAL) {
      const recs = txContext
        ? await txContext.getReceivableRepo().findAll()
        : await this.recRepo.findAllForCompany(companyId);
      const pays = txContext
        ? await txContext.getPayableRepo().findAll()
        : await this.payRepo.findAllForCompany(companyId);

      const isDeposit = (desc?: string, origin?: string) => {
        const text = (desc || '').toLowerCase();
        return text.includes('caução') || text.includes('caucao') || origin === OriginType.SECURITY_DEPOSIT;
      };

      const periodRecs = recs.filter(
        (r) =>
          r.companyId === companyId &&
          r.status !== ObligationStatus.CANCELLED &&
          dateKey(r.competenceDate) >= periodStart &&
          dateKey(r.competenceDate) <= periodEnd &&
          !isDeposit(r.description, r.originType)
      );

      const periodPays = pays.filter(
        (p) =>
          p.companyId === companyId &&
          p.status !== ObligationStatus.CANCELLED &&
          dateKey(p.competenceDate) >= periodStart &&
          dateKey(p.competenceDate) <= periodEnd &&
          !isDeposit(p.description, p.originType)
      );

      for (const r of periodRecs) {
        grossRevenueAmount += Number(r.originalAmount || 0);
        financialResultAmount += (
          Number(r.fineAmount || 0) +
          Number(r.interestAmount || 0) -
          Number(r.discountAmount || 0)
        );
      }

      for (const p of periodPays) {
        const amount = Number(p.originalAmount || 0);
        directCostsAmount += amount;
        financialResultAmount += (
          Number(p.discountAmount || 0) -
          Number(p.fineAmount || 0) -
          Number(p.interestAmount || 0)
        );
        this.addExpenseToBreakdown(breakdown, p.originType, amount, categoriesById.get(p.categoryId));
      }
    } else {
      // CASH REGIME
      const txs = txContext
        ? await txContext.getTransactionRepo().findAll()
        : await this.txRepo.findAllForCompany(companyId);
      const pays = txContext
        ? await txContext.getPayableRepo().findAll()
        : await this.payRepo.findAllForCompany(companyId);
      const payablesById = new Map<string, AccountPayable>(
        pays
          .filter((p) => p.companyId === companyId)
          .map((p): [string, AccountPayable] => [p.id, p])
      );
      const isDepositTx = (desc?: string) => {
        const text = (desc || '').toLowerCase();
        return text.includes('caução') || text.includes('caucao');
      };

      const periodTxs = txs.filter(
        (t) =>
          t.companyId === companyId &&
          !t.isReversed &&
          dateKey(t.transactionDate) >= periodStart &&
          dateKey(t.transactionDate) <= periodEnd &&
          !isDepositTx(t.description)
      );

      for (const t of periodTxs) {
        const amount = Number(t.amount || 0);
        if (t.type === TransactionType.INCOME) {
          grossRevenueAmount += amount;
        } else if (t.type === TransactionType.EXPENSE) {
          directCostsAmount += amount;
          const payable = t.payableId ? payablesById.get(t.payableId) : undefined;
          this.addExpenseToBreakdown(breakdown, payable?.originType, amount, payable ? categoriesById.get(payable.categoryId) : undefined);
        }
      }
    }

    const netRevenueAmount = roundCurrency(grossRevenueAmount - deductionsAmount);
    const grossProfitAmount = roundCurrency(netRevenueAmount - directCostsAmount);
    const operatingProfitAmount = roundCurrency(grossProfitAmount - operatingExpensesAmount);
    const netIncomeAmount = roundCurrency(operatingProfitAmount + financialResultAmount);

    const grossRevenue: DREItem = { code: '1', description: '1. Receita Bruta de Serviços (Aluguéis)', amount: grossRevenueAmount };
    const deductions: DREItem = { code: '2', description: '2. Deduções da Receita Bruta', amount: deductionsAmount };
    const netRevenue: DREItem = { code: '3', description: '3. Receita Líquida', amount: netRevenueAmount, isTotal: true };
    const directCosts: DREItem = { code: '4', description: '4. Custos Operacionais Diretos (Manutenção, Seguro, etc)', amount: directCostsAmount };
    const grossProfit: DREItem = { code: '5', description: '5. Lucro Bruto Operacional', amount: grossProfitAmount, isTotal: true };
    const operatingExpenses: DREItem = { code: '6', description: '6. Despesas Operacionais / Administrativas', amount: operatingExpensesAmount };
    const operatingProfit: DREItem = { code: '7', description: '7. Resultado Antes Financeiro (EBITDA)', amount: operatingProfitAmount, isTotal: true };
    const financialResult: DREItem = { code: '8', description: '8. Resultado Financeiro (Juros/Multas/Descontos)', amount: financialResultAmount };
    const netIncome: DREItem = { code: '9', description: '9. LUCRO LÍQUIDO DO EXERCÍCIO', amount: netIncomeAmount, isTotal: true };

    return {
      periodStart,
      periodEnd,
      regime,
      grossRevenue,
      deductions,
      netRevenue,
      directCosts,
      grossProfit,
      operatingExpenses,
      operatingProfit,
      financialResult,
      netIncome,
      netProfit: netIncomeAmount,
      breakdown: {
        maintenanceCosts: roundCurrency(breakdown.maintenanceCosts),
        insuranceCosts: roundCurrency(breakdown.insuranceCosts),
        trackerCosts: roundCurrency(breakdown.trackerCosts),
        trafficTicketCosts: roundCurrency(breakdown.trafficTicketCosts),
        otherCosts: roundCurrency(breakdown.otherCosts),
      },
    };
  }
}
