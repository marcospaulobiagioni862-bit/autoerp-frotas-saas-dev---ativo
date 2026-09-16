// AutoERP Operational Bottleneck Service (Phase 3.58)

import {
  OperationalBottleneckItem,
  BottleneckCategory,
  BottleneckSeverity,
  UserContext358
} from './types';
import { TaskService } from '../workflow/TaskService';
import { PendingActionService } from '../workflow/PendingActionService';
import { ProductivityService } from '../execution/ProductivityService';
import { IncidentManagementService } from '../incident-management/IncidentManagementService';
import { generateDailyOperations } from './DailyOperationsService';
import { OperationalPriorityService } from './OperationalPriorityService';

export class OperationalBottleneckService {
  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
  }

  public static async detectBottlenecks(
    companyId: string,
    context?: UserContext358
  ): Promise<OperationalBottleneckItem[]> {
    this.validateTenant(companyId);
    if (context && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de consulta cross-tenant (${context.companyId} !== ${companyId})`);
    }

    const bottlenecks: OperationalBottleneckItem[] = [];
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Blocked & Overdue Tasks Bottleneck
    try {
      const tasks = await TaskService.getTasks(companyId);
      const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED');
      if (blockedTasks.length > 0) {
        const avgBlockedDuration = blockedTasks.reduce((acc, t) => {
          const updated = new Date(t.updatedAt || t.createdAt).getTime();
          const hrs = (now.getTime() - updated) / (1000 * 60 * 60);
          return acc + (OperationalPriorityService.safeNumber(hrs, 0));
        }, 0) / Math.max(blockedTasks.length, 1);

        bottlenecks.push({
          id: `bot-blocked-tasks-${companyId}`,
          companyId,
          category: 'TASK',
          severity: blockedTasks.length >= 3 ? 'CRITICAL' : 'HIGH',
          entityType: 'TASK',
          entityId: blockedTasks[0]?.id || 'tasks-blocked',
          title: `${blockedTasks.length} Tarefa(s) Bloqueada(s) na Operação`,
          description: `Existem ${blockedTasks.length} tarefa(s) aguardando desbloqueio. Tempo médio bloqueado: ${Math.round(avgBlockedDuration)}h.`,
          detectedAt: nowIso,
          impactScore: Math.min(blockedTasks.length * 20, 100),
          durationHours: Math.round(avgBlockedDuration),
          responsibleUserId: blockedTasks[0]?.assignedUserId,
          recommendedAction: 'Analisar o motivo do bloqueio e desbloquear a dependência funcional imediatamente.',
          status: 'ACTIVE',
        });
      }
    } catch {
      // safe fail
    }

    // 2. User Workload Overload Bottleneck
    try {
      const userCtx357 = context ? {
        userId: context.userId,
        userName: context.userName || context.userId,
        userRole: (context.userRole as any) || 'ADMIN',
        companyId: context.companyId,
      } : undefined;

      const productivity = await ProductivityService.getProductivitySnapshot(companyId, 'CURRENT', userCtx357);
      if (productivity && productivity.workloadByUser) {
        const overloadedUsers = Object.values(productivity.workloadByUser).filter(
          (u) => u.classification === 'SOBRECARGA' || u.classification === 'CRÍTICA'
        );

        if (overloadedUsers.length > 0) {
          const topUser = overloadedUsers[0];
          bottlenecks.push({
            id: `bot-user-overload-${companyId}-${topUser.userId}`,
            companyId,
            category: 'USER_WORKLOAD',
            severity: topUser.classification === 'CRÍTICA' ? 'CRITICAL' : 'HIGH',
            entityType: 'USER',
            entityId: topUser.userId,
            title: `Sobrecarga Crítica de Trabalho: ${topUser.userName}`,
            description: `O colaborador possui ${topUser.openTasks} tarefas abertas (${topUser.criticalTasks} críticas, ${topUser.overdueTasks} atrasadas).`,
            detectedAt: nowIso,
            impactScore: Math.min(topUser.openTasks * 15, 95),
            durationHours: 24,
            responsibleUserId: topUser.userId,
            responsibleUserName: topUser.userName,
            recommendedAction: 'Redistribuir tarefas para outros membros da equipe com carga normal.',
            status: 'ACTIVE',
          });
        }
      }
    } catch {
      // safe fail
    }

    // 3. Active Incidents Bottleneck
    try {
      const incidents = await IncidentManagementService.getIncidents(companyId);
      const activeIncidents = incidents.filter(
        (i) => i.status !== 'CLOSED' && i.status !== 'CANCELLED' && i.status !== 'RESOLVED'
      );
      const criticalIncidents = activeIncidents.filter((i) => i.severity === 'SEV0' || i.severity === 'SEV1');

      if (criticalIncidents.length > 0) {
        const inc = criticalIncidents[0];
        const ageHrs = (now.getTime() - new Date(inc.createdAt).getTime()) / (1000 * 60 * 60);

        bottlenecks.push({
          id: `bot-incident-${inc.id}`,
          companyId,
          category: 'INCIDENT',
          severity: 'CRITICAL',
          entityType: 'INCIDENT',
          entityId: inc.id,
          title: `Incidente Crítico Ativo: ${inc.title}`,
          description: `Incidente ${inc.severity} (${inc.category}) ativo há ${Math.round(ageHrs)} horas sem resolução.`,
          detectedAt: inc.createdAt,
          impactScore: 100,
          durationHours: Math.round(ageHrs),
          responsibleUserId: inc.commanderId,
          recommendedAction: 'Acionar Commander de Incidente e aplicar plano de contenção imedita.',
          status: 'ACTIVE',
        });
      }
    } catch {
      // safe fail
    }

    // 4. Pending Actions Bottleneck
    try {
      const pendingActions = await PendingActionService.getPendingActions(companyId);
      const openPending = pendingActions.filter((p) => p.status === 'OPEN');
      if (openPending.length >= 5) {
        bottlenecks.push({
          id: `bot-pending-actions-${companyId}`,
          companyId,
          category: 'PENDING_ACTION',
          severity: openPending.length >= 10 ? 'CRITICAL' : 'HIGH',
          entityType: 'PENDING_ACTION',
          entityId: 'pending-summary',
          title: `Acúmulo de Pendências Operacionais (${openPending.length} itens)`,
          description: `Existem ${openPending.length} pendências aguardando conversão ou resolução.`,
          detectedAt: nowIso,
          impactScore: Math.min(openPending.length * 8, 90),
          durationHours: 48,
          recommendedAction: 'Converter pendências críticas em tarefas operacionais ativas com SLA.',
          status: 'ACTIVE',
        });
      }
    } catch {
      // safe fail
    }

    // 5. Daily Fleet & Maintenance Bottleneck
    try {
      const summary = generateDailyOperations({ companyId });
      if (summary && summary.counts.overdueItems > 0) {
        bottlenecks.push({
          id: `bot-fleet-overdue-${companyId}`,
          companyId,
          category: 'VEHICLE',
          severity: summary.counts.p0 > 0 ? 'CRITICAL' : 'HIGH',
          entityType: 'VEHICLE',
          entityId: 'fleet-overdue',
          title: `Pendências Atrasadas na Frota (${summary.counts.overdueItems} itens)`,
          description: `Identificados ${summary.counts.overdueItems} itens de frota com prazos estourados (${summary.counts.maintenancesDueToday} manutenções, ${summary.counts.documentsExpiringToday} documentos).`,
          detectedAt: nowIso,
          impactScore: Math.min(summary.counts.overdueItems * 10, 85),
          durationHours: 72,
          recommendedAction: 'Regularizar manutenções e documentações vencidas para evitar indisponibilidade de faturamento.',
          status: 'ACTIVE',
        });
      }
    } catch {
      // safe fail
    }

    // Sort bottlenecks by impact score descending
    return bottlenecks.sort((a, b) => b.impactScore - a.impactScore);
  }
}
