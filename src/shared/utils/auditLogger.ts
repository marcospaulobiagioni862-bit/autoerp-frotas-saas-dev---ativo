// AutoERP Audit Logger Service

import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditLog } from '../../types/entities';
import { AuditAction } from '../../types/enums';
import { generateUUID } from './uuid';

export class AuditLogger {
  private static repo = new AuditLogRepository();

  public static async logAction(
    companyId: string,
    entityName: string,
    entityId: string,
    action: AuditAction,
    userId: string,
    userName: string,
    previousState?: any,
    newState?: any
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

    return this.repo.create(entry);
  }
}
