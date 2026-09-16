// AutoERP Productivity Service (Phase 3.57)

import { ProductivitySnapshot, UserWorkload, WorkloadClassification, UserContext357 } from './types';
import { TaskService } from '../workflow/TaskService';
import { Task } from '../workflow/types';
import { SLAService } from '../workflow/SLAService';

export class ProductivityService {
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

  private static safeDivide(numerator: number, denominator: number): number {
    if (!denominator || denominator === 0 || !isFinite(denominator) || isNaN(denominator)) {
      return 0;
    }
    const result = numerator / denominator;
    return isNaN(result) || !isFinite(result) ? 0 : result;
  }

  private static classifyWorkload(
    openTasks: number,
    criticalTasks: number,
    overdueTasks: number,
    blockedTasks: number
  ): WorkloadClassification {
    const score = openTasks + criticalTasks * 3 + overdueTasks * 4 + blockedTasks * 2;
    if (score >= 25 || overdueTasks >= 5 || criticalTasks >= 4) return 'CRÍTICA';
    if (score >= 15 || overdueTasks >= 3 || criticalTasks >= 2) return 'SOBRECARGA';
    if (score >= 8 || openTasks >= 6) return 'ELEVADA';
    return 'NORMAL';
  }

  public static async getProductivitySnapshot(
    companyId: string,
    period: string = 'CURRENT',
    context?: UserContext357
  ): Promise<ProductivitySnapshot> {
    if (context) this.validateContext(companyId, context);
    if (!companyId) throw new Error('Tenant ID (companyId) é obrigatório');

    const tasks: Task[] = await TaskService.getTasks(companyId);
    const slaRecords = await SLAService.getSLARecords(companyId);

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED' || t.status === 'CLOSED').length;
    const openTasks = tasks.filter(
      (t) => t.status === 'OPEN' || t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS' || t.status === 'WAITING_VALIDATION'
    ).length;
    const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;
    const reopenedTasks = tasks.filter((t) => t.status === 'REOPENED').length;

    const now = new Date();
    const overdueTasks = tasks.filter((t) => {
      if (t.status === 'COMPLETED' || t.status === 'CLOSED' || t.status === 'CANCELLED') return false;
      return t.dueAt && new Date(t.dueAt) < now;
    }).length;

    // SLA compliance
    const slaOnTrack = slaRecords.filter((r) => r.status === 'ON_TRACK').length;
    const totalSla = slaRecords.length;
    const slaCompliance = Math.round(this.safeDivide(slaOnTrack * 100, totalSla));

    // Average completion time (in hours)
    let totalCompletionTimeMs = 0;
    let completedWithTimeCount = 0;

    tasks.forEach((t) => {
      if ((t.status === 'COMPLETED' || t.status === 'CLOSED') && t.completedAt && t.createdAt) {
        const duration = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
        if (duration > 0 && isFinite(duration)) {
          totalCompletionTimeMs += duration;
          completedWithTimeCount++;
        }
      }
    });

    const averageCompletionTime = Number(
      this.safeDivide(totalCompletionTimeMs, completedWithTimeCount * 3600 * 1000).toFixed(1)
    );

    // Workload by user
    const workloadMap: Record<string, UserWorkload> = {};

    tasks.forEach((t) => {
      const uId = t.assignedUserId || 'UNASSIGNED';
      if (!workloadMap[uId]) {
        workloadMap[uId] = {
          userId: uId,
          userName: t.assignedUserId ? `Usuário ${uId.substring(0, 8)}` : 'Não Atribuído',
          openTasks: 0,
          criticalTasks: 0,
          overdueTasks: 0,
          blockedTasks: 0,
          slaAtRisk: 0,
          classification: 'NORMAL',
        };
      }

      const isCompleted = t.status === 'COMPLETED' || t.status === 'CLOSED' || t.status === 'CANCELLED';
      if (!isCompleted) {
        workloadMap[uId].openTasks++;
        if (t.priority === 'P0' || t.severity === 'CRITICAL') workloadMap[uId].criticalTasks++;
        if (t.status === 'BLOCKED') workloadMap[uId].blockedTasks++;
        if (t.dueAt && new Date(t.dueAt) < now) workloadMap[uId].overdueTasks++;
      }
    });

    // Classify each user's workload
    Object.keys(workloadMap).forEach((uId) => {
      const w = workloadMap[uId];
      w.classification = this.classifyWorkload(w.openTasks, w.criticalTasks, w.overdueTasks, w.blockedTasks);
    });

    return {
      companyId,
      period,
      totalTasks,
      completedTasks,
      openTasks,
      blockedTasks,
      overdueTasks,
      slaCompliance,
      averageCompletionTime,
      reopenedTasks,
      backlog: openTasks + blockedTasks,
      workloadByUser: workloadMap,
    };
  }
}
