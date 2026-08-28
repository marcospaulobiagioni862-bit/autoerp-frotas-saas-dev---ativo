import type { FinancialTransaction } from '../../types/entities';
import type { CreditCardProfileSummary, CreditCardStatementSummary } from '../../api/creditCardStatementClient';

const EPSILON = 0.005;

export function isCreditCardStatementPayable(statement: CreditCardStatementSummary): boolean {
  return (statement.status === 'CLOSED' || statement.status === 'PARTIALLY_PAID') && statement.balanceAmount > 0;
}

export function eligibleStatementPaymentTransfers(
  statement: CreditCardStatementSummary,
  profile: CreditCardProfileSummary | undefined,
  transactions: FinancialTransaction[],
): FinancialTransaction[] {
  if (!profile || !isCreditCardStatementPayable(statement)) return [];

  return transactions.filter((transaction) => {
    if (transaction.type !== 'TRANSFER') return false;
    if (transaction.isReversed) return false;
    if (transaction.destinationAccountId !== profile.financialAccountId) return false;
    return Math.abs(transaction.amount - statement.balanceAmount) < EPSILON;
  });
}
