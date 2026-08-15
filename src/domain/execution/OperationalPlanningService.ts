// AutoERP Operational Planning Service (Phase 3.57)

import { OperationalPlanningBucket, PlanningPeriod, UserContext357, ExecutionActivity } from './types';
import { ExecutionService } from './ExecutionService';
import { TaskService } from '../workflow/TaskService';
import { Task } from '../workflow/types';
import { PendingActionService } from '../workflow/PendingActionService';
import { IncidentManagementService } from '../incident-management/IncidentManagementService';

export class OperationalPlanningService {
  private static validateContext(companyId: string, context: UserContext357): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('Tenant ID (companyId) é obrigatório');
    }
    if (!context || !context.userId) {
      throw new Error('Contexto de usuário é obrigatório');
    }
    if (context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de acesso cross-tenant (${context.companyId} !== ${companyId})`);
    }
  }

  private static getPriorityScore(priority: string): number {
    switch (priority) {
      case 'P0':
        return 4;
      case 'P1':
        return 3;
      case 'P2':
        return 2;
      case 'P3':
        return 1;
      default:
        return 0;
    }
  }

  public static async getPlanningBuckets(
    companyId: string,
    context?: UserContext357
  ): Promise<Record<PlanningPeriod, OperationalPlanningBucket>> {
    if (context) this.validateContext(companyId, context);
    if (!companyId) throw new Error('Tenant ID (companyId) é obrigatório');

    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);

    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const tomorrowStr = tomorrow.toISOString().substring(0, 10);

    const endOfWeek = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const nextWeekEnd = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const buckets: Record<PlanningPeriod, OperationalPlanningBucket> = {
      TODAY: {
        period: 'TODAY',
        title: 'Hoje',
        startDate: todayStr,
        endDate: todayStr,
        activities: [],
        taskIds: [],
        pendingActionIds: [],
        incidentIds: [],
        totalCritical: 0,
        totalOverdue: 0,
      },
      TOMORROW: {
        period: 'TOMORROW',
        title: 'Amanhã',
        startDate: tomorrowStr,
        endDate: tomorrowStr,
        activities: [],
        taskIds: [],
        pendingActionIds: [],
        incidentIds: [],
        totalCritical: 0,
        totalOverdue: 0,
      },
      THIS_WEEK: {
        period: 'THIS_WEEK',
        title: 'Esta Semana',
        startDate: todayStr,
        endDate: endOfWeek.toISOString().substring(0, 10),
        activities: [],
        taskIds: [],
        pendingActionIds: [],
        incidentIds: [],
        totalCritical: 0,
        totalOverdue: 0,
      },
      NEXT_WEEK: {
        period: 'NEXT_WEEK',
        title: 'Próxima Semana',
        startDate: endOfWeek.toISOString().substring(0, 10),
        endDate: nextWeekEnd.toISOString().substring(0, 10),
        activities: [],
        taskIds: [],
        pendingActionIds: [],
        incidentIds: [],
        totalCritical: 0,
        totalOverdue: 0,
      },
      THIS_MONTH: {
        period: 'THIS_MONTH',
        title: 'Este Mês',
        startDate: todayStr,
        endDate: endOfMonth.toISOString().substring(0, 10),
        activities: [],
        taskIds: [],
        pendingActionIds: [],
        incidentIds: [],
        totalCritical: 0,
        totalOverdue: 0,
      },
    };

    // Load activities
    const activities = await ExecutionService.getActivities(companyId, undefined, context);
    // Load tasks
    const tasks = await TaskService.getTasks(companyId);
    // Load pendings
    const pendings = await PendingActionService.getPendingActions(companyId);

    // Distribute activities
    activities.forEach((act) => {
      if (act.status === 'CANCELLED') return;
      const actDate = act.scheduledStart.substring(0, 10);

      let bucketKey: PlanningPeriod = 'THIS_MONTH';
      if (actDate <= todayStr) {
        bucketKey = 'TODAY';
      } else if (actDate === tomorrowStr) {
        bucketKey = 'TOMORROW';
      } else if (actDate <= endOfWeek.toISOString().substring(0, 10)) {
        bucketKey = 'THIS_WEEK';
      } else if (actDate <= nextWeekEnd.toISOString().substring(0, 10)) {
        bucketKey = 'NEXT_WEEK';
      }

      buckets[bucketKey].activities.push(act);
      if (act.priority === 'P0') buckets[bucketKey].totalCritical++;
      if (actDate < todayStr && act.status !== 'COMPLETED') buckets[bucketKey].totalOverdue++;
    });

    // Distribute tasks
    tasks.forEach((t) => {
      if (t.status === 'CANCELLED' || t.status === 'CLOSED' || t.status === 'COMPLETED') return;
      const tDate = t.dueAt ? t.dueAt.substring(0, 10) : todayStr;

      let bucketKey: PlanningPeriod = 'THIS_MONTH';
      if (tDate <= todayStr) {
        bucketKey = 'TODAY';
      } else if (tDate === tomorrowStr) {
        bucketKey = 'TOMORROW';
      } else if (tDate <= endOfWeek.toISOString().substring(0, 10)) {
        bucketKey = 'THIS_WEEK';
      } else if (tDate <= nextWeekEnd.toISOString().substring(0, 10)) {
        bucketKey = 'NEXT_WEEK';
      }

      buckets[bucketKey].taskIds.push(t.id);
      if (t.priority === 'P0' || t.severity === 'CRITICAL') buckets[bucketKey].totalCritical++;
      if (tDate < todayStr) buckets[bucketKey].totalOverdue++;
    });

    // Distribute pendings
    pendings.forEach((p) => {
      let bucketKey: PlanningPeriod = 'TODAY';
      buckets[bucketKey].pendingActionIds.push(p.id);
      if (p.priority === 'P0' || p.severity === 'CRITICAL') buckets[bucketKey].totalCritical++;
    });

    // Deterministic sorting of activities inside each bucket: Priority P0 > P1 > P2 > P3 -> Scheduled Start -> Created At
    Object.keys(buckets).forEach((key) => {
      const bKey = key as PlanningPeriod;
      buckets[bKey].activities.sort((a, b) => {
        const pDiff = this.getPriorityScore(b.priority) - this.getPriorityScore(a.priority);
        if (pDiff !== 0) return pDiff;
        const startDiff = new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
        if (startDiff !== 0) return startDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    });

    return buckets;
  }
}
