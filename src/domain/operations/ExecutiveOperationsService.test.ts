// Unit tests for ExecutiveOperationsService (Phase 3.58)

import { ExecutiveOperationsService } from './ExecutiveOperationsService';

export class ExecutiveOperationsTestRunner {
  public static async runTests(): Promise<{ total: number; passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    const companyId = 'company-test-exec-uuid';

    // Test 1: Get executive snapshot
    try {
      const snap = await ExecutiveOperationsService.getExecutiveSnapshot(companyId);
      if (snap && snap.companyId === companyId && typeof snap.healthScore === 'number') {
        passed++;
      } else {
        failed++;
        errors.push('Executive snapshot invalid');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 1 threw error: ${e.message}`);
    }

    // Test 2: Read-only financial status
    try {
      const finStatus = await ExecutiveOperationsService.getReadOnlyFinancialStatus(companyId);
      if (finStatus.isFinancialFrozen === true) {
        passed++;
      } else {
        failed++;
        errors.push('Financial status isFinancialFrozen must be true');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 2 threw error: ${e.message}`);
    }

    return { total: passed + failed, passed, failed, errors };
  }
}
