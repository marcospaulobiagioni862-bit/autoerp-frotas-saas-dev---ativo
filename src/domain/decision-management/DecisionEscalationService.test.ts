// AutoERP Decision Escalation Service Unit Tests (Phase 3.59)

import { DecisionEscalationService } from './DecisionEscalationService';
import { DecisionManagementService } from './DecisionManagementService';
import { UserContext359 } from './types';

export class DecisionEscalationServiceTests {
  public static async runTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    const companyId = `test-esc-company-${Date.now()}`;
    const ctx: UserContext359 = {
      userId: 'user-admin-esc',
      userName: 'Escalation Admin',
      userRole: 'ADMIN',
      companyId,
    };

    try {
      const decision = await DecisionManagementService.createDecision(
        {
          companyId,
          title: 'Decisão P0 Atrasada',
          description: 'Falha crítica de SLA',
          sourceType: 'SLA_BREACH',
          priority: 'P0',
          responsibleUserId: 'user-esc-1',
          dueAt: new Date(Date.now() - 3600000 * 5).toISOString(), // overdue 5 hours
          expectedResult: 'Restabelecer serviço',
          successCriteria: 'SLA OK',
        },
        ctx
      );

      // Test 1: shouldEscalate detection
      const check = DecisionEscalationService.shouldEscalate(decision);
      if (check.should && check.nextLevel === 'LEVEL_1') {
        passed++;
      } else {
        failed++;
        errors.push('Escalation Test 1 Failed: Overdue P0 not flagged for escalation');
      }

      // Test 2: Execute Escalation
      const escalated = await DecisionEscalationService.escalateDecision(
        decision,
        'executive-director-1',
        'Atraso grave P0 de 5 horas',
        ctx
      );

      if (escalated.status === 'ESCALATED' && escalated.escalationLevel === 'LEVEL_1' && escalated.responsibleUserId === 'executive-director-1') {
        passed++;
      } else {
        failed++;
        errors.push('Escalation Test 2 Failed: Escalation execution failed');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Escalation Service Exception: ${e.message}`);
    }

    return { passed, failed, errors };
  }
}
