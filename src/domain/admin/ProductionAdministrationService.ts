// src/domain/admin/ProductionAdministrationService.ts
import { SystemHealthBreakdown, AdministrativeAlertItem } from './types';
import { SystemHealthService } from './SystemHealthService';
import { TenantConfigurationService } from './TenantConfigurationService';
import { SecurityAdministrationService } from './SecurityAdministrationService';
import { BackupService } from '../resilience/BackupService';

export class ProductionAdministrationService {
  /**
   * Consolidates complete production administration status.
   */
  public static getProductionSummary(companyId: string, userRole: string = 'ADMIN') {
    const health = SystemHealthService.calculateSystemHealth(companyId);
    const config = TenantConfigurationService.getConfig(companyId);
    const users = SecurityAdministrationService.listUsers(companyId);
    const sessions = SecurityAdministrationService.listActiveSessions(companyId);
    const backups = BackupService.listBackups(companyId);
    const drStatus = BackupService.getDisasterRecoveryStatus(companyId);

    const alerts: AdministrativeAlertItem[] = [];

    if (backups.length === 0) {
      alerts.push({
        id: `alt-bkp-${Date.now()}`,
        severity: 'P1',
        category: 'BACKUP',
        message: 'Nenhum snapshot de backup registrado para este tenant.',
        companyId,
        createdAt: new Date().toISOString(),
        correlationId: `corr-alt-1`,
        resolved: false,
      });
    }

    if (drStatus.rpoStatus === 'ABOVE_TARGET') {
      alerts.push({
        id: `alt-rpo-${Date.now()}`,
        severity: 'P2',
        category: 'BACKUP',
        message: `RPO acima da meta: Último backup há ${drStatus.rpoActualMinutes} min.`,
        companyId,
        createdAt: new Date().toISOString(),
        correlationId: `corr-alt-2`,
        resolved: false,
      });
    }

    if (users.filter(u => u.status === 'SUSPENDED').length > 0) {
      alerts.push({
        id: `alt-sec-${Date.now()}`,
        severity: 'P3',
        category: 'SECURITY',
        message: 'Existem usuários com conta suspensa aguardando revisão.',
        companyId,
        createdAt: new Date().toISOString(),
        correlationId: `corr-alt-3`,
        resolved: false,
      });
    }

    return {
      systemVersion: '3.51.0',
      baseline: 'FASE 3.50 HOMOLOGADA',
      environment: 'PRODUCTION_READY',
      companyId,
      companyName: config.companyName,
      userRole,
      health,
      config,
      usersCount: users.length,
      activeSessionsCount: sessions.length,
      securityDataSource: users.length > 0 || sessions.length > 0
        ? 'DEVELOPMENT_MOCK'
        : 'SERVER_SOURCE_NOT_CONNECTED',
      backupsCount: backups.length,
      alerts,
      lastAuditTimestamp: new Date().toISOString(),
    };
  }
}
