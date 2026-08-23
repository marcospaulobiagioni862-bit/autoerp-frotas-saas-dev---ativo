import { ITransactionContext } from './ITransactionContext';
import {
  FinancialTransactionRepository,
  FinancialAccountRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { TransactionType, ObligationStatus } from '../../types/enums';
import { FinancialTransaction } from '../../types/entities';
import { CashFlowReport, CashFlowDaily } from '../../types/reports';
import { roundCurrency } from '../../shared/utils/currency';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CashMovement = {
  income: number;
  expense: number;
};

function normalizeDate(value: string, label: string): string {
  const candidate = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  if (!DATE_PATTERN.test(candidate)) throw new Error(`${label} deve usar o formato YYYY-MM-DD`);
  const [year, month, day] = candidate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} contém uma data inválida`);
  }
  return candidate;
}

function dateKey(value?: string): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function emptyDaily(date: string): CashFlowDaily {
  return {
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
}

export class CashFlowService {
  private static txRepo = new FinancialTransactionRepository();
  private static accountRepo = new FinancialAccountRepository();
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();

  private static cashMovement(
    transaction: FinancialTransaction,
    transactionsById: Map<string, FinancialTransaction>
  ): CashMovement {
    const amount = roundCurrency(Number(transaction.amount || 0));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Transação financeira contém valor inválido para o fluxo de caixa');
    }

    if (transaction.type === TransactionType.INCOME) return { income: amount, expense: 0 };
    if (transaction.type === TransactionType.EXPENSE) return { income: 0, expense: amount };
    if (transaction.type === TransactionType.TRANSFER) return { income: 0, expense: 0 };

    if (transaction.type === TransactionType.REVERSAL) {
      const originalId = transaction.reversalTransactionId || '';
      const original = originalId ? transactionsById.get(originalId) : undefined;
      if (!original || original.type === TransactionType.REVERSAL) {
        throw new Error('Estorno financeiro sem transação original autoritativa para o fluxo de caixa');
      }
      if (original.type === TransactionType.INCOME) return { income: 0, expense: amount };
      if (original.type === TransactionType.EXPENSE) return { income: amount, expense: 0 };
      return { income: 0, expense: 0 };
    }

    throw new Error('Tipo de transação financeira não suportado no fluxo de caixa');
  }

  public static async getCashFlowReport(
    companyId: string,
    periodStart: string,
    periodEnd: string,
    txContext?: ITransactionContext
  ): Promise<CashFlowReport> {
    const tenantId = typeof companyId === 'string' ? companyId.trim() : '';
    if (!tenantId) throw new Error('companyId é obrigatório para o fluxo de caixa');

    const start = normalizeDate(periodStart, 'periodStart');
    const end = normalizeDate(periodEnd, 'periodEnd');
    if (start > end) throw new Error('periodStart não pode ser posterior a periodEnd');

    const accountRepo = txContext ? txContext.getAccountRepo() : null;
    if (txContext && !accountRepo?.findAll) {
      throw new Error('Listagem autoritativa de contas financeiras indisponível');
    }

    const [rawAccounts, rawTransactions, rawReceivables, rawPayables] = await Promise.all([
      txContext
        ? accountRepo!.findAll!({ companyId: tenantId })
        : this.accountRepo.findAllForCompany(tenantId),
      txContext
        ? txContext.getTransactionRepo().findAll({ companyId: tenantId })
        : this.txRepo.findAllForCompany(tenantId),
      txContext
        ? txContext.getReceivableRepo().findAll({ companyId: tenantId })
        : this.recRepo.findAllForCompany(tenantId),
      txContext
        ? txContext.getPayableRepo().findAll({ companyId: tenantId })
        : this.payRepo.findAllForCompany(tenantId),
    ]);

    const accounts = rawAccounts.filter((item) => item.companyId === tenantId);
    const transactions = rawTransactions
      .filter((item) => item.companyId === tenantId)
      .sort((a, b) => `${dateKey(a.transactionDate)}:${a.createdAt}:${a.id}`.localeCompare(`${dateKey(b.transactionDate)}:${b.createdAt}:${b.id}`));
    const receivables = rawReceivables.filter((item) => item.companyId === tenantId);
    const payables = rawPayables.filter((item) => item.companyId === tenantId);

    const transactionsById = new Map<string, FinancialTransaction>(
      transactions.map((item): [string, FinancialTransaction] => [item.id, item])
    );

    const openingFromAccounts = roundCurrency(
      accounts.reduce((sum, account) => sum + Number(account.initialBalance || 0), 0)
    );

    let initialCashBalance = openingFromAccounts;
    let totalRealizedIncomes = 0;
    let totalRealizedExpenses = 0;
    const dailyMap = new Map<string, CashFlowDaily>();

    for (const transaction of transactions) {
      const transactionDate = dateKey(transaction.transactionDate);
      if (!DATE_PATTERN.test(transactionDate)) {
        throw new Error('Transação financeira contém data inválida para o fluxo de caixa');
      }
      const movement = this.cashMovement(transaction, transactionsById);

      if (transactionDate < start) {
        initialCashBalance = roundCurrency(initialCashBalance + movement.income - movement.expense);
        continue;
      }
      if (transactionDate > end) continue;

      const daily = dailyMap.get(transactionDate) || emptyDaily(transactionDate);
      daily.realizedIncomes = roundCurrency(daily.realizedIncomes + movement.income);
      daily.realizedExpenses = roundCurrency(daily.realizedExpenses + movement.expense);
      dailyMap.set(transactionDate, daily);
      totalRealizedIncomes = roundCurrency(totalRealizedIncomes + movement.income);
      totalRealizedExpenses = roundCurrency(totalRealizedExpenses + movement.expense);
    }

    const addPrediction = (date: string, amount: number, type: 'INCOME' | 'EXPENSE') => {
      if (!DATE_PATTERN.test(date) || date < start || date > end || amount <= 0) return;
      const daily = dailyMap.get(date) || emptyDaily(date);
      if (type === 'INCOME') daily.predictedIncomes = roundCurrency(daily.predictedIncomes + amount);
      else daily.predictedExpenses = roundCurrency(daily.predictedExpenses + amount);
      dailyMap.set(date, daily);
    };

    for (const receivable of receivables) {
      if (receivable.status === ObligationStatus.PAID || receivable.status === ObligationStatus.CANCELLED) continue;
      addPrediction(dateKey(receivable.dueDate), roundCurrency(Number(receivable.balanceAmount || 0)), 'INCOME');
    }

    for (const payable of payables) {
      if (payable.status === ObligationStatus.PAID || payable.status === ObligationStatus.CANCELLED) continue;
      addPrediction(dateKey(payable.dueDate), roundCurrency(Number(payable.balanceAmount || 0)), 'EXPENSE');
    }

    const dailyFlows = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    let realizedRunning = roundCurrency(initialCashBalance);
    let predictedRunning = roundCurrency(initialCashBalance);

    for (const daily of dailyFlows) {
      daily.openingBalance = realizedRunning;
      daily.realizedIncomes = roundCurrency(daily.realizedIncomes);
      daily.realizedExpenses = roundCurrency(daily.realizedExpenses);
      daily.realizedNet = roundCurrency(daily.realizedIncomes - daily.realizedExpenses);
      realizedRunning = roundCurrency(realizedRunning + daily.realizedNet);
      daily.closingBalance = realizedRunning;
      daily.predictedIncomes = roundCurrency(daily.predictedIncomes);
      daily.predictedExpenses = roundCurrency(daily.predictedExpenses);
      predictedRunning = roundCurrency(
        predictedRunning + daily.realizedNet + daily.predictedIncomes - daily.predictedExpenses
      );
      daily.predictedClosingBalance = predictedRunning;
    }

    const finalRealizedCashBalance = roundCurrency(
      initialCashBalance + totalRealizedIncomes - totalRealizedExpenses
    );

    return {
      periodStart: start,
      periodEnd: end,
      initialCashBalance: roundCurrency(initialCashBalance),
      totalRealizedIncomes: roundCurrency(totalRealizedIncomes),
      totalRealizedExpenses: roundCurrency(totalRealizedExpenses),
      finalRealizedCashBalance,
      dailyFlows,
    };
  }
}
