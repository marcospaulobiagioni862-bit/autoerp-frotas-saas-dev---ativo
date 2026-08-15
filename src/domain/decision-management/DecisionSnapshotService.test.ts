// AutoERP Decision Snapshot Service Unit Tests (Phase 3.59)

import { DecisionSnapshotService } from './DecisionSnapshotService';
import { DecisionManagementService } from './DecisionManagementService';
import { UserContext359 } from './types';

export class DecisionSnapshotServiceTests {
  public static async runTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    const companyId = `test-snap-company-${Date.now()}`;
    const ctx: UserContext359 = {
      userId: 'user-admin-snap',
      userName: 'Snapshot Admin',
      userRole: 'ADMIN',
      companyId,
    };

    try {
      await DecisionManagementService.createDecision(
        {
          companyId,
          title: 'Decisão Snapshot',
          description: 'Gravar estado imutável',
          sourceType: 'RECOMMENDATION',
          priority: 'P2',
          responsibleUserId: 'user-snap-1',
          expectedResult: 'Snapshot registrado',
          successCriteria: 'Persistência verificada',
        },
        ctx
      );

      const snapshot = await DecisionSnapshotService.saveSnapshot(companyId, ctx);

      if (snapshot && snapshot.id.startsWith('snap-dec-')) {
        passed++;
      } else {
        failed++;
        errors.push('Snapshot Test 1 Failed: Snapshot structure invalid');
      }

      const allSnapshots = await DecisionSnapshotService.getSnapshots(companyId, ctx);
      if (allSnapshots.length >= 1) {
        passed++;
      } else {
        failed++;
        errors.push('Snapshot Test 2 Failed: Snapshot retrieval failed');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Snapshot Service Exception: ${e.message}`);
    }

    return { passed, failed, errors };
  }
}
