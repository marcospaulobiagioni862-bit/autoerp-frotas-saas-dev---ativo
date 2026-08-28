import type { CreditCardStatementStatus } from '../../api/creditCardStatementClient';

export type CreditCardStatementBadgeVariant = 'success' | 'warning' | 'danger' | 'info';

export function creditCardStatementStatusVariant(
  status: CreditCardStatementStatus,
  isOverdue: boolean,
): CreditCardStatementBadgeVariant {
  if (status === 'PAID') return 'success';
  if (isOverdue) return 'danger';
  if (status === 'OPEN' || status === 'PARTIALLY_PAID') return 'warning';
  return 'info';
}
