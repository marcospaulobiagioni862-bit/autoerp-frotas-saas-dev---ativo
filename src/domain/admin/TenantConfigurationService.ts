// src/domain/admin/TenantConfigurationService.ts
import { TenantOperationalConfig } from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export class TenantConfigurationService {
  private static STORAGE_KEY_PREFIX = '__autoerp_tenant_config_v1_';

  /**
   * Returns default configuration for a given companyId.
   */
  public static getDefaultConfig(companyId: string): TenantOperationalConfig {
    return {
      companyId: companyId || 'company-default',
      companyName: 'AutoERP Locadora & Gestão de Frotas',
      document: '12.345.678/0001-90',
      email: 'contato@autoerp.com.br',
      phone: '(11) 98765-4321',
      address: 'Av. Paulista, 1000 - São Paulo, SP',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      maxVehiclesLimit: 5000,
      maxDriversLimit: 10000,
      slaResponseHours: 4,
      securityPolicy: {
        enforceMfa: true,
        sessionTimeoutMinutes: 30,
        maxLoginAttempts: 5,
      },
      auditRetentionDays: 365,
      backupFrequencyHours: 24,
      uiPreferences: {
        density: 'COMFORTABLE',
        theme: 'LIGHT',
        notificationsEnabled: true,
      },
      updatedAt: new Date().toISOString(),
      updatedBy: 'system-default',
    };
  }

  /**
   * Retrieves current tenant configuration, falling back to safe defaults.
   */
  public static getConfig(companyId: string): TenantOperationalConfig {
    if (typeof window === 'undefined' || !window.localStorage) {
      return this.getDefaultConfig(companyId);
    }
    try {
      const raw = localStorage.getItem(`${this.STORAGE_KEY_PREFIX}${companyId}`);
      if (!raw) {
        const def = this.getDefaultConfig(companyId);
        this.saveConfigWithoutAudit(def);
        return def;
      }
      const parsed: TenantOperationalConfig = JSON.parse(raw);
      return this.validateAndSanitize(parsed, companyId);
    } catch {
      return this.getDefaultConfig(companyId);
    }
  }

  /**
   * Validates and sanitizes configuration to ensure no negative numbers, NaN or Infinity.
   */
  public static validateAndSanitize(
    input: Partial<TenantOperationalConfig>, 
    companyId: string
  ): TenantOperationalConfig {
    const defaults = this.getDefaultConfig(companyId);

    const safeNumber = (val: any, fallback: number): number => {
      if (typeof val !== 'number' || isNaN(val) || !isFinite(val) || val < 0) {
        return fallback;
      }
      return Math.floor(val);
    };

    return {
      companyId,
      companyName: (input.companyName && input.companyName.trim()) || defaults.companyName,
      document: (input.document && input.document.trim()) || defaults.document,
      email: (input.email && input.email.trim()) || defaults.email,
      phone: (input.phone && input.phone.trim()) || defaults.phone,
      address: (input.address && input.address.trim()) || defaults.address,
      timezone: (input.timezone && input.timezone.trim()) || defaults.timezone,
      currency: (input.currency && input.currency.trim()) || defaults.currency,
      maxVehiclesLimit: safeNumber(input.maxVehiclesLimit, defaults.maxVehiclesLimit),
      maxDriversLimit: safeNumber(input.maxDriversLimit, defaults.maxDriversLimit),
      slaResponseHours: safeNumber(input.slaResponseHours, defaults.slaResponseHours),
      securityPolicy: {
        enforceMfa: input.securityPolicy?.enforceMfa ?? defaults.securityPolicy.enforceMfa,
        sessionTimeoutMinutes: safeNumber(input.securityPolicy?.sessionTimeoutMinutes, defaults.securityPolicy.sessionTimeoutMinutes),
        maxLoginAttempts: safeNumber(input.securityPolicy?.maxLoginAttempts, defaults.securityPolicy.maxLoginAttempts),
      },
      auditRetentionDays: safeNumber(input.auditRetentionDays, defaults.auditRetentionDays),
      backupFrequencyHours: safeNumber(input.backupFrequencyHours, defaults.backupFrequencyHours),
      uiPreferences: {
        density: input.uiPreferences?.density || defaults.uiPreferences.density,
        theme: input.uiPreferences?.theme || defaults.uiPreferences.theme,
        notificationsEnabled: input.uiPreferences?.notificationsEnabled ?? defaults.uiPreferences.notificationsEnabled,
      },
      updatedAt: new Date().toISOString(),
      updatedBy: input.updatedBy || 'admin',
    };
  }

  private static saveConfigWithoutAudit(config: TenantOperationalConfig): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`${this.STORAGE_KEY_PREFIX}${config.companyId}`, JSON.stringify(config));
    }
  }

  /**
   * Updates tenant configuration safely with validation and AuditLog registration.
   */
  public static async updateConfig(
    companyId: string,
    updates: Partial<TenantOperationalConfig>,
    userId: string,
    correlationId: string = `corr-tenant-config-${Date.now()}`
  ): Promise<{ success: boolean; config: TenantOperationalConfig; message: string }> {
    if (!companyId) {
      return {
        success: false,
        config: this.getDefaultConfig(''),
        message: 'Ação bloqueada: companyId é obrigatório.',
      };
    }

    const sanitized = this.validateAndSanitize({ ...updates, updatedBy: userId }, companyId);

    this.saveConfigWithoutAudit(sanitized);

    // AuditLog registration
    try {
      const auditRepo = new AuditLogRepository();
      await auditRepo.create({
        id: `audit-config-${Date.now()}`,
        companyId,
        userId,
        userName: userId,
        action: AuditAction.UPDATE,
        entityName: 'TENANT_CONFIGURATION',
        entityId: companyId,
        timestamp: new Date().toISOString(),
        newState: JSON.stringify({
          updatedBy: userId,
          correlationId,
          configSummary: {
            companyName: sanitized.companyName,
            maxVehiclesLimit: sanitized.maxVehiclesLimit,
            timezone: sanitized.timezone,
          },
        }),
      });
    } catch {
      // Non-blocking for UI
    }

    return {
      success: true,
      config: sanitized,
      message: 'Configuração do tenant atualizada e auditada com sucesso.',
    };
  }
}
