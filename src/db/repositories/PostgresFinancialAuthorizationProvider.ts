import { IFinancialAuthorizationProvider } from '../../domain/finance/FinancialAuthorizationService';
import { User, AuditLog } from '../../types/entities';
import { PostgresUserRepository, PostgresAuditLogRepository } from './postgresRepositories';
import { generateUUID } from '../../shared/utils/uuid';

export class PostgresFinancialAuthorizationProvider implements IFinancialAuthorizationProvider {
  private userRepo = new PostgresUserRepository();
  private auditRepo = new PostgresAuditLogRepository();

  async getUser(userId: string, companyId: string): Promise<User | null> {
    const user = await this.userRepo.findById(userId);
    if (!user) return null;
    if (user.companyId !== companyId) return null;
    return user;
  }

  async logDeniedAttempt(userId: string, companyId: string, requiredPermission: string): Promise<void> {
    try {
      await this.auditRepo.create({
        id: generateUUID(),
        companyId: companyId,
        entityName: 'SECURITY',
        entityId: 'AUTHORIZATION_FAILURE',
        action: 'FINANCIAL_PERMISSION_DENIED' as any,
        userId: userId,
        userName: userId,
        timestamp: new Date().toISOString(),
        newState: JSON.stringify({ operation: requiredPermission }),
      } as AuditLog);
    } catch {
      // Non-blocking
    }
  }
}
