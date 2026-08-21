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
  companyId: string,
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

const receivables = [
  {
    id: 'ar-rent', companyId, originType: OriginType.CONTRACT_RENT, originId: 'contract-1',
    categoryId: 'cat-income', description: 'Aluguel', originalAmount: 1000,
    discountAmount: 0, fineAmount: 0, interestAmount: 0, updatedAmount: 1000,
    paidAmount: 0, balanceAmount: 1000, dueDate: inPeriod, competenceDate: inPeriod,
    status: ObligationStatus.PENDING, idempotencyKey: 'ar-rent', createdAt: inPeriod, updatedAt: inPeriod,
  },
  {
    id: 'ar-other-tenant', companyId: otherCompanyId, originType: OriginType.CONTRACT_RENT, originId: 'contract-x',
    categoryId: 'cat-income', description: 'Other tenant rent', originalAmount: 9000,
    discountAmount: 0, fineAmount: 0, interestAmount: 0, updatedAmount: 9000,
    paidAmount: 0, balanceAmount: 9000, dueDate: inPeriod, competenceDate: inPeriod,
    status: ObligationStatus.PENDING, idempotencyKey: 'ar-other', createdAt: inPeriod, updatedAt: inPeriod,
  },
];

const payables = [
  { id: 'ap-maint', companyId, originType: OriginType.MAINTENANCE, originalAmount: 120.10, competenceDate: inPeriod, status: ObligationStatus.PENDING, description: 'Manutenção' },
  { id: 'ap-ins', companyId, originType: OriginType.INSURANCE, originalAmount: 80, competenceDate: inPeriod, status: ObligationStatus.PENDING, description: 'Seguro' },
  { id: 'ap-track', companyId, originType: OriginType.TRACKER, originalAmount: 30, competenceDate: inPeriod, status: ObligationStatus.PENDING, description: 'Rastreador' },
  { id: 'ap-ticket', companyId, originType: OriginType.TRAFFIC_TICKET_COMPANY, originalAmount: 50, competenceDate: inPeriod, status: ObligationStatus.PENDING, description: 'Multa empresa' },
  { id: 'ap-nic', companyId, originType: OriginType.TRAFFIC_TICKET_NIC, originalAmount: 25, competenceDate: inPeriod, status: ObligationStatus.PENDING, description: 'NIC' },
  { id: 'ap-doc', companyId, originType: OriginType.DOCUMENTATION, originalAmount: 20, competenceDate: inPeriod, status: ObligationStatus.PENDING, description: 'Licenciamento' },
  { id: 'ap-cancelled', companyId, originType: OriginType.MAINTENANCE, originalAmount: 999, competenceDate: inPeriod, status: ObligationStatus.CANCELLED, description: 'Cancelada' },
  { id: 'ap-out', companyId, originType: OriginType.MAINTENANCE, originalAmount: 777, competenceDate: outOfPeriod, status: ObligationStatus.PENDING, description: 'Fora do período' },
  { id: 'ap-other-tenant', companyId: otherCompanyId, originType: OriginType.MAINTENANCE, originalAmount: 888, competenceDate: inPeriod, status: ObligationStatus.PENDING, description: 'Outro tenant' },
  { id: 'ap-deposit', companyId, originType: OriginType.SECURITY_DEPOSIT, originalAmount: 500, competenceDate: inPeriod, status: ObligationStatus.PENDING, description: 'Caução contratual' },
].map((item) => ({
  originId: item.id,
  categoryId: 'cat-expense',
  discountAmount: 0,
  fineAmount: 0,
  interestAmount: 0,
  updatedAmount: item.originalAmount,
  paidAmount: 0,
  balanceAmount: item.originalAmount,
  dueDate: item.competenceDate,
  idempotencyKey: item.id,
  createdAt: inPeriod,
  updatedAt: inPeriod,
  ...item,
}));

