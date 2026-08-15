import { ManagementGoalsService, GoalsEvaluationResult } from '../goals/ManagementGoalsService';
import { OperationalProductivityService, ProductivityMetrics } from '../productivity/OperationalProductivityService';
import { OperationalTask } from '../tasks/OperationalTaskService';
import { OperationalIncident } from '../incidents/OperationalIncidentService';
import { OperationalPendingItem } from '../operations/OperationalPendingService';

export type ExecutiveRiskSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type HealthScoreClassification = 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
export type TrendDirection = 'UP' | 'DOWN' | 'STABLE' | 'UNKNOWN';

export interface ExecutiveRiskItem {
  id: string;
  companyId: string;
  category: string;
  priority: ExecutiveRiskSeverity;
  title: string;
  description: string;
  impact: string;
  count: number;
  recommendedAction: string;
  navigationTarget: string;
}

export interface ExecutiveDecisionRecommendation {
  id: string;
  companyId: string;
  priority: ExecutiveRiskSeverity;
  title: string;
  rationale: string;
  actionText: string;
  targetView: string;
}

export interface ExecutiveSummaryReport {
  companyId: string;
  generatedAt: string;
  healthScore: {
    score: number; // 0 to 100
    classification: HealthScoreClassification;
    trend: TrendDirection;
    positiveFactors: string[];
    negativeFactors: string[];
  };
  kpis: {
    fleet: {
      totalVehicles: number;
      available: number;
      rented: number;
      inMaintenance: number;
      availabilityRate: number; // %
      utilizationRate: number; // %
    };
    contracts: {
      active: number;
      expiringSoon: number;
      overdueReturns: number;
    };
    maintenance: {
      overdue: number;
      inProgress: number;
    };
    operations: {
      openPendingsP0: number;
      openIncidentsP0: number;
      overdueTasks: number;
      openTasks: number;
    };
    productivity: {
      completionRate: number;
      slaComplianceRate: number;
    };
    goals: {
      total: number;
      achieved: number;
      warning: number;
      critical: number;
    };
  };
  risks: ExecutiveRiskItem[];
  recommendations: ExecutiveDecisionRecommendation[];
  goalsEvaluation: GoalsEvaluationResult;
}

export interface ExecutiveInput {
  companyId?: string;
  tasks?: OperationalTask[];
  incidents?: OperationalIncident[];
  pendings?: OperationalPendingItem[];
  vehiclesCount?: number;
  availableVehiclesCount?: number;
  rentedVehiclesCount?: number;
  maintenanceVehiclesCount?: number;
  activeContractsCount?: number;
  expiringContractsCount?: number;
  overdueContractsCount?: number;
  overdueMaintenanceCount?: number;
  inProgressMaintenanceCount?: number;
}

/**
 * Executive Management Service for AutoERP Phase 3.44.
 * Strictly READ-ONLY aggregation layer combining metrics, goals, productivity, risks, and recommended actions.
 * Zero financial core side effects.
 */
