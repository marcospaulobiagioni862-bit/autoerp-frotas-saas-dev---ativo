import { RecurringFrequency } from '../../../types/enums';
import { advanceNextGenerationDate, calculatePeriodRef, getIsoWeek } from '../RecurringSchedule';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

export function runRecurringScheduleTests(): void {
  assertEqual(getIsoWeek('2026-01-01'), '2026-W01', 'ISO week new year');
  assertEqual(getIsoWeek('2027-01-01'), '2026-W53', 'ISO week cross-year');
  assertEqual(calculatePeriodRef(RecurringFrequency.MONTHLY, '2026-08-19'), '2026-08', 'monthly period');
  assertEqual(calculatePeriodRef(RecurringFrequency.QUARTERLY, '2026-08-19'), '2026-Q3', 'quarterly period');
  assertEqual(calculatePeriodRef(RecurringFrequency.SEMI_ANNUAL, '2026-08-19'), '2026-S2', 'semiannual period');
  assertEqual(advanceNextGenerationDate('2026-01-31', RecurringFrequency.MONTHLY), '2026-02-28', 'month end clamp');
  assertEqual(advanceNextGenerationDate('2024-02-29', RecurringFrequency.ANNUAL), '2025-02-28', 'leap year clamp');
  assertEqual(advanceNextGenerationDate('2026-12-28', RecurringFrequency.WEEKLY), '2027-01-04', 'weekly year boundary');
}

runRecurringScheduleTests();
console.log('RECURRING_SCHEDULE_TESTS_PASS');
