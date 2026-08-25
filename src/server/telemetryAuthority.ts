import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

export class TelemetryValidationError extends Error {}
export class TelemetryNotFoundError extends Error {}

export type TelemetryEventType = 'POSITION' | 'ODOMETER' | 'HEARTBEAT';
export interface IngestTelemetryInput {
  sourceEventId: string;
  eventType: TelemetryEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
  synthetic: true;
}
export interface TelemetryEventView {
  id: string;
  sourceEventId: string;
  eventType: TelemetryEventType;
  status: 'ACCEPTED' | 'QUARANTINED';
  quarantineReason?: string;
  receivedAt: string;
  occurredAt?: string;
  odometerKm?: number;
  batteryPercent?: number;
  signalPercent?: number;
  speedKph?: number;
  hasPosition: boolean;
}

const EVENT_TYPES = new Set<TelemetryEventType>(['POSITION', 'ODOMETER', 'HEARTBEAT']);
const PAYLOAD_KEYS: Record<TelemetryEventType, Set<string>> = {
  POSITION: new Set(['imei', 'latitude', 'longitude', 'speedKph']),
  ODOMETER: new Set(['imei', 'odometerKm']),
  HEARTBEAT: new Set(['imei', 'batteryPercent', 'signalPercent']),
};
function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }
function text(value: unknown, field: string, max = 160): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) throw new TelemetryValidationError(`Invalid ${field}`);
  return normalized;
}
function finite(value: unknown, field: string, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new TelemetryValidationError(`Invalid ${field}`);
  return number;
}
function optionalFinite(value: unknown, field: string, min: number, max: number): number | undefined {
  return value === undefined ? undefined : finite(value, field, min, max);
}
function exactPayload(eventType: TelemetryEventType, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TelemetryValidationError('Invalid payload');
  const payload = value as Record<string, unknown>;
  for (const key of Object.keys(payload)) if (!PAYLOAD_KEYS[eventType].has(key)) throw new TelemetryValidationError(`Forbidden payload field: ${key}`);
  const normalized: Record<string, unknown> = {};
  const imei = text(payload.imei, 'imei', 15).replace(/\D/g, '');
  if (!/^\d{15}$/.test(imei)) throw new TelemetryValidationError('Invalid imei');
  normalized.imei = imei;
  if (eventType === 'POSITION') {
    normalized.latitude = finite(payload.latitude, 'latitude', -90, 90);
    normalized.longitude = finite(payload.longitude, 'longitude', -180, 180);
    const speed = optionalFinite(payload.speedKph, 'speedKph', 0, 500);
    if (speed !== undefined) normalized.speedKph = speed;
  } else if (eventType === 'ODOMETER') {
    normalized.odometerKm = finite(payload.odometerKm, 'odometerKm', 0, 99999999);
  } else {
    const battery = optionalFinite(payload.batteryPercent, 'batteryPercent', 0, 100);
    const signal = optionalFinite(payload.signalPercent, 'signalPercent', 0, 100);
    if (battery !== undefined) normalized.batteryPercent = battery;
    if (signal !== undefined) normalized.signalPercent = signal;
  }
  return normalized;
}
function view(row: any): TelemetryEventView {
  return {
    id: String(row.id), sourceEventId: String(row.source_event_id), eventType: String(row.event_type) as TelemetryEventType,
    status: String(row.status) as TelemetryEventView['status'],
    quarantineReason: row.quarantine_reason ? String(row.quarantine_reason) : undefined,
    receivedAt: new Date(row.received_at).toISOString(), occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : undefined,
    odometerKm: row.odometer_km === null || row.odometer_km === undefined ? undefined : Number(row.odometer_km),
    batteryPercent: row.battery_percent === null || row.battery_percent === undefined ? undefined : Number(row.battery_percent),
    signalPercent: row.signal_percent === null || row.signal_percent === undefined ? undefined : Number(row.signal_percent),
    speedKph: row.speed_kph === null || row.speed_kph === undefined ? undefined : Number(row.speed_kph),
    hasPosition: Boolean(row.has_position),
  };
}
function maxJumpKm(): number {
  const configured = Number(process.env.TELEMETRY_ODOMETER_MAX_JUMP_KM || 5000);
  return Number.isFinite(configured) && configured >= 1 && configured <= 100000 ? configured : 5000;
}

