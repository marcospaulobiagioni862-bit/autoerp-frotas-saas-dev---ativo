// src/domain/release/ChangeManagementService.ts
import { ChangeRequest, ChangeStatus, ImpactAssessment } from './types';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { UserRole, AuditAction } from '../../types/enums';

export class ChangeManagementService {
  private static STORAGE_KEY_PREFIX = '__autoerp_changes_v1_';
  private static IDEMPOTENCY_STORAGE_KEY_PREFIX = '__autoerp_change_idem_v1_';
  private static LOCKS: Set<string> = new Set();

  /**
   * Deterministic state machine allowed transitions for ChangeRequest.
   */
  private static ALLOWED_TRANSITIONS: Record<ChangeStatus, ChangeStatus[]> = {
    DRAFT: ['SUBMITTED', 'CANCELLED'],
    SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['SCHEDULED', 'EXECUTING', 'CANCELLED'],
    SCHEDULED: ['EXECUTING', 'CANCELLED'],
    EXECUTING: ['VALIDATING', 'FAILED', 'CANCELLED'],
    VALIDATING: ['COMPLETED', 'FAILED', 'ROLLED_BACK'],
    COMPLETED: ['ROLLED_BACK'],
    REJECTED: [],  // Terminal
    CANCELLED: [], // Terminal
    ROLLED_BACK: [], // Terminal
    FAILED: ['ROLLED_BACK', 'CANCELLED'],
  };

  /**
   * Retrieves all ChangeRequests for a companyId.
   */
  public static listChanges(companyId: string): ChangeRequest[] {
    const cid = companyId || 'company-default';
    if (typeof window === 'undefined' || !window.localStorage) {
      return this.getMockDefaultChanges(cid);
    }
    try {
      const raw = localStorage.getItem(`${this.STORAGE_KEY_PREFIX}${cid}`);
      if (!raw) {
        const defaults = this.getMockDefaultChanges(cid);
        localStorage.setItem(`${this.STORAGE_KEY_PREFIX}${cid}`, JSON.stringify(defaults));
        return defaults;
      }
      return JSON.parse(raw);
    } catch {
      return this.getMockDefaultChanges(cid);
    }
  }

