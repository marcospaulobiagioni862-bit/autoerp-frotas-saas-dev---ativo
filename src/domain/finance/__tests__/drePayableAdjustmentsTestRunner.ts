import { DREService } from '../DREService';
import type { ITransactionContext } from '../ITransactionContext';
import {
  AccountingRegime,
  ObligationStatus,
  OriginType,
  TransactionType,
} from '../../../types/enums';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected=${String(expected)} actual=${String(actual)}`);
  }
}

function makeContext(
  receivables: Array<Record<string, any>>,
  payables: Array<Record<string, any>>,
  transactions: Array<Record<string, any>>
): ITransactionContext {
  return {
    getReceivableRepo: () => ({
      async findAll() { return receivables as any[]; },
    }),
    getPayableRepo: () => ({
      async findAll() { return payables as any[]; },
    }),
    getTransactionRepo: () => ({
      async findAll() { return transactions as any[]; },
    }),
  } as unknown as ITransactionContext;
}

const companyId = 'company-a';
const otherCompanyId = 'company-b';
const inPeriod = '2026-08-10T12:00:00.000Z';
const outOfPeriod = '2026-09-10T12:00:00.000Z';

function makeReceivable(overrides: Record<string, any> = {}) {
  return {
    id: 'ar-1',
    companyId,
    originType: OriginType.CONTRACT_RENT,
    originId: 'contract-1',
    categoryId: 'income',
    description: 'Aluguel',
    originalAmount: 1000,
    discountAmount: 2,
    fineAmount: 10,
    interestAmount: 5,
    updatedAmount: 1013,
    paidAmount: 0,
    balanceAmount: 1013,
    dueDate: inPeriod,
    competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
    idempotencyKey: 'ar-1',
    createdAt: inPeriod,
    updatedAt: inPeriod,
    ...overrides,
  };
}

function makePayable(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    companyId,
    originType: OriginType.MAINTENANCE,
    originId: id,
    categoryId: 'expense',
    description: 'Manutenção',
    originalAmount: 200,
    discountAmount: 3,
    fineAmount: 8,
    interestAmount: 4,
    updatedAmount: 209,
    paidAmount: 0,
    balanceAmount: 209,
    dueDate: inPeriod,
    competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
    idempotencyKey: id,
    createdAt: inPeriod,
    updatedAt: inPeriod,
    ...overrides,
  };
}

async function run(): Promise<void> {
  const receivables = [
    makeReceivable(),
    makeReceivable({ id: 'ar-other', companyId: otherCompanyId, originalAmount: 9000, fineAmount: 900, interestAmount: 900, discountAmount: 0 }),
  ];

  const payables = [
    makePayable('ap-main'),
    makePayable('ap-cancelled', { status: ObligationStatus.CANCELLED, fineAmount: 500, interestAmount: 500, discountAmount: 0 }),
    makePayable('ap-out', { competenceDate: outOfPeriod, dueDate: outOfPeriod, fineAmount: 400, interestAmount: 400, discountAmount: 0 }),
    makePayable('ap-other-tenant', { companyId: otherCompanyId, fineAmount: 300, interestAmount: 300, discountAmount: 0 }),
    makePayable('ap-deposit', {
      originType: OriginType.SECURITY_DEPOSIT,
      description: 'Caução contratual',
      originalAmount: 500,
      fineAmount: 100,
      interestAmount: 100,
      discountAmount: 0,
      updatedAmount: 700,
    }),
  ];

  const transactions = [
    {
      id: 'tx-income', companyId, type: TransactionType.INCOME, amount: 1013,
      transactionDate: inPeriod, competenceDate: inPeriod, description: 'Recebimento aluguel', isReversed: false,
    },
    {
      id: 'tx-expense', companyId, payableId: 'ap-main', type: TransactionType.EXPENSE, amount: 209,
      transactionDate: inPeriod, competenceDate: inPeriod, description: 'Pagamento manutenção', isReversed: false,
    },
  ].map((item) => ({
    financialAccountId: 'acc-1',
    paymentMethodId: 'pm-1',
    createdById: 'user-1',
    createdAt: inPeriod,
    updatedAt: inPeriod,
    ...item,
  }));

  const context = makeContext(receivables, payables, transactions);

  const accrual = await DREService.getDREReport(
    companyId,
    '2026-08-01',
    '2026-08-31',
    AccountingRegime.ACCRUAL,
    context
  );

  assertEqual(accrual.grossRevenue.amount, 1000, 'ACCRUAL gross revenue must use original receivable amount');
  assertEqual(accrual.directCosts.amount, 200, 'ACCRUAL direct costs must use original payable amount only');
  assertEqual(accrual.financialResult.amount, 4, 'ACCRUAL financial result must mirror receivable and payable adjustments');
  assertEqual(accrual.netIncome.amount, 804, 'ACCRUAL net income must include payable financial adjustments exactly once');
  assertEqual(accrual.breakdown?.maintenanceCosts, 200, 'FINANCE-R6 breakdown must remain based on original payable cost');

  const cash = await DREService.getDREReport(
    companyId,
    '2026-08-01',
    '2026-08-31',
    AccountingRegime.CASH,
    context
  );

  assertEqual(cash.grossRevenue.amount, 1013, 'CASH revenue must remain based on actual transaction amount');
  assertEqual(cash.directCosts.amount, 209, 'CASH expense must remain based on actual transaction amount');
  assertEqual(cash.financialResult.amount, 0, 'CASH must not double-count stored payable/receivable adjustments');
  assertEqual(cash.netIncome.amount, 804, 'CASH net income must reflect actual cash movements once');
  assertEqual(cash.breakdown?.maintenanceCosts, 209, 'CASH breakdown must remain based on actual linked payment amount');

  console.log('FINANCE-R7 payable financial adjustments: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
