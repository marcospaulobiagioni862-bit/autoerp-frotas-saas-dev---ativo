import assert from 'node:assert/strict';
import type { FinancialTransaction } from '../../../types/entities';
import { TransactionType } from '../../../types/enums';
import {
  filterFinancialTransactions,
  hasActiveTransactionFilters,
  hasInvalidTransactionPeriod,
  type TransactionFilters,
} from '../transactionFilters';
import fs from 'node:fs';

const transaction = (overrides: Partial<FinancialTransaction>): FinancialTransaction => ({
  id: 'tx-base',
  companyId: 'server-tenant',
  financialAccountId: 'account-1',
  type: TransactionType.INCOME,
  amount: 100,
  paymentMethodId: 'pix',
  transactionDate: '2026-08-10',
  competenceDate: '2026-08-01',
  description: 'Recebimento do contrato',
  isReversed: false,
  createdById: 'server-actor',
  createdAt: '2026-08-10T12:00:00Z',
  updatedAt: '2026-08-10T12:00:00Z',
  ...overrides,
});

const items = [
  transaction({ id: 'tx-ar', receivableId: 'rec-1', driverId: 'driver-1' }),
  transaction({ id: 'tx-ap', type: TransactionType.EXPENSE, payableId: 'pay-1', vehicleId: 'vehicle-1', financialAccountId: 'account-2', transactionDate: '2026-08-20' }),
  transaction({ id: 'tx-transfer', type: TransactionType.TRANSFER, destinationAccountId: 'account-2', transactionDate: '2026-08-25' }),
];

const base: TransactionFilters = { searchTerm: '', type: 'ALL', accountId: 'ALL', link: 'ALL', startDate: '', endDate: '' };
assert.deepEqual(filterFinancialTransactions(items, { ...base, link: 'RECEIVABLE' }).map(x => x.id), ['tx-ar']);
assert.deepEqual(filterFinancialTransactions(items, { ...base, link: 'PAYABLE' }).map(x => x.id), ['tx-ap']);
assert.deepEqual(filterFinancialTransactions(items, { ...base, link: 'UNLINKED' }).map(x => x.id), ['tx-transfer']);
assert.deepEqual(filterFinancialTransactions(items, { ...base, accountId: 'account-2' }).map(x => x.id), ['tx-ap', 'tx-transfer']);
assert.deepEqual(filterFinancialTransactions(items, { ...base, searchTerm: 'VEHICLE-1' }).map(x => x.id), ['tx-ap']);
assert.deepEqual(filterFinancialTransactions(items, { ...base, startDate: '2026-08-15', endDate: '2026-08-22' }).map(x => x.id), ['tx-ap']);
assert.equal(hasInvalidTransactionPeriod('2026-08-20', '2026-08-10'), true);
assert.deepEqual(filterFinancialTransactions(items, { ...base, startDate: '2026-08-20', endDate: '2026-08-10' }), []);
assert.equal(hasActiveTransactionFilters(base), false);
assert.equal(hasActiveTransactionFilters({ ...base, link: 'PAYABLE' }), true);
assert.deepEqual(items.map(x => x.id), ['tx-ar', 'tx-ap', 'tx-transfer']);

const view = fs.readFileSync('src/components/finance/TransactionsView.tsx', 'utf8');
assert.match(view, /filterFinancialTransactions\(transactions, filters\)/);
assert.match(view, /setAccountFilter\('ALL'\)/);
assert.match(view, /setLinkFilter\('ALL'\)/);
assert.match(view, /AR: \{tx\.receivableId\}/);
assert.match(view, /AP: \{tx\.payableId\}/);
assert.doesNotMatch(fs.readFileSync('src/components/finance/transactionFilters.ts', 'utf8'), /fetch\(|companyId|localRepositories/);
console.log('FINANCE-UX-1D transaction filters regression: PASS');
