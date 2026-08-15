// AutoERP Operational Priority Engine Service (Phase 3.58)

import {
  OperationalPriorityLevel,
  PriorityActionItem,
  UserContext358
} from './types';

export interface PriorityScoreFactors {
  baseSeverity?: 'SEV0' | 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  basePriority?: 'P0' | 'P1' | 'P2' | 'P3';
  slaStatus?: 'OK' | 'WARNING' | 'BREACHED' | 'CRITICAL';
  overdueDays?: number;
  isVehicleUnavailable?: boolean;
  isContractAffected?: boolean;
  isSystemicRisk?: boolean;
  reoccurrenceCount?: number;
  affectedUsersCount?: number;
}

export class OperationalPriorityService {
  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
  }

  /**
   * Safe math helper to avoid NaN or Infinity
   */
  public static safeNumber(value: number | undefined | null, fallback: number = 0): number {
    if (value === undefined || value === null || isNaN(value) || !isFinite(value)) {
      return fallback;
    }
    return value;
  }

  /**
   * Calculates a deterministic priority score (0 to 100+) and maps it to P0, P1, P2, P3
   */
  public static calculatePriorityScore(factors: PriorityScoreFactors): {
    score: number;
    level: OperationalPriorityLevel;
  } {
    let score = 0;

    // Base priority check
    if (factors.basePriority === 'P0') score += 80;
    else if (factors.basePriority === 'P1') score += 60;
    else if (factors.basePriority === 'P2') score += 35;
    else if (factors.basePriority === 'P3') score += 15;

    // Base severity
    if (factors.baseSeverity === 'SEV0' || factors.baseSeverity === 'CRITICAL') score += 40;
    else if (factors.baseSeverity === 'SEV1' || factors.baseSeverity === 'HIGH') score += 25;
    else if (factors.baseSeverity === 'SEV2' || factors.baseSeverity === 'MEDIUM') score += 15;
    else if (factors.baseSeverity === 'SEV3' || factors.baseSeverity === 'LOW') score += 5;

    // SLA Status
    if (factors.slaStatus === 'BREACHED' || factors.slaStatus === 'CRITICAL') score += 30;
    else if (factors.slaStatus === 'WARNING') score += 15;

    // Overdue Days
    const overdue = this.safeNumber(factors.overdueDays, 0);
    if (overdue > 0) {
      score += Math.min(Math.max(overdue, 0) * 5, 25);
    }

    // Impact factors
    if (factors.isVehicleUnavailable) score += 25;
    if (factors.isContractAffected) score += 20;
    if (factors.isSystemicRisk) score += 35;

    // Reoccurrence
    const reoccur = this.safeNumber(factors.reoccurrenceCount, 0);
    if (reoccur > 0) {
      score += Math.min(reoccur * 5, 15);
    }

    // Users affected
    const users = this.safeNumber(factors.affectedUsersCount, 0);
    if (users > 0) {
      score += Math.min(users * 2, 10);
    }

    score = this.safeNumber(score, 0);

    let level: OperationalPriorityLevel = 'P3';
    if (score >= 80) level = 'P0';
    else if (score >= 60) level = 'P1';
    else if (score >= 35) level = 'P2';
    else level = 'P3';

    return { score, level };
  }

  /**
   * Sorts priority actions deterministically (P0 > P1 > P2 > P3, then by priority score)
   */
  public static sortPriorityActions(actions: PriorityActionItem[]): PriorityActionItem[] {
    const priorityWeight: Record<OperationalPriorityLevel, number> = {
      P0: 4,
      P1: 3,
      P2: 2,
      P3: 1,
    };

    return [...actions].sort((a, b) => {
      const weightA = priorityWeight[a.priority] || 1;
      const weightB = priorityWeight[b.priority] || 1;
      if (weightA !== weightB) {
        return weightB - weightA;
      }
      return a.title.localeCompare(b.title);
    });
  }
}