const transactions = [
  { id: 'tx-income', companyId, type: TransactionType.INCOME, amount: 1000, transactionDate: inPeriod, description: 'Aluguel recebido', isReversed: false },
  { id: 'tx-maint', companyId, type: TransactionType.EXPENSE, amount: 50, payableId: 'ap-maint', transactionDate: inPeriod, description: 'Pagamento manutenção parcial', isReversed: false },
  { id: 'tx-ins', companyId, type: TransactionType.EXPENSE, amount: 20, payableId: 'ap-ins', transactionDate: inPeriod, description: 'Pagamento seguro parcial', isReversed: false },
  { id: 'tx-track', companyId, type: TransactionType.EXPENSE, amount: 10, payableId: 'ap-track', transactionDate: inPeriod, description: 'Pagamento rastreador parcial', isReversed: false },
  { id: 'tx-ticket', companyId, type: TransactionType.EXPENSE, amount: 25, payableId: 'ap-ticket', transactionDate: inPeriod, description: 'Pagamento multa', isReversed: false },
  { id: 'tx-nic', companyId, type: TransactionType.EXPENSE, amount: 5, payableId: 'ap-nic', transactionDate: inPeriod, description: 'Pagamento NIC', isReversed: false },
  { id: 'tx-doc', companyId, type: TransactionType.EXPENSE, amount: 15, payableId: 'ap-doc', transactionDate: inPeriod, description: 'Pagamento documento', isReversed: false },
  { id: 'tx-unlinked', companyId, type: TransactionType.EXPENSE, amount: 40, transactionDate: inPeriod, description: 'Despesa sem payable', isReversed: false },
  { id: 'tx-reversed', companyId, type: TransactionType.EXPENSE, amount: 999, payableId: 'ap-maint', transactionDate: inPeriod, description: 'Estornada', isReversed: true },
  { id: 'tx-out', companyId, type: TransactionType.EXPENSE, amount: 888, payableId: 'ap-maint', transactionDate: outOfPeriod, description: 'Fora do período', isReversed: false },
  { id: 'tx-other-tenant', companyId: otherCompanyId, type: TransactionType.EXPENSE, amount: 777, payableId: 'ap-other-tenant', transactionDate: inPeriod, description: 'Outro tenant', isReversed: false },
  { id: 'tx-deposit', companyId, type: TransactionType.INCOME, amount: 500, transactionDate: inPeriod, description: 'Recebimento caução', isReversed: false },
].map((item) => ({
  financialAccountId: 'acc-1', paymentMethodId: 'pm-1', competenceDate: item.transactionDate,
  createdById: 'user-1', createdAt: inPeriod, updatedAt: inPeriod,
  ...item,
}));

async function run(): Promise<void> {
  const context = makeContext(companyId, receivables, payables, transactions);

  const accrual = await DREService.getDREReport(
    companyId,
    '2026-08-01',
    '2026-08-31',
    AccountingRegime.ACCRUAL,
    context
  );

  assertEqual(accrual.grossRevenue.amount, 1000, 'ACCRUAL gross revenue must be tenant-scoped');
  assertEqual(accrual.directCosts.amount, 325.1, 'ACCRUAL direct costs must keep all real in-period expenses');
  assertEqual(accrual.breakdown?.maintenanceCosts, 120.1, 'ACCRUAL maintenance must use real payable amount');
  assertEqual(accrual.breakdown?.insuranceCosts, 80, 'ACCRUAL insurance must use real payable amount');
  assertEqual(accrual.breakdown?.trackerCosts, 30, 'ACCRUAL tracker must use real payable amount');
  assertEqual(accrual.breakdown?.trafficTicketCosts, 75, 'ACCRUAL company/NIC tickets must use real payable amounts');

  const namedAccrual =
    Number(accrual.breakdown?.maintenanceCosts || 0) +
    Number(accrual.breakdown?.insuranceCosts || 0) +
    Number(accrual.breakdown?.trackerCosts || 0) +
    Number(accrual.breakdown?.trafficTicketCosts || 0);
  assertEqual(namedAccrual, 305.1, 'ACCRUAL named buckets must not absorb documentation expense');

  const cash = await DREService.getDREReport(
    companyId,
    '2026-08-01',
    '2026-08-31',
    AccountingRegime.CASH,
    context
  );

  assertEqual(cash.grossRevenue.amount, 1000, 'CASH gross revenue must exclude deposit and other tenant');
  assertEqual(cash.directCosts.amount, 165, 'CASH direct costs must use actual non-reversed cash movements');
  assertEqual(cash.breakdown?.maintenanceCosts, 50, 'CASH maintenance must use actual partial payment');
  assertEqual(cash.breakdown?.insuranceCosts, 20, 'CASH insurance must use actual cash amount');
  assertEqual(cash.breakdown?.trackerCosts, 10, 'CASH tracker must use actual cash amount');
  assertEqual(cash.breakdown?.trafficTicketCosts, 30, 'CASH company/NIC tickets must use actual cash amounts');

  const namedCash =
    Number(cash.breakdown?.maintenanceCosts || 0) +
    Number(cash.breakdown?.insuranceCosts || 0) +
    Number(cash.breakdown?.trackerCosts || 0) +
    Number(cash.breakdown?.trafficTicketCosts || 0);
  assertEqual(namedCash, 110, 'CASH named buckets must not absorb documentation or unlinked expense');

  console.log('FINANCE-R6 DRE evidence-backed breakdown: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
