// AutoERP Performance Snapshot Service (Phase 3.60)

import {
  PerformanceSnapshot,
  UserContext360
} from './types';
import { GoalService } from './GoalService';
import { KPIManagementService } from './KPIManagementService';
import { PerformanceAnalysisService } from './PerformanceAnalysisService';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class PerformanceSnapshotService {
  private static STORAGE_KEY_PREFIX = '__autoerp_perf_snapshots_v1_';
  private static LOCKS: Set<string> = new Set();
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string, context?: UserContext360): void {
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

  public static async getSnapshots(companyId: string, context?: UserContext360): Promise<PerformanceSnapshot[]> {
    this.validateTenant(companyId, context);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((s: PerformanceSnapshot) => s && s.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async saveSnapshot(companyId: string, context: UserContext360): Promise<PerformanceSnapshot> {
    this.validateTenant(companyId, context);

    const lockKey = `perf-snapshot-${companyId}`;
    if (this.LOCKS.has(lockKey)) {
      const existing = await this.getSnapshots(companyId, context);
      if (existing.length > 0) return existing[existing.length - 1];
    }

    this.LOCKS.add(lockKey);

    try {
      const goals = await GoalService.getGoals(companyId, context);
      const kpis = await KPIManagementService.getKPIs(companyId, context);
      const analysis = await PerformanceAnalysisService.analyzePerformance(companyId, context);

      const correlationId = `psnap-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const timestamp = new Date().toISOString();

      const snapshot: PerformanceSnapshot = {
        id: `psnap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId,
        timestamp,
        correlationId,
        analysis,
        goalsSummary: goals.map((g) => ({
          id: g.id,
          title: g.title,
          status: g.status,
          progressPercentage: g.progressPercentage,
          ownerId: g.ownerId,
        })),
        kpisSummary: kpis.map((k) => ({
          id: k.id,
          name: k.name,
          currentValue: k.currentValue,
          target: k.target,
          status: k.status,
        })),
      };

      const existingSnapshots = await this.getSnapshots(companyId, context);
      existingSnapshots.push(snapshot);
      localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(existingSnapshots));

      // Audit Log
      await this.auditRepo.create({
        id: `audit-psnap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId,
        entityName: 'PerformanceSnapshot',
        entityId: snapshot.id,
        action: AuditAction.CREATE,
        userId: context.userId,
        userName: context.userName || 'User',
        timestamp,
        newState: JSON.stringify({ overallScore: analysis.overallScore, classification: analysis.classification, correlationId }),
      });

      return snapshot;
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }
}
