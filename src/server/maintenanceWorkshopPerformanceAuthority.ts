import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { MaintenanceValidationError } from './maintenanceAuthority';
import { summarizeMaintenanceTimeline, type MaintenanceTimelineEvent } from './maintenanceTimelineAuthority';
import { projectMaintenanceSla } from './maintenanceSlaAuthority';

export interface MaintenanceWorkshopPerformanceFilters {
  from?: string;
  to?: string;
  supplierId?: string;
  vehicleId?: string;
}

export interface MaintenanceWorkshopPerformanceRow {
  supplierId: string;
  workshopName: string;
  completedWorkOrders: number;
  slaEligibleWorkOrders: number;
  completedWithinSla: number;
  completedLate: number;
  slaCompliancePercent: number | null;
  averageTotalMinutes: number | null;
  averageActiveWorkMinutes: number | null;
  averageWaitingPartsMinutes: number | null;
  averageWaitingApprovalMinutes: number | null;
  delayReasonCount: number;
}

export interface MaintenanceWorkshopPerformanceResult {
  generatedAt: string;
  filters: MaintenanceWorkshopPerformanceFilters;
  totalCompletedWorkOrders: number;
  workshops: MaintenanceWorkshopPerformanceRow[];
}

const rows = (result: any): any[] => Array.isArray(result?.rows) ? result.rows : [];

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  if (!text || text.length > 200) throw new MaintenanceValidationError(`Invalid ${field}`);
  return text;
}

