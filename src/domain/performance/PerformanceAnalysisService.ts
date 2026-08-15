// AutoERP Performance Analysis Service (Phase 3.60)

import {
  PerformanceAnalysisResult,
  PerformanceClassification,
  PerformanceForecast,
  Goal,
  KPI,
  ActionPlan,
  UserContext360
} from './types';
import { GoalService } from './GoalService';
import { KPIManagementService } from './KPIManagementService';
import { ActionPlanService } from './ActionPlanService';

export class PerformanceAnalysisService {
  public static safeScore(val: number): number {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(val)));
  }

  public static getClassification(score: number): PerformanceClassification {
    const s = this.safeScore(score);
    if (s >= 90) return 'EXCELLENT';
    if (s >= 75) return 'GOOD';
    if (s >= 60) return 'ON_TRACK';
    if (s >= 40) return 'AT_RISK';
    if (s >= 20) return 'CRITICAL';
    return 'FAILED';
  }

  public static getForecast(overallScore: number, atRiskGoalsCount: number, blockedPlansCount: number): PerformanceForecast {
    if (atRiskGoalsCount === 0 && blockedPlansCount === 0 && overallScore >= 75) {
      return 'EXPECTED_ON_TIME';
    }
    if (overallScore >= 50 && atRiskGoalsCount <= 2) {
      return 'EXPECTED_LATE';
    }
    if (overallScore < 50 || atRiskGoalsCount > 2 || blockedPlansCount > 2) {
      return 'UNLIKELY_TO_ACHIEVE';
    }
    return 'INSUFFICIENT_DATA';
  }

  public static async analyzePerformance(companyId: string, context?: UserContext360): Promise<PerformanceAnalysisResult> {
    const goals: Goal[] = await GoalService.getGoals(companyId, context);
    const kpis: KPI[] = await KPIManagementService.getKPIs(companyId, context);
    const actionPlans: ActionPlan[] = await ActionPlanService.getActionPlans(companyId, context);

    // 1. Goal Achievement Score
    let goalAchievementScore = 80;
    let atRiskGoalsCount = 0;
    if (goals.length > 0) {
      const totalProg = goals.reduce((acc, g) => acc + (g.progressPercentage || 0), 0);
      goalAchievementScore = this.safeScore(totalProg / goals.length);
      atRiskGoalsCount = goals.filter((g) => g.status === 'AT_RISK' || g.status === 'FAILED').length;
    }

    // 2. KPI Health Score
    let kpiHealthScore = 85;
    if (kpis.length > 0) {
      const normalKpis = kpis.filter((k) => k.status === 'NORMAL').length;
      kpiHealthScore = this.safeScore((normalKpis / kpis.length) * 100);
    }

    // 3. Execution Score
    let executionScore = 80;
    let blockedActionPlansCount = 0;
    if (actionPlans.length > 0) {
      const completedPlans = actionPlans.filter((p) => p.status === 'COMPLETED' || p.status === 'CLOSED').length;
      executionScore = this.safeScore((completedPlans / actionPlans.length) * 100);
      blockedActionPlansCount = actionPlans.filter((p) => p.status === 'BLOCKED' || p.status === 'AT_RISK').length;
    }

    const slaScore = 90;
    const productivityScore = 85;
    const riskScore = Math.max(0, 100 - (atRiskGoalsCount * 15 + blockedActionPlansCount * 10));
    const dataQualityScore = 95;
    const decisionEffectivenessScore = 88;
    const incidentRecurrenceScore = 92;
    const continuousImprovementScore = 85;

    const overallScore = this.safeScore(
      goalAchievementScore * 0.25 +
      kpiHealthScore * 0.20 +
      executionScore * 0.20 +
      riskScore * 0.15 +
      slaScore * 0.10 +
      continuousImprovementScore * 0.10
    );

    const classification = this.getClassification(overallScore);
    const forecast = this.getForecast(overallScore, atRiskGoalsCount, blockedActionPlansCount);

    return {
      overallScore,
      classification,
      forecast,
      goalAchievementScore,
      kpiHealthScore,
      executionScore,
      slaScore,
      productivityScore,
      riskScore,
      dataQualityScore,
      decisionEffectivenessScore,
      incidentRecurrenceScore,
      continuousImprovementScore,
      atRiskGoalsCount,
      blockedActionPlansCount,
      overdueTasksCount: blockedActionPlansCount,
    };
  }
}
