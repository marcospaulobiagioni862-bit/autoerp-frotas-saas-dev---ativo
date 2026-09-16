// AutoERP Decision Management Service Unit Tests (Phase 3.59)

import { DecisionManagementService } from './DecisionManagementService';
import { UserContext359 } from './types';

export class DecisionManagementServiceTests {
  public static async runTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    const companyId = `test-company-${Date.now()}`;
    const ctx: UserContext359 = {
      userId: 'user-admin-1',
      userName: 'Admin User',
      userRole: 'ADMIN',
      companyId,
    };

    // Test 1: Create Decision
    try {
      const dec = await DecisionManagementService.createDecision(
        {
          companyId,
          title: 'Decisão de Teste Operacional',
          description: 'Ajuste de capacidade da frota',
          sourceType: 'RECOMMENDATION',
          priority: 'P1',
          responsibleUserId: 'user-op-1',
          expectedResult: 'Aumento de 15% de utilização',
          successCriteria: 'Utilização > 80%',
        },
        ctx
      );

      if (dec && dec.decisionNumber.startsWith('DEC-') && dec.status === 'PROPOSED') {
        passed++;
      } else {
        failed++;
        errors.push('Test 1 Failed: Decision creation structure invalid');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 1 Exception: ${e.message}`);
    }

    // Test 2: Approval and Transition
    try {
      const decList = await DecisionManagementService.getDecisions(companyId, ctx);
      const dec = decList[0];
      const approved = await DecisionManagementService.approveDecision(dec.id, companyId, ctx);

      if (approved.status === 'APPROVED' && approved.decidedAt) {
        passed++;
      } else {
        failed++;
        errors.push('Test 2 Failed: Decision approval failed');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 2 Exception: ${e.message}`);
    }

    // Test 3: Multi-tenant Isolation
    try {
      const badCtx: UserContext359 = {
        userId: 'hacker-1',
        userName: 'Hacker',
        userRole: 'ADMIN',
        companyId: 'other-company',
      };

      try {
        await DecisionManagementService.getDecisions(companyId, badCtx);
        failed++;
        errors.push('Test 3 Failed: Cross-tenant access was not blocked');
      } catch {
        passed++;
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 3 Exception: ${e.message}`);
    }

    // Test 4: Reopen Decision with mandatory reason
    try {
      const decList = await DecisionManagementService.getDecisions(companyId, ctx);
      const dec = decList[0];
      await DecisionManagementService.completeDecision(dec.id, companyId, 'Resultado obtido parcial', ctx);
      await DecisionManagementService.closeDecision(dec.id, companyId, ctx);

      const reopened = await DecisionManagementService.reopenDecision(
        dec.id,
        companyId,
        'Resultado caiu no dia seguinte, reabrindo investigação',
        ctx
      );

      if (reopened.status === 'REOPENED' && reopened.reopenReason) {
        passed++;
      } else {
        failed++;
        errors.push('Test 4 Failed: Reopening decision failed');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 4 Exception: ${e.message}`);
    }

    return { passed, failed, errors };
  }
}
