import type { TelemetryEventSummary } from '../../api/trackerClient';

export const TELEMETRY_EVENT_FILTERS = ['ALL', 'PENDING', 'COMPLETED', 'ACCEPTED'] as const;

export type TelemetryEventFilter = (typeof TELEMETRY_EVENT_FILTERS)[number];

export type TelemetryEventCounts = Readonly<Record<TelemetryEventFilter, number>>;

export function createTelemetryEventCounts(events: ReadonlyArray<TelemetryEventSummary>): TelemetryEventCounts {
  let pending = 0;
  let completed = 0;
  let accepted = 0;
  for (const event of events) {
    if (event.status === 'ACCEPTED') {
      accepted += 1;
    } else if (event.reviewStatus === 'PENDING') {
      pending += 1;
    } else {
      completed += 1;
    }
  }
  return { ALL: events.length, PENDING: pending, COMPLETED: completed, ACCEPTED: accepted };
}

export function filterTelemetryEvents(
  events: ReadonlyArray<TelemetryEventSummary>,
  filter: TelemetryEventFilter,
): TelemetryEventSummary[] {
  const selected = filter === 'ALL'
    ? [...events]
    : events.filter((event) => {
      if (filter === 'ACCEPTED') return event.status === 'ACCEPTED';
      if (filter === 'PENDING') return event.status === 'QUARANTINED' && event.reviewStatus === 'PENDING';
      return event.status === 'QUARANTINED'
        && (event.reviewStatus === 'ACKNOWLEDGED' || event.reviewStatus === 'DISMISSED');
    });

  if (filter !== 'PENDING') return selected;

  return selected.sort((left, right) => {
    const leftTime = Date.parse(left.occurredAt);
    const rightTime = Date.parse(right.occurredAt);
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    return safeLeft - safeRight || left.id.localeCompare(right.id);
  });
}
