import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import type { AuthenticatedPrincipal } from './auth';
import { MaintenanceConflictError, MaintenanceNotFoundError, MaintenanceValidationError } from './maintenanceAuthority';

export const MAINTENANCE_TIMELINE_EVENT_TYPES = [
  'ENTERED_WORKSHOP',
  'WORK_STARTED',
  'WAITING_PARTS',
  'WAITING_APPROVAL',
  'WORK_RESUMED',
  'TECHNICALLY_COMPLETED',
  'VEHICLE_RELEASED',
] as const;

export type MaintenanceTimelineEventType = typeof MAINTENANCE_TIMELINE_EVENT_TYPES[number];

export interface MaintenanceTimelineEvent {
  id: string;
  workOrderId: string;
  eventType: MaintenanceTimelineEventType;
  actorUserId: string;
  actorName: string;
  note?: string;
  occurredAt: string;
}

export interface MaintenanceTimelineInterval {
  kind: 'ACTIVE_WORK' | 'WAITING_PARTS' | 'WAITING_APPROVAL';
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface MaintenanceTimelineSummary {
  intervals: MaintenanceTimelineInterval[];
  activeWorkMs: number;
  waitingPartsMs: number;
  waitingApprovalMs: number;
  totalElapsedMs: number | null;
}

export interface RegisterMaintenanceTimelineEventInput {
  eventType: MaintenanceTimelineEventType;
  idempotencyKey: string;
  note?: string;
}

const EVENT_TYPES = new Set<string>(MAINTENANCE_TIMELINE_EVENT_TYPES);
const rows = (result: any): any[] => Array.isArray(result?.rows) ? result.rows : [];

function requiredText(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new MaintenanceValidationError(`Invalid ${field}`);
  return text;
}

function optionalNote(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredText(value, 'note', 2000);
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid maintenance timeline timestamp');
  return date.toISOString();
}

function mapEvent(row: any): MaintenanceTimelineEvent {
  return {
    id: String(row.id),
    workOrderId: String(row.work_order_id),
    eventType: String(row.event_type) as MaintenanceTimelineEventType,
    actorUserId: String(row.actor_user_id),
    actorName: String(row.actor_name),
    note: row.note == null ? undefined : String(row.note),
    occurredAt: asIso(row.occurred_at),
  };
}

export function assertMaintenanceTimelineTransition(
  previous: MaintenanceTimelineEventType | null,
  next: MaintenanceTimelineEventType,
): void {
  const allowed: Record<string, readonly MaintenanceTimelineEventType[]> = {
    START: ['ENTERED_WORKSHOP'],
    ENTERED_WORKSHOP: ['WORK_STARTED', 'WAITING_APPROVAL'],
    WORK_STARTED: ['WAITING_PARTS', 'WAITING_APPROVAL', 'TECHNICALLY_COMPLETED'],
    WAITING_PARTS: ['WORK_RESUMED'],
    WAITING_APPROVAL: ['WORK_RESUMED'],
    WORK_RESUMED: ['WAITING_PARTS', 'WAITING_APPROVAL', 'TECHNICALLY_COMPLETED'],
    TECHNICALLY_COMPLETED: ['VEHICLE_RELEASED'],
    VEHICLE_RELEASED: [],
  };
  const candidates = allowed[previous ?? 'START'] ?? [];
  if (!candidates.includes(next)) {
    throw new MaintenanceConflictError(`Invalid maintenance timeline transition: ${previous ?? 'START'} -> ${next}`);
  }
}

export function summarizeMaintenanceTimeline(events: MaintenanceTimelineEvent[]): MaintenanceTimelineSummary {
  const intervals: MaintenanceTimelineInterval[] = [];
  let open: { kind: MaintenanceTimelineInterval['kind']; startedAt: string } | null = null;

  const close = (endedAt: string) => {
    if (!open) return;
    const start = new Date(open.startedAt).getTime();
    const end = new Date(endedAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      intervals.push({ kind: open.kind, startedAt: open.startedAt, endedAt, durationMs: end - start });
    }
    open = null;
  };

  for (const event of events) {
    if (event.eventType === 'WORK_STARTED' || event.eventType === 'WORK_RESUMED') {
      close(event.occurredAt);
      open = { kind: 'ACTIVE_WORK', startedAt: event.occurredAt };
      continue;
    }
    if (event.eventType === 'WAITING_PARTS') {
      close(event.occurredAt);
      open = { kind: 'WAITING_PARTS', startedAt: event.occurredAt };
      continue;
    }
    if (event.eventType === 'WAITING_APPROVAL') {
      close(event.occurredAt);
      open = { kind: 'WAITING_APPROVAL', startedAt: event.occurredAt };
      continue;
    }
    if (event.eventType === 'TECHNICALLY_COMPLETED' || event.eventType === 'VEHICLE_RELEASED') close(event.occurredAt);
  }

  const total = (kind: MaintenanceTimelineInterval['kind']) =>
    intervals.filter(item => item.kind === kind).reduce((sum, item) => sum + item.durationMs, 0);
  const entered = events.find(item => item.eventType === 'ENTERED_WORKSHOP');
  const released = [...events].reverse().find(item => item.eventType === 'VEHICLE_RELEASED');
  const totalElapsedMs = entered && released
    ? Math.max(0, new Date(released.occurredAt).getTime() - new Date(entered.occurredAt).getTime())
    : null;

  return {
    intervals,
    activeWorkMs: total('ACTIVE_WORK'),
    waitingPartsMs: total('WAITING_PARTS'),
    waitingApprovalMs: total('WAITING_APPROVAL'),
    totalElapsedMs,
  };
}

async function rawTransaction(tx: any): Promise<any> {
  const raw = tx.getRawTransaction?.();
  if (!raw) throw new Error('Maintenance timeline persistence unavailable');
  return raw;
}

async function requireWorkOrder(raw: any, companyId: string, workOrderId: string, lock = false): Promise<any> {
  const suffix = lock ? sql` FOR UPDATE` : sql``;
  const result = await raw.execute(sql`
    SELECT id, company_id, status
    FROM work_orders
    WHERE company_id = ${companyId} AND id = ${workOrderId}
    LIMIT 1${suffix}
  `);
  const item = rows(result)[0];
  if (!item) throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');
  return item;
}

async function listEventsRaw(raw: any, companyId: string, workOrderId: string): Promise<MaintenanceTimelineEvent[]> {
  const result = await raw.execute(sql`
    SELECT id, work_order_id, event_type, actor_user_id, actor_name, note, occurred_at
    FROM maintenance_work_order_events
    WHERE company_id = ${companyId} AND work_order_id = ${workOrderId}
    ORDER BY occurred_at ASC, created_at ASC, id ASC
  `);
  return rows(result).map(mapEvent);
}

export class MaintenanceTimelineAuthorityService {
  static list(companyId: string, workOrderId: string): Promise<{ events: MaintenanceTimelineEvent[]; summary: MaintenanceTimelineSummary }> {
    const safeWorkOrderId = requiredText(workOrderId, 'workOrderId', 200);
    return UnitOfWork.run(companyId, async tx => {
      const raw = await rawTransaction(tx);
      await requireWorkOrder(raw, companyId, safeWorkOrderId);
      const events = await listEventsRaw(raw, companyId, safeWorkOrderId);
      return { events, summary: summarizeMaintenanceTimeline(events) };
    });
  }

