import { ITransactionContext } from './ITransactionContext';
import { AuditLogRepository, BaseRepository } from '../../persistence/repositories/localRepositories';
import { User } from '../../types/entities';
import { generateUUID } from '../../shared/utils/uuid';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    'VIEW_FINANCIAL',
    'PAYABLE_CREATE',
    'PAYABLE_CANCEL',
    'RECEIVABLE_CREATE',
    'RECEIVABLE_CANCEL',
    'PAYMENT_REGISTER',
    'RECEIPT_REGISTER',
    'FINANCIAL_TRANSFER',
    'FINANCIAL_REVERSAL',
    'FINANCIAL_RENEGOTIATION',
    'FINANCIAL_OVERDUE_PROCESS',
    'FINANCIAL_LATE_CHARGE_RULE_MANAGE',
    'FINANCIAL_MASTER_DATA_MANAGE',
    'BANK_RECONCILIATION_VIEW',
    'BANK_RECONCILIATION_MATCH',
    'BANK_RECONCILIATION_UNMATCH',
    'BANK_RECONCILIATION_IGNORE',
    'FINANCIAL_PERIOD_CLOSE',
    'FINANCIAL_PERIOD_REOPEN',
    'FINANCIAL_AUDIT_VIEW',
  ],
  FINANCIAL_MANAGER: [
    'VIEW_FINANCIAL',
    'PAYABLE_CREATE',
    'PAYABLE_CANCEL',
    'RECEIVABLE_CREATE',
    'RECEIVABLE_CANCEL',
    'PAYMENT_REGISTER',
    'RECEIPT_REGISTER',
    'FINANCIAL_TRANSFER',
    'FINANCIAL_REVERSAL',
    'FINANCIAL_RENEGOTIATION',
    'FINANCIAL_OVERDUE_PROCESS',
    'FINANCIAL_LATE_CHARGE_RULE_MANAGE',
    'FINANCIAL_MASTER_DATA_MANAGE',
    'BANK_RECONCILIATION_VIEW',
    'BANK_RECONCILIATION_MATCH',
    'BANK_RECONCILIATION_UNMATCH',
    'BANK_RECONCILIATION_IGNORE',
    'FINANCIAL_PERIOD_CLOSE',
    'FINANCIAL_AUDIT_VIEW',
  ],
  MANAGER: [
    'VIEW_FINANCIAL',
    'PAYABLE_CREATE',
    'PAYABLE_CANCEL',
    'RECEIVABLE_CREATE',
    'RECEIVABLE_CANCEL',
    'PAYMENT_REGISTER',
    'RECEIPT_REGISTER',
    'FINANCIAL_TRANSFER',
    'FINANCIAL_REVERSAL',
    'FINANCIAL_RENEGOTIATION',
    'FINANCIAL_OVERDUE_PROCESS',
    'FINANCIAL_LATE_CHARGE_RULE_MANAGE',
    'FINANCIAL_MASTER_DATA_MANAGE',
    'BANK_RECONCILIATION_VIEW',
    'BANK_RECONCILIATION_MATCH',
    'BANK_RECONCILIATION_UNMATCH',
    'BANK_RECONCILIATION_IGNORE',
    'FINANCIAL_PERIOD_CLOSE',
    'FINANCIAL_AUDIT_VIEW',
  ],
  FINANCIAL_OPERATOR: [
    'VIEW_FINANCIAL',
    'PAYABLE_CREATE',
    'RECEIVABLE_CREATE',
    'PAYMENT_REGISTER',
    'RECEIPT_REGISTER',
  ],
  FINANCIAL: [
    'VIEW_FINANCIAL',
    'PAYABLE_CREATE',
    'RECEIVABLE_CREATE',
    'PAYMENT_REGISTER',
    'RECEIPT_REGISTER',
  ],
  OPERATIONAL: [
    'VIEW_FINANCIAL',
    'PAYABLE_CREATE',
    'RECEIVABLE_CREATE',
    'PAYMENT_REGISTER',
    'RECEIPT_REGISTER',
  ],
  FINANCIAL_VIEWER: [
    'VIEW_FINANCIAL',
    'BANK_RECONCILIATION_VIEW',
  ],
  READONLY: [
    'VIEW_FINANCIAL',
    'BANK_RECONCILIATION_VIEW',
  ],
};

const RECURRING_SYSTEM_USER_ID = 'system-recurring';
const RECURRING_SYSTEM_PERMISSIONS = new Set(['PAYABLE_CREATE', 'RECEIVABLE_CREATE']);

export class FinancialAuthorizationService {
  public static async authorize(
    userId: string,
    companyId: string,
    requiredPermission: string,
    txContext?: ITransactionContext
  ): Promise<User> {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('Acesso negado: companyId é obrigatório');
    }

    if (!userId) {
      throw new Error('Acesso negado: Usuário não informado');
    }

    // SECURITY-2I5: only trusted server code can mint this narrow capability.
    // No HTTP/body/header field can set trustedSystemActor on a transaction context.
    if (
      txContext?.trustedSystemActor === 'RECURRING' &&
      userId === RECURRING_SYSTEM_USER_ID &&
      RECURRING_SYSTEM_PERMISSIONS.has(requiredPermission)
    ) {
      const now = new Date().toISOString();
      return {
        id: RECURRING_SYSTEM_USER_ID,
        companyId,
        name: 'Motor de Recorrência',
        email: 'system-recurring@internal.invalid',
        role: 'ADMIN' as any,
        active: true,
        createdAt: now,
        updatedAt: now,
      } as User;
    }

    let user: User | null = null;
    if (txContext) {
      const userRepo = txContext.getUserRepo();
      user = await userRepo.findById(userId);
    } else {
      const userRepo = new BaseRepository<User>('users');
      user = await userRepo.findByIdForCompany(userId, companyId);
    }

    if (!user) {
      await this.logDeniedAttempt(userId, companyId, requiredPermission, txContext);
      throw new Error(`Acesso negado: Usuário não encontrado (${userId})`);
    }

    if (!user.companyId || user.companyId !== companyId) {
      await this.logDeniedAttempt(userId, companyId, requiredPermission, txContext);
      throw new Error('Acesso negado: Tenant incorreto ou descompasso de empresa');
    }

    if (!user.active) {
      await this.logDeniedAttempt(userId, companyId, requiredPermission, txContext);
      throw new Error('Acesso negado: Usuário inativo ou suspenso');
    }

    const role = user.role ? String(user.role).toUpperCase() : '';
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions || !permissions.includes(requiredPermission)) {
      await this.logDeniedAttempt(userId, companyId, requiredPermission, txContext);
      throw new Error(`Acesso negado: Permissão insuficiente (${requiredPermission}) para a função ${role}`);
    }

    return user;
  }

  private static async logDeniedAttempt(
    userId: string,
    companyId: string,
    requiredPermission: string,
    txContext?: ITransactionContext
  ): Promise<void> {
    try {
      const auditItem = {
        id: generateUUID(),
        companyId: companyId,
        entityName: 'SECURITY',
        entityId: 'AUTHORIZATION_FAILURE',
        action: 'FINANCIAL_PERMISSION_DENIED' as any,
        userId: userId || 'unknown-user',
        userName: userId || 'unknown-user',
        timestamp: new Date().toISOString(),
        newState: JSON.stringify({ operation: requiredPermission }),
      };

      if (txContext) {
        const auditRepo = txContext.getAuditLogRepo();
        await auditRepo.create(auditItem);
      } else {
        const auditRepo = new AuditLogRepository();
        await auditRepo.createForCompany(companyId, auditItem);
      }
    } catch {
      // Non-blocking
    }
  }
}
