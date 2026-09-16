// AutoERP Decision Effectiveness Service Unit Tests (Phase 3.59)

import { DecisionEffectivenessService } from './DecisionEffectivenessService';
import { DecisionManagementService } from './DecisionManagementService';
import { UserContext359 } from './types';

export class DecisionEffectivenessServiceTests {
  public static async runTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    const companyId = `test-eff-company-${Date.now()}`;
    const ctx: UserContext359 = {
      userId: 'user-admin-eff',
      userName: 'Effectiveness Admin',
      userRole: 'ADMIN',
      companyId,
    };

    try {
      const decision = await DecisionManagementService.createDecision(
        {
          companyId,
          title: 'Ajuste de Processo SLA',
          description: 'Melhoria de resposta',
          sourceType: 'SLA_BREACH',
          priority: 'P1',
          responsibleUserId: 'user-eff-1',
          expectedResult: 'SLA cumprido em 98%',
          successCriteria: 'Tempo < 2h',
        },
        ctx
      );

      // Test 1: Math safety
      const safe1 = DecisionEffectivenessService.safeScore(NaN);
      const safe2 = DecisionEffectivenessService.safeScore(Infinity);
      const safe3 = DecisionEffectivenessService.safeScore(87.6);

      if (safe1 === 0 && safe2 === 0 && safe3 === 88) {
        passed++;
      } else {
        failed++;
        errors.push(`Effectiveness Test 1 Failed: SafeScore math issue (${safe1}, ${safe2}, ${safe3})`);
      }

      // Test 2: Calculate Effectiveness
      const evalRes = DecisionEffectivenessService.calculateEffectiveness(
        decision,
        'SLA cumprido em 98%, tempo de resposta ajustado para 1.5h com sucesso',
        ['ev-1', 'ev-2', 'ev-3']
      );

      if (evalRes.score >= 80 && (evalRes.classification === 'EXCELLENT' || evalRes.classification === 'EFFECTIVE')) {
        passed++;
      } else {
        failed++;
        errors.push(`Effectiveness Test 2 Failed: Score calculation mismatch (${evalRes.score})`);
      }
    } catch (e: any) {
      failed++;
      errors.push(`Effectiveness Service Exception: ${e.message}`);
    }

    return { passed, failed, errors };
  }
}