export class TelemetryAuthorityService {
  static ingest(principal: AuthenticatedPrincipal, trackerIdInput: string, input: IngestTelemetryInput): Promise<{ item: TelemetryEventView; replayed: boolean }> {
    return UnitOfWork.run(principal.companyId, async (tx: any) => {
      const raw = tx.getRawTransaction?.(); if (!raw) throw new Error('Telemetry persistence unavailable');
      const trackerId = text(trackerIdInput, 'trackerId');
      const sourceEventId = text(input.sourceEventId, 'sourceEventId');
      if (!/^[A-Za-z0-9._:-]+$/.test(sourceEventId)) throw new TelemetryValidationError('Invalid sourceEventId');
      if (input.synthetic !== true) throw new TelemetryValidationError('Only synthetic events are enabled');
      const eventType = String(input.eventType || '').toUpperCase() as TelemetryEventType;
      if (!EVENT_TYPES.has(eventType)) throw new TelemetryValidationError('Invalid eventType');
      const payload = exactPayload(eventType, input.payload);
      if (typeof input.occurredAt !== 'string' || input.occurredAt.length > 100) throw new TelemetryValidationError('Invalid occurredAt');
      const tracker = rows(await raw.execute(sql`SELECT id, imei, status FROM trackers WHERE company_id=${principal.companyId} AND id=${trackerId} LIMIT 1 FOR UPDATE`))[0];
      if (!tracker || tracker.status !== 'ACTIVE') throw new TelemetryNotFoundError('Rastreador ativo não encontrado');

      const existing = rows(await raw.execute(sql`SELECT id, source_event_id, event_type, status, quarantine_reason, received_at, occurred_at, odometer_km, battery_percent, signal_percent, speed_kph, has_position FROM telemetry_events WHERE company_id=${principal.companyId} AND tracker_id=${trackerId} AND source_event_id=${sourceEventId} LIMIT 1`))[0];
      if (existing) return { item: view(existing), replayed: true };

      const receivedAt = new Date();
      const parsed = typeof input.occurredAt === 'string' ? new Date(input.occurredAt) : new Date(Number.NaN);
      const validTimestamp = Number.isFinite(parsed.getTime());
      const occurredAt = validTimestamp ? parsed : null;
      const latest = rows(await raw.execute(sql`SELECT occurred_at, odometer_km FROM telemetry_events WHERE company_id=${principal.companyId} AND tracker_id=${trackerId} AND event_type=${eventType} AND status='ACCEPTED' AND occurred_at IS NOT NULL ORDER BY occurred_at DESC, received_at DESC LIMIT 1`))[0];
      let quarantineReason: string | undefined;
      if (String(payload.imei) !== String(tracker.imei || '')) quarantineReason = 'DEVICE_MISMATCH';
      else if (!validTimestamp) quarantineReason = 'TIMESTAMP_INVALID';
      else if (parsed.getTime() > receivedAt.getTime() + 5 * 60_000) quarantineReason = 'TIMESTAMP_FUTURE';
      else if (eventType === 'ODOMETER' && latest?.odometer_km !== null && latest?.odometer_km !== undefined && Number(payload.odometerKm) < Number(latest.odometer_km)) quarantineReason = 'ODOMETER_REGRESSION';
      else if (eventType === 'ODOMETER' && latest?.odometer_km !== null && latest?.odometer_km !== undefined && Number(payload.odometerKm) - Number(latest.odometer_km) > maxJumpKm()) quarantineReason = 'ODOMETER_JUMP';
      else if (latest?.occurred_at && parsed.getTime() < new Date(latest.occurred_at).getTime()) quarantineReason = 'OUT_OF_SEQUENCE';

      const status = quarantineReason ? 'QUARANTINED' : 'ACCEPTED';
      const id = `tev_${randomUUID().replace(/-/g, '')}`;
      const payloadJson = JSON.stringify(payload);
      const payloadHash = createHash('sha256').update(payloadJson).digest('hex');
      const inserted = rows(await raw.execute(sql`
        INSERT INTO telemetry_events (
          id, company_id, tracker_id, source_event_id, received_at, occurred_at, raw_occurred_at, event_type,
          raw_payload, payload_sha256, status, quarantine_reason, ingested_by, is_synthetic,
          odometer_km, battery_percent, signal_percent, speed_kph, has_position
        ) VALUES (
          ${id}, ${principal.companyId}, ${trackerId}, ${sourceEventId}, ${receivedAt.toISOString()}, ${occurredAt?.toISOString() || null}, ${String(input.occurredAt || '')}, ${eventType},
          CAST(${payloadJson} AS jsonb), ${payloadHash}, ${status}, ${quarantineReason || null}, ${principal.userId}, true,
          ${eventType === 'ODOMETER' ? Number(payload.odometerKm) : null}, ${eventType === 'HEARTBEAT' ? (payload.batteryPercent as number | undefined) ?? null : null},
          ${eventType === 'HEARTBEAT' ? (payload.signalPercent as number | undefined) ?? null : null}, ${eventType === 'POSITION' ? (payload.speedKph as number | undefined) ?? null : null}, ${eventType === 'POSITION'}
        ) ON CONFLICT (company_id, tracker_id, source_event_id) DO NOTHING
        RETURNING id, source_event_id, event_type, status, quarantine_reason, received_at, occurred_at, odometer_km, battery_percent, signal_percent, speed_kph, has_position
      `));
      if (!inserted[0]) {
        const replay = rows(await raw.execute(sql`SELECT id, source_event_id, event_type, status, quarantine_reason, received_at, occurred_at, odometer_km, battery_percent, signal_percent, speed_kph, has_position FROM telemetry_events WHERE company_id=${principal.companyId} AND tracker_id=${trackerId} AND source_event_id=${sourceEventId} LIMIT 1`))[0];
        if (!replay) throw new Error('Telemetry idempotency resolution failed');
        return { item: view(replay), replayed: true };
      }
      await tx.getAuditLogRepo().create({
        id: randomUUID(), companyId: principal.companyId, entityName: 'TelemetryEvent', entityId: id, action: AuditAction.CREATE,
        newState: JSON.stringify({ trackerId, sourceEventId, eventType, status, quarantineReason, payloadHash, synthetic: true }),
        userId: principal.userId, userName: principal.name, timestamp: receivedAt.toISOString(),
      });
      return { item: view(inserted[0]), replayed: false };
    });
  }

