import {
  calculateRenegotiationDueDate,
  resolveRenegotiationInstallmentFrequency,
} from '../renegotiationSchedule';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected=${String(expected)} actual=${String(actual)}`);
  }
}

function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(message);
}

assertEqual(calculateRenegotiationDueDate('2026-09-15', 1, 'WEEKLY'), '2026-09-15', 'weekly first installment');
assertEqual(calculateRenegotiationDueDate('2026-09-15', 2, 'WEEKLY'), '2026-09-22', 'weekly +7 days');
assertEqual(calculateRenegotiationDueDate('2026-09-15', 3, 'WEEKLY'), '2026-09-29', 'weekly +14 days');

assertEqual(calculateRenegotiationDueDate('2026-09-15', 2, 'BIWEEKLY'), '2026-09-29', 'biweekly +14 days');
assertEqual(calculateRenegotiationDueDate('2026-09-15', 3, 'BIWEEKLY'), '2026-10-13', 'biweekly +28 days');

assertEqual(calculateRenegotiationDueDate('2026-01-31', 1, 'MONTHLY'), '2026-01-31', 'monthly first installment');
assertEqual(calculateRenegotiationDueDate('2026-01-31', 2, 'MONTHLY'), '2026-02-28', 'monthly non-leap clamp');
assertEqual(calculateRenegotiationDueDate('2026-01-31', 3, 'MONTHLY'), '2026-03-31', 'monthly restores original day');
assertEqual(calculateRenegotiationDueDate('2028-01-31', 2, 'MONTHLY'), '2028-02-29', 'monthly leap-year clamp');

assertEqual(resolveRenegotiationInstallmentFrequency(undefined), 'MONTHLY', 'missing frequency backward compatibility');
assertEqual(resolveRenegotiationInstallmentFrequency('WEEKLY'), 'WEEKLY', 'weekly resolution');
assertThrows(() => resolveRenegotiationInstallmentFrequency('INVALID'), 'invalid frequency must fail closed');
assertThrows(() => calculateRenegotiationDueDate('2026-02-30', 1, 'MONTHLY'), 'invalid date must fail closed');
assertThrows(() => calculateRenegotiationDueDate('2026-09-15', 0, 'MONTHLY'), 'invalid installment number must fail closed');

console.log('FINANCE-R1 renegotiation schedule: PASS');
