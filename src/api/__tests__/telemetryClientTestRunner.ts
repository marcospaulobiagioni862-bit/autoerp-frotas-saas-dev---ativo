import {
  TrackerClient,
  parseTelemetryEventSummary,
  parseTelemetryHealthSummary,
  parseTelemetryObservabilitySummary,
  type TelemetryEventSummary,
  type TelemetryHealthSummary,
  type TelemetryObservabilitySummary,
} from '../trackerClient';
import {
  createTelemetryEventCounts,
  filterTelemetryEvents,
  TELEMETRY_EVENT_FILTERS,
} from '../../components/fleet/telemetryEventTriage';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const accepted: TelemetryEventSummary = {
  id: 'telemetry-event-1',
  trackerId: 'tracker/synthetic',
  sourceEventId: 'synthetic-heartbeat-1',
  eventType: 'HEARTBEAT',
  occurredAt: '2026-08-25T02:00:00.000Z',
  receivedAt: '2026-08-25T02:00:01.000Z',
  status: 'ACCEPTED',
  quarantineReason: null,
  reviewStatus: null,
  reviewReason: null,
  reviewedAt: null,
};
const quarantined: TelemetryEventSummary = {
  ...accepted,
  id: 'telemetry-event-2',
  sourceEventId: 'synthetic-odometer-2',
  eventType: 'ODOMETER',
  status: 'QUARANTINED',
  quarantineReason: 'ODOMETER_REGRESSION',
  reviewStatus: 'PENDING',
};
const reviewed: TelemetryEventSummary = {
  ...quarantined,
  reviewStatus: 'ACKNOWLEDGED',
  reviewReason: 'Divergência confirmada em revisão humana',
  reviewedAt: '2026-08-25T02:10:00.000Z',
};
const health: TelemetryHealthSummary = {
  trackerId: 'tracker/synthetic',
  healthStatus: 'ATTENTION',
  lastCommunicationAt: '2026-08-25T02:00:01.000Z',
  lastAcceptedEventAt: '2026-08-25T02:00:01.000Z',
  latestAcceptedEventType: 'HEARTBEAT',
  lastAcceptedOdometerKm: 1000,
  quarantinedLast24h: 1,
};
const observability: TelemetryObservabilitySummary = {
  trackerId: 'tracker/synthetic',
  retentionDays: 90,
  generatedAt: '2026-08-25T03:00:00.000Z',
  retentionCutoffAt: '2026-05-27T03:00:00.000Z',
  totalEvents: 2,
  acceptedEvents: 1,
  quarantinedEvents: 1,
  pendingReviewEvents: 1,
  retentionEligibleEvents: 0,
  oldestReceivedAt: '2026-08-25T02:00:01.000Z',
  newestReceivedAt: '2026-08-25T02:05:01.000Z',
};

