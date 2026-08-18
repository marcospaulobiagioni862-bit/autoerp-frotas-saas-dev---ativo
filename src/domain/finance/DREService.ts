import { ITransactionContext } from './ITransactionContext';
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
    regime: AccountingRegime = AccountingRegime.ACCRUAL,
    txContext?: ITransactionContext
  ): Promise<DREReport> {
    let grossRevenueAmount = 0;
    let deductionsAmount = 0;
    let directCostsAmount = 0;
    let operatingExpensesAmount = 0;
    let financialResultAmount = 0;

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
        return text.includes('caução') || text.includes('caucao') || origin === 'SECURITY_DEPOSIT';
      };

      const periodRecs = recs.filter(
        (r) =>
          r.status !== ObligationStatus.CANCELLED &&
          dateKey(r.competenceDate) >= periodStart &&
          dateKey(r.competenceDate) <= periodEnd &&
          !isDeposit(r.description, r.originType)
      );

      const periodPays = pays.filter(
        (p) =>
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
        directCostsAmount += Number(p.originalAmount || 0);
      }
    } else {
      // CASH REGIME
      const txs = txContext
        ? await txContext.getTransactionRepo().findAll()
        : await this.txRepo.findAllForCompany(companyId);
      const isDepositTx = (desc?: string) => {
        const text = (desc || '').toLowerCase();
        return text.includes('caução') || text.includes('caucao');
      };

      const periodTxs = txs.filter(
        (t) =>
          !t.isReversed &&
          dateKey(t.transactionDate) >= periodStart &&
          dateKey(t.transactionDate) <= periodEnd &&
          !isDepositTx(t.description)
      );

      for (const t of periodTxs) {
        if (t.type === TransactionType.INCOME) grossRevenueAmount += Number(t.amount || 0);
        else if (t.type === TransactionType.EXPENSE) directCostsAmount += Number(t.amount || 0);
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
        maintenanceCosts: roundCurrency(directCostsAmount * 0.4),
        insuranceCosts: roundCurrency(directCostsAmount * 0.3),
        trackerCosts: roundCurrency(directCostsAmount * 0.2),
        trafficTicketCosts: roundCurrency(directCostsAmount * 0.1),
      },
    };
  }
}
