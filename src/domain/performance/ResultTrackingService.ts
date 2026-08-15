// AutoERP Result Tracking Service (Phase 3.60)

import {
  ResultMeasurement,
  UserContext360
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class ResultTrackingService {
  private static STORAGE_KEY_PREFIX = '__autoerp_result_measurements_v1_';
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext360): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de medição cross-tenant (${context.companyId} !== ${companyId})`);
    }
  }

  private static safeScore(val: number): number {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(val)));
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async getMeasurements(companyId: string, context?: UserContext360): Promise<ResultMeasurement[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((m: ResultMeasurement) => m && m.companyId === companyId);
    } catch {
      return [];
    }
  }

  /**
   * Appends a new measurement record. Historical measurements are APPEND_ONLY and never overwritten.
   */
  public static async recordMeasurement(
    params: {
      companyId: string;
      metricId?: string;
      goalId?: string;
      objectiveId?: string;
      keyResultId?: string;
      measuredValue: number;
      expectedValue: number;
      source?: string;
      correlationId?: string;
    },
    context: UserContext360
  ): Promise<ResultMeasurement> {
    this.validateTenant(params.companyId, context);

    const lockKey = `measurement-${params.companyId}-${Date.now()}`;
    if (this.LOCKS.has(lockKey)) {
      throw new Error('Registro de medição em andamento');
    }

    this.LOCKS.add(lockKey);

    try {
      const now = new Date().toISOString();
      const correlationId = params.correlationId || `meas-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const existing = await this.getMeasurements(params.companyId, context);

      const variance = params.measuredValue - params.expectedValue;
      let percentageAchieved = 100;
      if (params.expectedValue !== 0) {
        percentageAchieved = this.safeScore((params.measuredValue / params.expectedValue) * 100);
      }

      const measurement: ResultMeasurement = {
        id: `meas-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        metricId: params.metricId,
        goalId: params.goalId,
        objectiveId: params.objectiveId,
        keyResultId: params.keyResultId,
        measuredValue: params.measuredValue,
        expectedValue: params.expectedValue,
        variance,
        percentageAchieved,
        measuredAt: now,
        measuredBy: context.userName || context.userId,
        source: params.source || 'MEDICAO_MANUAL',
        correlationId,
      };

      existing.push(measurement);
      localStorage.setItem(this.getStorageKey(params.companyId), JSON.stringify(existing));

      // Audit Log
      await this.auditRepo.create({
        id: `audit-meas-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: params.companyId,
        entityName: 'ResultMeasurement',
        entityId: measurement.id,
        action: AuditAction.CREATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp: now,
        newState: JSON.stringify({ measuredValue: params.measuredValue, expectedValue: params.expectedValue, correlationId }),
      });

      return measurement;
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }
}
