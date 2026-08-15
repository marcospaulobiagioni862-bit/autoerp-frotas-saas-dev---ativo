// AutoERP Operational Risk Engine Service (Phase 3.58)

import {
  OperationalRiskScore,
  OperationalRiskItem,
  OperationalRiskCategory,
  OperationalRiskSeverity,
  UserContext358
} from './types';
import { TaskService } from '../workflow/TaskService';
import { SLAService } from '../workflow/SLAService';
import { PendingActionService } from '../workflow/PendingActionService';
import { IncidentManagementService } from '../incident-management/IncidentManagementService';
import { ProductivityService } from '../execution/ProductivityService';
import { generateDailyOperations } from './DailyOperationsService';
import { OperationalPriorityService } from './OperationalPriorityService';

export class OperationalRiskService {
  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
  }

  /**
   * Calculates overall operational risk score (0..100) and factor breakdown.
   * GUARANTEE: Does NOT use or allow financial data to alter the score.
   */
  public static async calculateOperationalRiskScore(
    companyId: string,
    context?: UserContext358
  ): Promise<{
    riskScore: OperationalRiskScore;
    riskItems: OperationalRiskItem[];
  }> {
    this.validateTenant(companyId);
    if (context && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de consulta cross-tenant (${context.companyId} !== ${companyId})`);
    }

    const riskItems: OperationalRiskItem[] = [];

    let backlogScore = 0;
    let slaScore = 0;
    let incidentScore = 0;
    let unavailabilityScore = 0;
    let maintenanceScore = 0;
    let documentScore = 0;
    let contractScore = 0;
    let overloadScore = 0;
    let dataQualityScore = 0;
    let recurrenceScore = 0;

    // 1. Backlog Risk
    try {
      const tasks = await TaskService.getTasks(companyId);
      const openTasks = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CLOSED');
      const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < Date.now());

      if (openTasks.length > 20) backlogScore += 30;
      else if (openTasks.length > 10) backlogScore += 15;

      if (overdueTasks.length > 5) backlogScore += 40;
      else if (overdueTasks.length > 0) backlogScore += 20;

      backlogScore = Math.min(backlogScore, 100);

      if (overdueTasks.length > 0) {
        riskItems.push({
          id: `risk-backlog-${companyId}`,
          companyId,
          category: 'BACKLOG_RISK',
          severity: overdueTasks.length >= 5 ? 'CRITICAL' : 'HIGH',
          title: 'Risco de Acúmulo de Backlog Atrasado',
          cause: `${overdueTasks.length} tarefa(s) estão com prazo estourado na operação.`,
          entityType: 'TASK',
          entityId: overdueTasks[0]?.id || 'backlog',
          recommendedAction: 'Priorizar e reatribuir tarefas atrasadas imediatamente.',
          riskScore: backlogScore,
        });
      }
    } catch {
      // safe fail
    }

    // 2. SLA Risk
    try {
      const slaRecords = await SLAService.getSLARecords(companyId);
      const breachedSla = slaRecords.filter((s) => s.status === 'BREACHED');
      const warningSla = slaRecords.filter((s) => s.status === 'WARNING');

      if (breachedSla.length > 3) slaScore += 70;
      else if (breachedSla.length > 0) slaScore += 40;

      if (warningSla.length > 5) slaScore += 30;
      else if (warningSla.length > 0) slaScore += 15;

      slaScore = Math.min(slaScore, 100);

      if (breachedSla.length > 0) {
        riskItems.push({
          id: `risk-sla-${companyId}`,
          companyId,
          category: 'SLA_RISK',
          severity: breachedSla.length >= 3 ? 'CRITICAL' : 'HIGH',
          title: 'Risco de Estouro de SLA Operacional',
          cause: `${breachedSla.length} registro(s) de SLA já foram rompidos e ${warningSla.length} em alerta.`,
          entityType: 'SLA',
          entityId: breachedSla[0]?.taskId || 'sla-breach',
          recommendedAction: 'Tratar tarefas em iminência ou que já estouraram SLA.',
          riskScore: slaScore,
        });
      }
    } catch {
      // safe fail
    }

    // 3. Incident Risk
    try {
      const incidents = await IncidentManagementService.getIncidents(companyId);
      const activeIncidents = incidents.filter(
        (i) => i.status !== 'CLOSED' && i.status !== 'RESOLVED' && i.status !== 'CANCELLED'
      );
      const sev0Sev1 = activeIncidents.filter((i) => i.severity === 'SEV0' || i.severity === 'SEV1');

      if (sev0Sev1.length > 0) incidentScore += 90;
      else if (activeIncidents.length > 2) incidentScore += 50;
      else if (activeIncidents.length > 0) incidentScore += 25;

      incidentScore = Math.min(incidentScore, 100);

      if (activeIncidents.length > 0) {
        riskItems.push({
          id: `risk-incident-${companyId}`,
          companyId,
          category: 'INCIDENT_RISK',
          severity: sev0Sev1.length > 0 ? 'CRITICAL' : 'HIGH',
          title: 'Risco de Incidentes Ativos na Operação',
          cause: `Existem ${activeIncidents.length} incidente(s) ativos (${sev0Sev1.length} críticos SEV0/SEV1).`,
          entityType: 'INCIDENT',
          entityId: activeIncidents[0]?.id || 'incident-risk',
          recommendedAction: 'Mobilizar sala de crise/Commander para conter e mitigar incidentes.',
          riskScore: incidentScore,
        });
      }
    } catch {
      // safe fail
    }

    // 4. Overload Risk
    try {
      const userCtx357 = context ? {
        userId: context.userId,
        userName: context.userName || context.userId,
        userRole: (context.userRole as any) || 'ADMIN',
        companyId: context.companyId,
      } : undefined;

      const productivity = await ProductivityService.getProductivitySnapshot(companyId, 'CURRENT', userCtx357);
      if (productivity && productivity.workloadByUser) {
        const overloaded = Object.values(productivity.workloadByUser).filter(
          (u) => u.classification === 'SOBRECARGA' || u.classification === 'CRÍTICA'
        );
        if (overloaded.length > 0) {
          overloadScore = Math.min(overloaded.length * 35, 100);
          riskItems.push({
            id: `risk-overload-${companyId}`,
            companyId,
            category: 'OVERLOAD_RISK',
            severity: overloaded.length >= 2 ? 'CRITICAL' : 'HIGH',
            title: 'Risco de Sobrecarga de Pessoas / Equipe',
            cause: `${overloaded.length} colaborador(es) estão classificados em sobrecarga crítica de trabalho.`,
            entityType: 'USER',
            entityId: overloaded[0]?.userId || 'user-overload',
            recommendedAction: 'Rebalancear a distribuição de chamados e tarefas entre a equipe.',
            riskScore: overloadScore,
          });
        }
      }
    } catch {
      // safe fail
    }

    // 5. Fleet / Unavailability & Maintenance Risk
    try {
      const summary = generateDailyOperations({ companyId });
      if (summary) {
        if (summary.counts.maintenancesDueToday > 0) {
          maintenanceScore = Math.min(summary.counts.maintenancesDueToday * 20, 100);
        }
        if (summary.counts.documentsExpiringToday > 0) {
          documentScore = Math.min(summary.counts.documentsExpiringToday * 15, 100);
        }
        if (summary.counts.p0 > 0) {
          unavailabilityScore = Math.min(summary.counts.p0 * 30, 100);
        }

        if (maintenanceScore > 0 || documentScore > 0) {
          riskItems.push({
            id: `risk-fleet-${companyId}`,
            companyId,
            category: 'MAINTENANCE_RISK',
            severity: maintenanceScore >= 60 ? 'CRITICAL' : 'MEDIUM',
            title: 'Risco de Indisponibilidade de Frota',
            cause: `Existem manutenções ou documentos de veículos com vencimento hoje/atrasados.`,
            entityType: 'VEHICLE',
            entityId: 'fleet-risk',
            recommendedAction: 'Agendar revisões e renovar licenças/documentos pendentes.',
            riskScore: Math.max(maintenanceScore, documentScore),
          });
        }
      }
    } catch {
      // safe fail
    }

    // Weighted Overall Score calculation
    const weightedSum =
      backlogScore * 0.2 +
      slaScore * 0.2 +
      incidentScore * 0.25 +
      unavailabilityScore * 0.1 +
      maintenanceScore * 0.1 +
      overloadScore * 0.15;

    const totalScore = Math.min(
      Math.max(OperationalPriorityService.safeNumber(Math.round(weightedSum), 0), 0),
      100
    );

    let level: 'EXCELENTE' | 'BOM' | 'ATENÇÃO' | 'ALTO RISCO' | 'CRÍTICO' = 'BOM';
    if (totalScore <= 20) level = 'EXCELENTE';
    else if (totalScore <= 40) level = 'BOM';
    else if (totalScore <= 60) level = 'ATENÇÃO';
    else if (totalScore <= 80) level = 'ALTO RISCO';
    else level = 'CRÍTICO';

    const riskScore: OperationalRiskScore = {
      score: totalScore,
      level,
      factors: {
        backlogScore,
        slaScore,
        incidentScore,
        unavailabilityScore,
        maintenanceScore,
        documentScore,
        contractScore,
        overloadScore,
        dataQualityScore,
        recurrenceScore,
      },
    };

    return {
      riskScore,
      riskItems: riskItems.sort((a, b) => b.riskScore - a.riskScore),
    };
  }
}
