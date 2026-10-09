// src/domain/admin/TenantConfigurationService.ts
import { TenantOperationalConfig } from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditAction } from '../../types/enums';

export function resolveTenantLocalConfigurationMode(isDevelopmentRuntime: boolean): boolean {
  return isDevelopmentRuntime === true;
}

export class TenantConfigurationService {
  private static STORAGE_KEY_PREFIX = '__autoerp_tenant_config_v1_';

  private static isDevelopmentLocalConfigurationEnabled(): boolean {
    const viteImportMeta = import.meta as ImportMeta & {
      env?: {
        DEV?: boolean;
      };
    };

    return resolveTenantLocalConfigurationMode(viteImportMeta.env?.DEV === true);
  }

  /**
   * Development-only seed configuration used to keep the local development UI
   * usable until TenantOperationalConfig has a trusted server-side source.
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
      updatedBy: 'development-default',
    };
  }

  private static getServerSourceUnavailableConfig(companyId: string): TenantOperationalConfig {
    return {
      companyId,
      companyName: '',
      document: '',
      email: '',
      phone: '',
      address: '',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      maxVehiclesLimit: 0,
      maxDriversLimit: 0,
      slaResponseHours: 0,
      securityPolicy: {
        enforceMfa: true,
        sessionTimeoutMinutes: 0,
        maxLoginAttempts: 0,
      },
      auditRetentionDays: 0,
      backupFrequencyHours: 0,
      uiPreferences: {
        density: 'COMFORTABLE',
        theme: 'LIGHT',
        notificationsEnabled: false,
      },
      updatedAt: new Date(0).toISOString(),
      updatedBy: 'SERVER_SOURCE_NOT_CONNECTED',
    };
  }

  /**
   * Retrieves tenant configuration. LocalStorage is a development-only source;
   * non-DEV callers receive an explicit neutral/unavailable state rather than
   * fabricated company data.
   */
  public static getConfig(companyId: string): TenantOperationalConfig {
    if (!this.isDevelopmentLocalConfigurationEnabled()) {
      return this.getServerSourceUnavailableConfig(companyId);
    }

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

    const safeNumber = (val: unknown, fallback: number): number => {
      if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val) || val < 0) {
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
   * Updates local tenant configuration only in development. Production/default
   * callers fail closed until a trusted server-side configuration endpoint is
   * implemented.
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
        config: this.getServerSourceUnavailableConfig(''),
        message: 'Não foi possível identificar a empresa.',
      };
    }

    if (!this.isDevelopmentLocalConfigurationEnabled()) {
      return {
        success: false,
        config: this.getServerSourceUnavailableConfig(companyId),
        message: 'Esta configuração não pode ser alterada neste ambiente.',
      };
    }

    const sanitized = this.validateAndSanitize({ ...updates, updatedBy: userId }, companyId);

    this.saveConfigWithoutAudit(sanitized);

    // AuditLog registration for the development-only local configuration path.
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
      // Non-blocking in the development-only local configuration path.
    }

    return {
      success: true,
      config: sanitized,
      message: 'Configuração local de desenvolvimento atualizada e auditada com sucesso.',
    };
  }
}
