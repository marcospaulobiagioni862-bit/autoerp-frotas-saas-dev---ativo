import { generateOperationalTaskSummary, OperationalTask } from '../tasks/OperationalTaskService';
import { OperationalIncident } from '../incidents/OperationalIncidentService';
import { generateOperationalPendings, OperationalPendingItem } from '../operations/OperationalPendingService';

export interface ProductivityMetrics {
  companyId: string;
  generatedAt: string;
  tasks: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    blocked: number;
    cancelled: number;
    overdue: number;
    completionRate: number; // percentage 0-100
  };
  sla: {
    totalEligible: number;
    compliant: number;
    violated: number;
    complianceRate: number; // percentage 0-100
    p0Violated: number;
    p1Violated: number;
  };
  resolution: {
    averageResolutionHours: number;
    minResolutionHours: number;
    maxResolutionHours: number;
  };
  assignees: {
    name: string;
    assignedCount: number;
    completedCount: number;
    overdueCount: number;
    complianceRate: number;
  }[];
  bottlenecks: {
    category: string;
    issueCount: number;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
  }[];
}

export interface ProductivityInput {
  companyId?: string;
  tasks?: OperationalTask[];
  incidents?: OperationalIncident[];
  pendings?: OperationalPendingItem[];
}

/**
 * Deterministic service that aggregates operational data into productivity, SLA, and performance metrics.
 * Strictly READ-ONLY with zero financial side effects.
 */
export class OperationalProductivityService {
  public static calculateMetrics(input: ProductivityInput = {}): ProductivityMetrics {
    const targetCompanyId = input.companyId || 'company-main-uuid';
    const taskSummary = generateOperationalTaskSummary({
      companyId: targetCompanyId,
      tasks: input.tasks,
      incidents: input.incidents,
      pendings: input.pendings,
    });

    const tasks = taskSummary.tasks;
    const total = tasks.length;
    const pending = taskSummary.counts.pending;
    const inProgress = taskSummary.counts.inProgress;
    const completed = taskSummary.counts.completed;
    const blocked = taskSummary.counts.blocked;
    const cancelled = taskSummary.counts.cancelled;
    const overdue = taskSummary.counts.overdue;

    const rawCompletionRate = total > 0 ? (completed / total) * 100 : 0;
    const completionRate = isNaN(rawCompletionRate) || !isFinite(rawCompletionRate) ? 0 : Math.round(rawCompletionRate * 10) / 10;

    // SLA Calculations
    let compliant = 0;
    let violated = 0;
    let p0Violated = 0;
    let p1Violated = 0;

    tasks.forEach(t => {
      if (t.status === 'COMPLETED' || t.deadlineStatus === 'NO_PRAZO' || t.deadlineStatus === 'VENCENDO') {
        compliant++;
      } else if (t.deadlineStatus === 'ATRASADA') {
        violated++;
        if (t.priority === 'P0') p0Violated++;
        if (t.priority === 'P1') p1Violated++;
      }
    });

    const totalSlaEligible = compliant + violated;
    const rawSlaRate = totalSlaEligible > 0 ? (compliant / totalSlaEligible) * 100 : 100;
    const complianceRate = isNaN(rawSlaRate) || !isFinite(rawSlaRate) ? 100 : Math.round(rawSlaRate * 10) / 10;

    // Resolution time calculation (mock/derived from completed tasks)
    let totalHours = 0;
    let resolvedCount = 0;
    let minRes = 0;
    let maxRes = 0;

    tasks.filter(t => t.status === 'COMPLETED' && t.createdAt && t.completedAt).forEach(t => {
      const start = new Date(t.createdAt).getTime();
      const end = new Date(t.completedAt!).getTime();
      const diffHours = Math.max(0, (end - start) / (1000 * 3600));
      totalHours += diffHours;
      resolvedCount++;
      if (resolvedCount === 1) {
        minRes = diffHours;
        maxRes = diffHours;
      } else {
        if (diffHours < minRes) minRes = diffHours;
        if (diffHours > maxRes) maxRes = diffHours;
      }
    });

    const averageResolutionHours = resolvedCount > 0 ? Math.round((totalHours / resolvedCount) * 10) / 10 : 0;

    // Assignee performance grouping
    const assigneeMap = new Map<string, { assigned: number; completed: number; overdue: number }>();
    tasks.forEach(t => {
      const assignee = t.assignedTo || 'Não atribuído';
      const current = assigneeMap.get(assignee) || { assigned: 0, completed: 0, overdue: 0 };
      current.assigned++;
      if (t.status === 'COMPLETED') current.completed++;
      if (t.deadlineStatus === 'ATRASADA') current.overdue++;
      assigneeMap.set(assignee, current);
    });

    const assignees = Array.from(assigneeMap.entries()).map(([name, data]) => {
      const rate = data.assigned > 0 ? (data.completed / data.assigned) * 100 : 0;
      return {
        name,
        assignedCount: data.assigned,
        completedCount: data.completed,
        overdueCount: data.overdue,
        complianceRate: isNaN(rate) ? 0 : Math.round(rate * 10) / 10,
      };
    });

    // Bottlenecks identification
    const bottlenecks: ProductivityMetrics['bottlenecks'] = [];
    if (overdue > 0) {
      bottlenecks.push({
        category: 'Atrasos Operacionais',
        issueCount: overdue,
        severity: overdue > 5 ? 'HIGH' : 'MEDIUM',
        description: `${overdue} tarefas operacionais encontram-se atualmente em atraso, exigindo realocação ou atenção imediata.`,
      });
    }
    if (blocked > 0) {
      bottlenecks.push({
        category: 'Tarefas Bloqueadas',
        issueCount: blocked,
        severity: 'HIGH',
        description: `${blocked} tarefas estagnadas por bloqueio operacional ou documental.`,
      });
    }

    return {
      companyId: targetCompanyId,
      generatedAt: new Date().toISOString(),
      tasks: {
        total,
        pending,
        inProgress,
        completed,
        blocked,
        cancelled,
        overdue,
        completionRate,
      },
      sla: {
        totalEligible: totalSlaEligible,
        compliant,
        violated,
        complianceRate,
        p0Violated,
        p1Violated,
      },
      resolution: {
        averageResolutionHours,
        minResolutionHours: resolvedCount > 0 ? Math.round(minRes * 10) / 10 : 0,
        maxResolutionHours: resolvedCount > 0 ? Math.round(maxRes * 10) / 10 : 0,
      },
      assignees,
      bottlenecks,
    };
  }
}
