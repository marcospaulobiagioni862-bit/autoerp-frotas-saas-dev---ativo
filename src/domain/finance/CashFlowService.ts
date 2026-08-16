import {
  FinancialTransactionRepository,
  FinancialAccountRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { TransactionType, ObligationStatus } from '../../types/enums';
import { CashFlowReport, CashFlowDaily } from '../../types/reports';
import { roundCurrency } from '../../shared/utils/currency';

export class CashFlowService {
  private static txRepo = new FinancialTransactionRepository();
  private static accountRepo = new FinancialAccountRepository();
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();

  public static async getCashFlowReport(
    companyId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<CashFlowReport> {
    const allAccounts = await this.accountRepo.findAllForCompany(companyId);
    const accounts = allAccounts.filter((a) => a.companyId === companyId);
    const currentCashBalance = accounts.reduce((acc, a) => acc + a.currentBalance, 0);

    const allTx = await this.txRepo.findAllForCompany(companyId);
    const periodTx = allTx.filter(
      (t) =>  t.transactionDate >= periodStart && t.transactionDate <= periodEnd && !t.isReversed
    );

    const afterPeriodTx = allTx.filter(
      (t) =>  t.transactionDate > periodEnd && !t.isReversed
    );

    let totalRealizedIncomes = 0;
    let totalRealizedExpenses = 0;

    for (const t of periodTx) {
      if (t.type === TransactionType.INCOME) totalRealizedIncomes += t.amount;
      else if (t.type === TransactionType.EXPENSE) totalRealizedExpenses += t.amount;
    }

    let totalIncomesAfter = 0;
    let totalExpensesAfter = 0;
    for (const t of afterPeriodTx) {
      if (t.type === TransactionType.INCOME) totalIncomesAfter += t.amount;
      else if (t.type === TransactionType.EXPENSE) totalExpensesAfter += t.amount;
    }

    const finalRealizedCashBalance = roundCurrency(currentCashBalance - totalIncomesAfter + totalExpensesAfter);
    const initialCashBalance = roundCurrency(finalRealizedCashBalance - totalRealizedIncomes + totalRealizedExpenses);

    // Grouping by daily flow
    const dailyMap = new Map<string, CashFlowDaily>();

    for (const t of periodTx) {
      const date = t.transactionDate;
      let daily = dailyMap.get(date);
      if (!daily) {
        daily = {
          date,
          openingBalance: 0,
          realizedIncomes: 0,
          realizedExpenses: 0,
          realizedNet: 0,
          closingBalance: 0,
          predictedIncomes: 0,
          predictedExpenses: 0,
          predictedClosingBalance: 0,
        };
        dailyMap.set(date, daily);
      }

      if (t.type === TransactionType.INCOME) daily.realizedIncomes += t.amount;
      else if (t.type === TransactionType.EXPENSE) daily.realizedExpenses += t.amount;
    }

    // Add predictions from pending receivables/payables
    const pendingRec = await this.recRepo.findAllForCompany(companyId);
    for (const r of pendingRec) {
      if (
        
        r.status !== ObligationStatus.PAID &&
        r.status !== ObligationStatus.CANCELLED &&
        r.dueDate >= periodStart &&
        r.dueDate <= periodEnd
      ) {
        let daily = dailyMap.get(r.dueDate);
        if (!daily) {
          daily = {
            date: r.dueDate,
            openingBalance: 0,
            realizedIncomes: 0,
            realizedExpenses: 0,
            realizedNet: 0,
            closingBalance: 0,
            predictedIncomes: 0,
            predictedExpenses: 0,
            predictedClosingBalance: 0,
          };
          dailyMap.set(r.dueDate, daily);
        }
        daily.predictedIncomes += r.balanceAmount;
      }
    }

    const pendingPay = await this.payRepo.findAllForCompany(companyId);
    for (const p of pendingPay) {
      if (
        
        p.status !== ObligationStatus.PAID &&
        p.status !== ObligationStatus.CANCELLED &&
        p.dueDate >= periodStart &&
        p.dueDate <= periodEnd
      ) {
        let daily = dailyMap.get(p.dueDate);
        if (!daily) {
          daily = {
            date: p.dueDate,
            openingBalance: 0,
            realizedIncomes: 0,
            realizedExpenses: 0,
            realizedNet: 0,
            closingBalance: 0,
            predictedIncomes: 0,
            predictedExpenses: 0,
            predictedClosingBalance: 0,
          };
          dailyMap.set(p.dueDate, daily);
        }
        daily.predictedExpenses += p.balanceAmount;
      }
    }

    const dailyFlows = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      periodStart,
      periodEnd,
      initialCashBalance,
      totalRealizedIncomes: roundCurrency(totalRealizedIncomes),
      totalRealizedExpenses: roundCurrency(totalRealizedExpenses),
      finalRealizedCashBalance,
      dailyFlows,
    };
  }
}
