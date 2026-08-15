// src/domain/release/ConfigurationGovernanceService.ts
import { ConfigurationChangeRecord, ConfigurationSnapshot } from './types';
import { TenantConfigurationService } from '../admin/TenantConfigurationService';
import { TenantOperationalConfig } from '../admin/types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { UserRole, AuditAction } from '../../types/enums';

export class ConfigurationGovernanceService {
  private static CHANGES_STORAGE_KEY_PREFIX = '__autoerp_cfg_changes_v1_';
  private static SNAPSHOTS_STORAGE_KEY_PREFIX = '__autoerp_cfg_snapshots_v1_';

  /**
   * Retrieves all configuration change records for a companyId.
   */
  public static listConfigurationChanges(companyId: string): ConfigurationChangeRecord[] {
    const cid = companyId || 'company-default';
    if (typeof window === 'undefined' || !window.localStorage) {
      return this.getMockDefaultChanges(cid);
    }
    try {
      const raw = localStorage.getItem(`${this.CHANGES_STORAGE_KEY_PREFIX}${cid}`);
      if (!raw) {
        const defaults = this.getMockDefaultChanges(cid);
        localStorage.setItem(`${this.CHANGES_STORAGE_KEY_PREFIX}${cid}`, JSON.stringify(defaults));
        return defaults;
      }
      return JSON.parse(raw);
    } catch {
      return this.getMockDefaultChanges(cid);
    }
  }

