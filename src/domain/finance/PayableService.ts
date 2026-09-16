import { AccountPayableRepository } from '../../persistence/repositories/localRepositories';
import { AccountPayable } from '../../types/entities';
import { ObligationStatus, OriginType, AuditAction } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { IdempotencyService } from '../services/IdempotencyService';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';
import { ITransactionContext } from './ITransactionContext';
import { assertFinancialCategoryForObligation } from './FinancialCategoryAuthority';
import { sql } from 'drizzle-orm';

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
    if (!Number.isFinite(params.totalAmount) || params.totalAmount <= 0 || roundCurrency(params.totalAmount) !== params.totalAmount) {
      throw new Error('Total deve ser positivo e expresso em centavos');
    }
    const totalCents = Math.round(params.totalAmount * 100);
    if (!Number.isSafeInteger(totalCents) || !Number.isInteger(installments) || installments < 1 || installments > 120 || totalCents < installments) {
      throw new Error('Quantidade de parcelas inválida (1–120, mínimo de um centavo por parcela)');
    }
    if (!params.companyId || !params.originId || !params.description?.trim()) throw new Error('Tenant, origem e descrição obrigatórios');
    for (const reference of [params.supplierId, params.vehicleId, params.driverId, params.contractId]) {
      if (reference !== undefined && (typeof reference !== 'string' || !reference.trim())) throw new Error('Referência inválida');
    }
    if (params.idempotencyKey !== undefined && (typeof params.idempotencyKey !== 'string' || !params.idempotencyKey.trim() || params.idempotencyKey.length > 200)) throw new Error('Chave de idempotência inválida');
    if (params.recurrenceDaysInterval !== undefined && (!Number.isInteger(params.recurrenceDaysInterval) || params.recurrenceDaysInterval < 1 || params.recurrenceDaysInterval > 366)) throw new Error('Intervalo de parcelas inválido');
    for (const date of [params.dueDate, params.competenceDate ?? params.dueDate]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Data inválida');
    }
    if (txContext) {
      const raw = txContext.getRawTransaction?.();
      if (!raw) throw new Error('Autoridade de referências indisponível');
      const tenant = await raw.execute(sql`SELECT id FROM companies WHERE id = ${params.companyId}`);
      if (!tenant.rows?.length) throw new Error('Tenant inválido');
      if (params.supplierId) {
        const supplier = await raw.execute(sql`SELECT id FROM suppliers WHERE company_id = ${params.companyId} AND id = ${params.supplierId}`);
        if (!supplier.rows?.length) throw new Error('Fornecedor não encontrado no tenant');
      }
      if (params.vehicleId && !await txContext.getVehicleRepo().findByIdForCompany(params.companyId, params.vehicleId)) throw new Error('Veículo não encontrado no tenant');
      if (params.driverId && !await txContext.getDriverRepo().findByIdForCompany(params.companyId, params.driverId)) throw new Error('Motorista não encontrado no tenant');
      if (params.contractId) {
        const contract = await txContext.getContractRepo().findByIdForCompany(params.companyId, params.contractId);
        if (!contract) throw new Error('Contrato não encontrado no tenant');
        if ((params.vehicleId && contract.vehicleId !== params.vehicleId) || (params.driverId && contract.driverId !== params.driverId)) throw new Error('Referências incompatíveis com contrato');
      }
      // Serialize the complete command across server processes before looking up installments.
      const commandKey = JSON.stringify([params.companyId, params.idempotencyKey?.trim() ?? params.originId, params.originType]);
      await raw.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${commandKey}, 0))`);
    } else if (params.supplierId || params.vehicleId || params.driverId || params.contractId) {
      throw new Error('Autoridade de referências indisponível');
    }
    const roundedBase = roundCurrency(params.totalAmount / installments);
    const baseAmount = installments === 1 ? roundedBase : Math.min(roundedBase, Math.floor((totalCents - 1) / (installments - 1)) / 100);
    const createdList: AccountPayable[] = [];
    let groupId = installments > 1 ? generateUUID() : undefined;

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

      await FinancialPeriodService.assertDateOpen(params.companyId, periodRef, txContext);
      await FinancialPeriodService.assertDateOpen(params.companyId, calculatedDueDate, txContext);

      const idempotencyKey = params.idempotencyKey ? JSON.stringify([params.companyId, 'PAYABLE', params.idempotencyKey.trim(), i]) : IdempotencyService.buildKey(
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
          if (!existing && params.idempotencyKey) {
            existing = await txContext.getPayableRepo().findByIdempotencyKey(params.idempotencyKey.trim());
            if (existing && installments > 1) throw new Error('Parcelamento com chave literal legada exige reconciliação antes de retry');
          }
        } else {
          existing = await this.repo.findByIdempotencyKeyForCompany(params.companyId, idempotencyKey);
          if (!existing) {
            existing = await this.repo.findByIdempotencyKeyForCompany(params.companyId, legacyKey);
          }
          if (!existing && params.idempotencyKey) {
            existing = await this.repo.findByIdempotencyKeyForCompany(params.companyId, params.idempotencyKey.trim());
            if (existing && installments > 1) throw new Error('Parcelamento com chave literal legada exige reconciliação antes de retry');
          }
        }

        if (existing) {
          if (existing.companyId !== params.companyId) {
            throw new Error('Acesso negado: Conta a Pagar idempotente pertence a outro tenant');
          }
          const expectedDescription = installments > 1 ? `${params.description} (${i}/${installments})` : params.description;
          const referenceKeys = ['supplierId', 'vehicleId', 'driverId', 'contractId'] as const;
          if (existing.originType !== params.originType || existing.originId !== params.originId ||
              existing.categoryId !== categoryId || existing.description !== expectedDescription ||
              Number(existing.originalAmount) !== amountForThisInstallment || existing.totalInstallments !== installments ||
              existing.dueDate.slice(0, 10) !== calculatedDueDate || existing.competenceDate.slice(0, 10) !== periodRef ||
              referenceKeys.some(key => (existing![key] || '') !== (params[key] || ''))) {
            throw new Error('Conflito de idempotência: comando de criação alterado');
          }
          if (existing.installmentGroupId) groupId = existing.installmentGroupId;
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
