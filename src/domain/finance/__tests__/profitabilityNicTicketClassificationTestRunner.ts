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

const companyId = 'finance-r10-company-a';
const otherCompanyId = 'finance-r10-company-b';
const vehicleId = 'finance-r10-shared-vehicle';
const inPeriod = '2026-08-10T12:00:00.000Z';

const receivables = [
  {
    id: 'r10-rec-owned',
    companyId,
    vehicleId,
    originType: OriginType.CONTRACT_RENT,
    description: 'Locação semanal',
    originalAmount: 200,
    competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
  },
  {
    id: 'r10-rec-foreign',
    companyId: otherCompanyId,
    vehicleId,
    originType: OriginType.CONTRACT_RENT,
    description: 'Locação estrangeira',
    originalAmount: 800,
    competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
  },
];

const payables = [
  {
    id: 'r10-pay-nic-owned',
    companyId,
    vehicleId,
    originType: OriginType.TRAFFIC_TICKET_NIC,
    description: 'Não identificação do condutor',
    originalAmount: 40,
    competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
  },
  {
    id: 'r10-pay-admin-owned',
    companyId,
    vehicleId,
    originType: OriginType.ADMINISTRATIVE,
    description: 'Taxa administrativa operacional',
    originalAmount: 15,
    competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
  },
  {
    id: 'r10-pay-nic-foreign',
    companyId: otherCompanyId,
    vehicleId,
    originType: OriginType.TRAFFIC_TICKET_NIC,
    description: 'Não identificação estrangeira',
    originalAmount: 900,
    competenceDate: inPeriod,
    status: ObligationStatus.PENDING,
  },
];

const transactions = [
  {
    id: 'r10-tx-income-owned',
    companyId,
    vehicleId,
    receivableId: 'r10-rec-owned',
    type: TransactionType.INCOME,
    amount: 200,
    transactionDate: inPeriod,
    description: 'Recebimento locação semanal',
    isReversed: false,
  },
  {
    id: 'r10-tx-nic-owned',
    companyId,
    vehicleId,
    payableId: 'r10-pay-nic-owned',
    type: TransactionType.EXPENSE,
    amount: 40,
    transactionDate: inPeriod,
    description: 'Pagamento por não identificação do condutor',
    isReversed: false,
  },
  {
    id: 'r10-tx-admin-owned',
    companyId,
    vehicleId,
    payableId: 'r10-pay-admin-owned',
    type: TransactionType.EXPENSE,
    amount: 15,
    transactionDate: inPeriod,
    description: 'Taxa administrativa operacional',
    isReversed: false,
  },
  {
    id: 'r10-tx-nic-foreign',
    companyId: otherCompanyId,
    vehicleId,
    payableId: 'r10-pay-nic-foreign',
    type: TransactionType.EXPENSE,
    amount: 900,
    transactionDate: inPeriod,
    description: 'Não identificação estrangeira',
    isReversed: false,
  },
  {
    id: 'r10-tx-income-foreign',
    companyId: otherCompanyId,
    vehicleId,
    receivableId: 'r10-rec-foreign',
    type: TransactionType.INCOME,
    amount: 800,
    transactionDate: inPeriod,
    description: 'Recebimento estrangeiro',
    isReversed: false,
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

async function assertRegime(regime: AccountingRegime): Promise<void> {
  const report = await ProfitabilityService.getVehicleProfitability(
    companyId,
    vehicleId,
    '2026-08-01',
    '2026-08-31',
    regime,
    context
  );

  assertEqual(report.totalIncome, 200, `${regime} tenant income total`);
  assertEqual(report.rentalIncome, 200, `${regime} rental income`);
  assertEqual(report.finesCompanyExpense, 40, `${regime} NIC must classify as company fine expense`);
  assertEqual(report.otherExpense, 15, `${regime} unrelated administrative expense must remain otherExpense`);
  assertEqual(report.totalExpense, 55, `${regime} total expense must preserve amount`);
  assertEqual(report.netProfit, 145, `${regime} net profit must preserve formula`);
}

async function run(): Promise<void> {
  await assertRegime(AccountingRegime.CASH);
  await assertRegime(AccountingRegime.ACCRUAL);
  console.log('FINANCE-R10 NIC profitability classification: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
