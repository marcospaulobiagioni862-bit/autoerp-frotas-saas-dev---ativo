import type { FinancialTransaction } from '../../types/entities';

export type TransactionLinkFilter = 'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'UNLINKED';

export interface TransactionFilters {
  searchTerm: string;
  type: string;
  accountId: string;
  link: TransactionLinkFilter;
  startDate: string;
  endDate: string;
}

export function hasInvalidTransactionPeriod(startDate: string, endDate: string): boolean {
  return Boolean(startDate && endDate && startDate > endDate);
}

export function hasActiveTransactionFilters(filters: TransactionFilters): boolean {
  return Boolean(
    filters.searchTerm ||
    filters.type !== 'ALL' ||
    filters.accountId !== 'ALL' ||
    filters.link !== 'ALL' ||
    filters.startDate ||
    filters.endDate
  );
}

export function filterFinancialTransactions(
  transactions: readonly FinancialTransaction[],
  filters: TransactionFilters
): FinancialTransaction[] {
  if (hasInvalidTransactionPeriod(filters.startDate, filters.endDate)) return [];

  const search = filters.searchTerm.trim().toLocaleLowerCase('pt-BR');

  return transactions.filter((transaction) => {
    const searchable = [
      transaction.id,
      transaction.description,
      transaction.financialAccountId,
      transaction.destinationAccountId,
      transaction.receivableId,
      transaction.payableId,
      transaction.vehicleId,
      transaction.driverId,
      transaction.supplierId,
      transaction.reversalTransactionId,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLocaleLowerCase('pt-BR');

    const matchesSearch = !search || searchable.includes(search);
    const matchesType = filters.type === 'ALL' || transaction.type === filters.type;
    const matchesAccount =
      filters.accountId === 'ALL' ||
      transaction.financialAccountId === filters.accountId ||
      transaction.destinationAccountId === filters.accountId;
    const matchesLink =
      filters.link === 'ALL' ||
      (filters.link === 'RECEIVABLE' && Boolean(transaction.receivableId)) ||
      (filters.link === 'PAYABLE' && Boolean(transaction.payableId)) ||
      (filters.link === 'UNLINKED' && !transaction.receivableId && !transaction.payableId);
    const matchesStart = !filters.startDate || transaction.transactionDate >= filters.startDate;
    const matchesEnd = !filters.endDate || transaction.transactionDate <= filters.endDate;

    return matchesSearch && matchesType && matchesAccount && matchesLink && matchesStart && matchesEnd;
  });
}
