import { AccountReceivableRepository } from '../../persistence/repositories/localRepositories';
import { AccountReceivable } from '../../types/entities';
import { ObligationStatus, OriginType, AuditAction } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { IdempotencyService } from '../services/IdempotencyService';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export interface CreateReceivableParams {
  companyId: string;
  originType: OriginType;
  originId: string;
  vehicleId?: string;
  driverId?: string;
  contractId?: string;
  categoryId: string;
  description: string;
  totalAmount: number;
  dueDate: string;
  competenceDate?: string;
  installmentsCount?: number;
  recurrenceDaysInterval?: number;
  userId: string;
  userName: string;
}

export class ReceivableService {
  private static repo = new AccountReceivableRepository();

  public static async create(params: CreateReceivableParams): Promise<AccountReceivable[]> {
    await FinancialAuthorizationService.authorize(params.userId, params.companyId, 'RECEIVABLE_CREATE');

    const installments = Math.max(1, params.installmentsCount || 1);
    const baseAmount = roundCurrency(params.totalAmount / installments);
    const createdList: AccountReceivable[] = [];
    const groupId = installments > 1 ? generateUUID() : undefined;

    for (let i = 1; i <= installments; i++) {
      const amountForThisInstallment = i === installments
        ? roundCurrency(params.totalAmount - baseAmount * (installments - 1))
        : baseAmount;

      const dueDateObj = new Date(params.dueDate);
      if (i > 1 && params.recurrenceDaysInterval) {
        dueDateObj.setDate(dueDateObj.getDate() + params.recurrenceDaysInterval * (i - 1));
      } else if (i > 1) {
        dueDateObj.setMonth(dueDateObj.getMonth() + (i - 1));
      }
      const calculatedDueDate = dueDateObj.toISOString().split('T')[0];
      const periodRef = params.competenceDate || calculatedDueDate;

      await FinancialPeriodService.assertDateOpen(params.companyId, periodRef);
      await FinancialPeriodService.assertDateOpen(params.companyId, calculatedDueDate);

      const idempotencyKey = IdempotencyService.buildKey(
        params.originType,
        params.originId,
        i,
        periodRef,
        params.companyId
      );
      const legacyKey = IdempotencyService.buildLegacyKey(params.originType, params.originId, i, periodRef);

      const savedItem = await IdempotencyService.executeWithLock(idempotencyKey, async () => {
        // Check Idempotency
        let existing = await this.repo.findByIdempotencyKeyForCompany(params.companyId, idempotencyKey);
        if (!existing) {
          const legacyItem = await this.repo.findByIdempotencyKeyForCompany(params.companyId, legacyKey);
          if (legacyItem) {
            existing = legacyItem;
          }
        }
        if (existing) {
          return existing;
        }

        const item: AccountReceivable = {
          id: generateUUID(),
          companyId: params.companyId,
          originType: params.originType,
          originId: params.originId,
          vehicleId: params.vehicleId,
          driverId: params.driverId,
          contractId: params.contractId,
          categoryId: params.categoryId,
          description: installments > 1 ? `${params.description} (${i}/${installments})` : params.description,
          originalAmount: amountForThisInstallment,
          discountAmount: 0,
          fineAmount: 0,
          interestAmount: 0,
          updatedAmount: amountForThisInstallment,
          paidAmount: 0,
          balanceAmount: amountForThisInstallment,
          dueDate: calculatedDueDate,
          competenceDate: params.competenceDate || calculatedDueDate,
          status: ObligationStatus.PENDING,
          installmentGroupId: groupId,
          installmentNumber: i,
          totalInstallments: installments,
          idempotencyKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const saved = await this.repo.createForCompany(params.companyId, item);

        await AuditLogger.logAction(
          params.companyId,
          'AccountReceivable',
          saved.id,
          AuditAction.CREATE,
          params.userId,
          params.userName,
          null,
          saved
        );

        return saved;
      });

      createdList.push(savedItem);
    }

    return createdList;
  }

  public static async getById(companyId: string, id: string): Promise<AccountReceivable | null> {
    return this.repo.findByIdForCompany(id, companyId);
  }

  public static async getAll(companyId: string): Promise<AccountReceivable[]> {
    return this.repo.findAllForCompany(companyId);
  }

  public static async cancelReceivable(
    companyId: string,
    receivableId: string,
    reason: string,
    userId: string,
    userName: string
  ): Promise<AccountReceivable> {
    await FinancialAuthorizationService.authorize(userId, companyId, 'RECEIVABLE_CANCEL');

    const receivable = await this.repo.findByIdForCompany(receivableId, companyId);
    if (!receivable) {
      throw new Error('Conta a Receber não encontrada');
    }

    if (receivable.status === ObligationStatus.CANCELLED) {
      throw new Error('Título já se encontra cancelado');
    }

    if (receivable.paidAmount > 0 || receivable.status === ObligationStatus.PAID) {
      throw new Error('Não é possível cancelar um título com recebimentos efetuados. Realize o estorno dos recebimentos primeiro.');
    }

    const previousState = { ...receivable };

    const updatedReceivable = await this.repo.updateForCompany(receivableId, companyId, {
      status: ObligationStatus.CANCELLED,
      updatedAt: new Date().toISOString(),
    });

    await AuditLogger.logAction(
      companyId,
      'AccountReceivable',
      receivable.id,
      AuditAction.CANCEL,
      userId,
      userName,
      previousState,
      updatedReceivable
    );

    return updatedReceivable;
  }
}
