import {
  AccountReceivableRepository,
  AccountPayableRepository,
  FinancialTransactionRepository,
} from '../../persistence/repositories/localRepositories';
import { AccountingRegime, TransactionType, ObligationStatus } from '../../types/enums';
import { DREReport, DREItem } from '../../types/reports';
import { roundCurrency } from '../../shared/utils/currency';

export class DREService {
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();
  private static txRepo = new FinancialTransactionRepository();

  public static async getDREReport(
    companyId: string,
    periodStart: string,
    periodEnd: string,
    regime: AccountingRegime = AccountingRegime.ACCRUAL
  ): Promise<DREReport> {
    let grossRevenueAmount = 0;
    let deductionsAmount = 0;
    let directCostsAmount = 0;
    let operatingExpensesAmount = 0;
    let financialResultAmount = 0;

    if (regime === AccountingRegime.ACCRUAL) {
      const recs = await this.recRepo.findAll();
      const pays = await this.payRepo.findAll();

      const isDeposit = (desc?: string, origin?: string) => {
        const text = (desc || '').toLowerCase();
        return text.includes('caução') || text.includes('caucao') || origin === 'SECURITY_DEPOSIT';
      };

      const periodRecs = recs.filter(
        (r) =>
          r.companyId === companyId &&
          r.status !== ObligationStatus.CANCELLED &&
          r.competenceDate >= periodStart &&
          r.competenceDate <= periodEnd &&
          !isDeposit(r.description, r.originType)
      );

      const periodPays = pays.filter(
        (p) =>
          p.companyId === companyId &&
          p.status !== ObligationStatus.CANCELLED &&
          p.competenceDate >= periodStart &&
          p.competenceDate <= periodEnd &&
          !isDeposit(p.description, p.originType)
      );

      for (const r of periodRecs) {
        grossRevenueAmount += r.originalAmount;
        financialResultAmount += (r.fineAmount + r.interestAmount - r.discountAmount);
      }

      for (const p of periodPays) {
        directCostsAmount += p.originalAmount;
      }
    } else {
      // CASH REGIME
      const txs = await this.txRepo.findAll();
      const isDepositTx = (desc?: string) => {
        const text = (desc || '').toLowerCase();
        return text.includes('caução') || text.includes('caucao');
      };

      const periodTxs = txs.filter(
        (t) =>
          t.companyId === companyId &&
          !t.isReversed &&
          t.transactionDate >= periodStart &&
          t.transactionDate <= periodEnd &&
          !isDepositTx(t.description)
      );

      for (const t of periodTxs) {
        if (t.type === TransactionType.INCOME) grossRevenueAmount += t.amount;
        else if (t.type === TransactionType.EXPENSE) directCostsAmount += t.amount;
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
    };
  }
}