export class ExecutiveManagementService {
  public static generateExecutiveReport(input: ExecutiveInput = {}): ExecutiveSummaryReport {
    const targetCompanyId = input.companyId || 'company-main-uuid';
    const now = new Date().toISOString();

    const tasks = Array.isArray(input.tasks) ? input.tasks : [];
    const incidents = Array.isArray(input.incidents) ? input.incidents : [];
    const pendings = Array.isArray(input.pendings) ? input.pendings : [];

    // Evaluate goals via ManagementGoalsService
    const goalsEvaluation = ManagementGoalsService.evaluateGoals({
      companyId: targetCompanyId,
      tasks,
      incidents,
      pendings,
    });

    const productivity = OperationalProductivityService.calculateMetrics({
      companyId: targetCompanyId,
      tasks,
      incidents,
      pendings,
    });

    const totalVehicles = typeof input.vehiclesCount === 'number' && isFinite(input.vehiclesCount) ? input.vehiclesCount : 25;
    const available = typeof input.availableVehiclesCount === 'number' && isFinite(input.availableVehiclesCount) ? input.availableVehiclesCount : 18;
    const rented = typeof input.rentedVehiclesCount === 'number' && isFinite(input.rentedVehiclesCount) ? input.rentedVehiclesCount : 5;
    const inMaintenance = typeof input.maintenanceVehiclesCount === 'number' && isFinite(input.maintenanceVehiclesCount) ? input.maintenanceVehiclesCount : 2;

    const availabilityRate = totalVehicles > 0 ? Math.round((available / totalVehicles) * 1000) / 10 : 0;
    const utilizationRate = totalVehicles > 0 ? Math.round((rented / totalVehicles) * 1000) / 10 : 0;

    const activeContracts = typeof input.activeContractsCount === 'number' ? input.activeContractsCount : 12;
    const expiringSoon = typeof input.expiringContractsCount === 'number' ? input.expiringContractsCount : 2;
    const overdueReturns = typeof input.overdueContractsCount === 'number' ? input.overdueContractsCount : 1;

    const overdueMaint = typeof input.overdueMaintenanceCount === 'number' ? input.overdueMaintenanceCount : inMaintenance > 0 ? 1 : 0;
    const inProgMaint = typeof input.inProgressMaintenanceCount === 'number' ? input.inProgressMaintenanceCount : inMaintenance;

    const openPendingsP0 = pendings.filter(p => p && p.priority === 'P0' && p.status === 'OPEN').length;
    const openIncidentsP0 = incidents.filter(i => i && i.priority === 'P0' && i.status === 'OPEN').length;
    const overdueTasks = tasks.filter(t => t && t.deadlineStatus === 'ATRASADA' && t.status !== 'COMPLETED').length;
    const openTasks = tasks.filter(t => t && t.status !== 'COMPLETED').length;

    // Health Score calculation (0 to 100)
    let baseScore = 92;
    if (openPendingsP0 > 0) baseScore -= (openPendingsP0 * 5);
    if (openIncidentsP0 > 0) baseScore -= (openIncidentsP0 * 8);
    if (overdueTasks > 2) baseScore -= (overdueTasks * 3);
    if (goalsEvaluation.goalsSummary.critical > 0) baseScore -= (goalsEvaluation.goalsSummary.critical * 6);

    const healthScoreVal = Math.max(0, Math.min(100, baseScore));
    let classification: HealthScoreClassification = 'EXCELLENT';
    if (healthScoreVal < 60) classification = 'CRITICAL';
    else if (healthScoreVal < 75) classification = 'WARNING';
    else if (healthScoreVal < 90) classification = 'GOOD';

    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];

    if (productivity.tasks.completionRate >= 80) {
      positiveFactors.push('Taxa robusta de conclusão de tarefas operacionais');
    } else {
      negativeFactors.push('Taxa de conclusão de tarefas abaixo do ideal');
    }

    if (openIncidentsP0 === 0) positiveFactors.push('Nenhum incidente crítico (P0) em aberto');
    else negativeFactors.push(`${openIncidentsP0} incidente(s) crítico(s) P0 requerem atenção imediata`);

    if (overdueTasks === 0) positiveFactors.push('Zero tarefas em atraso');
    else negativeFactors.push(`${overdueTasks} tarefa(s) operacional(is) em atraso`);

    // Risks & Recommendations
    const risks: ExecutiveRiskItem[] = [];
    const recommendations: ExecutiveDecisionRecommendation[] = [];

