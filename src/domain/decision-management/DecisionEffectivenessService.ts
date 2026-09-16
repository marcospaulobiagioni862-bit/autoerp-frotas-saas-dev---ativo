// AutoERP Decision Effectiveness Service (Phase 3.59)

import {
  ExecutiveDecision,
  DecisionEffectivenessRating,
  UserContext359
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class DecisionEffectivenessService {
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext359): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de avaliação cross-tenant (${context.companyId} !== ${companyId})`);
    }
  }

  /**
   * Safely calculates a score from 0 to 100 with strict mathematical protection against NaN / Infinity / div-by-zero.
   */
  public static safeScore(val: number): number {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(val)));
  }

  /**
   * Classifies numerical effectiveness score into standardized rating enum
   */
  public static getClassification(score: number): DecisionEffectivenessRating {
    const s = this.safeScore(score);
    if (s >= 90) return 'EXCELLENT';
    if (s >= 75) return 'EFFECTIVE';
    if (s >= 50) return 'PARTIALLY_EFFECTIVE';
    if (s >= 25) return 'INEFFECTIVE';
    return 'FAILED';
  }

  /**
   * Evaluates effectiveness of an Executive Decision based on actual results, success criteria, SLA, and evidence
   */
  public static calculateEffectiveness(
    decision: ExecutiveDecision,
    actualResult?: string,
    evidenceIds?: string[]
  ): {
    score: number;
    classification: DecisionEffectivenessRating;
    breakdown: {
      resultMatchScore: number;
      slaScore: number;
      evidenceScore: number;
      escalationPenalty: number;
    };
  } {
    let resultMatchScore = 50;
    const resultText = actualResult || decision.actualResult || '';

    if (resultText && resultText.trim().length > 10) {
      const lowerActual = resultText.toLowerCase();
      const lowerCriteria = (decision.successCriteria || '').toLowerCase();
      const lowerExpected = (decision.expectedResult || '').toLowerCase();

      let matches = 0;
      if (lowerExpected && lowerActual.includes(lowerExpected)) matches++;
      if (lowerCriteria && lowerActual.includes(lowerCriteria)) matches++;

      if (lowerActual.includes('sucesso') || lowerActual.includes('concluído') || lowerActual.includes('resolvido') || lowerActual.includes('eliminado')) {
        matches++;
      }

      if (matches >= 2) resultMatchScore = 95;
      else if (matches === 1) resultMatchScore = 80;
      else resultMatchScore = 65;
    } else if (decision.status === 'COMPLETED' || decision.status === 'CLOSED') {
      resultMatchScore = 70;
    } else {
      resultMatchScore = 30;
    }

    let slaScore = 100;
    if (decision.dueAt && decision.completedAt) {
      const dueTime = new Date(decision.dueAt).getTime();
      const compTime = new Date(decision.completedAt).getTime();
      if (!isNaN(dueTime) && !isNaN(compTime)) {
        if (compTime <= dueTime) {
          slaScore = 100;
        } else {
          const delayDays = (compTime - dueTime) / (1000 * 3600 * 24);
          slaScore = Math.max(0, 100 - Math.round(delayDays * 15));
        }
      }
    } else if (decision.dueAt) {
      const dueTime = new Date(decision.dueAt).getTime();
      if (!isNaN(dueTime) && Date.now() > dueTime) {
        slaScore = 40;
      }
    }

    const evidences = evidenceIds || decision.evidenceIds || [];
    let evidenceScore = 0;
    if (evidences.length >= 3) evidenceScore = 100;
    else if (evidences.length === 2) evidenceScore = 85;
    else if (evidences.length === 1) evidenceScore = 70;
    else evidenceScore = 40;

    let escalationPenalty = 0;
    if (decision.escalationLevel === 'LEVEL_1') escalationPenalty = 5;
    else if (decision.escalationLevel === 'LEVEL_2') escalationPenalty = 15;
    else if (decision.escalationLevel === 'LEVEL_3') escalationPenalty = 25;

    const rawScore = (resultMatchScore * 0.4) + (slaScore * 0.3) + (evidenceScore * 0.3) - escalationPenalty;
    const finalScore = this.safeScore(rawScore);
    const classification = this.getClassification(finalScore);

    return {
      score: finalScore,
      classification,
      breakdown: {
        resultMatchScore: this.safeScore(resultMatchScore),
        slaScore: this.safeScore(slaScore),
        evidenceScore: this.safeScore(evidenceScore),
        escalationPenalty: this.safeScore(escalationPenalty),
      },
    };
  }

  /**
   * Validates completed decision with recorded actual result, evidence, and calculates effectiveness
   */
  public static async validateDecisionEffectiveness(
    decision: ExecutiveDecision,
    actualResult: string,
    evidenceIds: string[],
    context: UserContext359
  ): Promise<ExecutiveDecision> {
    this.validateTenant(decision.companyId, context);

    if (!actualResult || actualResult.trim() === '') {
      throw new Error('Resultado real (actualResult) é obrigatório para validação de efetividade');
    }

    const evalRes = this.calculateEffectiveness(decision, actualResult, evidenceIds);

    decision.actualResult = actualResult;
    decision.evidenceIds = Array.from(new Set([...decision.evidenceIds, ...evidenceIds]));
    decision.effectivenessScore = evalRes.score;
    decision.effectivenessClassification = evalRes.classification;
    decision.validatedAt = new Date().toISOString();
    decision.status = 'VALIDATING';

    const correlationId = `validation-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Audit Log
    await this.auditRepo.create({
      id: `audit-val-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId: decision.companyId,
      entityName: 'ExecutiveDecisionValidation',
      entityId: decision.id,
      action: AuditAction.UPDATE,
      userId: context.userId,
      userName: context.userName || 'User',
      timestamp: new Date().toISOString(),
      newState: JSON.stringify({
        effectivenessScore: evalRes.score,
        classification: evalRes.classification,
        actualResult,
        evidenceCount: evidenceIds.length,
        correlationId,
      }),
    });

    return decision;
  }
}
