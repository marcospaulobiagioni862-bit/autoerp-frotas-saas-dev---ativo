// src/domain/release/FeatureFlagService.ts
import { FeatureFlag, FeatureFlagEnvironment } from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { UserRole, AuditAction } from '../../types/enums';

export class FeatureFlagService {
  private static STORAGE_KEY_PREFIX = '__autoerp_flags_v1_';

  /**
   * Lists all Feature Flags for a companyId.
   */
  public static listFlags(companyId: string): FeatureFlag[] {
    const cid = companyId || 'company-default';
    if (typeof window === 'undefined' || !window.localStorage) {
      return this.getMockDefaultFlags(cid);
    }
    try {
      const raw = localStorage.getItem(`${this.STORAGE_KEY_PREFIX}${cid}`);
      if (!raw) {
        const defaults = this.getMockDefaultFlags(cid);
        localStorage.setItem(`${this.STORAGE_KEY_PREFIX}${cid}`, JSON.stringify(defaults));
        return defaults;
      }
      return JSON.parse(raw);
    } catch {
      return this.getMockDefaultFlags(cid);
    }
  }

  private static saveFlags(companyId: string, flags: FeatureFlag[]): void {
    const cid = companyId || 'company-default';
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`${this.STORAGE_KEY_PREFIX}${cid}`, JSON.stringify(flags));
    }
  }

  /**
   * Checks whether a feature flag is enabled for a given tenant and environment.
   */
  public static isFeatureEnabled(companyId: string, key: string, environment: FeatureFlagEnvironment = 'PRODUCTION'): boolean {
    const flags = this.listFlags(companyId);
    const flag = flags.find(f => f.key === key && f.environment === environment);
    return flag ? flag.enabled : false;
  }

  /**
   * Sets or toggles a feature flag with RBAC and AuditLog.
   */
  public static async toggleFeatureFlag(
    companyId: string,
    flagId: string,
    enabled: boolean,
    userId: string,
    role: string = 'ADMIN',
    changeId?: string
  ): Promise<{ success: boolean; flag?: FeatureFlag; message: string }> {
    const flags = this.listFlags(companyId);
    const index = flags.findIndex(f => f.id === flagId);
    if (index === -1) {
      return { success: false, message: 'Feature flag não encontrada.' };
    }

    const target = flags[index];

    // RBAC check: PRODUCTION requires ADMIN
    if (target.environment === 'PRODUCTION' && role !== UserRole.ADMIN && role !== 'ADMIN') {
      return { success: false, message: 'Acesso negado: Alterar Feature Flags em PRODUÇÃO requer perfil ADMIN.' };
    }

    target.enabled = enabled;
    target.updatedAt = new Date().toISOString();
    target.updatedBy = userId;
    if (changeId) target.changeId = changeId;

    flags[index] = target;
    this.saveFlags(companyId, flags);

    const correlationId = `feature-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await this.registerAuditLog(
      companyId,
      userId,
      AuditAction.UPDATE,
      'FEATURE_FLAG',
      target.key,
      correlationId,
      JSON.stringify({ key: target.key, enabled, environment: target.environment, changeId })
    );

    return {
      success: true,
      flag: target,
      message: `Feature Flag '${target.key}' [${target.environment}] ${enabled ? 'ATIVADA' : 'DESATIVADA'} com sucesso.`,
    };
  }

  /**
   * Creates a new Feature Flag safely.
   */
  public static async createFeatureFlag(
    input: Partial<FeatureFlag>,
    userId: string,
    role: string = 'ADMIN'
  ): Promise<{ success: boolean; flag?: FeatureFlag; message: string }> {
    const companyId = input.companyId || 'company-default';

    if (role !== UserRole.ADMIN && role !== 'ADMIN') {
      return { success: false, message: 'Acesso negado: Somente administradores podem criar Feature Flags.' };
    }

    const key = (input.key && input.key.trim().toUpperCase()) || 'FF_NEW_FEATURE';
    const env = input.environment || 'PRODUCTION';

    const flags = this.listFlags(companyId);
    if (flags.some(f => f.key === key && f.environment === env)) {
      return { success: false, message: `Feature Flag '${key}' já existe no ambiente '${env}'.` };
    }

    const correlationId = `feature-create-${Date.now()}`;

    const newFlag: FeatureFlag = {
      id: `ff-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      companyId,
      key,
      enabled: input.enabled !== undefined ? input.enabled : false,
      description: input.description || 'Feature flag de governança e controle de versão.',
      environment: env,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
      changeId: input.changeId,
    };

    flags.unshift(newFlag);
    this.saveFlags(companyId, flags);

    await this.registerAuditLog(
      companyId,
      userId,
      AuditAction.CREATE,
      'FEATURE_FLAG',
      newFlag.key,
      correlationId,
      JSON.stringify({ key, enabled: newFlag.enabled, environment: env })
    );

    return { success: true, flag: newFlag, message: `Feature Flag '${key}' criada com sucesso.` };
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
        id: `audit-ff-${Date.now()}-${Math.floor(Math.random() * 100)}`,
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
      // Non-blocking for UI
    }
  }

  private static getMockDefaultFlags(companyId: string): FeatureFlag[] {
    const cid = companyId || 'company-default';
    return [
      {
        id: 'ff-001',
        companyId: cid,
        key: 'FF_GOVERNANCE_RELEASE_CENTER',
        enabled: true,
        description: 'Painel Central de Governança de Releases e Controle de Mudanças.',
        environment: 'PRODUCTION',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'usr-admin-default',
      },
      {
        id: 'ff-002',
        companyId: cid,
        key: 'FF_STRICT_RBAC_MATRICIAL',
        enabled: true,
        description: 'Validação matricial estrita de RBAC para operações críticas.',
        environment: 'PRODUCTION',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'usr-admin-default',
      },
      {
        id: 'ff-003',
        companyId: cid,
        key: 'FF_AUTOMATIC_CONFIG_SNAPSHOTS',
        enabled: true,
        description: 'Snapshots automáticos de configuração em mudanças críticas.',
        environment: 'PRODUCTION',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'usr-admin-default',
      },
      {
        id: 'ff-004',
        companyId: cid,
        key: 'FF_FINANCIAL_CORE_FREEZE_GUARD',
        enabled: true,
        description: 'Bloqueador P0 contra modificações no núcleo financeiro.',
        environment: 'PRODUCTION',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'usr-admin-default',
      },
      {
        id: 'ff-005',
        companyId: cid,
        key: 'FF_EXPERIMENTAL_AI_DIAGNOSTICS',
        enabled: false,
        description: 'Diagnósticos experimentais de frota em ambiente de teste.',
        environment: 'STAGING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'usr-admin-default',
      },
    ];
  }
}
