import { AccountPayableRepository } from '../../persistence/repositories/localRepositories';
import { AccountPayable } from '../../types/entities';
import { ObligationStatus, OriginType, AuditAction } from '../../types/enums';
import { installmentCompetences, type InstallmentCompetenceMode } from '../../shared/utils/installmentCompetence';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { IdempotencyService } from '../services/IdempotencyService';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';
import { ITransactionContext } from './ITransactionContext';
import { assertFinancialCategoryForObligation } from './FinancialCategoryAuthority';

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
  competenceMode?: InstallmentCompetenceMode;
  installmentCompetenceDates?: string[];
  installmentsCount?: number;
  recurrenceDaysInterval?: number;
  idempotencyKey?: string;
  userId: string;
  userName: string;
}

export class PayableService {
  private static repo = new AccountPayableRepository();

  public static async create(
    params: CreatePayableParams,
    txContext?: ITransactionContext
  ): Promise<AccountPayable[]> {
    await FinancialAuthorizationService.authorize(
      params.userId,
      params.companyId,
      'PAYABLE_CREATE',
      txContext
    );

    const categoryId = typeof params.categoryId === 'string' ? params.categoryId.trim() : '';
    if (params.originType === OriginType.MANUAL) {
      if (!txContext?.getRawTransaction) {
        throw new Error('Autoridade de categoria financeira indisponível para Conta a Pagar manual');
      }
      await assertFinancialCategoryForObligation(params.companyId, categoryId, 'PAYABLE', txContext);
    }

    const installments = params.installmentsCount ?? 1;
    if (!Number.isInteger(installments) || installments < 1 || installments > 120 || !Number.isFinite(params.totalAmount) || params.totalAmount <= 0) throw new Error('Valor ou quantidade de parcelas inválidos');
    const dueDates = Array.from({ length: installments }, (_, index) => {
      const date = new Date(params.dueDate);
      if (!Number.isFinite(date.getTime())) throw new Error('Data de vencimento inválida');
      if (index > 0 && params.recurrenceDaysInterval) date.setUTCDate(date.getUTCDate() + params.recurrenceDaysInterval * index);
      else if (index > 0) date.setUTCMonth(date.getUTCMonth() + index);
      return date.toISOString().slice(0, 10);
    });
    const competences = installmentCompetences(params, dueDates);
    // Validate the complete schedule before any title is created.
    for (let index = 0; index < installments; index++) {
      await FinancialPeriodService.assertDateOpen(params.companyId, competences[index], txContext);
      await FinancialPeriodService.assertDateOpen(params.companyId, dueDates[index], txContext);
    }
    const baseAmount = roundCurrency(params.totalAmount / installments);
    const createdList: AccountPayable[] = [];
    const groupId = installments > 1 ? generateUUID() : undefined;

    for (let i = 1; i <= installments; i++) {
      const amountForThisInstallment = i === installments
        ? roundCurrency(params.totalAmount - baseAmount * (installments - 1))
        : baseAmount;

      const dueDateObj = new Date(params.dueDate);
      if (i > 1 && params.recurrenceDaysInterval) {
        dueDateObj.setUTCDate(dueDateObj.getUTCDate() + params.recurrenceDaysInterval * (i - 1));
      } else if (i > 1) {
        dueDateObj.setUTCMonth(dueDateObj.getUTCMonth() + (i - 1));
      }
      const calculatedDueDate = dueDateObj.toISOString().split('T')[0];
      const periodRef = competences[i - 1];

      await FinancialPeriodService.assertDateOpen(params.companyId, periodRef, txContext);
      await FinancialPeriodService.assertDateOpen(params.companyId, calculatedDueDate, txContext);

      const idempotencyKey = params.idempotencyKey || IdempotencyService.buildKey(
        params.originType,
        params.originId,
        i,
        periodRef,
        params.companyId
      );
      const legacyKey = IdempotencyService.buildLegacyKey(
        params.originType,
        params.originId,
        i,
        periodRef
      );

      const savedItem = await IdempotencyService.executeWithLock(idempotencyKey, async () => {
        let existing: AccountPayable | null;
        if (txContext) {
          existing = await txContext.getPayableRepo().findByIdempotencyKey(idempotencyKey);
          if (!existing) {
            existing = await txContext.getPayableRepo().findByIdempotencyKey(legacyKey);
          }
        } else {
          existing = await this.repo.findByIdempotencyKeyForCompany(params.companyId, idempotencyKey);
          if (!existing) {
            existing = await this.repo.findByIdempotencyKeyForCompany(params.companyId, legacyKey);
          }
        }

        if (existing) {
          if (existing.companyId !== params.companyId) {
            throw new Error('Acesso negado: Conta a Pagar idempotente pertence a outro tenant');
          }
          return existing;
        }

        const item: AccountPayable = {
          id: generateUUID(),
          companyId: params.companyId,
          originType: params.originType,
          originId: params.originId,
          vehicleId: params.vehicleId,
          supplierId: params.supplierId,
          driverId: params.driverId,
          contractId: params.contractId,
          categoryId,
          description: installments > 1 ? `${params.description} (${i}/${installments})` : params.description,
          originalAmount: amountForThisInstallment,
          discountAmount: 0,
          fineAmount: 0,
          interestAmount: 0,
          updatedAmount: amountForThisInstallment,
          paidAmount: 0,
          balanceAmount: amountForThisInstallment,
          dueDate: calculatedDueDate,
          competenceDate: periodRef,
          status: ObligationStatus.PENDING,
          installmentGroupId: groupId,
          installmentNumber: i,
          totalInstallments: installments,
          idempotencyKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const saved = txContext
          ? await txContext.getPayableRepo().create(item)
          : await this.repo.createForCompany(params.companyId, item);

        await AuditLogger.logAction(
          params.companyId,
          'AccountPayable',
          saved.id,
          AuditAction.CREATE,
          params.userId,
          params.userName,
          null,
          saved,
          txContext
        );

        return saved;
      });

      createdList.push(savedItem);
    }

    return createdList;
  }

  public static async getById(companyId: string, id: string): Promise<AccountPayable | null> {
    return this.repo.findByIdForCompany(id, companyId);
  }

  public static async getAll(companyId: string): Promise<AccountPayable[]> {
    return this.repo.findAllForCompany(companyId);
  }

  public static async cancelPayable(
    companyId: string,
    payableId: string,
    reason: string,
    userId: string,
    userName: string,
    txContext?: ITransactionContext
  ): Promise<AccountPayable> {
    await FinancialAuthorizationService.authorize(
      userId,
      companyId,
      'PAYABLE_CANCEL',
      txContext
    );

    const cancellationReason = typeof reason === 'string' ? reason.trim() : '';
    if (!cancellationReason || cancellationReason.length > 1000) {
      throw new Error('Motivo de cancelamento é obrigatório e deve ter no máximo 1000 caracteres');
    }

    let payable: AccountPayable | null;
    if (txContext) {
      if (!txContext.findPayableByIdWithLock) {
        throw new Error('Autoridade transacional de Conta a Pagar indisponível');
      }
      payable = await txContext.findPayableByIdWithLock(payableId);
    } else {
      payable = await this.repo.findByIdForCompany(payableId, companyId);
    }

    if (!payable) {
      throw new Error('Conta a Pagar não encontrada');
    }
    if (!payable.companyId || payable.companyId !== companyId) {
      throw new Error('Acesso negado: Conta a Pagar pertence a outra empresa ou tenant inválido');
    }

    if (payable.status === ObligationStatus.CANCELLED) {
      throw new Error('Título já se encontra cancelado');
    }

    if (payable.paidAmount > 0 || payable.status === ObligationStatus.PAID) {
      throw new Error('Não é possível cancelar um título com pagamentos efetuados. Realize o estorno dos pagamentos primeiro.');
    }

    const previousState = { ...payable };
    const cancelledAt = new Date().toISOString();

    const updatedPayable = txContext
      ? await txContext.getPayableRepo().update(payableId, {
          status: ObligationStatus.CANCELLED,
          cancelledAt,
          cancelReason: cancellationReason,
          updatedAt: cancelledAt,
        })
      : await this.repo.updateForCompany(payableId, companyId, {
          status: ObligationStatus.CANCELLED,
          cancelledAt,
          cancelReason: cancellationReason,
          updatedAt: cancelledAt,
        });

    await AuditLogger.logAction(
      companyId,
      'AccountPayable',
      payable.id,
      AuditAction.CANCEL,
      userId,
      userName,
      previousState,
      updatedPayable,
      txContext
    );

    return updatedPayable;
  }
}
