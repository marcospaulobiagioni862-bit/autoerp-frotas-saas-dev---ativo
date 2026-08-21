import { ProfitabilityService } from '../ProfitabilityService';
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

const companyId = 'company-a';
const otherCompanyId = 'company-b';
const vehicleId = 'vehicle-shared';
const inPeriod = '2026-08-10T12:00:00.000Z';

const receivables = [
  {
    id: 'rec-owned', companyId, vehicleId, originType: OriginType.CONTRACT_RENT,
    description: 'Aluguel', originalAmount: 100, competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
  },
  {
    id: 'rec-foreign', companyId: otherCompanyId, vehicleId, originType: OriginType.KM_EXCESS,
    description: 'Excesso KM estrangeiro', originalAmount: 900, competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
  },
];

const payables = [
  {
    id: 'pay-owned', companyId, vehicleId, originType: OriginType.MAINTENANCE,
    description: 'Manutenção', originalAmount: 30, competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
  },
  {
    id: 'pay-foreign', companyId: otherCompanyId, vehicleId, originType: OriginType.INSURANCE,
    description: 'Seguro estrangeiro', originalAmount: 800, competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
  },
];

const transactions = [
  {
    id: 'tx-owned-income', companyId, vehicleId, receivableId: 'rec-owned',
    type: TransactionType.INCOME, amount: 100, transactionDate: inPeriod,
    description: 'Aluguel recebido', isReversed: false,
  },
  {
    id: 'tx-owned-expense', companyId, vehicleId, payableId: 'pay-owned',
    type: TransactionType.EXPENSE, amount: 30, transactionDate: inPeriod,
    description: 'Pagamento manutenção', isReversed: false,
  },
  {
    id: 'tx-foreign-income', companyId: otherCompanyId, vehicleId, receivableId: 'rec-foreign',
    type: TransactionType.INCOME, amount: 900, transactionDate: inPeriod,
    description: 'Excesso KM estrangeiro', isReversed: false,
  },
  {
    id: 'tx-foreign-expense', companyId: otherCompanyId, vehicleId, payableId: 'pay-foreign',
    type: TransactionType.EXPENSE, amount: 800, transactionDate: inPeriod,
    description: 'Seguro estrangeiro', isReversed: false,
  },
];

const context = {
  getTransactionRepo: () => ({
    async findAll() { return transactions as any[]; },
  }),
  getPayableRepo: () => ({
    async findAll() { return payables as any[]; },
  }),
  getReceivableRepo: () => ({
    async findAll() { return receivables as any[]; },
  }),
} as unknown as ITransactionContext;

async function run(): Promise<void> {
  const cash = await ProfitabilityService.getVehicleProfitability(
    companyId,
    vehicleId,
    '2026-08-01',
    '2026-08-31',
    AccountingRegime.CASH,
    context
  );

  assertEqual(cash.totalIncome, 100, 'CASH must ignore other-company income');
  assertEqual(cash.rentalIncome, 100, 'CASH owned rental income must remain');
  assertEqual(cash.kmExcessIncome, 0, 'CASH foreign receivable must not influence classification');
  assertEqual(cash.totalExpense, 30, 'CASH must ignore other-company expense');
  assertEqual(cash.maintenanceExpense, 30, 'CASH owned maintenance expense must remain');
  assertEqual(cash.insuranceExpense, 0, 'CASH foreign payable must not influence classification');
  assertEqual(cash.netProfit, 70, 'CASH net profit must use tenant-owned movements only');

  const accrual = await ProfitabilityService.getVehicleProfitability(
    companyId,
    vehicleId,
    '2026-08-01',
    '2026-08-31',
    AccountingRegime.ACCRUAL,
    context
  );

  assertEqual(accrual.totalIncome, 100, 'ACCRUAL must ignore other-company receivable');
  assertEqual(accrual.rentalIncome, 100, 'ACCRUAL owned rental must remain');
  assertEqual(accrual.kmExcessIncome, 0, 'ACCRUAL foreign KM excess must be excluded');
  assertEqual(accrual.totalExpense, 30, 'ACCRUAL must ignore other-company payable');
  assertEqual(accrual.maintenanceExpense, 30, 'ACCRUAL owned maintenance must remain');
  assertEqual(accrual.insuranceExpense, 0, 'ACCRUAL foreign insurance must be excluded');
  assertEqual(accrual.netProfit, 70, 'ACCRUAL net profit must use tenant-owned obligations only');

  console.log('FINANCE-R9 profitability tenant isolation: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