  private static saveChanges(companyId: string, changes: ChangeRequest[]): void {
    const cid = companyId || 'company-default';
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`${this.STORAGE_KEY_PREFIX}${cid}`, JSON.stringify(changes));
    }
  }

  /**
   * Creates a new Change Request with idempotency, impact assessment, and financial core checks.
   */
  public static async createChange(
    input: Partial<ChangeRequest>,
    userId: string,
    role: string = 'ADMIN',
    idempotencyKey?: string
  ): Promise<{ success: boolean; change?: ChangeRequest; message: string; p0Found?: boolean }> {
    const companyId = input.companyId || 'company-default';

    // Idempotency check
    const idemKey = idempotencyKey || input.idempotencyKey || `idem-chg-${input.title}-${companyId}`;
    if (typeof window !== 'undefined' && window.localStorage) {
      const existingIdem = localStorage.getItem(`${this.IDEMPOTENCY_STORAGE_KEY_PREFIX}${idemKey}`);
      if (existingIdem) {
        try {
          const chg: ChangeRequest = JSON.parse(existingIdem);
          return { success: true, change: chg, message: 'ChangeRequest retornada via idempotência.' };
        } catch {
          // continue
        }
      }
    }

    // Concurrency lock
    const lockKey = `lock-chg-create-${companyId}-${input.title || 'new'}`;
    if (this.LOCKS.has(lockKey)) {
      return { success: false, message: 'Operação de mudança em processamento concorrente. Tente novamente.' };
    }
    this.LOCKS.add(lockKey);

    try {
      const changes = this.listChanges(companyId);

      const impact: ImpactAssessment = input.impactAssessment || {
        affectedModules: ['CONFIG'],
        affectedEntities: ['TENANT_OPERATIONAL_CONFIG'],
        touchesFinancialCore: false,
        requiresBackup: false,
        requiresRollbackPlan: true,
        estimatedDowntimeMinutes: 0,
      };

      // Strict Financial Core Protection: If change touches financial core, REJECT IMMEDIATELY with P0
      if (impact.touchesFinancialCore) {
        await this.registerAuditLog(
          companyId,
          userId,
          AuditAction.UPDATE,
          'CHANGE_REJECTED_FINANCIAL_CORE',
          'financial-core-violation',
          `corr-chg-fin-${Date.now()}`,
          'CRITICAL: Tentativa de mudança direcionada ao Núcleo Financeiro Congelado. Bloqueada (P0).'
        );
        return {
          success: false,
          message: 'MUDANÇA BLOQUEADA (P0): Alterações diretas no Núcleo Financeiro são proibidas (Fase 3.52).',
          p0Found: true,
        };
      }

      const correlationId = `change-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const newChange: ChangeRequest = {
        id: `chg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        companyId,
        title: input.title || 'Ajuste de Parâmetros de Governança',
        description: input.description || 'Solicitação de mudança operacional rastreável.',
        category: input.category || 'CONFIGURATION',
        risk: input.risk || 'LOW',
        priority: input.priority || 'P3',
        status: 'SUBMITTED',
        requestedBy: userId,
        createdAt: new Date().toISOString(),
        rollbackPlan: input.rollbackPlan || 'Restaurar snapshot de configuração anterior.',
        validationPlan: input.validationPlan || 'Executar teste de integridade e verificar AuditLog.',
        impactAssessment: impact,
        releaseId: input.releaseId,
        correlationId,
        auditLogIds: [],
        incidentId: input.incidentId,
        taskId: input.taskId,
        idempotencyKey: idemKey,
      };

      changes.unshift(newChange);
      this.saveChanges(companyId, changes);

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(`${this.IDEMPOTENCY_STORAGE_KEY_PREFIX}${idemKey}`, JSON.stringify(newChange));
      }

      await this.registerAuditLog(
        companyId,
        userId,
        AuditAction.CREATE,
        'CHANGE_REQUEST',
        newChange.id,
        correlationId,
        JSON.stringify({ title: newChange.title, status: newChange.status })
      );

      return { success: true, change: newChange, message: `Change Request ${newChange.id} criada e submetida com sucesso.` };
    } finally {
      this.LOCKS.delete(lockKey);
    }
  }

  /**
   * Approves or Rejects a Change Request.
   */
  public static async evaluateChange(
    changeId: string,
    companyId: string,
    approve: boolean,
    userId: string,
    role: string = 'ADMIN',
    reason?: string
  ): Promise<{ success: boolean; change?: ChangeRequest; message: string }> {
    if (role !== UserRole.ADMIN && role !== 'ADMIN' && role !== 'OPERATIONAL_MANAGER') {
      return { success: false, message: 'Acesso negado: Somente administradores ou gestores operacionais podem avaliar mudanças.' };
    }

    const changes = this.listChanges(companyId);
    const index = changes.findIndex(c => c.id === changeId);
    if (index === -1) return { success: false, message: 'Change Request não encontrada.' };

    const target = changes[index];
    const nextStatus: ChangeStatus = approve ? 'APPROVED' : 'REJECTED';

    if (!this.ALLOWED_TRANSITIONS[target.status]?.includes(nextStatus)) {
      return { success: false, message: `Transição inválida de ${target.status} para ${nextStatus}.` };
    }

    target.status = nextStatus;
    target.approvedBy = userId;
    target.approvedAt = new Date().toISOString();
    changes[index] = target;
    this.saveChanges(companyId, changes);

    await this.registerAuditLog(
      companyId,
      userId,
      AuditAction.UPDATE,
      'CHANGE_REQUEST',
      changeId,
      target.correlationId,
      JSON.stringify({ action: approve ? 'APPROVE_CHANGE' : 'REJECT_CHANGE', reason: reason || 'N/A' })
    );

    return {
      success: true,
      change: target,
      message: `Change Request ${changeId} foi ${approve ? 'APROVADA' : 'REJEITADA'} com sucesso.`,
    };
  }

  /**
   * Executes a Change Request transition (EXECUTING -> VALIDATING -> COMPLETED).
   */
  public static async executeChange(
    changeId: string,
    companyId: string,
    userId: string
  ): Promise<{ success: boolean; change?: ChangeRequest; message: string }> {
    const changes = this.listChanges(companyId);
    const index = changes.findIndex(c => c.id === changeId);
    if (index === -1) return { success: false, message: 'Change Request não encontrada.' };

    const target = changes[index];
    if (target.status !== 'APPROVED' && target.status !== 'SCHEDULED') {
      return { success: false, message: `Mudança deve estar APPROVED ou SCHEDULED para execução.` };
    }

    target.status = 'COMPLETED';
    target.executedAt = new Date().toISOString();
    target.completedAt = new Date().toISOString();
    changes[index] = target;
    this.saveChanges(companyId, changes);

    await this.registerAuditLog(
      companyId,
      userId,
      AuditAction.UPDATE,
      'CHANGE_REQUEST',
      changeId,
      target.correlationId,
      JSON.stringify({ action: 'EXECUTE_CHANGE', status: 'COMPLETED' })
    );

    return { success: true, change: target, message: `Change Request ${changeId} concluída com sucesso.` };
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
        id: `audit-chg-${Date.now()}-${Math.floor(Math.random() * 100)}`,
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

  private static getMockDefaultChanges(companyId: string): ChangeRequest[] {
    const cid = companyId || 'company-default';
    return [
      {
        id: 'chg-001-cfg',
        companyId: cid,
        title: 'Atualização de Retenção de Trilha de Auditoria e Timezone',
        description: 'Ajuste de configuração para conformidade de auditoria Fase 3.52.',
        category: 'CONFIGURATION',
        risk: 'LOW',
        priority: 'P3',
        status: 'COMPLETED',
        requestedBy: 'usr-admin-default',
        approvedBy: 'usr-admin-default',
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        executedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        rollbackPlan: 'Restaurar snapshot de configuração anterior.',
        validationPlan: 'Verificar integridade do tenant e log de auditoria.',
        impactAssessment: {
          affectedModules: ['CONFIG', 'ADMIN'],
          affectedEntities: ['TENANT_OPERATIONAL_CONFIG'],
          touchesFinancialCore: false,
          requiresBackup: false,
          requiresRollbackPlan: true,
          estimatedDowntimeMinutes: 0,
        },
        correlationId: 'change-chg-001-corr',
        auditLogIds: [],
      },
    ];
  }
}
