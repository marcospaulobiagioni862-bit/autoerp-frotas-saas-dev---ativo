// AutoERP Workflow Metrics Service (Phase 3.56)

import { WorkflowMetrics, Task, SLARecord, PendingAction } from './types';
import { TaskService } from './TaskService';
import { SLAService } from './SLAService';
import { PendingActionService } from './PendingActionService';

export class WorkflowMetricsService {
  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('CompanyId is required for multi-tenant isolation');
    }
  }

  /**
   * Safe calculation helpers to guarantee zero NaN / Infinity
   */
  private static safeDivide(numerator: number, denominator: number): number {
    if (!denominator || isNaN(denominator) || !isFinite(denominator) || denominator <= 0) {
      return 0;
    }
    const val = numerator / denominator;
    if (isNaN(val) || !isFinite(val)) return 0;
    return val;
  }

  private static safePercentage(numerator: number, denominator: number): number {
    return Math.round(this.safeDivide(numerator, denominator) * 100);
  }

  public static async calculateMetrics(companyId: string): Promise<WorkflowMetrics> {
    this.validateTenant(companyId);

    const tasks: Task[] = await TaskService.getAllTasks(companyId);
    const slas: SLARecord[] = await SLAService.getSLARecords(companyId);
    const pendencies: PendingAction[] = await PendingActionService.getPendingActions(companyId);

    const totalTasks = tasks.length;
    const openTasks = tasks.filter(t => t.status === 'OPEN').length;
    const assignedTasks = tasks.filter(t => t.status === 'ASSIGNED').length;
    const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
    const blockedTasks = tasks.filter(t => t.status === 'BLOCKED').length;
    const waitingValidationTasks = tasks.filter(t => t.status === 'WAITING_VALIDATION').length;
    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const closedTasks = tasks.filter(t => t.status === 'CLOSED').length;
    const cancelledTasks = tasks.filter(t => t.status === 'CANCELLED').length;
    const reopenedTasks = tasks.filter(t => t.status === 'REOPENED').length;
    const unassignedTasks = tasks.filter(t => !t.assignedUserId && t.status !== 'CLOSED' && t.status !== 'CANCELLED').length;

    const finishedTasks = completedTasks + closedTasks;
    const validTotalTasks = totalTasks - cancelledTasks;

    const completionRate = this.safePercentage(finishedTasks, validTotalTasks);

    // On-Time Completion Rate
    let onTimeCount = 0;
    let totalResolutionMinutes = 0;
    let resolvedCount = 0;

    for (const t of tasks) {
      if ((t.status === 'COMPLETED' || t.status === 'CLOSED') && t.completedAt) {
        const completedTime = new Date(t.completedAt).getTime();
        const dueTime = new Date(t.dueAt).getTime();
        if (!isNaN(completedTime) && !isNaN(dueTime) && completedTime <= dueTime) {
          onTimeCount++;
        }

        const createdTime = new Date(t.createdAt).getTime();
        if (!isNaN(createdTime) && completedTime > createdTime) {
          totalResolutionMinutes += (completedTime - createdTime) / 60000;
          resolvedCount++;
        }
      }
    }

    const onTimeCompletionRate = this.safePercentage(onTimeCount, finishedTasks);
    const averageResolutionMinutes = Math.round(this.safeDivide(totalResolutionMinutes, resolvedCount));

    // Assignment speed
    let totalAssignmentMinutes = 0;
    let assignedCount = 0;
    for (const t of tasks) {
      if (t.startedAt) {
        const createdTime = new Date(t.createdAt).getTime();
        const startedTime = new Date(t.startedAt).getTime();
        if (!isNaN(createdTime) && !isNaN(startedTime) && startedTime > createdTime) {
          totalAssignmentMinutes += (startedTime - createdTime) / 60000;
          assignedCount++;
        }
      }
    }
    const averageAssignmentMinutes = Math.round(this.safeDivide(totalAssignmentMinutes, assignedCount));

    const reopenRate = this.safePercentage(reopenedTasks, validTotalTasks);
    const blockedRate = this.safePercentage(blockedTasks, validTotalTasks);

    // SLA Metrics
    const totalSLAs = slas.length;
    const compliantSLAs = slas.filter(s => s.status === 'RESOLVED' || s.status === 'ON_TRACK').length;
    const slaComplianceRate = this.safePercentage(compliantSLAs, totalSLAs);

    const slaBreachedCount = slas.filter(s => s.status === 'BREACHED').length;
    const slaWarningCount = slas.filter(s => s.status === 'WARNING').length;

    // Pending Actions
    const openPendencies = pendencies.filter(p => p.status === 'OPEN');
    const totalPendingActions = openPendencies.length;
    const criticalPendencies = openPendencies.filter(p => p.priority === 'P0' || p.priority === 'P1').length;

    return {
      totalTasks,
      openTasks,
      assignedTasks,
      inProgressTasks,
      blockedTasks,
      waitingValidationTasks,
      completedTasks,
      closedTasks,
      cancelledTasks,
      reopenedTasks,
      unassignedTasks,
      completionRate,
      onTimeCompletionRate,
      slaComplianceRate,
      averageResolutionMinutes,
      averageAssignmentMinutes,
      reopenRate,
      blockedRate,
      totalPendingActions,
      criticalPendencies,
      slaBreachedCount,
      slaWarningCount
    };
  }
}
