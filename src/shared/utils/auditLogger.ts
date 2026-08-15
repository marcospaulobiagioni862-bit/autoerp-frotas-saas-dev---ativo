// AutoERP Audit Logger Service

import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { ITransactionContext } from '../../domain/finance/ITransactionContext';
import { AuditLog } from '../../types/entities';
import { AuditAction } from '../../types/enums';
import { generateUUID } from './uuid';

export class AuditLogger {
  public static async logAction(
    companyId: string,
    entityName: string,
    entityId: string,
    action: AuditAction,
    userId: string,
    userName: string,
    previousState?: any,
    newState?: any,
    txContext?: ITransactionContext
  ): Promise<AuditLog> {
    const entry: AuditLog = {
      id: generateUUID(),
      companyId,
      entityName,
      entityId,
      action,
      userId,
      userName,
      previousState: previousState ? JSON.stringify(previousState) : undefined,
      newState: newState ? JSON.stringify(newState) : undefined,
      timestamp: new Date().toISOString(),
    };

    const auditRepo = txContext ? txContext.getAuditLogRepo() : new AuditLogRepository();
    return auditRepo.create(entry);
  }
}
