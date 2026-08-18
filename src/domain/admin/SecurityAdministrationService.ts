// src/domain/admin/SecurityAdministrationService.ts
import { SystemUserRecord, ActiveSessionRecord, RbacMatrixRule } from './types';
import { UserRole, AuditAction } from '../../types/enums';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';

export function resolveSecurityAdministrationMockMode(isDevelopmentRuntime: boolean): boolean {
  return isDevelopmentRuntime === true;
}

export class SecurityAdministrationService {
  private static USER_STORAGE_KEY_PREFIX = '__autoerp_admin_users_v1_';

  private static isDevelopmentMockDataEnabled(): boolean {
    const viteImportMeta = import.meta as ImportMeta & {
      env?: {
        DEV?: boolean;
      };
    };

    return resolveSecurityAdministrationMockMode(viteImportMeta.env?.DEV === true);
  }

  /**
   * Evaluates if a role is authorized for an administrative action.
   */
  public static isActionAllowed(role: UserRole | string, action: string): boolean {
    const roleUpper = String(role).toUpperCase();

    // ADMIN has full permissions
    if (roleUpper === UserRole.ADMIN || roleUpper === 'ADMIN') {
      return true;
    }

    // Role-action mapping
    switch (action) {
      case 'VIEW_SYSTEM_HEALTH':
      case 'VIEW_TENANT_INFO':
      case 'VIEW_AUDIT_LOGS':
      case 'VIEW_OBSERVABILITY':
        return true; // Allowed for all authenticated staff

      case 'VIEW_USERS':
      case 'VIEW_RBAC_MATRIX':
      case 'VIEW_SECURITY_POLICY':
      case 'VIEW_BACKUP_STATUS':
        return roleUpper === UserRole.MANAGER || roleUpper === 'OPERATIONAL_MANAGER' || roleUpper === UserRole.FINANCIAL;

      case 'CONFIGURE_TENANT':
      case 'CONFIGURE_USERS':
      case 'CONFIGURE_GLOBAL':
      case 'MANAGE_BACKUP':
      case 'RESTORE_BACKUP':
      case 'EXECUTE_ROLLBACK':
      case 'CHANGE_SECURITY_POLICY':
        return false; // Strict ADMIN only

      default:
        return false;
    }
  }

  /**
   * Returns the canonical RBAC Matrix for the ERP system.
   */
  public static getRbacMatrix(): RbacMatrixRule[] {
    return [
      { role: 'ADMIN', action: 'Visualizar Saúde do Sistema', allowed: true, description: 'Acesso completo a métricas de saúde' },
      { role: 'OPERATIONAL_MANAGER', action: 'Visualizar Saúde do Sistema', allowed: true, description: 'Monitoramento da saúde operacional' },
      { role: 'FINANCIAL', action: 'Visualizar Saúde do Sistema', allowed: true, description: 'Visualização da integridade do sistema' },
      { role: 'OPERATIONAL', action: 'Visualizar Saúde do Sistema', allowed: true, description: 'Visualização conforme política da empresa' },

      { role: 'ADMIN', action: 'Configurar Empresa / Tenant', allowed: true, description: 'Edição de limites, contatos e parâmetros' },
      { role: 'OPERATIONAL_MANAGER', action: 'Configurar Empresa / Tenant', allowed: false, description: 'Bloqueado para gestores' },
      { role: 'FINANCIAL', action: 'Configurar Empresa / Tenant', allowed: false, description: 'Bloqueado para financeiro' },
      { role: 'OPERATIONAL', action: 'Configurar Empresa / Tenant', allowed: false, description: 'Bloqueado para atendentes' },

      { role: 'ADMIN', action: 'Gerenciar Usuários & Permissões', allowed: true, description: 'Criação, edição e suspensão de contas' },
      { role: 'OPERATIONAL_MANAGER', action: 'Gerenciar Usuários & Permissões', allowed: false, description: 'Somente leitura de usuários de frota' },
      { role: 'FINANCIAL', action: 'Gerenciar Usuários & Permissões', allowed: false, description: 'Bloqueado para financeiro' },

      { role: 'ADMIN', action: 'Configurações Globais & Segurança', allowed: true, description: 'Políticas de sessão, MFA e retenção' },
      { role: 'OPERATIONAL_MANAGER', action: 'Configurações Globais & Segurança', allowed: false, description: 'Bloqueado' },

      { role: 'ADMIN', action: 'Executar Backup e Restore', allowed: true, description: 'Ações de resiliência e recuperação DR' },
      { role: 'OPERATIONAL_MANAGER', action: 'Executar Backup e Restore', allowed: false, description: 'Somente leitura do status do backup' },
      { role: 'FINANCIAL', action: 'Executar Backup e Restore', allowed: false, description: 'Bloqueado' },
    ];
  }

