// Unit tests for OperationalRiskService (Phase 3.58)

import { OperationalRiskService } from './OperationalRiskService';

export class OperationalRiskTestRunner {
  public static async runTests(): Promise<{ total: number; passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Test 1: Risk score calculation within 0..100
    try {
      const companyId = 'company-test-risk-uuid';
      const { riskScore, riskItems } = await OperationalRiskService.calculateOperationalRiskScore(companyId);
      if (riskScore.score >= 0 && riskScore.score <= 100 && Array.isArray(riskItems)) {
        passed++;
      } else {
        failed++;
        errors.push(`Invalid risk score or items: ${riskScore.score}`);
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 1 threw error: ${e.message}`);
    }

    // Test 2: Cross tenant context rejection
    try {
      await OperationalRiskService.calculateOperationalRiskScore('company-A', {
        userId: 'u1',
        companyId: 'company-B',
      });
      failed++;
      errors.push('Expected cross-tenant error');
    } catch {
      passed++;
    }

    return { total: passed + failed, passed, failed, errors };
  }
}
