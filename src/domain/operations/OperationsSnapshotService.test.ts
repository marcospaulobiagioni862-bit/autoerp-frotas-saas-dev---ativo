// Unit tests for OperationsSnapshotService (Phase 3.58)

import { OperationsSnapshotService } from './OperationsSnapshotService';

export class OperationsSnapshotTestRunner {
  public static async runTests(): Promise<{ total: number; passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Test 1: Snapshot comparison deltas
    try {
      const snap1: any = {
        healthScore: 90,
        operationalRiskScore: { score: 30 },
        backlog: 10,
        overdueTasks: 2,
        openIncidents: 1,
        kpis: { slaCompliancePercent: 95, fleetUtilizationPercent: 70 },
      };
      const snap2: any = {
        healthScore: 80,
        operationalRiskScore: { score: 50 },
        backlog: 15,
        overdueTasks: 5,
        openIncidents: 3,
        kpis: { slaCompliancePercent: 85, fleetUtilizationPercent: 60 },
      };

      const comp = OperationsSnapshotService.compareSnapshots(snap1, snap2);
      if (comp.diff.healthScoreDelta === 10 && comp.diff.backlogDelta === -5) {
        passed++;
      } else {
        failed++;
        errors.push(`Comparison diff unexpected: ${JSON.stringify(comp.diff)}`);
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 1 threw error: ${e.message}`);
    }

    return { total: passed + failed, passed, failed, errors };
  }
}
