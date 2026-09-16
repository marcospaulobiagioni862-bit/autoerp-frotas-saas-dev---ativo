import { PostgresFinancialPeriodRepository } from '../../db/repositories/PostgresFinancialPeriodRepository';
import { FinancialPeriod } from '../../types/entities';
import { FinancialPeriodStatus, AuditAction } from '../../types/enums';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';
import { IFinancialPeriodRepository } from '../../persistence/repositories/interfaces';
import { ITransactionContext } from './ITransactionContext';

export interface ClosePeriodParams {
  companyId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  userId?: string;
  userName?: string;
}

export interface ReopenPeriodParams {
  companyId: string;
  periodId: string;
  reason: string;
  userId?: string;
  userName?: string;
}

export class FinancialPeriodService {
  private static repo: IFinancialPeriodRepository = new PostgresFinancialPeriodRepository();

  public static setRepository(repo: IFinancialPeriodRepository) {
    this.repo = repo;
  }

  public static async isDateOpen(companyId: string, date: string, txContext?: ITransactionContext): Promise<boolean> {
    try {
      await this.assertDateOpen(companyId, date, txContext);
      return true;
    } catch {
      return false;
    }
  }

  public static async assertDateOpen(companyId: string, date: string, txContext?: ITransactionContext): Promise<void> {
    if (!companyId) {
      throw new Error('companyId é obrigatório para verificar status do período financeiro');
    }
    if (!date) return;

    // Normalize date to YYYY-MM-DD
    const dateStr = date.split('T')[0];

    const repo = txContext ? txContext.getFinancialPeriodRepo() : this.repo;
    const periods = await repo.findAll({ companyId });
    const closedPeriod = periods.find(
      (p) =>
        p.companyId === companyId &&
        p.status === FinancialPeriodStatus.CLOSED &&
        p.startDate <= dateStr &&
        p.endDate >= dateStr
    );

    if (closedPeriod) {
      throw new Error(
        `O período financeiro para a data ${dateStr} está fechado (Período: ${closedPeriod.startDate} a ${closedPeriod.endDate}). Mutações financeiras retroativas são bloqueadas.`
      );
    }
  }

  public static async closePeriod(params: ClosePeriodParams, txContext?: ITransactionContext): Promise<FinancialPeriod> {
    const { companyId, startDate, endDate } = params;
    const userId = params.userId || 'system';
    const userName = params.userName || 'System';

    await FinancialAuthorizationService.authorize(userId, companyId, 'FINANCIAL_PERIOD_CLOSE', txContext);

    if (!params.companyId) {
      throw new Error('companyId é obrigatório para fechar período financeiro');
    }
    if (!params.startDate || !params.endDate) {
      throw new Error('startDate e endDate são obrigatórios para fechar período financeiro');
    }
    if (params.startDate > params.endDate) {
      throw new Error('startDate não pode ser posterior a endDate');
    }

    const repo = txContext ? txContext.getFinancialPeriodRepo() : this.repo;
    const periods = await repo.findAll({ companyId });
    let existing = periods.find(
      (p) => p.companyId === companyId && p.startDate === startDate && p.endDate === endDate
    );

    const now = new Date().toISOString();

    if (existing) {
      if (existing.status === FinancialPeriodStatus.CLOSED) {
        // Idempotent return
        return existing;
      }
      const previousState = { ...existing };
      existing.status = FinancialPeriodStatus.CLOSED;
      existing.closedAt = now;
      existing.closedBy = userName;
      existing.updatedAt = now;
      const updated = await repo.update(existing.id, existing);

      if (txContext) {
        await txContext.getAuditLogRepo().create({
          id: generateUUID(),
          companyId,
          entityName: 'FinancialPeriod',
          entityId: updated.id,
          action: AuditAction.PERIOD_CLOSED,
          previousState: JSON.stringify(previousState),
          newState: JSON.stringify(updated),
          userId,
          userName,
          timestamp: now,
        });
      } else {
        await AuditLogger.logAction(companyId, 'FinancialPeriod', updated.id, AuditAction.PERIOD_CLOSED, userId, userName, previousState, updated);
      }
      return updated;
    }

    const newPeriod: FinancialPeriod = {
      id: generateUUID(),
      companyId,
      startDate,
      endDate,
      status: FinancialPeriodStatus.CLOSED,
      closedAt: now,
      closedBy: userName,
      createdAt: now,
      updatedAt: now,
    };

    const created = await repo.create(newPeriod);

    if (txContext) {
      await txContext.getAuditLogRepo().create({
        id: generateUUID(),
        companyId,
        entityName: 'FinancialPeriod',
        entityId: created.id,
        action: AuditAction.PERIOD_CLOSED,
        newState: JSON.stringify(created),
        userId,
        userName,
        timestamp: now,
      });
    } else {
      await AuditLogger.logAction(companyId, 'FinancialPeriod', created.id, AuditAction.PERIOD_CLOSED, userId, userName, null, created);
    }

    return created;
  }

  public static async reopenPeriod(params: ReopenPeriodParams, txContext?: ITransactionContext): Promise<FinancialPeriod> {
    const { companyId, periodId, reason } = params;
    const userId = params.userId || 'system';
    const userName = params.userName || 'System';

    await FinancialAuthorizationService.authorize(userId, companyId, 'FINANCIAL_PERIOD_REOPEN', txContext);

    if (!params.companyId) {
      throw new Error('companyId é obrigatório para reabrir período financeiro');
    }
    if (!params.periodId) {
      throw new Error('periodId é obrigatório para reabrir período financeiro');
    }
    if (!params.reason || !params.reason.trim()) {
      throw new Error('Justificativa é obrigatória para reabrir período financeiro');
    }

    const repo = txContext ? txContext.getFinancialPeriodRepo() : this.repo;
    const period = await repo.findById(periodId);
    if (!period || period.companyId !== companyId) {
      throw new Error('Período financeiro não encontrado para esta empresa');
    }

    const previousState = { ...period };
    const now = new Date().toISOString();

    period.status = FinancialPeriodStatus.OPEN;
    period.reopenedAt = now;
    period.reopenedBy = userName;
    period.reopenReason = reason.trim();
    period.updatedAt = now;

    const updated = await repo.update(period.id, period);

    if (txContext) {
      await txContext.getAuditLogRepo().create({
        id: generateUUID(),
        companyId,
        entityName: 'FinancialPeriod',
        entityId: updated.id,
        action: AuditAction.PERIOD_REOPENED,
        previousState: JSON.stringify(previousState),
        newState: JSON.stringify(updated),
        userId,
        userName,
        timestamp: now,
      });
    } else {
      await AuditLogger.logAction(companyId, 'FinancialPeriod', updated.id, AuditAction.PERIOD_REOPENED, userId, userName, previousState, updated);
    }

    return updated;
  }

  public static async getPeriods(companyId: string, txContext?: ITransactionContext): Promise<FinancialPeriod[]> {
    if (!companyId) return [];
    const repo = txContext ? txContext.getFinancialPeriodRepo() : this.repo;
    return repo.findAll({ companyId });
  }
}
