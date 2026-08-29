import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import type { AuthenticatedPrincipal } from './auth';
import { MaintenanceConflictError, MaintenanceNotFoundError, MaintenanceValidationError } from './maintenanceAuthority';
import type { MaintenanceTimelineEvent } from './maintenanceTimelineAuthority';

export const MAINTENANCE_SLA_RISK_RATIO = 0.8;

export type MaintenanceSlaStatus =
  | 'SEM_SLA'
  | 'DENTRO_PRAZO'
  | 'EM_RISCO'
  | 'ATRASADO'
  | 'CONCLUIDO_NO_PRAZO'
  | 'CONCLUIDO_ATRASADO';

export interface MaintenanceSlaProjection {
  expectedDurationMinutes: number | null;
  elapsedMinutes: number;
  differenceMinutes: number | null;
  progressRatio: number | null;
  status: MaintenanceSlaStatus;
  startedAt: string | null;
  releasedAt: string | null;
}

export interface MaintenanceDelayReason {
  id: string;
  workOrderId: string;
  reason: string;
  actorUserId: string;
  actorName: string;
  occurredAt: string;
}

const rows = (result: any): any[] => Array.isArray(result?.rows) ? result.rows : [];

function requiredText(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new MaintenanceValidationError(`Invalid ${field}`);
  return text;
}

function normalizeExpectedDuration(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0 || number > 2_147_483_647) {
    throw new MaintenanceValidationError('Invalid expectedDurationMinutes');
  }
  return number;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid maintenance SLA timestamp');
  return date.toISOString();
}

function mapTimelineEvent(row: any): MaintenanceTimelineEvent {
  return {
    id: String(row.id),
    workOrderId: String(row.work_order_id),
    eventType: String(row.event_type) as MaintenanceTimelineEvent['eventType'],
    actorUserId: String(row.actor_user_id),
    actorName: String(row.actor_name),
    note: row.note == null ? undefined : String(row.note),
    occurredAt: asIso(row.occurred_at),
  };
}

function mapDelayReason(row: any): MaintenanceDelayReason {
  return {
    id: String(row.id),
    workOrderId: String(row.work_order_id),
    reason: String(row.reason),
    actorUserId: String(row.actor_user_id),
    actorName: String(row.actor_name),
    occurredAt: asIso(row.occurred_at),
  };
}

export function projectMaintenanceSla(
  expectedDurationMinutes: number | null,
  events: readonly MaintenanceTimelineEvent[],
  now: Date = new Date(),
): MaintenanceSlaProjection {
  const entered = events.find(event => event.eventType === 'ENTERED_WORKSHOP') ?? null;
  const released = [...events].reverse().find(event => event.eventType === 'VEHICLE_RELEASED') ?? null;
  const startedAt = entered?.occurredAt ?? null;
  const releasedAt = released?.occurredAt ?? null;

  let elapsedMinutes = 0;
  if (entered) {
    const startMs = new Date(entered.occurredAt).getTime();
    const endMs = released ? new Date(released.occurredAt).getTime() : now.getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      elapsedMinutes = Math.floor((endMs - startMs) / 60_000);
    }
  }

  if (expectedDurationMinutes === null) {
    return {
      expectedDurationMinutes: null,
      elapsedMinutes,
      differenceMinutes: null,
      progressRatio: null,
      status: 'SEM_SLA',
      startedAt,
      releasedAt,
    };
  }

  const differenceMinutes = expectedDurationMinutes - elapsedMinutes;
  const progressRatio = elapsedMinutes / expectedDurationMinutes;
  let status: MaintenanceSlaStatus;
  if (released) {
    status = elapsedMinutes <= expectedDurationMinutes ? 'CONCLUIDO_NO_PRAZO' : 'CONCLUIDO_ATRASADO';
  } else if (elapsedMinutes > expectedDurationMinutes) {
    status = 'ATRASADO';
  } else if (progressRatio >= MAINTENANCE_SLA_RISK_RATIO) {
    status = 'EM_RISCO';
  } else {
    status = 'DENTRO_PRAZO';
  }

  return {
    expectedDurationMinutes,
    elapsedMinutes,
    differenceMinutes,
    progressRatio,
    status,
    startedAt,
    releasedAt,
  };
}

async function rawTransaction(tx: any): Promise<any> {
  const raw = tx.getRawTransaction?.();
  if (!raw) throw new Error('Maintenance SLA persistence unavailable');
  return raw;
}

async function requireWorkOrder(raw: any, companyId: string, workOrderId: string, lock = false): Promise<any> {
  const query = lock
    ? sql`SELECT id, company_id, status, expected_duration_minutes FROM work_orders WHERE company_id=${companyId} AND id=${workOrderId} LIMIT 1 FOR UPDATE`
    : sql`SELECT id, company_id, status, expected_duration_minutes FROM work_orders WHERE company_id=${companyId} AND id=${workOrderId} LIMIT 1`;
  const result = await raw.execute(query);
  const item = rows(result)[0];
  if (!item) throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');
  return item;
}

