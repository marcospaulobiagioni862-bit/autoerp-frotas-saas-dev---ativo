// AutoERP Decision Snapshot Service (Phase 3.59)

import {
  DecisionManagementSnapshot,
  UserContext359,
  DecisionKPIs,
  ExecutiveDecision
} from './types';
import { DecisionManagementService } from './DecisionManagementService';
import { DecisionMetricsService } from './DecisionMetricsService';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class DecisionSnapshotService {
  private static STORAGE_KEY_PREFIX = '__autoerp_decision_snapshots_v1_';
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext359): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
    if (context && context.companyId && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de snapshot cross-tenant (${context.companyId} !== ${companyId})`);
    }
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async getSnapshots(companyId: string, context?: UserContext359): Promise<DecisionManagementSnapshot[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((s: DecisionManagementSnapshot) => s && s.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async createSnapshot(
    decisions: ExecutiveDecision[],
    companyId: string,
    context: UserContext359
  ): Promise<DecisionManagementSnapshot> {
    const kpis = DecisionMetricsService.calculateKPIs(decisions, companyId);
    const correlationId = `snapshot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toISOString();

    const snapshot: DecisionManagementSnapshot = {
      id: `snap-dec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId,
      timestamp,
      correlationId,
      metrics: kpis,
      decisionsSummary: decisions.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        priority: d.priority,
        responsibleUserId: d.responsibleUserId,
      })),
    };

    const existingSnapshots = await this.getSnapshots(companyId, context);
    existingSnapshots.push(snapshot);
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(existingSnapshots));
    return snapshot;
  }

  public static async saveSnapshot(companyId: string, context: UserContext359): Promise<DecisionManagementSnapshot> {
    this.validateTenant(companyId, context);

    const lockKey = `snapshot-${companyId}`;
    if (this.LOCKS.has(lockKey)) {
      const existing = await this.getSnapshots(companyId, context);
      if (existing.length > 0) return existing[existing.length - 1];
    }

    this.LOCKS.add(lockKey);

    try {
      const decisions = await DecisionManagementService.getDecisions(companyId, context);
      const kpis = DecisionMetricsService.calculateKPIs(decisions, companyId);

      const correlationId = `snap-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const timestamp = new Date().toISOString();

      const snapshot: DecisionManagementSnapshot = {
        id: `snap-dec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId,
        timestamp,
        correlationId,
        metrics: kpis,
        decisionsSummary: decisions.map((d) => ({
          id: d.id,
          title: d.title,
          status: d.status,
          priority: d.priority,
          responsibleUserId: d.responsibleUserId,
        })),
      };

      const existingSnapshots = await this.getSnapshots(companyId, context);
      existingSnapshots.push(snapshot);
      localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(existingSnapshots));

      // Audit Log
      await this.auditRepo.create({
        id: `audit-snap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId,
        entityName: 'ExecutiveDecisionSnapshot',
        entityId: snapshot.id,
        action: AuditAction.CREATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp,
        newState: JSON.stringify({
          totalDecisions: kpis.totalDecisions,
          effectivenessScore: kpis.effectivenessScore,
          correlationId,
        }),
      });

      return snapshot;
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }
}
