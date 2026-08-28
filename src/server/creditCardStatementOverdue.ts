const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export interface CreditCardStatementOverdueView {
  is_overdue: boolean;
  overdue_days: number;
}

export function deriveCreditCardStatementOverdue(
  statement: { due_date?: unknown; status?: unknown; balance_amount?: unknown },
  asOf = new Date().toISOString().slice(0, 10)
): CreditCardStatementOverdueView {
  if (!validIsoDate(asOf) || !validIsoDate(statement.due_date)) {
    return { is_overdue: false, overdue_days: 0 };
  }

  const status = typeof statement.status === 'string' ? statement.status : '';
  const balance = Number(statement.balance_amount);
  if (!Number.isFinite(balance) || balance <= 0 || status === 'PAID' || statement.due_date >= asOf) {
    return { is_overdue: false, overdue_days: 0 };
  }

  const overdueDays = Math.floor(
    (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${statement.due_date}T00:00:00Z`)) / DAY_MS
  );
  return { is_overdue: overdueDays > 0, overdue_days: Math.max(overdueDays, 0) };
}
