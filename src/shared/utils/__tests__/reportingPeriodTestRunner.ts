import {
  currentReportingMonthRange,
  currentReportingYearRange,
  lastReportingDaysRange,
  localIsoDate,
} from '../reportingPeriod';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected=${String(expected)} actual=${String(actual)}`);
}

const previousTimezone = process.env.TZ;
process.env.TZ = 'America/Sao_Paulo';

const utcAlreadyOctober = new Date('2026-10-01T00:30:00Z');
assertEqual(localIsoDate(utcAlreadyOctober), '2026-09-30', 'local ISO date must remain September in Brazil');
const month = currentReportingMonthRange(utcAlreadyOctober);
assertEqual(month.start, '2026-09-01', 'local current month start');
assertEqual(month.end, '2026-09-30', 'local current month end');

const last30 = lastReportingDaysRange(30, utcAlreadyOctober);
assertEqual(last30.start, '2026-09-01', 'local rolling 30-day start');
assertEqual(last30.end, '2026-09-30', 'local rolling 30-day end');

const year = currentReportingYearRange(utcAlreadyOctober);
assertEqual(year.start, '2026-01-01', 'local year start');
assertEqual(year.end, '2026-12-31', 'local year end');

if (previousTimezone == null) delete process.env.TZ;
else process.env.TZ = previousTimezone;

console.log('DRE local reporting period regression: PASS');
