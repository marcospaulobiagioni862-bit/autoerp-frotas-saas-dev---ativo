import { User } from '../../types/entities';
import { generateUUID } from '../../shared/utils/uuid';
import { ITransactionContext } from './ITransactionContext';

export interface IFinancialAuthorizationProvider {
  getUser(userId: string, companyId: string): Promise<User | null>;
  logDeniedAttempt(userId: string, companyId: string, requiredPermission: string): Promise<void>;
}

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

export class FinancialAuthorizationService {
  public static provider: IFinancialAuthorizationProvider | null = null;

  public static async logDeniedAttempt(
    userId: string,
    companyId: string,
    requiredPermission: string,
    txContext?: ITransactionContext
  ): Promise<void> {
    try {
      if (txContext) {
        await txContext.getAuditLogRepo().create({
          id: generateUUID(),
          companyId,
          userId: userId || 'unknown',
          action: 'FINANCIAL_PERMISSION_DENIED' as any,
          entityType: 'SECURITY',
          entityId: 'AUTHORIZATION_FAILURE',
          changes: JSON.stringify({ operation: requiredPermission }),
          timestamp: new Date().toISOString(),
        } as any);
      } else if (this.provider) {
        await this.provider.logDeniedAttempt(userId, companyId, requiredPermission);
      }
    } catch {
      // Non-blocking
    }
  }

  public static async authorize(
    userId: string,
    companyId: string,
    requiredPermission: string,
    txContext?: ITransactionContext
  ): Promise<User> {
    if (!userId) {
      throw new Error('Acesso negado: Usuário não informado');
    }
    
    let user: User | null = null;

    if (txContext) {
      user = await txContext.getUserRepo().findById(userId);
    } else if (this.provider) {
      user = await this.provider.getUser(userId, companyId);
    } else {
      throw new Error('Authorization provider not configured for production environment');
    }
    
    if (!user) {
      await this.logDeniedAttempt(userId, companyId, requiredPermission, txContext);
      throw new Error(`Acesso negado: Usuário inválido ou inexistente (${userId})`);
    }

    if (!user.active) {
      await this.logDeniedAttempt(userId, companyId, requiredPermission, txContext);
      throw new Error('Acesso negado: Usuário inativo ou suspenso');
    }

    if (!user.companyId || user.companyId !== companyId) {
      await this.logDeniedAttempt(userId, companyId, requiredPermission, txContext);
      throw new Error('Acesso negado: Tenant incorreto ou descompasso de empresa');
    }

    const role = user.role ? String(user.role).toUpperCase() : '';
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions || !permissions.includes(requiredPermission)) {
      await this.logDeniedAttempt(userId, companyId, requiredPermission, txContext);
      throw new Error(`Acesso negado: Permissão insuficiente (${requiredPermission}) para a função ${role}`);
    }

    return user;
  }
}