async function listTimeline(raw: any, companyId: string, workOrderId: string): Promise<MaintenanceTimelineEvent[]> {
  const result = await raw.execute(sql`
    SELECT id, work_order_id, event_type, actor_user_id, actor_name, note, occurred_at
    FROM maintenance_work_order_events
    WHERE company_id=${companyId} AND work_order_id=${workOrderId}
    ORDER BY occurred_at ASC, created_at ASC, id ASC
  `);
  return rows(result).map(mapTimelineEvent);
}

async function databaseNow(raw: any): Promise<Date> {
  const result = await raw.execute(sql`SELECT now() AS current_time`);
  const value = rows(result)[0]?.current_time;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('Database clock unavailable');
  return date;
}

async function listDelayReasonsRaw(raw: any, companyId: string, workOrderId: string): Promise<MaintenanceDelayReason[]> {
  const result = await raw.execute(sql`
    SELECT id, work_order_id, reason, actor_user_id, actor_name, occurred_at
    FROM maintenance_work_order_delay_reasons
    WHERE company_id=${companyId} AND work_order_id=${workOrderId}
    ORDER BY occurred_at DESC, created_at DESC, id DESC
  `);
  return rows(result).map(mapDelayReason);
}

export class MaintenanceSlaAuthorityService {
  static get(companyId: string, workOrderId: string): Promise<{ projection: MaintenanceSlaProjection; delayReasons: MaintenanceDelayReason[] }> {
    const safeWorkOrderId = requiredText(workOrderId, 'workOrderId', 200);
    return UnitOfWork.run(companyId, async tx => {
      const raw = await rawTransaction(tx);
      const workOrder = await requireWorkOrder(raw, companyId, safeWorkOrderId);
      const [events, now, delayReasons] = await Promise.all([
        listTimeline(raw, companyId, safeWorkOrderId),
        databaseNow(raw),
        listDelayReasonsRaw(raw, companyId, safeWorkOrderId),
      ]);
      const expected = workOrder.expected_duration_minutes == null ? null : Number(workOrder.expected_duration_minutes);
      return { projection: projectMaintenanceSla(expected, events, now), delayReasons };
    });
  }

  static setExpectedDuration(
    principal: AuthenticatedPrincipal,
    workOrderId: string,
    expectedDurationMinutes: unknown,
  ): Promise<{ projection: MaintenanceSlaProjection }> {
    const safeWorkOrderId = requiredText(workOrderId, 'workOrderId', 200);
    const expected = normalizeExpectedDuration(expectedDurationMinutes);
    return UnitOfWork.run(principal.companyId, async tx => {
      const raw = await rawTransaction(tx);
      await requireWorkOrder(raw, principal.companyId, safeWorkOrderId, true);
      await raw.execute(sql`
        UPDATE work_orders
        SET expected_duration_minutes=${expected}, updated_at=now()
        WHERE company_id=${principal.companyId} AND id=${safeWorkOrderId}
      `);
      const [events, now] = await Promise.all([
        listTimeline(raw, principal.companyId, safeWorkOrderId),
        databaseNow(raw),
      ]);
      return { projection: projectMaintenanceSla(expected, events, now) };
    });
  }

  static addDelayReason(
    principal: AuthenticatedPrincipal,
    workOrderId: string,
    reasonValue: unknown,
  ): Promise<{ reason: MaintenanceDelayReason; projection: MaintenanceSlaProjection }> {
    const safeWorkOrderId = requiredText(workOrderId, 'workOrderId', 200);
    const reason = requiredText(reasonValue, 'reason', 2000);
    return UnitOfWork.run(principal.companyId, async tx => {
      const raw = await rawTransaction(tx);
      const workOrder = await requireWorkOrder(raw, principal.companyId, safeWorkOrderId, true);
      const [events, now] = await Promise.all([
        listTimeline(raw, principal.companyId, safeWorkOrderId),
        databaseNow(raw),
      ]);
      const expected = workOrder.expected_duration_minutes == null ? null : Number(workOrder.expected_duration_minutes);
      const projection = projectMaintenanceSla(expected, events, now);
      if (projection.status !== 'ATRASADO' && projection.status !== 'CONCLUIDO_ATRASADO') {
        throw new MaintenanceConflictError('Motivo de atraso só pode ser registrado quando a OS estiver atrasada');
      }

      const id = randomUUID();
      const inserted = await raw.execute(sql`
        INSERT INTO maintenance_work_order_delay_reasons (
          id, company_id, work_order_id, reason, actor_user_id, actor_name
        ) VALUES (
          ${id}, ${principal.companyId}, ${safeWorkOrderId}, ${reason}, ${principal.userId}, ${principal.name}
        )
        RETURNING id, work_order_id, reason, actor_user_id, actor_name, occurred_at
      `);
      const created = rows(inserted)[0];
      if (!created) throw new Error('Maintenance delay reason insert failed');
      return { reason: mapDelayReason(created), projection };
    });
  }
}
