import { projectMaintenanceSla, type MaintenanceSlaStatus } from '../maintenanceSlaAuthority';
import type { MaintenanceTimelineEvent, MaintenanceTimelineEventType } from '../maintenanceTimelineAuthority';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function event(eventType: MaintenanceTimelineEventType, occurredAt: string): MaintenanceTimelineEvent {
  return {
    id: `sla-${eventType}-${occurredAt}`,
    workOrderId: 'work-order-sla-synthetic',
    eventType,
    actorUserId: 'user-sla-synthetic',
    actorName: 'SLA Synthetic User',
    occurredAt,
  };
}

function expectStatus(
  expectedDurationMinutes: number | null,
  events: MaintenanceTimelineEvent[],
  nowIso: string,
  expectedStatus: MaintenanceSlaStatus,
): ReturnType<typeof projectMaintenanceSla> {
  const projection = projectMaintenanceSla(expectedDurationMinutes, events, new Date(nowIso));
  assert(projection.status === expectedStatus, `expected ${expectedStatus}, got ${projection.status}`);
  return projection;
}

function main(): void {
  const entered = event('ENTERED_WORKSHOP', '2026-08-29T10:00:00.000Z');

  const noSla = expectStatus(null, [entered], '2026-08-29T11:00:00.000Z', 'SEM_SLA');
  assert(noSla.differenceMinutes === null && noSla.progressRatio === null, 'SEM_SLA must not invent comparison values');

  const within = expectStatus(120, [entered], '2026-08-29T11:00:00.000Z', 'DENTRO_PRAZO');
  assert(within.elapsedMinutes === 60 && within.differenceMinutes === 60, 'within-SLA projection mismatch');

  const risk = expectStatus(100, [entered], '2026-08-29T11:20:00.000Z', 'EM_RISCO');
  assert(risk.elapsedMinutes === 80 && risk.progressRatio === 0.8, 'risk threshold must be deterministic at 80%');

  const late = expectStatus(60, [entered], '2026-08-29T11:01:00.000Z', 'ATRASADO');
  assert(late.differenceMinutes === -1, 'late difference must be negative');

  const releasedOnTime = event('VEHICLE_RELEASED', '2026-08-29T11:00:00.000Z');
  const completedOnTime = expectStatus(60, [entered, releasedOnTime], '2026-08-29T15:00:00.000Z', 'CONCLUIDO_NO_PRAZO');
  assert(completedOnTime.elapsedMinutes === 60, 'released projection must freeze at persisted release time');

  const releasedLate = event('VEHICLE_RELEASED', '2026-08-29T11:01:00.000Z');
  const completedLate = expectStatus(60, [entered, releasedLate], '2026-08-29T15:00:00.000Z', 'CONCLUIDO_ATRASADO');
  assert(completedLate.elapsedMinutes === 61, 'late released projection mismatch');

  const notEntered = expectStatus(60, [], '2026-08-29T15:00:00.000Z', 'DENTRO_PRAZO');
  assert(notEntered.elapsedMinutes === 0 && notEntered.startedAt === null, 'unstarted SLA must not invent an entry timestamp');

  console.log('MAINT-SLA-1C deterministic SLA regression: PASS');
}

main();
