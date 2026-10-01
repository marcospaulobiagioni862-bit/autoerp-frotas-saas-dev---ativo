import assert from 'node:assert/strict';
import { addDays, addMonths, calculateNextRecurringDate, formatDateBR, getDaysDiff } from '../date';
import { RecurringFrequency } from '../../../types/enums';

const previous = process.env.TZ;
try {
  for (const zone of ['UTC', 'America/Sao_Paulo', 'America/New_York', 'Pacific/Auckland']) {
    process.env.TZ = zone;
    assert.equal(formatDateBR('2027-01-07'), '07/01/2027');
    assert.equal(addDays('2026-03-08', 1), '2026-03-09');
    assert.equal(addDays('2026-11-01', 1), '2026-11-02');
    assert.equal(addMonths('2026-11-07', 2), '2027-01-07');
    assert.equal(calculateNextRecurringDate('2026-03-08', RecurringFrequency.WEEKLY), '2026-03-15');
    assert.equal(getDaysDiff('2026-03-08', '2026-03-09'), 1);
  }
} finally {
  if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
}
console.log('PASS civil dates: Brazilian display, installment offset and DST across four timezones');
