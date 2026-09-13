import { randomUUID } from 'node:crypto';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { WorkOrder } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';
import { MaintenanceConflictError, MaintenanceNotFoundError, MaintenanceValidationError } from './maintenanceAuthority';

function archiveReason(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (!reason || reason.length > 500) throw new MaintenanceValidationError('Invalid archive reason');
  return reason;
}

export class MaintenanceArchiveAuthority {
  static archiveWorkOrder(principal: AuthenticatedPrincipal, id: string, reasonInput: unknown): Promise<WorkOrder> {
    return UnitOfWork.run(principal.companyId, async (tx) => {
      const repo = tx.getWorkOrderRepo();
      const before = await repo.findByIdForCompanyWithLock(principal.companyId, id);
      if (!before) throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');
      if (before.status === 'ARCHIVED') return before;
      if (!['COMPLETED', 'CANCELLED'].includes(before.status)) {
        throw new MaintenanceConflictError('Somente OS concluída ou cancelada pode ser arquivada');
      }

      const reason = archiveReason(reasonInput);
      const now = new Date().toISOString();
      const archiveNote = `[ARQUIVAMENTO ${now}] Status anterior: ${before.status}. Motivo: ${reason}`;
      const notes = before.notes ? `${before.notes}\n${archiveNote}` : archiveNote;
      const updated = await repo.updateLifecycle(principal.companyId, id, {
        status: 'ARCHIVED',
        notes,
        updatedAt: now,
      });
      if (!updated) throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');

      await tx.getAuditLogRepo().create({
        id: randomUUID(),
        companyId: principal.companyId,
        entityName: 'WorkOrder',
        entityId: id,
        action: AuditAction.UPDATE,
        previousState: JSON.stringify(before),
        newState: JSON.stringify({
          ...updated,
          archive: {
            previousStatus: before.status,
            reason,
            archivedAt: now,
            archivedBy: principal.userId,
          },
        }),
        userId: principal.userId,
        userName: principal.name,
        timestamp: now,
      });

      return updated;
    });
  }
}
