import { OperationalProductivityService } from '../productivity/OperationalProductivityService';
import { generateOperationalTaskSummary, OperationalTask } from '../tasks/OperationalTaskService';
import { OperationalIncident } from '../incidents/OperationalIncidentService';
import { OperationalPendingItem } from '../operations/OperationalPendingService';

export type GoalCategory = 'FROTA' | 'CONTRATOS' | 'OPERAÇÃO' | 'MANUTENÇÃO' | 'SLA' | 'PRODUTIVIDADE';
export type GoalStatus = 'ACHIEVED' | 'WARNING' | 'CRITICAL' | 'NO_DATA';
export type GoalTrend = 'MELHORANDO' | 'ESTÁVEL' | 'PIORANDO' | 'SEM_DADOS';
export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type ComparisonOperator = 'MAIOR_MELHOR' | 'MENOR_MELHOR';

export interface ManagementGoal {
  id: string;
  companyId: string;
  name: string;
  description: string;
  indicatorCode: string;
  category: GoalCategory;
  targetValue: number;
  warningThreshold: number;
  criticalThreshold: number;
  comparisonOperator: ComparisonOperator;
  status?: GoalStatus;
  realizedValue?: number;
  achievementPercentage?: number;
  deviation?: number;
  trend?: GoalTrend;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ManagerialAlert {
  id: string;
  companyId: string;
  goalId?: string;
  indicatorCode: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  currentValue: number;
  targetValue: number;
  deviation: number;
  createdAt: string;
  status: 'ACTIVE' | 'RESOLVED' | 'ACKNOWLEDGED';
  recommendedAction: string;
}

export interface GoalsEvaluationResult {
  companyId: string;
  generatedAt: string;
  goalsSummary: {
    total: number;
    achieved: number;
    warning: number;
    critical: number;
    noData: number;
  };
  goals: ManagementGoal[];
  alerts: ManagerialAlert[];
}

export interface GoalsInput {
  companyId?: string;
  goals?: ManagementGoal[];
  tasks?: OperationalTask[];
  incidents?: OperationalIncident[];
  pendings?: OperationalPendingItem[];
  vehiclesCount?: number;
  activeContractsCount?: number;
}

/**
 * Deterministic service for management goals, real vs target evaluation, and managerial alerts.
 * Strictly READ-ONLY on operational data, with zero financial side effects.
 */
export class ManagementGoalsService {
  public static evaluateGoals(input: GoalsInput = {}): GoalsEvaluationResult {
    const targetCompanyId = input.companyId || 'company-main-uuid';
    const now = new Date().toISOString();

    // Fetch productivity metrics as base for indicators
    const prodMetrics = OperationalProductivityService.calculateMetrics({
      companyId: targetCompanyId,
      tasks: input.tasks,
      incidents: input.incidents,
      pendings: input.pendings,
    });

    const defaultGoals: ManagementGoal[] = [
      {
        id: `goal-prod-${targetCompanyId}`,
        companyId: targetCompanyId,
        name: 'Taxa de Conclusão de Tarefas',
        description: 'Manter a taxa de conclusão de tarefas operacionais acima de 85%.',
        indicatorCode: 'TASK_COMPLETION_RATE',
        category: 'PRODUTIVIDADE',
        targetValue: 85,
        warningThreshold: 75,
        criticalThreshold: 60,
        comparisonOperator: 'MAIOR_MELHOR',
        active: true,
        createdAt: '2026-08-01',
        updatedAt: '2026-08-01',
        createdBy: 'Admin Gerencial',
      },
      {
        id: `goal-sla-${targetCompanyId}`,
        companyId: targetCompanyId,
        name: 'Conformidade de SLA',
        description: 'Garantir que pelo menos 90% das tarefas cumpram o prazo de SLA.',
        indicatorCode: 'SLA_COMPLIANCE_RATE',
        category: 'SLA',
        targetValue: 90,
        warningThreshold: 80,
        criticalThreshold: 70,
        comparisonOperator: 'MAIOR_MELHOR',
        active: true,
        createdAt: '2026-08-01',
        updatedAt: '2026-08-01',
        createdBy: 'Admin Gerencial',
      },
      {
        id: `goal-overdue-${targetCompanyId}`,
        companyId: targetCompanyId,
        name: 'Tarefas em Atraso',
        description: 'Reduzir ao máximo o número de tarefas operacionais em atraso.',
        indicatorCode: 'OVERDUE_TASKS',
        category: 'OPERAÇÃO',
        targetValue: 0,
        warningThreshold: 3,
        criticalThreshold: 8,
        comparisonOperator: 'MENOR_MELHOR',
        active: true,
        createdAt: '2026-08-01',
        updatedAt: '2026-08-01',
        createdBy: 'Admin Gerencial',
      },
    ];

    const inputGoals = Array.isArray(input.goals) && input.goals.length > 0 ? input.goals.filter(g => g && g.companyId === targetCompanyId) : defaultGoals;

    const evaluatedGoals: ManagementGoal[] = inputGoals.map(goal => {
      let realizedValue = 0;
      if (goal.indicatorCode === 'TASK_COMPLETION_RATE') {
        realizedValue = prodMetrics.tasks.completionRate;
      } else if (goal.indicatorCode === 'SLA_COMPLIANCE_RATE') {
        realizedValue = prodMetrics.sla.complianceRate;
      } else if (goal.indicatorCode === 'OVERDUE_TASKS') {
        realizedValue = prodMetrics.tasks.overdue;
      } else {
        realizedValue = prodMetrics.tasks.completionRate;
      }

      const deviation = Math.round((realizedValue - goal.targetValue) * 10) / 10;
      let achievementPercentage = 100;
      if (goal.targetValue > 0) {
        if (goal.comparisonOperator === 'MAIOR_MELHOR') {
          achievementPercentage = Math.round((realizedValue / goal.targetValue) * 1000) / 10;
        } else {
          // MENOR_MELHOR (ex: overdue tasks where target is 0)
          if (realizedValue === 0) achievementPercentage = 100;
          else achievementPercentage = Math.max(0, Math.round((1 - realizedValue / (goal.warningThreshold || 5)) * 100));
        }
      }

      if (isNaN(achievementPercentage) || !isFinite(achievementPercentage)) {
        achievementPercentage = 0;
      }

      let status: GoalStatus = 'ACHIEVED';
      if (isNaN(realizedValue) || !isFinite(realizedValue)) {
        status = 'NO_DATA';
      } else if (goal.comparisonOperator === 'MAIOR_MELHOR') {
        if (realizedValue < goal.criticalThreshold) status = 'CRITICAL';
        else if (realizedValue < goal.warningThreshold) status = 'WARNING';
        else status = 'ACHIEVED';
      } else {
        // MENOR_MELHOR
        if (realizedValue > goal.criticalThreshold) status = 'CRITICAL';
        else if (realizedValue > goal.warningThreshold) status = 'WARNING';
        else status = 'ACHIEVED';
      }

      const trend: GoalTrend = realizedValue >= goal.targetValue ? 'MELHORANDO' : 'ESTÁVEL';

      return {
        ...goal,
        realizedValue,
        achievementPercentage,
        deviation,
        status,
        trend,
      };
    });

    let achieved = 0, warning = 0, critical = 0, noData = 0;
    const alerts: ManagerialAlert[] = [];

    evaluatedGoals.forEach(g => {
      if (g.status === 'ACHIEVED') achieved++;
      else if (g.status === 'WARNING') warning++;
      else if (g.status === 'CRITICAL') critical++;
      else if (g.status === 'NO_DATA') noData++;

      if (g.status === 'CRITICAL' || g.status === 'WARNING') {
        const severity: AlertSeverity = g.status === 'CRITICAL' ? 'P0' : 'P1';
        alerts.push({
          id: `alert-${g.id}-${Date.now()}`,
          companyId: targetCompanyId,
          goalId: g.id,
          indicatorCode: g.indicatorCode,
          severity,
          title: `Desvio em ${g.name}`,
          message: `O indicador ${g.name} registrou ${g.realizedValue} (Meta: ${g.targetValue}), violando o limite configurado.`,
          currentValue: g.realizedValue || 0,
          targetValue: g.targetValue,
          deviation: g.deviation || 0,
          createdAt: now,
          status: 'ACTIVE',
          recommendedAction: g.indicatorCode === 'OVERDUE_TASKS' ? 'Visualizar Tarefas Atrasadas na Central de Tarefas' : 'Revisar atribuições e prazos operacionais',
        });
      }
    });

    return {
      companyId: targetCompanyId,
      generatedAt: now,
      goalsSummary: {
        total: evaluatedGoals.length,
        achieved,
        warning,
        critical,
        noData,
      },
      goals: evaluatedGoals,
      alerts,
    };
  }
}
