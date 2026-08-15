// AutoERP Decision Metrics Service Unit Tests (Phase 3.59)

import { DecisionMetricsService } from './DecisionMetricsService';
import { DecisionManagementService } from './DecisionManagementService';
import { UserContext359 } from './types';

export class DecisionMetricsServiceTests {
  public static async runTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    const companyId = `test-met-company-${Date.now()}`;
    const ctx: UserContext359 = {
      userId: 'user-admin-met',
      userName: 'Metrics Admin',
      userRole: 'ADMIN',
      companyId,
    };

    try {
      // Test 1: Empty metrics zero-division safety
      const emptyMetrics = DecisionMetricsService.calculateMetrics([], companyId, ctx);
      if (emptyMetrics.totalDecisions === 0 && emptyMetrics.successRate === 100 && emptyMetrics.overdueRate === 0) {
        passed++;
      } else {
        failed++;
        errors.push('Metrics Test 1 Failed: Zero decisions calculation invalid');
      }

      // Test 2: Populated decision metrics
      await DecisionManagementService.createDecision(
        {
          companyId,
          title: 'Decisão P0 Crítica',
          description: 'Ação emergencial',
          sourceType: 'INCIDENT',
          priority: 'P0',
          responsibleUserId: 'user-met-1',
          expectedResult: 'Incidente mitigado',
          successCriteria: 'Sem reincidência',
        },
        ctx
      );

      const decisions = await DecisionManagementService.getDecisions(companyId, ctx);
      const metrics = DecisionMetricsService.calculateMetrics(decisions, companyId, ctx);

      if (metrics.totalDecisions === 1 && metrics.criticalP0P1Count === 1 && metrics.openDecisions === 1) {
        passed++;
      } else {
        failed++;
        errors.push('Metrics Test 2 Failed: Populated metrics calculation mismatch');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Metrics Service Exception: ${e.message}`);
    }

    return { passed, failed, errors };
  }
}
