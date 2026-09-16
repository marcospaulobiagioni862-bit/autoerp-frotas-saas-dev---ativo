// Unit tests for OperationalBottleneckService (Phase 3.58)

import { OperationalBottleneckService } from './OperationalBottleneckService';

export class OperationalBottleneckTestRunner {
  public static async runTests(): Promise<{ total: number; passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Test 1: Detect Bottlenecks
    try {
      const companyId = 'company-test-bot-uuid';
      const items = await OperationalBottleneckService.detectBottlenecks(companyId);
      if (Array.isArray(items)) {
        passed++;
      } else {
        failed++;
        errors.push('detectBottlenecks should return an array');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 1 threw error: ${e.message}`);
    }

    // Test 2: Multi-tenant validation failure
    try {
      await OperationalBottleneckService.detectBottlenecks('');
      failed++;
      errors.push('Expected error for empty companyId');
    } catch {
      passed++;
    }

    return { total: passed + failed, passed, failed, errors };
  }
}
