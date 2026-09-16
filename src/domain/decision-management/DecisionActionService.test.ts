// AutoERP Decision Action Service Unit Tests (Phase 3.59)

import { DecisionActionService } from './DecisionActionService';
import { DecisionManagementService } from './DecisionManagementService';
import { UserContext359 } from './types';

export class DecisionActionServiceTests {
  public static async runTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    const companyId = `test-action-company-${Date.now()}`;
    const ctx: UserContext359 = {
      userId: 'user-admin-act',
      userName: 'Action Admin',
      userRole: 'ADMIN',
      companyId,
    };

    try {
      const decision = await DecisionManagementService.createDecision(
        {
          companyId,
          title: 'Decisão para Ação Operacional',
          description: 'Ação de manutenção imediata',
          sourceType: 'INCIDENT',
          priority: 'P0',
          responsibleUserId: 'user-act-1',
          expectedResult: 'Manutenção realizada',
          successCriteria: 'Veículo aprovado na vistoria',
        },
        ctx
      );

      // Test 1: Convert Decision to Task (Idempotent)
      const res1 = await DecisionActionService.convertDecisionToAction(
        decision,
        {
          companyId,
          decisionId: decision.id,
          actionType: 'TASK',
          title: decision.title,
          description: decision.description,
        },
        ctx
      );

      if (res1 && res1.actionId && res1.idempotencyKey.includes(decision.id)) {
        passed++;
      } else {
        failed++;
        errors.push('Action Test 1 Failed: Task conversion output invalid');
      }

      // Test 2: Idempotent Retry should return same reference
      const res2 = await DecisionActionService.convertDecisionToAction(
        decision,
        {
          companyId,
          decisionId: decision.id,
          actionType: 'TASK',
          title: decision.title,
          description: decision.description,
        },
        ctx
      );

      if (res2 && (res2.actionId === res1.actionId || res2.actionObject?.duplicateIgnored)) {
        passed++;
      } else {
        failed++;
        errors.push('Action Test 2 Failed: Duplicate action conversion was not idempotent');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Action Service Exception: ${e.message}`);
    }

    return { passed, failed, errors };
  }
}