async function main(): Promise<void> {
  assert(parseTelemetryEventSummary(accepted).status === 'ACCEPTED', 'accepted summary rejected');
  assert(parseTelemetryEventSummary(quarantined).reviewStatus === 'PENDING', 'pending quarantine summary rejected');
  assert(parseTelemetryEventSummary(reviewed).reviewStatus === 'ACKNOWLEDGED', 'reviewed quarantine summary rejected');
  assert(parseTelemetryHealthSummary(health).healthStatus === 'ATTENTION', 'health summary rejected');
  assert(parseTelemetryObservabilitySummary(observability).pendingReviewEvents === 1, 'observability summary rejected');

  assert(TELEMETRY_EVENT_FILTERS.join(',') === 'ALL,PENDING,COMPLETED,ACCEPTED', 'telemetry triage allowlist changed');
  const triageEvents: TelemetryEventSummary[] = [
    accepted,
    { ...quarantined, id: 'telemetry-pending-new', occurredAt: '2026-08-25T04:00:00.000Z' },
    { ...quarantined, id: 'telemetry-pending-old', occurredAt: '2026-08-25T01:00:00.000Z' },
    { ...reviewed, id: 'telemetry-reviewed' },
    { ...reviewed, id: 'telemetry-dismissed', reviewStatus: 'DISMISSED', reviewReason: 'Falso positivo confirmado em revisão humana' },
  ];
  const originalTriageOrder = triageEvents.map((event) => event.id).join(',');
  const counts = createTelemetryEventCounts(triageEvents);
  assert(counts.ALL === 5 && counts.PENDING === 2 && counts.COMPLETED === 2 && counts.ACCEPTED === 1, 'telemetry triage counts are inconsistent');
  assert(filterTelemetryEvents(triageEvents, 'ALL').length === 5, 'ALL telemetry triage hid authorized events');
  assert(filterTelemetryEvents(triageEvents, 'ACCEPTED').every((event) => event.status === 'ACCEPTED'), 'ACCEPTED telemetry triage leaked quarantine');
  assert(filterTelemetryEvents(triageEvents, 'COMPLETED').every((event) => event.status === 'QUARANTINED' && event.reviewStatus !== 'PENDING'), 'COMPLETED telemetry triage leaked unresolved events');
  const pendingTriage = filterTelemetryEvents(triageEvents, 'PENDING');
  assert(pendingTriage.length === 2 && pendingTriage[0].id === 'telemetry-pending-old', 'PENDING telemetry triage must show oldest pending first');
  assert(triageEvents.map((event) => event.id).join(',') === originalTriageOrder, 'telemetry triage mutated authorized input');

  for (const unsafeObservability of [
    { ...observability, rawPayload: {} },
    { ...observability, companyId: 'foreign-tenant' },
    { ...observability, totalEvents: 3 },
    { ...observability, retentionDays: 7 },
  ]) {
    let rejected = false;
    try { parseTelemetryObservabilitySummary(unsafeObservability); } catch { rejected = true; }
    assert(rejected, 'unsafe or inconsistent observability summary accepted');
  }
  for (const unsafeHealth of [
    { ...health, rawPayload: {} },
    { ...health, companyId: 'foreign-tenant' },
    { ...health, imei: '111111111111111' },
    { ...health, healthStatus: 'NO_DATA' },
  ]) {
    let rejected = false;
    try { parseTelemetryHealthSummary(unsafeHealth); } catch { rejected = true; }
    assert(rejected, 'unsafe or inconsistent health summary accepted');
  }
  for (const unsafe of [
    { ...accepted, rawPayload: { latitude: -23.5, longitude: -46.6 } },
    { ...accepted, companyId: 'foreign-tenant' },
    { ...accepted, imei: '111111111111111' },
    { ...accepted, reviewedBy: 'internal-user' },
    { ...accepted, status: 'QUARANTINED', quarantineReason: null, reviewStatus: 'PENDING' },
    { ...quarantined, reviewStatus: 'ACKNOWLEDGED', reviewReason: null, reviewedAt: null },
  ]) {
    let rejected = false;
    try { parseTelemetryEventSummary(unsafe); } catch { rejected = true; }
    assert(rejected, 'unsafe or inconsistent telemetry response accepted');
  }

  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input: String(input), init });
      const url = String(input);
      const payload = url.endsWith('/telemetry/health')
        ? { item: health }
        : url.endsWith('/telemetry/observability')
          ? { item: observability }
          : url.endsWith('/review')
            ? { item: reviewed, changed: true }
            : { items: [accepted, quarantined] };
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const listed = await TrackerClient.listTelemetry('tracker/synthetic', 200);
    assert(listed.length === 2, 'telemetry list not parsed');
    const loadedHealth = await TrackerClient.getTelemetryHealth('tracker/synthetic');
    assert(loadedHealth.lastAcceptedOdometerKm === 1000, 'derived odometer not parsed');
    const loadedObservability = await TrackerClient.getTelemetryObservability('tracker/synthetic');
    assert(loadedObservability.totalEvents === 2, 'observability not parsed');
    const result = await TrackerClient.reviewTelemetry('tracker/synthetic', 'event/review', 'ACKNOWLEDGED', 'Divergência confirmada em revisão humana');
    assert(result.changed && result.item.reviewStatus === 'ACKNOWLEDGED', 'telemetry review not parsed');
    assert(requests.length === 4, 'telemetry client emitted unexpected requests');
    assert(requests[0].input === '/api/trackers/tracker%2Fsynthetic/telemetry?limit=50', 'tracker id or safe limit not enforced');
    assert(!requests[0].init?.method || requests[0].init?.method === 'GET', 'telemetry list emitted a mutation');
    assert(requests[0].init?.credentials === 'include' && !requests[0].init?.body, 'telemetry list sent browser authority payload');
    assert(requests[1].input === '/api/trackers/tracker%2Fsynthetic/telemetry/health', 'health tracker id not encoded');
    assert(!requests[1].init?.method || requests[1].init?.method === 'GET', 'health client emitted a mutation');
    assert(requests[1].init?.credentials === 'include' && !requests[1].init?.body, 'health query sent browser authority payload');
    assert(requests[2].input === '/api/trackers/tracker%2Fsynthetic/telemetry/observability', 'observability tracker id not encoded');
    assert(!requests[2].init?.method || requests[2].init?.method === 'GET', 'observability client emitted a mutation');
    assert(requests[2].init?.credentials === 'include' && !requests[2].init?.body, 'observability query sent browser authority payload');
    assert(requests[3].input === '/api/trackers/tracker%2Fsynthetic/telemetry/event%2Freview/review', 'review path identifiers not encoded');
    assert(requests[3].init?.method === 'POST' && requests[3].init?.credentials === 'include', 'review omitted authenticated POST');
    const body = JSON.parse(String(requests[3].init?.body)) as Record<string, unknown>;
    assert(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['decision', 'reason']), 'review sent protected browser authority fields');
    assert(body.decision === 'ACKNOWLEDGED' && body.reason === 'Divergência confirmada em revisão humana', 'review body changed human decision');
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('Telemetry client authority, human review and local triage tests PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
