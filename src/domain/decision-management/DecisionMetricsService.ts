// AutoERP Decision Metrics Service (Phase 3.59)

import {
  ExecutiveDecision,
  DecisionMetrics,
  UserContext359
} from './types';
import { DecisionEffectivenessService } from './DecisionEffectivenessService';

export class DecisionMetricsService {
  private static validateTenant(companyId: string, context?: UserContext359): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== context.companyId) {
      throw new Error('Acesso negado: Tentativa de métrica cross-tenant');
    }
  }

  /**
   * Safely calculates percentage (0 - 100) guarding against division by zero
   */
  public static safePercentage(numerator: number, denominator: number): number {
    if (!denominator || denominator <= 0 || typeof numerator !== 'number' || isNaN(numerator)) {
      return 0;
    }
    const pct = (numerator / denominator) * 100;
    return DecisionEffectivenessService.safeScore(pct);
  }

  /**
   * Calculates comprehensive Decision KPIs for a tenant
   */
  public static calculateMetrics(
    decisions: ExecutiveDecision[],
    companyId: string,
    context?: UserContext359
  ): DecisionMetrics {
    this.validateTenant(companyId, context);

    const tenantDecisions = decisions.filter((d) => d && d.companyId === companyId);
    return this.computeMetricsFromList(tenantDecisions, companyId);
  }

  public static calculateKPIs(decisions: ExecutiveDecision[], companyId: string = 'company-main-uuid'): DecisionMetrics {
    const tenantDecisions = decisions.filter((d) => d && d.companyId === companyId);
    return this.computeMetricsFromList(tenantDecisions.length > 0 ? tenantDecisions : decisions, companyId);
  }

  private static computeMetricsFromList(tenantDecisions: ExecutiveDecision[], companyId: string): DecisionMetrics {
    const total = tenantDecisions.length;

    if (total === 0) {
      return {
        companyId,
        totalDecisions: 0,
        openDecisions: 0,
        criticalP0P1Count: 0,
        overdueCount: 0,
        escalatedCount: 0,
        inExecutionCount: 0,
        completedCount: 0,
        reopenedCount: 0,
        avgLeadTimeHours: 0,
        avgExecutionTimeHours: 0,
        avgClosureTimeHours: 0,
        successRate: 100,
        reopenRate: 0,
        escalationRate: 0,
        overdueRate: 0,
        effectivenessScore: 100,
        p0P1ResolutionRate: 100,
        actionConversionRate: 0,
        decisionsByCategory: {},
        decisionsByResponsible: {},
      };
    }

    const openStatuses = ['PROPOSED', 'UNDER_ANALYSIS', 'APPROVED', 'IN_EXECUTION', 'WAITING_RESULT', 'VALIDATING', 'ESCALATED', 'REOPENED'];
    const openDecisions = tenantDecisions.filter((d) => openStatuses.includes(d.status)).length;
    const criticalP0P1 = tenantDecisions.filter((d) => d.priority === 'P0' || d.priority === 'P1');
    const criticalP0P1Count = criticalP0P1.length;

    const now = Date.now();
    const overdueCount = tenantDecisions.filter(
      (d) => openStatuses.includes(d.status) && d.dueAt && new Date(d.dueAt).getTime() < now
    ).length;

    const escalatedCount = tenantDecisions.filter(
      (d) => d.status === 'ESCALATED' || d.escalationLevel !== 'LEVEL_0'
    ).length;

    const inExecutionCount = tenantDecisions.filter((d) => d.status === 'IN_EXECUTION').length;
    const completedCount = tenantDecisions.filter((d) => d.status === 'COMPLETED' || d.status === 'CLOSED').length;
    const reopenedCount = tenantDecisions.filter((d) => d.status === 'REOPENED' || d.reopenedAt).length;

    // Time Metrics
    let leadTimeSum = 0;
    let leadTimeCount = 0;
    let execTimeSum = 0;
    let execTimeCount = 0;
    let closureTimeSum = 0;
    let closureTimeCount = 0;

    for (const d of tenantDecisions) {
      const created = new Date(d.createdAt).getTime();
      if (isNaN(created)) continue;

      if (d.decidedAt) {
        const decided = new Date(d.decidedAt).getTime();
        if (!isNaN(decided) && decided >= created) {
          leadTimeSum += (decided - created) / 3600000; // hours
          leadTimeCount++;
        }
      }

      if (d.decidedAt && d.completedAt) {
        const decided = new Date(d.decidedAt).getTime();
        const comp = new Date(d.completedAt).getTime();
        if (!isNaN(decided) && !isNaN(comp) && comp >= decided) {
          execTimeSum += (comp - decided) / 3600000;
          execTimeCount++;
        }
      }

      if (d.closedAt) {
        const closed = new Date(d.closedAt).getTime();
        if (!isNaN(closed) && closed >= created) {
          closureTimeSum += (closed - created) / 3600000;
          closureTimeCount++;
        }
      }
    }

    const avgLeadTimeHours = leadTimeCount > 0 ? Math.round((leadTimeSum / leadTimeCount) * 10) / 10 : 0;
    const avgExecutionTimeHours = execTimeCount > 0 ? Math.round((execTimeSum / execTimeCount) * 10) / 10 : 0;
    const avgClosureTimeHours = closureTimeCount > 0 ? Math.round((closureTimeSum / closureTimeCount) * 10) / 10 : 0;

    // Rates
    const successRate = this.safePercentage(
      tenantDecisions.filter((d) => (d.status === 'COMPLETED' || d.status === 'CLOSED') && (d.effectivenessScore || 0) >= 50).length,
      completedCount || 1
    );

    const reopenRate = this.safePercentage(reopenedCount, total);
    const escalationRate = this.safePercentage(escalatedCount, total);
    const overdueRate = this.safePercentage(overdueCount, total);

    // Effectiveness Average
    const scoredDecisions = tenantDecisions.filter((d) => typeof d.effectivenessScore === 'number');
    let avgEffectiveness = 100;
    if (scoredDecisions.length > 0) {
      const sumEffectiveness = scoredDecisions.reduce((acc, curr) => acc + (curr.effectivenessScore || 0), 0);
      avgEffectiveness = DecisionEffectivenessService.safeScore(sumEffectiveness / scoredDecisions.length);
    }

    // P0/P1 Resolution Rate
    const completedP0P1 = criticalP0P1.filter((d) => d.status === 'COMPLETED' || d.status === 'CLOSED').length;
    const p0P1ResolutionRate = this.safePercentage(completedP0P1, criticalP0P1Count || 1);

    // Action Conversion Rate (decisions with linked actions)
    const convertedDecisions = tenantDecisions.filter(
      (d) => (d.linkedTaskIds && d.linkedTaskIds.length > 0) || (d.linkedPendingActionIds && d.linkedPendingActionIds.length > 0)
    ).length;
    const actionConversionRate = this.safePercentage(convertedDecisions, total);

    // Breakdown maps
    const decisionsByCategory: Record<string, number> = {};
    const decisionsByResponsible: Record<string, number> = {};

    for (const d of tenantDecisions) {
      const cat = d.category || 'OPERATIONAL';
      decisionsByCategory[cat] = (decisionsByCategory[cat] || 0) + 1;

      const resp = d.responsibleUserId || 'UNASSIGNED';
      decisionsByResponsible[resp] = (decisionsByResponsible[resp] || 0) + 1;
    }

    return {
      companyId,
      totalDecisions: total,
      openDecisions,
      criticalP0P1Count,
      overdueCount,
      escalatedCount,
      inExecutionCount,
      completedCount,
      reopenedCount,
      avgLeadTimeHours,
      avgExecutionTimeHours,
      avgClosureTimeHours,
      successRate,
      reopenRate,
      escalationRate,
      overdueRate,
      effectivenessScore: avgEffectiveness,
      p0P1ResolutionRate,
      actionConversionRate,
      decisionsByCategory,
      decisionsByResponsible,
    };
  }
}
