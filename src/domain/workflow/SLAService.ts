// AutoERP SLA Engine Service (Phase 3.56)

import {
  SLARecord,
  SLAParameter,
  SLAStatus,
  Task,
  TaskPriority
} from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class SLAService {
  private static STORAGE_KEY_PREFIX = '__autoerp_sla_v1_';
  private static PARAMS_STORAGE_KEY_PREFIX = '__autoerp_sla_params_v1_';
  private static auditRepo = new AuditLogRepository();

  private static validateTenant(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('CompanyId is required for multi-tenant isolation');
    }
  }

  private static getStorageKey(companyId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${companyId}`;
  }

  private static getParamsStorageKey(companyId: string): string {
    return `${this.PARAMS_STORAGE_KEY_PREFIX}${companyId}`;
  }

  public static getDefaultSLAParameters(companyId: string): SLAParameter[] {
    this.validateTenant(companyId);
    try {
      const raw = localStorage.getItem(this.getParamsStorageKey(companyId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }

    // Default SLA Parameters per priority
    return [
      { priority: 'P0', maxHoursToFirstResponse: 0.5, maxHoursToResolution: 2, warningThresholdPercent: 80 },
      { priority: 'P1', maxHoursToFirstResponse: 1, maxHoursToResolution: 8, warningThresholdPercent: 80 },
      { priority: 'P2', maxHoursToFirstResponse: 4, maxHoursToResolution: 24, warningThresholdPercent: 80 },
      { priority: 'P3', maxHoursToFirstResponse: 12, maxHoursToResolution: 72, warningThresholdPercent: 80 }
    ];
  }

  public static setSLAParameters(companyId: string, params: SLAParameter[]): void {
    this.validateTenant(companyId);
    localStorage.setItem(this.getParamsStorageKey(companyId), JSON.stringify(params));
  }

  public static async getSLARecords(companyId: string): Promise<SLARecord[]> {
    this.validateTenant(companyId);
    try {
      const raw = localStorage.getItem(this.getStorageKey(companyId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((s: SLARecord) => s && s.companyId === companyId);
    } catch {
      return [];
    }
  }

  private static async saveSLARecords(companyId: string, records: SLARecord[]): Promise<void> {
    this.validateTenant(companyId);
    const tenantRecords = records.filter(s => s.companyId === companyId);
    localStorage.setItem(this.getStorageKey(companyId), JSON.stringify(tenantRecords));
  }

  public static async createSLARecord(task: Task, customParam?: SLAParameter): Promise<SLARecord> {
    this.validateTenant(task.companyId);

    const allParams = this.getDefaultSLAParameters(task.companyId);
    const slaParam = customParam || allParams.find(p => p.priority === task.priority) || {
      priority: task.priority,
      maxHoursToFirstResponse: 1,
      maxHoursToResolution: 24,
      warningThresholdPercent: 80
    };

    const now = new Date();
    const createdIso = now.toISOString();

    const targetHours = Math.max(0.1, slaParam.maxHoursToResolution || 24);
    const targetMs = targetHours * 3600000;
    
    // Calculate Due and Warning Timestamps safely
    let dueTime = new Date(task.dueAt).getTime();
    if (isNaN(dueTime)) {
      dueTime = now.getTime() + targetMs;
    }

    const warningThreshold = Math.min(99, Math.max(10, slaParam.warningThresholdPercent || 80)) / 100;
    const warningMs = targetMs * warningThreshold;
    const warningTime = now.getTime() + warningMs;

    const dueAt = new Date(dueTime).toISOString();
    const warningAt = new Date(warningTime).toISOString();

    const slaRecord: SLARecord = {
      id: `sla-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      companyId: task.companyId,
      taskId: task.id,
      priority: task.priority,
      severity: task.severity,
      status: 'ON_TRACK',
      targetHours,
      elapsedMinutes: 0,
      remainingMinutes: Math.round(targetHours * 60),
      delayMinutes: 0,
      consumedPercent: 0,
      dueAt,
      warningAt,
      correlationId: task.correlationId || `sla-corr-${Date.now()}`,
      createdAt: createdIso,
      updatedAt: createdIso
    };

    const existing = await this.getSLARecords(task.companyId);
    existing.push(slaRecord);
    await this.saveSLARecords(task.companyId, existing);

    await this.auditRepo.create({
      id: `audit-${Date.now()}`,
      companyId: task.companyId,
      entityName: 'SLA',
      entityId: slaRecord.id,
      action: AuditAction.CREATE,
      newState: JSON.stringify(slaRecord),
      userId: task.createdBy || 'SYSTEM',
      userName: 'System SLA Engine',
      timestamp: createdIso
    });

    return slaRecord;
  }

  public static async updateSLAStatus(slaId: string, companyId: string): Promise<SLARecord> {
    this.validateTenant(companyId);

    const records = await this.getSLARecords(companyId);
    const index = records.findIndex(r => r.id === slaId);
    if (index === -1) {
      throw new Error(`SLA Record ${slaId} not found`);
    }

    const record = records[index];
    if (record.status === 'RESOLVED') {
      return record;
    }

    const prevStatus = record.status;
    const now = new Date();

    const createdTime = new Date(record.createdAt).getTime();
    const dueTime = new Date(record.dueAt).getTime();
    const warningTime = new Date(record.warningAt).getTime();

    const validCreated = isNaN(createdTime) ? now.getTime() - 60000 : createdTime;
    const validDue = isNaN(dueTime) ? validCreated + (record.targetHours || 24) * 3600000 : dueTime;
    const validWarning = isNaN(warningTime) ? validCreated + (record.targetHours || 24) * 3600000 * 0.8 : warningTime;

    const totalDurationMs = Math.max(1000, validDue - validCreated);
    const elapsedMs = Math.max(0, now.getTime() - validCreated);
    const remainingMs = Math.max(0, validDue - now.getTime());

    // Safe mathematical calculations
    const elapsedMinutes = Math.round(elapsedMs / 60000);
    const remainingMinutes = Math.round(remainingMs / 60000);
    const consumedPercent = Math.min(1000, Math.round((elapsedMs / totalDurationMs) * 100));

    let delayMinutes = 0;
    if (now.getTime() > validDue) {
      delayMinutes = Math.round((now.getTime() - validDue) / 60000);
    }

    let newStatus: SLAStatus = 'ON_TRACK';
    if (now.getTime() >= validDue) {
      newStatus = 'BREACHED';
      if (!record.breachedAt) {
        record.breachedAt = now.toISOString();
      }
    } else if (now.getTime() >= validWarning) {
      newStatus = 'WARNING';
    }

    record.elapsedMinutes = isNaN(elapsedMinutes) ? 0 : elapsedMinutes;
    record.remainingMinutes = isNaN(remainingMinutes) ? 0 : remainingMinutes;
    record.delayMinutes = isNaN(delayMinutes) ? 0 : delayMinutes;
    record.consumedPercent = isNaN(consumedPercent) ? 0 : consumedPercent;
    record.status = newStatus;
    record.updatedAt = now.toISOString();

    records[index] = record;
    await this.saveSLARecords(companyId, records);

    if (prevStatus !== newStatus && newStatus === 'BREACHED') {
      await this.auditRepo.create({
        id: `audit-${Date.now()}`,
        companyId,
        entityName: 'SLA',
        entityId: record.id,
        action: AuditAction.UPDATE,
        previousState: JSON.stringify({ status: prevStatus }),
        newState: JSON.stringify({ status: newStatus, delayMinutes }),
        userId: 'SYSTEM',
        userName: 'SLA Engine',
        timestamp: record.updatedAt
      });
    }

    return record;
  }

  public static async resolveSLA(slaId: string, companyId: string): Promise<SLARecord | null> {
    this.validateTenant(companyId);

    const records = await this.getSLARecords(companyId);
    const index = records.findIndex(r => r.id === slaId);
    if (index === -1) return null;

    const record = records[index];
    const nowIso = new Date().toISOString();

    record.status = 'RESOLVED';
    record.resolvedAt = nowIso;
    record.updatedAt = nowIso;

    records[index] = record;
    await this.saveSLARecords(companyId, records);

    return record;
  }

  public static async recalculateAllSLAs(companyId: string): Promise<SLARecord[]> {
    this.validateTenant(companyId);

    const records = await this.getSLARecords(companyId);
    const updated: SLARecord[] = [];

    for (const r of records) {
      if (r.status !== 'RESOLVED') {
        const u = await this.updateSLAStatus(r.id, companyId);
        updated.push(u);
      } else {
        updated.push(r);
      }
    }

    return updated;
  }
}