  static list(companyId: string, trackerIdInput: string, limitInput = 50, before?: string): Promise<{ items: TelemetryEventView[]; nextBefore?: string }> {
    return UnitOfWork.run(companyId, async (tx: any) => {
      const raw = tx.getRawTransaction?.(); if (!raw) throw new Error('Telemetry persistence unavailable');
      const trackerId = text(trackerIdInput, 'trackerId');
      const limit = Number(limitInput); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TelemetryValidationError('Invalid limit');
      const tracker = rows(await raw.execute(sql`SELECT id FROM trackers WHERE company_id=${companyId} AND id=${trackerId} LIMIT 1`))[0];
      if (!tracker) throw new TelemetryNotFoundError('Rastreador não encontrado');
      let beforeDate: Date | undefined;
      if (before !== undefined) { beforeDate = new Date(before); if (!Number.isFinite(beforeDate.getTime())) throw new TelemetryValidationError('Invalid cursor'); }
      const result = beforeDate
        ? await raw.execute(sql`SELECT id, source_event_id, event_type, status, quarantine_reason, received_at, occurred_at, odometer_km, battery_percent, signal_percent, speed_kph, has_position FROM telemetry_events WHERE company_id=${companyId} AND tracker_id=${trackerId} AND received_at < ${beforeDate.toISOString()} ORDER BY received_at DESC, id DESC LIMIT ${limit + 1}`)
        : await raw.execute(sql`SELECT id, source_event_id, event_type, status, quarantine_reason, received_at, occurred_at, odometer_km, battery_percent, signal_percent, speed_kph, has_position FROM telemetry_events WHERE company_id=${companyId} AND tracker_id=${trackerId} ORDER BY received_at DESC, id DESC LIMIT ${limit + 1}`);
      const selected = rows(result), hasMore = selected.length > limit, page = selected.slice(0, limit);
      return { items: page.map(view), nextBefore: hasMore && page.length ? new Date(page[page.length - 1].received_at).toISOString() : undefined };
    });
  }
}
