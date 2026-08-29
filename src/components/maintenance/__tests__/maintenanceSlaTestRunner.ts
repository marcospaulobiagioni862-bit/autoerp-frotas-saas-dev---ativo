import assert from 'node:assert/strict';
import { deriveMaintenanceSlaMetrics, formatMaintenanceDuration } from '../maintenanceSla';

const now = '2026-08-29T12:00:00.000Z';

const open = deriveMaintenanceSlaMetrics({ status: 'OPEN', openedAt: '2026-08-29T10:00:00.000Z' }, now);
assert.equal(open.knownDowntimeMs, 2 * 60 * 60 * 1000);
assert.equal(open.waitToStartMs, null);
assert.equal(open.activeWorkMs, null);
assert.equal(open.isFrozen, false);

const inProgress = deriveMaintenanceSlaMetrics({
  status: 'IN_PROGRESS',
  openedAt: '2026-08-29T08:00:00.000Z',
  startedAt: '2026-08-29T09:30:00.000Z',
}, now);
assert.equal(inProgress.waitToStartMs, 90 * 60 * 1000);
assert.equal(inProgress.activeWorkMs, 150 * 60 * 1000);
assert.equal(inProgress.knownDowntimeMs, 4 * 60 * 60 * 1000);
assert.equal(inProgress.isFrozen, false);

const completed = deriveMaintenanceSlaMetrics({
  status: 'COMPLETED',
  openedAt: '2026-08-27T08:00:00.000Z',
  startedAt: '2026-08-27T09:00:00.000Z',
  completedAt: '2026-08-27T11:30:00.000Z',
}, now);
assert.equal(completed.waitToStartMs, 60 * 60 * 1000);
assert.equal(completed.activeWorkMs, 150 * 60 * 1000);
assert.equal(completed.knownDowntimeMs, 210 * 60 * 1000);
assert.equal(completed.isFrozen, true);

const cancelled = deriveMaintenanceSlaMetrics({
  status: 'CANCELLED',
  openedAt: '2026-08-29T08:00:00.000Z',
  cancelledAt: '2026-08-29T09:00:00.000Z',
}, now);
assert.equal(cancelled.knownDowntimeMs, 60 * 60 * 1000);
assert.equal(cancelled.activeWorkMs, null);
assert.equal(cancelled.isFrozen, true);

const invalid = deriveMaintenanceSlaMetrics({ status: 'OPEN', openedAt: 'invalid-date' }, now);
assert.equal(invalid.knownDowntimeMs, null);
assert.equal(formatMaintenanceDuration(null), '—');
assert.equal(formatMaintenanceDuration(90 * 60 * 1000), '1h 30min');
assert.equal(formatMaintenanceDuration(27 * 60 * 60 * 1000), '1d 3h');

console.log('Maintenance SLA derived-time regression: PASS');
