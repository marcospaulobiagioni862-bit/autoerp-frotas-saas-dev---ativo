import {
  assertMaintenanceTimelineTransition,
  summarizeMaintenanceTimeline,
  type MaintenanceTimelineEvent,
  type MaintenanceTimelineEventType,
} from '../maintenanceTimelineAuthority';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function event(eventType: MaintenanceTimelineEventType, occurredAt: string): MaintenanceTimelineEvent {
  return {
    id: `event-${eventType}-${occurredAt}`,
    workOrderId: 'work-order-synthetic',
    eventType,
    actorUserId: 'user-synthetic',
    actorName: 'Synthetic User',
    occurredAt,
  };
}

function assertAllowed(previous: MaintenanceTimelineEventType | null, next: MaintenanceTimelineEventType): void {
  assertMaintenanceTimelineTransition(previous, next);
}

function assertRejected(previous: MaintenanceTimelineEventType | null, next: MaintenanceTimelineEventType): void {
  let rejected = false;
  try {
    assertMaintenanceTimelineTransition(previous, next);
  } catch {
    rejected = true;
  }
  assert(rejected, `expected ${previous ?? 'START'} -> ${next} to be rejected`);
}

function testSequence(): void {
  assertAllowed(null, 'ENTERED_WORKSHOP');
  assertAllowed('ENTERED_WORKSHOP', 'WORK_STARTED');
  assertAllowed('WORK_STARTED', 'WAITING_PARTS');
  assertAllowed('WAITING_PARTS', 'WORK_RESUMED');
  assertAllowed('WORK_RESUMED', 'WAITING_APPROVAL');
  assertAllowed('WAITING_APPROVAL', 'WORK_RESUMED');
  assertAllowed('WORK_RESUMED', 'TECHNICALLY_COMPLETED');
  assertAllowed('TECHNICALLY_COMPLETED', 'VEHICLE_RELEASED');

  assertRejected(null, 'WORK_STARTED');
  assertRejected('ENTERED_WORKSHOP', 'VEHICLE_RELEASED');
  assertRejected('WAITING_PARTS', 'TECHNICALLY_COMPLETED');
  assertRejected('TECHNICALLY_COMPLETED', 'WORK_RESUMED');
  assertRejected('VEHICLE_RELEASED', 'WORK_STARTED');
}

function testPersistedIntervalsOnly(): void {
  const timeline: MaintenanceTimelineEvent[] = [
    event('ENTERED_WORKSHOP', '2026-08-29T10:00:00.000Z'),
    event('WORK_STARTED', '2026-08-29T10:10:00.000Z'),
    event('WAITING_PARTS', '2026-08-29T10:40:00.000Z'),
    event('WORK_RESUMED', '2026-08-29T11:10:00.000Z'),
    event('WAITING_APPROVAL', '2026-08-29T11:30:00.000Z'),
    event('WORK_RESUMED', '2026-08-29T11:45:00.000Z'),
    event('TECHNICALLY_COMPLETED', '2026-08-29T12:15:00.000Z'),
    event('VEHICLE_RELEASED', '2026-08-29T12:30:00.000Z'),
  ];

  const summary = summarizeMaintenanceTimeline(timeline);
  assert(summary.activeWorkMs === 80 * 60_000, `active work mismatch: ${summary.activeWorkMs}`);
  assert(summary.waitingPartsMs === 30 * 60_000, `parts wait mismatch: ${summary.waitingPartsMs}`);
  assert(summary.waitingApprovalMs === 15 * 60_000, `approval wait mismatch: ${summary.waitingApprovalMs}`);
  assert(summary.totalElapsedMs === 150 * 60_000, `elapsed mismatch: ${summary.totalElapsedMs}`);
  assert(summary.intervals.length === 5, `expected five closed intervals, got ${summary.intervals.length}`);

  const unfinished = summarizeMaintenanceTimeline([
    event('ENTERED_WORKSHOP', '2026-08-29T10:00:00.000Z'),
    event('WORK_STARTED', '2026-08-29T10:10:00.000Z'),
    event('WAITING_PARTS', '2026-08-29T10:40:00.000Z'),
  ]);
  assert(unfinished.totalElapsedMs === null, 'unfinished timeline must not infer vehicle release time');
  assert(unfinished.activeWorkMs === 30 * 60_000, 'closed active interval should still be measurable');
  assert(unfinished.waitingPartsMs === 0, 'open wait must not invent an ending timestamp');
}

function main(): void {
  testSequence();
  testPersistedIntervalsOnly();
  console.log('MAINT-SLA-1B timeline regression: PASS');
}

main();