function optionalDate(value: unknown, field: string): string | undefined {
  const text = optionalText(value, field);
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new MaintenanceValidationError(`Invalid ${field}`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new MaintenanceValidationError(`Invalid ${field}`);
  return text;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid maintenance performance timestamp');
  return date.toISOString();
}

function mapEvent(row: any): MaintenanceTimelineEvent {
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

export class MaintenanceWorkshopPerformanceAuthorityService {
  static get(companyId: string, input: MaintenanceWorkshopPerformanceFilters = {}): Promise<MaintenanceWorkshopPerformanceResult> {
    const filters: MaintenanceWorkshopPerformanceFilters = {
      from: optionalDate(input.from, 'from'),
      to: optionalDate(input.to, 'to'),
      supplierId: optionalText(input.supplierId, 'supplierId'),
      vehicleId: optionalText(input.vehicleId, 'vehicleId'),
    };
    if (filters.from && filters.to && filters.from > filters.to) throw new MaintenanceValidationError('Invalid date range');

    return UnitOfWork.run(companyId, async tx => {
      const raw = tx.getRawTransaction?.();
      if (!raw) throw new Error('Maintenance workshop performance persistence unavailable');

      const result = await raw.execute(sql`
        SELECT wo.id, wo.supplier_id, COALESCE(s.trade_name, s.name, 'Oficina não informada') workshop_name,
               wo.expected_duration_minutes,
               e.id event_id, e.event_type, e.actor_user_id, e.actor_name, e.note, e.occurred_at,
               (SELECT count(*)::int FROM maintenance_work_order_delay_reasons dr
                 WHERE dr.company_id=wo.company_id AND dr.work_order_id=wo.id) delay_reason_count
        FROM work_orders wo
        LEFT JOIN suppliers s ON s.company_id=wo.company_id AND s.id=wo.supplier_id
        JOIN maintenance_work_order_events released
          ON released.company_id=wo.company_id AND released.work_order_id=wo.id AND released.event_type='VEHICLE_RELEASED'
        JOIN maintenance_work_order_events e
          ON e.company_id=wo.company_id AND e.work_order_id=wo.id
        WHERE wo.company_id=${companyId}
          AND (${filters.supplierId ?? null}::text IS NULL OR wo.supplier_id=${filters.supplierId ?? null})
          AND (${filters.vehicleId ?? null}::text IS NULL OR wo.vehicle_id=${filters.vehicleId ?? null})
          AND (${filters.from ?? null}::date IS NULL OR released.occurred_at >= ${filters.from ?? null}::date)
          AND (${filters.to ?? null}::date IS NULL OR released.occurred_at < (${filters.to ?? null}::date + interval '1 day'))
        ORDER BY wo.id, e.occurred_at ASC, e.created_at ASC, e.id ASC
      `);

      const workOrders = new Map<string, { supplierId: string; workshopName: string; expectedDurationMinutes: number | null; delayReasonCount: number; events: MaintenanceTimelineEvent[] }>();
      for (const row of rows(result)) {
        const id = String(row.id);
        let item = workOrders.get(id);
        if (!item) {
          item = {
            supplierId: row.supplier_id == null ? 'UNSPECIFIED' : String(row.supplier_id),
            workshopName: String(row.workshop_name),
            expectedDurationMinutes: row.expected_duration_minutes == null ? null : Number(row.expected_duration_minutes),
            delayReasonCount: Number(row.delay_reason_count ?? 0),
            events: [],
          };
          workOrders.set(id, item);
        }
        item.events.push(mapEvent({
          id: row.event_id,
          work_order_id: row.id,
          event_type: row.event_type,
          actor_user_id: row.actor_user_id,
          actor_name: row.actor_name,
          note: row.note,
          occurred_at: row.occurred_at,
        }));
      }

      const grouped = new Map<string, { workshopName: string; total: number[]; active: number[]; parts: number[]; approval: number[]; slaEligible: number; within: number; late: number; delayReasons: number }>();
      for (const item of workOrders.values()) {
        const summary = summarizeMaintenanceTimeline(item.events);
        if (summary.totalElapsedMs == null) continue;
        const sla = projectMaintenanceSla(item.expectedDurationMinutes, item.events, new Date());
        const bucket = grouped.get(item.supplierId) ?? { workshopName: item.workshopName, total: [], active: [], parts: [], approval: [], slaEligible: 0, within: 0, late: 0, delayReasons: 0 };
        bucket.total.push(Math.round(summary.totalElapsedMs / 60000));
        bucket.active.push(Math.round(summary.activeWorkMs / 60000));
        bucket.parts.push(Math.round(summary.waitingPartsMs / 60000));
        bucket.approval.push(Math.round(summary.waitingApprovalMs / 60000));
        bucket.delayReasons += item.delayReasonCount;
        if (item.expectedDurationMinutes !== null) {
          bucket.slaEligible += 1;
          if (sla.status === 'CONCLUIDO_NO_PRAZO') bucket.within += 1;
          if (sla.status === 'CONCLUIDO_ATRASADO') bucket.late += 1;
        }
        grouped.set(item.supplierId, bucket);
      }

      const workshops = [...grouped.entries()].map(([supplierId, bucket]) => ({
        supplierId,
        workshopName: bucket.workshopName,
        completedWorkOrders: bucket.total.length,
        slaEligibleWorkOrders: bucket.slaEligible,
        completedWithinSla: bucket.within,
        completedLate: bucket.late,
        slaCompliancePercent: bucket.slaEligible ? Math.round((bucket.within / bucket.slaEligible) * 1000) / 10 : null,
        averageTotalMinutes: average(bucket.total),
        averageActiveWorkMinutes: average(bucket.active),
        averageWaitingPartsMinutes: average(bucket.parts),
        averageWaitingApprovalMinutes: average(bucket.approval),
        delayReasonCount: bucket.delayReasons,
      })).sort((a, b) => {
        const aScore = a.slaCompliancePercent ?? -1;
        const bScore = b.slaCompliancePercent ?? -1;
        if (aScore !== bScore) return bScore - aScore;
        if ((a.averageTotalMinutes ?? Number.MAX_SAFE_INTEGER) !== (b.averageTotalMinutes ?? Number.MAX_SAFE_INTEGER)) {
          return (a.averageTotalMinutes ?? Number.MAX_SAFE_INTEGER) - (b.averageTotalMinutes ?? Number.MAX_SAFE_INTEGER);
        }
        return a.workshopName.localeCompare(b.workshopName, 'pt-BR');
      });

      const nowResult = await raw.execute(sql`SELECT now() AS current_time`);
      return {
        generatedAt: asIso(rows(nowResult)[0]?.current_time),
        filters,
        totalCompletedWorkOrders: workshops.reduce((sum, item) => sum + item.completedWorkOrders, 0),
        workshops,
      };
    });
  }
}
