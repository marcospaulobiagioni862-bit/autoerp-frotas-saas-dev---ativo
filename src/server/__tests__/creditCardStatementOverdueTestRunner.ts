import { deriveCreditCardStatementOverdue } from '../creditCardStatementOverdue';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const overdueClosed = deriveCreditCardStatementOverdue(
  { due_date: '2026-08-22', status: 'CLOSED', balance_amount: 400 },
  '2026-08-27'
);
assert(overdueClosed.is_overdue === true && overdueClosed.overdue_days === 5,
  'closed statement with positive balance must be overdue after due date');

const overduePartial = deriveCreditCardStatementOverdue(
  { due_date: '2026-08-26', status: 'PARTIALLY_PAID', balance_amount: 100 },
  '2026-08-27'
);
assert(overduePartial.is_overdue === true && overduePartial.overdue_days === 1,
  'partially paid statement must remain overdue while balance is positive');

const paid = deriveCreditCardStatementOverdue(
  { due_date: '2026-08-01', status: 'PAID', balance_amount: 0 },
  '2026-08-27'
);
assert(paid.is_overdue === false && paid.overdue_days === 0,
  'paid statement must never be reported as overdue');

const dueToday = deriveCreditCardStatementOverdue(
  { due_date: '2026-08-27', status: 'CLOSED', balance_amount: 300 },
  '2026-08-27'
);
assert(dueToday.is_overdue === false && dueToday.overdue_days === 0,
  'statement due today must not be overdue');

const future = deriveCreditCardStatementOverdue(
  { due_date: '2026-08-28', status: 'CLOSED', balance_amount: 300 },
  '2026-08-27'
);
assert(future.is_overdue === false && future.overdue_days === 0,
  'future statement must not be overdue');

console.log('FINANCE-CARD-1E2 overdue derivation regression: PASS');
