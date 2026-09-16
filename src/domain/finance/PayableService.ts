import { AccountPayableRepository } from '../../persistence/repositories/localRepositories';
import { AccountPayable } from '../../types/entities';
import { ObligationStatus, OriginType, AuditAction } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { IdempotencyService } from '../services/IdempotencyService';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export interface CreatePayableParams {
  companyId: string;
  originType: OriginType;
  originId: string;
  vehicleId?: string;
  supplierId?: string;
  driverId?: string;
  contractId?: string;
  categoryId: string;
  description: string;
  totalAmount: number;
  dueDate: string;
  competenceDate?: string;
  installmentsCount?: number;
  recurrenceDaysInterval?: number;
  idempotencyKey?: string;
  userId: string;
  userName: string;
}

export class PayableService {
  private static repo = new AccountPayableRepository();

  public static async create(params: CreatePayableParams): Promise<AccountPayable[]> {
    await FinancialAuthorizationService.authorize(params.userId, params.companyId, 'PAYABLE_CREATE');

    const installments = Math.max(1, params.installmentsCount || 1);
    const baseAmount = roundCurrency(params.totalAmount / installments);
    const createdList: AccountPayable[] = [];
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

      const idempotencyKey = params.idempotencyKey || IdempotencyService.buildKey(
        params.originType,
        params.originId,
        i,
        periodRef,
        params.companyId
      );
      const legacyKey = IdempotencyService.buildLegacyKey(params.originType, params.originId, i, periodRef);

      const savedItem = await IdempotencyService.executeWithLock(idempotencyKey, async () => {
        // Check Idempotency
        let existing = await this.repo.findByIdempotencyKey(idempotencyKey);
        if (!existing) {
          const legacyItem = await this.repo.findByIdempotencyKey(legacyKey);
          if (legacyItem && legacyItem.companyId === params.companyId) {
            existing = legacyItem;
          }
        }
        if (existing) {
          return existing;
        }

        const item: AccountPayable = {
          id: generateUUID(),
          companyId: params.companyId,
          originType: params.originType,
          originId: params.originId,
          vehicleId: params.vehicleId, // Vehicle cost center
          supplierId: params.supplierId,
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

        const saved = await this.repo.create(item);

        await AuditLogger.logAction(
          params.companyId,
          'AccountPayable',
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

  public static async getById(id: string): Promise<AccountPayable | null> {
    return this.repo.findById(id);
  }

  public static async getAll(): Promise<AccountPayable[]> {
    return this.repo.findAll();
  }

  public static async cancelPayable(
    companyId: string,
    payableId: string,
    reason: string,
    userId: string,
    userName: string
  ): Promise<AccountPayable> {
    await FinancialAuthorizationService.authorize(userId, companyId, 'PAYABLE_CANCEL');

    const payable = await this.repo.findById(payableId);
    if (!payable) {
      throw new Error('Conta a Pagar não encontrada');
    }

    if (payable.status === ObligationStatus.CANCELLED) {
      throw new Error('Título já se encontra cancelado');
    }

    if (payable.paidAmount > 0 || payable.status === ObligationStatus.PAID) {
      throw new Error('Não é possível cancelar um título com pagamentos efetuados. Realize o estorno dos pagamentos primeiro.');
    }

    const previousState = { ...payable };

    const updatedPayable = await this.repo.update(payableId, {
      status: ObligationStatus.CANCELLED,
      updatedAt: new Date().toISOString(),
    });

    await AuditLogger.logAction(
      companyId,
      'AccountPayable',
      payable.id,
      AuditAction.CANCEL,
      userId,
      userName,
      previousState,
      updatedPayable
    );

    return updatedPayable;
  }
}
