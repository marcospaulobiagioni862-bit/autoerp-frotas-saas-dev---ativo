import { AccountReceivableRepository } from '../../persistence/repositories/localRepositories';
import { AccountReceivable } from '../../types/entities';
import { ObligationStatus, OriginType, AuditAction } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { IdempotencyService } from '../services/IdempotencyService';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';
import { ITransactionContext } from './ITransactionContext';
import { assertFinancialCategoryForObligation } from './FinancialCategoryAuthority';
import { requireContractEffectivePeriod } from '../contracts/contractEffectivePeriod';

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

async function assertContractRentCompetenceWithinContract(
  params: CreateReceivableParams,
  txContext?: ITransactionContext
): Promise<void> {
  if (![OriginType.CONTRACT_RENT, OriginType.SECURITY_DEPOSIT, OriginType.KM_EXCESS].includes(params.originType)) return;
  if (!txContext) throw new Error('Autoridade contratual transacional indisponível para cobrança');
  if (!params.contractId) {
    throw new Error('Autoridade contratual indisponível para cobrança de aluguel');
  }

  const contract = await txContext.getContractRepo().findByIdForCompanyWithLock(params.companyId, params.contractId);
  if (!contract || contract.isArchived) {
    throw new Error('Contrato indisponível para cobrança de aluguel');
  }

  const competenceDate = params.competenceDate || params.dueDate;
  const period = await requireContractEffectivePeriod(contract, txContext);
  if (competenceDate < period.effectiveStartDate || (contract.endDate && competenceDate > contract.endDate)) {
    throw new Error('Período contratual inválido para cobrança');
  }
}

export class ReceivableService {
  private static repo = new AccountReceivableRepository();

  public static async create(
    params: CreateReceivableParams,
    txContext?: ITransactionContext
  ): Promise<AccountReceivable[]> {
    await FinancialAuthorizationService.authorize(
      params.userId,
      params.companyId,
      'RECEIVABLE_CREATE',
      txContext
    );

    await assertContractRentCompetenceWithinContract(params, txContext);

    const categoryId = typeof params.categoryId === 'string' ? params.categoryId.trim() : '';
    if (params.originType === OriginType.MANUAL) {
      if (!txContext?.getRawTransaction) {
        throw new Error('Autoridade de categoria financeira indisponível para Conta a Receber manual');
      }
      await assertFinancialCategoryForObligation(params.companyId, categoryId, 'RECEIVABLE', txContext);
    }

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
        dueDateObj.setUTCDate(dueDateObj.getUTCDate() + params.recurrenceDaysInterval * (i - 1));
      } else if (i > 1) {
        dueDateObj.setUTCMonth(dueDateObj.getUTCMonth() + (i - 1));
      }
      const calculatedDueDate = dueDateObj.toISOString().split('T')[0];
      const periodRef = params.competenceDate || calculatedDueDate;

      await FinancialPeriodService.assertDateOpen(params.companyId, periodRef, txContext);
      await FinancialPeriodService.assertDateOpen(params.companyId, calculatedDueDate, txContext);

      const idempotencyKey = IdempotencyService.buildKey(
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
        let existing: AccountReceivable | null;
        if (txContext) {
          existing = await txContext.getReceivableRepo().findByIdempotencyKey(idempotencyKey);
          if (!existing) {
            existing = await txContext.getReceivableRepo().findByIdempotencyKey(legacyKey);
          }
        } else {
          existing = await this.repo.findByIdempotencyKeyForCompany(params.companyId, idempotencyKey);
          if (!existing) {
            existing = await this.repo.findByIdempotencyKeyForCompany(params.companyId, legacyKey);
          }
        }

        if (existing) {
          if (existing.companyId !== params.companyId) {
            throw new Error('Acesso negado: Conta a Receber idempotente pertence a outro tenant');
          }
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
          competenceDate: params.competenceDate || calculatedDueDate,
          status: ObligationStatus.PENDING,
          installmentGroupId: groupId,
          installmentNumber: i,
          totalInstallments: installments,
          idempotencyKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const saved = txContext
          ? await txContext.getReceivableRepo().create(item)
          : await this.repo.createForCompany(params.companyId, item);

        await AuditLogger.logAction(
          params.companyId,
          'AccountReceivable',
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
    userName: string,
    txContext?: ITransactionContext
  ): Promise<AccountReceivable> {
    await FinancialAuthorizationService.authorize(
      userId,
      companyId,
      'RECEIVABLE_CANCEL',
      txContext
    );

    const cancellationReason = typeof reason === 'string' ? reason.trim() : '';
    if (!cancellationReason || cancellationReason.length > 1000) {
      throw new Error('Motivo de cancelamento é obrigatório e deve ter no máximo 1000 caracteres');
    }

    let receivable: AccountReceivable | null;
    if (txContext) {
      if (!txContext.findReceivableByIdWithLock) {
        throw new Error('Autoridade transacional de Conta a Receber indisponível');
      }
      receivable = await txContext.findReceivableByIdWithLock(receivableId);
    } else {
      receivable = await this.repo.findByIdForCompany(receivableId, companyId);
    }

    if (!receivable) {
      throw new Error('Conta a Receber não encontrada');
    }
    if (!receivable.companyId || receivable.companyId !== companyId) {
      throw new Error('Acesso negado: Conta a Receber pertence a outra empresa ou tenant inválido');
    }

    if (receivable.status === ObligationStatus.CANCELLED) {
      throw new Error('Título já se encontra cancelado');
    }

    if (receivable.paidAmount > 0 || receivable.status === ObligationStatus.PAID) {
      throw new Error('Não é possível cancelar um título com recebimentos efetuados. Realize o estorno dos recebimentos primeiro.');
    }

    const previousState = { ...receivable };
    const cancelledAt = new Date().toISOString();

    const updatedReceivable = txContext
      ? await txContext.getReceivableRepo().update(receivableId, {
          status: ObligationStatus.CANCELLED,
          cancelledAt,
          cancelReason: cancellationReason,
          updatedAt: cancelledAt,
        })
      : await this.repo.updateForCompany(receivableId, companyId, {
          status: ObligationStatus.CANCELLED,
          cancelledAt,
          cancelReason: cancellationReason,
          updatedAt: cancelledAt,
        });

    await AuditLogger.logAction(
      companyId,
      'AccountReceivable',
      receivable.id,
      AuditAction.CANCEL,
      userId,
      userName,
      previousState,
      updatedReceivable,
      txContext
    );

    return updatedReceivable;
  }
}
