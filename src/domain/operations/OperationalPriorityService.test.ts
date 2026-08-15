// Unit tests for OperationalPriorityService (Phase 3.58)

import { OperationalPriorityService } from './OperationalPriorityService';

export class OperationalPriorityTestRunner {
  public static runTests(): { total: number; passed: number; failed: number; errors: string[] } {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Test 1: Calculate P0 Priority
    try {
      const res = OperationalPriorityService.calculatePriorityScore({
        basePriority: 'P0',
        slaStatus: 'BREACHED',
        isVehicleUnavailable: true,
      });
      if (res.level === 'P0' && res.score >= 80) {
        passed++;
      } else {
        failed++;
        errors.push(`Expected P0, got ${res.level} (${res.score})`);
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 1 threw error: ${e.message}`);
    }

    // Test 2: Calculate P3 Priority
    try {
      const res = OperationalPriorityService.calculatePriorityScore({
        basePriority: 'P3',
        slaStatus: 'OK',
      });
      if (res.level === 'P3' && res.score < 35) {
        passed++;
      } else {
        failed++;
        errors.push(`Expected P3, got ${res.level} (${res.score})`);
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 2 threw error: ${e.message}`);
    }

    // Test 3: Math safety NaN protection
    try {
      const safe = OperationalPriorityService.safeNumber(NaN, 10);
      if (safe === 10) {
        passed++;
      } else {
        failed++;
        errors.push(`Expected 10 for NaN fallback, got ${safe}`);
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 3 threw error: ${e.message}`);
    }

    return { total: passed + failed, passed, failed, errors };
  }
}