  /**
   * Returns development-only administrative mock users. Production callers
   * fail closed with an empty list until a real server data source is connected.
   */
  public static listUsers(companyId: string): SystemUserRecord[] {
    if (!this.isDevelopmentMockDataEnabled()) {
      return [];
    }

    if (typeof window === 'undefined' || !window.localStorage) {
      return this.getMockDefaultUsers(companyId);
    }
    try {
      const raw = localStorage.getItem(`${this.USER_STORAGE_KEY_PREFIX}${companyId}`);
      if (!raw) {
        const defaults = this.getMockDefaultUsers(companyId);
        localStorage.setItem(`${this.USER_STORAGE_KEY_PREFIX}${companyId}`, JSON.stringify(defaults));
        return defaults;
      }
      return JSON.parse(raw);
    } catch {
      return this.getMockDefaultUsers(companyId);
    }
  }

  /**
   * Returns fabricated session telemetry only in Vite development runtime.
   * Production callers return no sessions rather than presenting mock IPs,
   * timestamps or session IDs as real security telemetry.
   */
  public static listActiveSessions(companyId: string): ActiveSessionRecord[] {
    if (!this.isDevelopmentMockDataEnabled()) {
      return [];
    }

    const users = this.listUsers(companyId);
    const now = new Date();

    return users.map((u, idx) => ({
      sessionId: `sess-${companyId.substring(0, 5)}-${idx + 101}`,
      userId: u.id,
      userName: u.name,
      userRole: u.role,
      companyId,
      ipAddress: `192.168.1.${10 + idx}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AutoERP/3.51',
      loginTime: new Date(now.getTime() - (idx + 1) * 3600 * 1000).toISOString(),
      lastActiveTime: new Date(now.getTime() - (idx * 5) * 60 * 1000).toISOString(),
      status: u.status === 'ACTIVE' ? 'ACTIVE' : 'EXPIRED',
    }));
  }

  /**
   * Updates only the development mock user store. Real production user status
   * changes must use a trusted server-side administration endpoint in a later
   * SECURITY-2 wave.
   */
  public static async updateUserStatus(
    companyId: string,
    targetUserId: string,
    newStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
    executorUserId: string,
    executorRole: string,
    correlationId: string = `corr-sec-user-${Date.now()}`
  ): Promise<{ success: boolean; message: string }> {
    if (!this.isDevelopmentMockDataEnabled()) {
      return {
        success: false,
        message: 'Operação indisponível: gestão local de usuários simulados é permitida somente em desenvolvimento.',
      };
    }

    if (!this.isActionAllowed(executorRole, 'CONFIGURE_USERS')) {
      return {
        success: false,
        message: 'Acesso negado: Somente administradores podem alterar o status de usuários.',
      };
    }

    const users = this.listUsers(companyId);
    const userIndex = users.findIndex(u => u.id === targetUserId);
    if (userIndex === -1) {
      return { success: false, message: 'Usuário não encontrado para este tenant.' };
    }

    users[userIndex].status = newStatus;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`${this.USER_STORAGE_KEY_PREFIX}${companyId}`, JSON.stringify(users));
    }

    // AuditLog registration for the development simulation only.
    try {
      const auditRepo = new AuditLogRepository();
      await auditRepo.create({
        id: `audit-sec-${Date.now()}`,
        companyId,
        userId: executorUserId,
        userName: executorUserId,
        action: AuditAction.UPDATE,
        entityName: 'SYSTEM_USER',
        entityId: targetUserId,
        timestamp: new Date().toISOString(),
        newState: JSON.stringify({
          targetUserId,
          newStatus,
          executorUserId,
          correlationId,
        }),
      });
    } catch {
      // Non-blocking in the development-only simulation.
    }

    return {
      success: true,
      message: `Status do usuário ${users[userIndex].name} atualizado para ${newStatus}.`,
    };
  }

  private static getMockDefaultUsers(companyId: string): SystemUserRecord[] {
    const cid = companyId || 'company-default';
    return [
      {
        id: `usr-admin-${cid.substring(0, 4)}`,
        companyId: cid,
        name: 'Administrador Principal',
        email: 'admin@autoerp.com.br',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
        lastAccessAt: new Date().toISOString(),
        permissions: ['ALL_PERMISSIONS'],
      },
      {
        id: `usr-manager-${cid.substring(0, 4)}`,
        companyId: cid,
        name: 'Carlos Oliveira - Gerente Operacional',
        email: 'carlos.oliveira@autoerp.com.br',
        role: 'OPERATIONAL_MANAGER',
        status: 'ACTIVE',
        lastAccessAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        permissions: ['OPERATIONS_FULL', 'FLEET_READ', 'REPORTS_READ'],
      },
      {
        id: `usr-fin-${cid.substring(0, 4)}`,
        companyId: cid,
        name: 'Mariana Santos - Analista Financeiro',
        email: 'mariana.santos@autoerp.com.br',
        role: UserRole.FINANCIAL,
        status: 'ACTIVE',
        lastAccessAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        permissions: ['FINANCE_READ_ONLY'],
      },
    ];
  }
}
