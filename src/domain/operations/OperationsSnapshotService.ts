// AutoERP Operations Snapshot Service (Phase 3.58)

import {
  ExecutiveOperationsSnapshot,
  SnapshotComparison,
  UserContext358
} from './types';
import { OperationalPriorityService } from './OperationalPriorityService';

export class OperationsSnapshotService {
  private static STORAGE_KEY_PREFIX = '__autoerp_ops_snapshots_v1_';

  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId é obrigatório para isolamento multi-tenant');
    }
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static async saveSnapshot(
    snapshot: ExecutiveOperationsSnapshot
  ): Promise<ExecutiveOperationsSnapshot> {
    this.validateTenant(snapshot.companyId);

    const key = this.getStorageKey(snapshot.companyId);
    let list = await this.getSnapshots(snapshot.companyId);

    // Immutable check: if id already exists, do not modify existing historical record
    const existingIndex = list.findIndex((s) => s.id === snapshot.id);
    if (existingIndex >= 0) {
      return list[existingIndex]; // Return existing without modifying historical content
    }

    list.push(snapshot);
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // safe fallback
    }

    return snapshot;
  }

  public static async getSnapshots(
    companyId: string,
    context?: UserContext358
  ): Promise<ExecutiveOperationsSnapshot[]> {
    this.validateTenant(companyId);
    if (context && context.companyId !== companyId) {
      throw new Error(`Acesso negado: Tentativa de consulta cross-tenant (${context.companyId} !== ${companyId})`);
    }

    const key = this.getStorageKey(companyId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((s: ExecutiveOperationsSnapshot) => s && s.companyId === companyId);
    } catch {
      return [];
    }
  }

  public static async getLatestSnapshot(
    companyId: string,
    context?: UserContext358
  ): Promise<ExecutiveOperationsSnapshot | null> {
    const list = await this.getSnapshots(companyId, context);
    if (list.length === 0) return null;
    return list.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0];
  }

  /**
   * Compares two snapshots and returns delta breakdown
   */
  public static compareSnapshots(
    current: ExecutiveOperationsSnapshot,
    previous: ExecutiveOperationsSnapshot
  ): SnapshotComparison {
    const safeNum = OperationalPriorityService.safeNumber;

    return {
      current,
      previous,
      diff: {
        healthScoreDelta: safeNum(current.healthScore - previous.healthScore, 0),
        riskScoreDelta: safeNum(current.operationalRiskScore.score - previous.operationalRiskScore.score, 0),
        backlogDelta: safeNum(current.backlog - previous.backlog, 0),
        slaComplianceDelta: safeNum(current.kpis.slaCompliancePercent - previous.kpis.slaCompliancePercent, 0),
        overdueTasksDelta: safeNum(current.overdueTasks - previous.overdueTasks, 0),
        activeIncidentsDelta: safeNum(current.openIncidents - previous.openIncidents, 0),
        fleetUtilizationDelta: safeNum(current.kpis.fleetUtilizationPercent - previous.kpis.fleetUtilizationPercent, 0),
      },
    };
  }
}
