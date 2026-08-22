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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeFinancialDate(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} é obrigatória para o período financeiro`);
  }

  const candidate = value.trim().slice(0, 10);
  if (!DATE_PATTERN.test(candidate)) {
    throw new Error(`${label} deve usar o formato YYYY-MM-DD`);
  }

  const [year, month, day] = candidate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} contém uma data inválida`);
  }

  return candidate;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
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
    const tenantId = typeof companyId === 'string' ? companyId.trim() : '';
    if (!tenantId) {
      throw new Error('companyId é obrigatório para verificar status do período financeiro');
    }

    const dateStr = normalizeFinancialDate(date, 'date');

    const periods = txContext
      ? await txContext.getFinancialPeriodRepo().findAll({ companyId: tenantId })
      : await this.repo.findAllForCompany(tenantId);

    const closedPeriod = periods.find(
      (p) =>
        p.companyId === tenantId &&
        p.status === FinancialPeriodStatus.CLOSED &&
        Boolean(p.startDate) &&
        Boolean(p.endDate) &&
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
    const companyId = typeof params.companyId === 'string' ? params.companyId.trim() : '';
    if (!companyId) {
      throw new Error('companyId é obrigatório para fechar período financeiro');
    }

    const startDate = normalizeFinancialDate(params.startDate, 'startDate');
    const endDate = normalizeFinancialDate(params.endDate, 'endDate');
    if (startDate > endDate) {
      throw new Error('startDate não pode ser posterior a endDate');
    }

    const userId = typeof params.userId === 'string' && params.userId.trim() ? params.userId.trim() : 'system';
    const userName = typeof params.userName === 'string' && params.userName.trim() ? params.userName.trim() : 'System';

    await FinancialAuthorizationService.authorize(userId, companyId, 'FINANCIAL_PERIOD_CLOSE', txContext);

    const periods = txContext
      ? await txContext.getFinancialPeriodRepo().findAll({ companyId })
      : await this.repo.findAllForCompany(companyId);

    const tenantPeriods = periods.filter(
      (p) => p.companyId === companyId && Boolean(p.startDate) && Boolean(p.endDate)
    );

    const exact = tenantPeriods.find((p) => p.startDate === startDate && p.endDate === endDate);
    const conflictingOverlap = tenantPeriods.find(
      (p) => p.id !== exact?.id && overlaps(startDate, endDate, p.startDate, p.endDate)
    );
    if (conflictingOverlap) {
      throw new Error(
        `Período financeiro sobreposto: já existe ${conflictingOverlap.startDate} a ${conflictingOverlap.endDate}`
      );
    }

    const year = Number(startDate.slice(0, 4));
    const month = Number(startDate.slice(5, 7));
    const conflictingMonth = tenantPeriods.find(
      (p) => p.id !== exact?.id && p.year === year && p.month === month
    );
    if (conflictingMonth) {
      throw new Error('Já existe um período financeiro diferente para o mesmo mês de referência');
    }

    if (exact?.status === FinancialPeriodStatus.CLOSED) {
      return exact;
    }

    const now = new Date().toISOString();

    if (exact) {
      const previousState = { ...exact };
      const updatedPayload: Partial<FinancialPeriod> = {
        status: FinancialPeriodStatus.CLOSED,
        closedAt: now,
        closedBy: userName,
        updatedAt: now,
      };

      const updated = txContext
        ? await txContext.getFinancialPeriodRepo().update(exact.id, updatedPayload)
        : await this.repo.updateForCompany(exact.id, companyId, updatedPayload);

      await AuditLogger.logAction(
        companyId,
        'FinancialPeriod',
        updated.id,
        AuditAction.PERIOD_CLOSED,
        userId,
        userName,
        previousState,
        updated,
        txContext
      );
      return updated;
    }

    const newPeriod: FinancialPeriod = {
      id: generateUUID(),
      companyId,
      year,
      month,
      startDate,
      endDate,
      status: FinancialPeriodStatus.CLOSED,
      closedAt: now,
      closedBy: userName,
      createdAt: now,
      updatedAt: now,
    };

    const created = txContext
      ? await txContext.getFinancialPeriodRepo().create(newPeriod)
      : await this.repo.createForCompany(companyId, newPeriod);

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

  public static async reopenPeriod(params: ReopenPeriodParams, txContext?: ITransactionContext): Promise<FinancialPeriod> {
    const companyId = typeof params.companyId === 'string' ? params.companyId.trim() : '';
    const periodId = typeof params.periodId === 'string' ? params.periodId.trim() : '';
    const reason = typeof params.reason === 'string' ? params.reason.trim() : '';

    if (!companyId) {
      throw new Error('companyId é obrigatório para reabrir período financeiro');
    }
    if (!periodId) {
      throw new Error('periodId é obrigatório para reabrir período financeiro');
    }
    if (!reason) {
      throw new Error('Motivo da reabertura do período financeiro é obrigatório');
    }
    if (reason.length > 1000) {
      throw new Error('Motivo da reabertura do período financeiro excede o limite permitido');
    }

    const userId = typeof params.userId === 'string' && params.userId.trim() ? params.userId.trim() : 'system';
    const userName = typeof params.userName === 'string' && params.userName.trim() ? params.userName.trim() : 'System';

    await FinancialAuthorizationService.authorize(userId, companyId, 'FINANCIAL_PERIOD_REOPEN', txContext);

    const period = txContext
      ? await txContext.getFinancialPeriodRepo().findById(periodId)
      : await this.repo.findByIdForCompany(periodId, companyId);

    if (!period) {
      throw new Error('Período financeiro não encontrado');
    }
    if (period.companyId !== companyId) {
      throw new Error('Descompasso de tenant no período financeiro');
    }

    if (period.status === FinancialPeriodStatus.OPEN) {
      if (period.reopenedAt && period.reopenReason === reason) {
        return period;
      }
      throw new Error('Período financeiro já se encontra aberto');
    }

    const now = new Date().toISOString();
    const previousState = { ...period };
    const updatedPayload: Partial<FinancialPeriod> = {
      status: FinancialPeriodStatus.OPEN,
      reopenedAt: now,
      reopenedBy: userName,
      reopenReason: reason,
      updatedAt: now,
    };

    const updated = txContext
      ? await txContext.getFinancialPeriodRepo().update(periodId, updatedPayload)
      : await this.repo.updateForCompany(periodId, companyId, updatedPayload);

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
    const tenantId = typeof companyId === 'string' ? companyId.trim() : '';
    if (!tenantId) return [];

    const periods = txContext
      ? await txContext.getFinancialPeriodRepo().findAll({ companyId: tenantId })
      : await this.repo.findAllForCompany(tenantId);

    return periods
      .filter((period) => period.companyId === tenantId)
      .sort((a, b) => `${b.startDate}:${b.id}`.localeCompare(`${a.startDate}:${a.id}`));
  }
}