  static register(
    principal: AuthenticatedPrincipal,
    workOrderId: string,
    input: RegisterMaintenanceTimelineEventInput,
  ): Promise<{ event: MaintenanceTimelineEvent; replayed: boolean; summary: MaintenanceTimelineSummary }> {
    const safeWorkOrderId = requiredText(workOrderId, 'workOrderId', 200);
    const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey', 200);
    const eventType = String(input.eventType || '').trim().toUpperCase();
    if (!EVENT_TYPES.has(eventType)) throw new MaintenanceValidationError('Invalid eventType');
    const typedEvent = eventType as MaintenanceTimelineEventType;
    const note = optionalNote(input.note);

    return UnitOfWork.run(principal.companyId, async tx => {
      const raw = await rawTransaction(tx);
      const workOrder = await requireWorkOrder(raw, principal.companyId, safeWorkOrderId, true);

      const replayResult = await raw.execute(sql`
        SELECT id, work_order_id, event_type, actor_user_id, actor_name, note, occurred_at
        FROM maintenance_work_order_events
        WHERE company_id = ${principal.companyId}
          AND work_order_id = ${safeWorkOrderId}
          AND idempotency_key = ${idempotencyKey}
        LIMIT 1
      `);
      const replay = rows(replayResult)[0];
      if (replay) {
        const existing = mapEvent(replay);
        if (existing.eventType !== typedEvent || (existing.note ?? '') !== (note ?? '')) {
          throw new MaintenanceConflictError('Idempotency key already used with a different maintenance event');
        }
        const events = await listEventsRaw(raw, principal.companyId, safeWorkOrderId);
        return { event: existing, replayed: true, summary: summarizeMaintenanceTimeline(events) };
      }

      const status = String(workOrder.status || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'COMPLETED') {
        throw new MaintenanceConflictError(`Maintenance timeline is closed for work order status ${status}`);
      }

      const eventsBefore = await listEventsRaw(raw, principal.companyId, safeWorkOrderId);
      const previous = eventsBefore.length ? eventsBefore[eventsBefore.length - 1].eventType : null;
      assertMaintenanceTimelineTransition(previous, typedEvent);

      const id = randomUUID();
      const inserted = await raw.execute(sql`
        INSERT INTO maintenance_work_order_events (
          id, company_id, work_order_id, event_type, idempotency_key,
          actor_user_id, actor_name, note
        ) VALUES (
          ${id}, ${principal.companyId}, ${safeWorkOrderId}, ${typedEvent}, ${idempotencyKey},
          ${principal.userId}, ${principal.name}, ${note ?? null}
        )
        RETURNING id, work_order_id, event_type, actor_user_id, actor_name, note, occurred_at
      `);
      const createdRow = rows(inserted)[0];
      if (!createdRow) throw new Error('Maintenance timeline event insert failed');
      const event = mapEvent(createdRow);
      const events = [...eventsBefore, event];
      return { event, replayed: false, summary: summarizeMaintenanceTimeline(events) };
    });
  }
}