  private static saveConfigurationChanges(companyId: string, records: ConfigurationChangeRecord[]): void {
    const cid = companyId || 'company-default';
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`${this.CHANGES_STORAGE_KEY_PREFIX}${cid}`, JSON.stringify(records));
    }
  }

  /**
   * Retrieves all snapshots for a companyId.
   */
  public static listSnapshots(companyId: string): ConfigurationSnapshot[] {
    const cid = companyId || 'company-default';
    if (typeof window === 'undefined' || !window.localStorage) {
      return [this.createSnapshotInternal(cid, 'usr-system-init', 'BASELINE_3.51_CFG')];
    }
    try {
      const raw = localStorage.getItem(`${this.SNAPSHOTS_STORAGE_KEY_PREFIX}${cid}`);
      if (!raw) {
        const snap = this.createSnapshotInternal(cid, 'usr-system-init', 'BASELINE_3.51_CFG');
        localStorage.setItem(`${this.SNAPSHOTS_STORAGE_KEY_PREFIX}${cid}`, JSON.stringify([snap]));
        return [snap];
      }
      return JSON.parse(raw);
    } catch {
      return [this.createSnapshotInternal(cid, 'usr-system-init', 'BASELINE_3.51_CFG')];
    }
  }

  private static saveSnapshots(companyId: string, snapshots: ConfigurationSnapshot[]): void {
    const cid = companyId || 'company-default';
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`${this.SNAPSHOTS_STORAGE_KEY_PREFIX}${cid}`, JSON.stringify(snapshots));
    }
  }

  /**
   * Takes a configuration snapshot before making critical changes.
   */
  public static takeSnapshot(
    companyId: string,
    userId: string,
    versionLabel?: string
  ): ConfigurationSnapshot {
    const cid = companyId || 'company-default';
    const snapshot = this.createSnapshotInternal(cid, userId, versionLabel);
    const snapshots = this.listSnapshots(cid);
    snapshots.unshift(snapshot);
    this.saveSnapshots(cid, snapshots);
    return snapshot;
  }

  private static createSnapshotInternal(companyId: string, userId: string, versionLabel?: string): ConfigurationSnapshot {
    const config = TenantConfigurationService.getConfig(companyId);
    const values = JSON.parse(JSON.stringify(config));
    
    // Mask sensitive fields if present
    if (values.securityPolicy && values.securityPolicy.secretKey) {
      values.securityPolicy.secretKey = '***MASKED***';
    }

    const correlationId = `snap-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return {
      snapshotId: `snap-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      companyId,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      configurationVersion: versionLabel || `CFG_${Date.now()}`,
      values,
      checksum: `chk-cfg-snap-${Date.now()}-sha256`,
      correlationId,
    };
  }

  /**
   * Updates a configuration key governed by change management, creating snapshot and audit log.
   */
  public static async updateConfigurationKey(
    companyId: string,
    key: keyof TenantOperationalConfig | string,
    newValue: any,
    userId: string,
    reason: string,
    role: string = 'ADMIN',
    changeId?: string,
    releaseId?: string
  ): Promise<{ success: boolean; changeRecord?: ConfigurationChangeRecord; message: string }> {
    if (role !== UserRole.ADMIN && role !== 'ADMIN') {
      return { success: false, message: 'Acesso negado: Somente administradores podem alterar configurações globais.' };
    }

    if (!reason || !reason.trim()) {
      return { success: false, message: 'Justificativa é obrigatória para alteração de configuração.' };
    }

    // Take automatic snapshot prior to change
    this.takeSnapshot(companyId, userId, `BEFORE_KEY_${String(key)}`);

    const currentConfig = TenantConfigurationService.getConfig(companyId);
    const oldValue = (currentConfig as any)[key];

    // Sanitize sensitive secrets
    if (String(key).toLowerCase().includes('secret') || String(key).toLowerCase().includes('token')) {
      newValue = '***MASKED_SECRET***';
    }

    // Apply update to TenantConfigurationService
    const updatedObj: Partial<TenantOperationalConfig> = {
      [key]: newValue,
    };
    TenantConfigurationService.updateConfig(companyId, updatedObj, userId);

    const correlationId = `config-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const changeRecord: ConfigurationChangeRecord = {
      id: `cfg-rec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      companyId,
      configurationKey: String(key),
      oldValue: oldValue !== undefined ? oldValue : null,
      newValue,
      changedBy: userId,
      changedAt: new Date().toISOString(),
      reason,
      changeId,
      releaseId,
      correlationId,
    };

    const records = this.listConfigurationChanges(companyId);
    records.unshift(changeRecord);
    this.saveConfigurationChanges(companyId, records);

    await this.registerAuditLog(
      companyId,
      userId,
      AuditAction.UPDATE,
      'CONFIGURATION',
      String(key),
      correlationId,
      JSON.stringify({ key, oldValue, newValue, reason })
    );

    return { success: true, changeRecord, message: `Configuração '${String(key)}' atualizada com sucesso.` };
  }

  /**
   * Safe Configuration Rollback to a previous snapshot or change record.
   * Creates a NEW reverse configuration change (never deletes history).
   */
  public static async rollbackConfiguration(
    companyId: string,
    snapshotId: string,
    userId: string,
    reason: string,
    role: string = 'ADMIN'
  ): Promise<{ success: boolean; message: string }> {
    if (role !== UserRole.ADMIN && role !== 'ADMIN') {
      return { success: false, message: 'Acesso negado: Somente administradores podem realizar rollback de configuração.' };
    }

    if (!reason || !reason.trim()) {
      return { success: false, message: 'Justificativa do rollback é obrigatória.' };
    }

    const snapshots = this.listSnapshots(companyId);
    const targetSnapshot = snapshots.find(s => s.snapshotId === snapshotId);
    if (!targetSnapshot) {
      return { success: false, message: 'Snapshot de configuração não encontrado.' };
    }

    // Restore config values
    const restoredValues = targetSnapshot.values;
    TenantConfigurationService.updateConfig(companyId, restoredValues, userId);

    const correlationId = `rollback-cfg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const reverseRecord: ConfigurationChangeRecord = {
      id: `cfg-rec-rollback-${Date.now()}`,
      companyId,
      configurationKey: 'ALL_TENANT_CONFIG',
      oldValue: 'CURRENT_STATE',
      newValue: `RESTORED_FROM_SNAPSHOT_${targetSnapshot.configurationVersion}`,
      changedBy: userId,
      changedAt: new Date().toISOString(),
      reason: `[ROLLBACK DE CONFIGURAÇÃO]: ${reason}`,
      correlationId,
    };

    const records = this.listConfigurationChanges(companyId);
    records.unshift(reverseRecord);
    this.saveConfigurationChanges(companyId, records);

    await this.registerAuditLog(
      companyId,
      userId,
      AuditAction.UPDATE,
      'CONFIGURATION_ROLLBACK',
      snapshotId,
      correlationId,
      JSON.stringify({ snapshotId, restoredVersion: targetSnapshot.configurationVersion, reason })
    );

    return { success: true, message: `Configuração restaurada com sucesso a partir do snapshot ${targetSnapshot.configurationVersion}.` };
  }

  private static async registerAuditLog(
    companyId: string,
    userId: string,
    action: AuditAction,
    entityName: string,
    entityId: string,
    correlationId: string,
    newState: string
  ): Promise<void> {
    try {
      const repo = new AuditLogRepository();
      await repo.create({
        id: `audit-cfg-${Date.now()}-${Math.floor(Math.random() * 100)}`,
        companyId,
        userId,
        userName: userId,
        action,
        entityName,
        entityId,
        timestamp: new Date().toISOString(),
        newState: JSON.stringify({ correlationId, stateData: newState }),
      });
    } catch {
      // Non-blocking
    }
  }

  private static getMockDefaultChanges(companyId: string): ConfigurationChangeRecord[] {
    const cid = companyId || 'company-default';
    return [
      {
        id: 'cfg-rec-init',
        companyId: cid,
        configurationKey: 'auditRetentionDays',
        oldValue: 365,
        newValue: 730,
        changedBy: 'usr-admin-default',
        changedAt: new Date().toISOString(),
        reason: 'Conformidade com política de governança de releases Fase 3.52.',
        correlationId: 'config-rec-init-corr',
      },
    ];
  }
}