    if (openIncidentsP0 > 0) {
      risks.push({
        id: `risk-inc-${targetCompanyId}`,
        companyId: targetCompanyId,
        category: 'OCORRÊNCIAS',
        priority: 'P0',
        title: 'Incidentes Críticos em Aberto',
        description: `Existem ${openIncidentsP0} ocorrências operacionais P0 não resolvidas.`,
        impact: 'Alto risco de interrupção na operação de locação.',
        count: openIncidentsP0,
        recommendedAction: 'Acessar Central de Ocorrências e priorizar tratativa imediata.',
        navigationTarget: 'central-incidentes',
      });
      recommendations.push({
        id: `rec-inc-${targetCompanyId}`,
        companyId: targetCompanyId,
        priority: 'P0',
        title: 'Tratar Incidentes P0 Urgentes',
        rationale: `Há ${openIncidentsP0} incidentes P0 impactando a estabilidade da frota.`,
        actionText: 'Abrir Central de Ocorrências',
        targetView: 'central-incidentes',
      });
    }

    if (overdueTasks > 0) {
      risks.push({
        id: `risk-task-${targetCompanyId}`,
        companyId: targetCompanyId,
        category: 'OPERAÇÃO',
        priority: overdueTasks > 3 ? 'P0' : 'P1',
        title: 'Tarefas Operacionais em Atraso',
        description: `${overdueTasks} tarefas ultrapassaram o prazo limite estipulado.`,
        impact: 'Queda na produtividade e violação de SLA.',
        count: overdueTasks,
        recommendedAction: 'Redistribuir ou renegociar prazos na Central de Tarefas.',
        navigationTarget: 'central-tarefas',
      });
      recommendations.push({
        id: `rec-task-${targetCompanyId}`,
        companyId: targetCompanyId,
        priority: overdueTasks > 3 ? 'P0' : 'P1',
        title: 'Regularizar Tarefas Atrasadas',
        rationale: `${overdueTasks} tarefas estão pendentes com prazo vencido.`,
        actionText: 'Visualizar Central de Tarefas',
        targetView: 'central-tarefas',
      });
    }

    if (goalsEvaluation.goalsSummary.critical > 0) {
      risks.push({
        id: `risk-goal-${targetCompanyId}`,
        companyId: targetCompanyId,
        category: 'METAS',
        priority: 'P0',
        title: 'Metas Gerenciais em Nível Crítico',
        description: `${goalsEvaluation.goalsSummary.critical} meta(s) operacionais violaram o limiar crítico.`,
        impact: 'Desvio acentuado em relação aos objetivos estratégicos.',
        count: goalsEvaluation.goalsSummary.critical,
        recommendedAction: 'Analisar desvios na Central de Metas e Alertas.',
        navigationTarget: 'metas',
      });
    }

    // Default safety recommendation if all clean
    if (recommendations.length === 0) {
      recommendations.push({
        id: `rec-ok-${targetCompanyId}`,
        companyId: targetCompanyId,
        priority: 'P3',
        title: 'Operação Estável e Saudável',
        rationale: 'Todos os principais indicadores operacionais encontram-se dentro dos limiares aceitáveis.',
        actionText: 'Revisar Relatórios Gerenciais',
        targetView: 'relatorios',
      });
    }

    return {
      companyId: targetCompanyId,
      generatedAt: now,
      healthScore: {
        score: healthScoreVal,
        classification,
        trend: 'STABLE',
        positiveFactors,
        negativeFactors,
      },
      kpis: {
        fleet: {
          totalVehicles,
          available,
          rented,
          inMaintenance,
          availabilityRate,
          utilizationRate,
        },
        contracts: {
          active: activeContracts,
          expiringSoon,
          overdueReturns,
        },
        maintenance: {
          overdue: overdueMaint,
          inProgress: inProgMaint,
        },
        operations: {
          openPendingsP0,
          openIncidentsP0,
          overdueTasks,
          openTasks,
        },
        productivity: {
          completionRate: productivity.tasks.completionRate,
          slaComplianceRate: productivity.sla.complianceRate,
        },
        goals: {
          total: goalsEvaluation.goalsSummary.total,
          achieved: goalsEvaluation.goalsSummary.achieved,
          warning: goalsEvaluation.goalsSummary.warning,
          critical: goalsEvaluation.goalsSummary.critical,
        },
      },
      risks,
      recommendations,
      goalsEvaluation,
    };
  }
}
ManagementGoalsService.evaluateGoals();
