import assert from 'node:assert/strict';
import {
  calculateNextKmReadingDate,
  validateKmReadingScheduleRule,
} from '../kmReadingSchedule';

assert.equal(
  calculateNextKmReadingDate('2026-09-07', { frequency:'WEEKLY', weekday:1 }, true),
  '2026-09-07',
  'weekly schedule must include the reference date when requested',
);
assert.equal(
  calculateNextKmReadingDate('2026-09-07', { frequency:'WEEKLY', weekday:1 }, false),
  '2026-09-14',
  'weekly schedule must advance one week after a completed reading',
);
assert.equal(
  calculateNextKmReadingDate('2026-09-07', { frequency:'WEEKLY', weekday:5 }, true),
  '2026-09-11',
  'weekly schedule must resolve the next requested weekday',
);
assert.equal(
  calculateNextKmReadingDate('2026-01-31', { frequency:'MONTHLY', dayOfMonth:31 }, false),
  '2026-02-28',
  'monthly day 31 must clamp to the last valid day',
);
assert.equal(
  calculateNextKmReadingDate('2028-01-31', { frequency:'MONTHLY', dayOfMonth:31 }, false),
  '2028-02-29',
  'monthly schedule must respect leap years',
);
assert.equal(
  calculateNextKmReadingDate('2026-09-15', { frequency:'MONTHLY', dayOfMonth:15 }, true),
  '2026-09-15',
  'monthly schedule may include the reference date',
);
assert.throws(
  () => validateKmReadingScheduleRule({ frequency:'WEEKLY', weekday:0 }),
  /Invalid weekly KM schedule/,
);
assert.throws(
  () => validateKmReadingScheduleRule({ frequency:'MONTHLY', dayOfMonth:32 }),
  /Invalid monthly KM schedule/,
);
assert.throws(
  () => validateKmReadingScheduleRule({ frequency:'WEEKLY', weekday:1, dayOfMonth:1 }),
  /Invalid weekly KM schedule/,
);

console.log('KM reading schedule regressions: PASS');
