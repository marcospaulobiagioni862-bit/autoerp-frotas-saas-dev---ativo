import { FinancialPeriodRepository } from '../../persistence/repositories/localRepositories';
import { FinancialPeriod } from '../../types/entities';
import { FinancialPeriodStatus, AuditAction } from '../../types/enums';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';
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
  private static repo = new FinancialPeriodRepository();

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

    let periods: FinancialPeriod[];
    if (txContext) {
      periods = await txContext.getFinancialPeriodRepo().findAll({ companyId });
    } else {
      periods = await this.repo.findAllForCompany(companyId);
    }

    const closedPeriod = periods.find(
      (p) =>
        p.companyId === companyId &&
        p.status === FinancialPeriodStatus.CLOSED &&
        p.startDate && p.endDate &&
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

    let periods: FinancialPeriod[];
    if (txContext) {
      periods = await txContext.getFinancialPeriodRepo().findAll({ companyId });
    } else {
      periods = await this.repo.findAllForCompany(companyId);
    }

    let existing = periods.find(
      (p) => p.companyId === companyId && p.startDate === startDate && p.endDate === endDate
    );

    const now = new Date().toISOString();

    if (existing) {
      if (existing.status === FinancialPeriodStatus.CLOSED) {
        return existing;
      }
      existing.status = FinancialPeriodStatus.CLOSED;
      existing.closedAt = now;
      existing.closedBy = userName;
      existing.updatedAt = now;

      let updated: FinancialPeriod;
      if (txContext) {
        updated = await txContext.getFinancialPeriodRepo().update(existing.id, existing);
      } else {
        updated = await this.repo.updateForCompany(existing.id, companyId, existing);
      }

      await AuditLogger.logAction(
        companyId,
        'FinancialPeriod',
        updated.id,
        AuditAction.PERIOD_CLOSED,
        userId,
        userName,
        null,
        updated,
        txContext
      );
      return updated;
    } else {
      const newPeriod: FinancialPeriod = {
        id: generateUUID(),
        companyId,
        year: new Date(startDate).getFullYear(),
        month: new Date(startDate).getMonth() + 1,
        startDate,
        endDate,
        status: FinancialPeriodStatus.CLOSED,
        closedAt: now,
        closedBy: userName,
        createdAt: now,
        updatedAt: now,
      };

      let created: FinancialPeriod;
      if (txContext) {
        created = await txContext.getFinancialPeriodRepo().create(newPeriod);
      } else {
        created = await this.repo.createForCompany(companyId, newPeriod);
      }

      await AuditLogger.logAction(
        companyId,
        'FinancialPeriod',
        created.id,
        AuditAction.PERIOD_CLOSED,
        userId,
        userName,
        null,
        created,
        txContext
      );
      return created;
    }
  }

  public static async reopenPeriod(params: ReopenPeriodParams, txContext?: ITransactionContext): Promise<FinancialPeriod> {
    const { companyId, periodId, reason } = params;
    const userId = params.userId || 'system';
    const userName = params.userName || 'System';

    await FinancialAuthorizationService.authorize(userId, companyId, 'FINANCIAL_PERIOD_REOPEN', txContext);

    let period: FinancialPeriod | null;
    if (txContext) {
      period = await txContext.getFinancialPeriodRepo().findById(periodId);
    } else {
      period = await this.repo.findByIdForCompany(periodId, companyId);
    }

    if (!period) {
      throw new Error('Período financeiro não encontrado');
    }
    if (period.companyId !== companyId) {
      throw new Error('Descompasso de tenant no período financeiro');
    }

    const now = new Date().toISOString();
    const previousState = { ...period };
    period.status = FinancialPeriodStatus.OPEN;
    period.reopenedAt = now as any;
    period.reopenedBy = userName;
    period.reopenReason = reason;
    period.updatedAt = now;

    let updated: FinancialPeriod;
    if (txContext) {
      updated = await txContext.getFinancialPeriodRepo().update(periodId, period);
    } else {
      updated = await this.repo.updateForCompany(periodId, companyId, period);
    }

    await AuditLogger.logAction(
      companyId,
      'FinancialPeriod',
      periodId,
      AuditAction.PERIOD_REOPENED,
      userId,
      userName,
      previousState,
      updated,
      txContext
    );
    return updated;
  }

  public static async getPeriods(companyId: string, txContext?: ITransactionContext): Promise<FinancialPeriod[]> {
    if (!companyId) return [];
    if (txContext) {
      return txContext.getFinancialPeriodRepo().findAll({ companyId });
    }
    return this.repo.findAllForCompany(companyId);
  }
}
