// AutoERP Performance Management Orchestrator Service (Phase 3.60)

import {
  UserContext360,
  Goal,
  KPI,
  Objective,
  KeyResult,
  ActionPlan,
  ResultMeasurement,
  PDCARecord,
  PerformanceAnalysisResult,
  PerformanceSnapshot
} from './types';
import { GoalService } from './GoalService';
import { KPIManagementService } from './KPIManagementService';
import { OKRService } from './OKRService';
import { ActionPlanService } from './ActionPlanService';
import { ResultTrackingService } from './ResultTrackingService';
import { PerformanceAnalysisService } from './PerformanceAnalysisService';
import { ContinuousImprovementService } from './ContinuousImprovementService';
import { PerformanceSnapshotService } from './PerformanceSnapshotService';

export class PerformanceManagementService {
  private static validateTenant(companyId: string, context?: UserContext360): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de operação de gestão de performance cross-tenant (${context.companyId} !== ${companyId})`);
    }
  }

  private static validateFinancialProtection(text?: string): void {
    if (!text) return;
    const forbiddenKeywords = [
      'writefinance',
      'updatebalance',
      'updatefinancialtransaction',
      'modifypayment',
      'modifyreceipt',
      'modifycontapagar',
      'modifycontareceber'
    ];
    const lower = text.toLowerCase();
    for (const kw of forbiddenKeywords) {
      if (lower.includes(kw)) {
        throw new Error('Operação financeira não permitida no orquestrador de performance');
      }
    }
  }

  public static async getPerformanceOverview(companyId: string, context: UserContext360): Promise<{
    analysis: PerformanceAnalysisResult;
    goals: Goal[];
    kpis: KPI[];
    objectives: Objective[];
    keyResults: KeyResult[];
    actionPlans: ActionPlan[];
    recentMeasurements: ResultMeasurement[];
    pdcaRecords: PDCARecord[];
    snapshots: PerformanceSnapshot[];
  }> {
    this.validateTenant(companyId, context);

    const goals = await GoalService.getGoals(companyId, context);
    const kpis = await KPIManagementService.getKPIs(companyId, context);
    const objectives = await OKRService.getObjectives(companyId, context);
    const keyResults = await OKRService.getKeyResults(companyId, context);
    const actionPlans = await ActionPlanService.getActionPlans(companyId, context);
    const recentMeasurements = await ResultTrackingService.getMeasurements(companyId, context);
    const pdcaRecords = await ContinuousImprovementService.getPDCARecords(companyId, context);
    const snapshots = await PerformanceSnapshotService.getSnapshots(companyId, context);
    const analysis = await PerformanceAnalysisService.analyzePerformance(companyId, context);

    return {
      analysis,
      goals,
      kpis,
      objectives,
      keyResults,
      actionPlans,
      recentMeasurements,
      pdcaRecords,
      snapshots,
    };
  }

  /**
   * Seed default demo data for Phase 3.60 if tenant is empty
   */
  public static async seedDemoDataIfEmpty(companyId: string, context: UserContext360): Promise<void> {
    this.validateTenant(companyId, context);

    const goals = await GoalService.getGoals(companyId, context);
    if (goals.length > 0) return; // Already seeded or has data

    // 1. Create Objective & KRs
    const obj = await OKRService.createObjective(
      {
        companyId,
        title: 'Aumentar a Eficiência Operacional e SLA da Frota',
        description: 'Objetivo estratégico para otimização de frotas, entregas e satisfação de clientes',
        ownerId: context.userId,
        period: '2026-Q1',
      },
      context
    );

    const kr1 = await OKRService.createKeyResult(
      {
        companyId,
        objectiveId: obj.id,
        title: 'Reduzir atraso em entregas de 12% para menos de 3%',
        metric: '% de Entregas Atrasadas',
        baseline: 12,
        target: 3,
        ownerId: context.userId,
      },
      context
    );

    // 2. Create KPIs
    const kpi1 = await KPIManagementService.createKPI(
      {
        companyId,
        name: 'Índice de SLA de Frota',
        description: 'Percentual de rotas cumpridas dentro da janela estipulada',
        category: 'FLEET',
        unit: '%',
        calculationMethod: '(Rotas no prazo / Total Rotas) * 100',
        target: 95,
        warningThreshold: 90,
        criticalThreshold: 80,
        currentValue: 92,
        ownerId: context.userId,
      },
      context
    );

    const kpiFinancial = await KPIManagementService.createKPI(
      {
        companyId,
        name: 'Margem Operacional Líquida (Read-Only)',
        description: 'Métrica consolidada do centro financeiro para acompanhamento de resultados (Somente Leitura)',
        category: 'FINANCIAL_READ_ONLY',
        unit: '%',
        calculationMethod: 'getReadOnlyFinancialStatus()',
        target: 25,
        warningThreshold: 18,
        criticalThreshold: 12,
        currentValue: 22,
        ownerId: context.userId,
        isReadOnlyFinancial: true,
      },
      context
    );

    // 3. Create Goal
    const goal1 = await GoalService.createGoal(
      {
        companyId,
        title: 'Alcançar 95% de Cumprimento de SLA na Frota Sul',
        description: 'Meta tática associada ao KR de entregas pontuais',
        category: 'FLEET',
        ownerId: context.userId,
        startDate: new Date().toISOString().substring(0, 10),
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10),
        targetValue: 95,
        baselineValue: 80,
        unit: '%',
        direction: 'INCREASE',
        priority: 'P1',
        linkedObjectiveId: obj.id,
        linkedKPIId: kpi1.id,
      },
      context
    );

    await GoalService.updateGoalProgress(goal1.id, companyId, 88, context);

    // 4. Create Action Plan
    const aplan = await ActionPlanService.createActionPlan(
      {
        companyId,
        goalId: goal1.id,
        objectiveId: obj.id,
        title: 'Reestruturação de Manutenção Preventiva e Roteamento',
        description: 'Ação para recalibrar janelas de inspeção mecânica das frotas pesadas',
        ownerId: context.userId,
        priority: 'P1',
        startDate: new Date().toISOString().substring(0, 10),
        dueDate: new Date(Date.now() + 15 * 86400000).toISOString().substring(0, 10),
        risk: 'MEDIUM',
        expectedResult: 'Eliminação de paradas não programadas por falhas de motor',
      },
      context
    );

    await ActionPlanService.updatePlanProgress(aplan.id, companyId, 60, 'ACTIVE', 'Revisão das 10 primeiras carretas concluída', context);

    // 5. Record Result Measurement
    await ResultTrackingService.recordMeasurement(
      {
        companyId,
        goalId: goal1.id,
        metricId: kpi1.id,
        measuredValue: 88,
        expectedValue: 90,
        source: 'SENSORS_IOT_FLEET',
      },
      context
    );

    // 6. Create PDCA
    await ContinuousImprovementService.createPDCARecord(
      {
        companyId,
        goalId: goal1.id,
        actionPlanId: aplan.id,
        title: 'Análise de Gargalo na Saída do Hub de Curitiba',
        rootCause: 'Demora na liberação de nota fiscal na guarita',
        impactDescription: 'Atraso médio de 45 min por veículo',
        correctiveAction: 'Implementar leitura automatizada de QR Code na guarita',
        preventiveAction: 'Pré-validação digital de manifestos antes da chegada',
        ownerId: context.userId,
        dueDate: new Date(Date.now() + 10 * 86400000).toISOString().substring(0, 10),
        expectedOutcome: 'Redução do tempo de guarita para menos de 3 minutos',
      },
      context
    );

    // 7. Initial Snapshot
    await PerformanceSnapshotService.saveSnapshot(companyId, context);
  }
}
