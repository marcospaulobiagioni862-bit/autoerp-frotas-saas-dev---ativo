import { ITransactionContext } from './ITransactionContext';
import {
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { ObligationStatus, OriginType, AuditAction } from '../../types/enums';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import {
  calculateRenegotiationDueDate,
  resolveRenegotiationInstallmentFrequency,
  type RenegotiationInstallmentFrequency,
} from '../../shared/utils/renegotiationSchedule';
import { IdempotencyService } from '../services/IdempotencyService';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export interface RenegotiateParams {
  companyId: string;
  obligationIds: string[]; // List of receivables or payables to consolidate
  type: 'RECEIVABLE' | 'PAYABLE';
  newTotalAmount: number;
  installmentsCount: number;
  firstDueDate: string;
  installmentFrequency?: RenegotiationInstallmentFrequency;
  categoryId: string;
  description: string;
  userId: string;
  userName: string;
}

export class RenegotiationService {
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();

  public static async renegociate(params: RenegotiateParams, txContext?: ITransactionContext) {
    const installmentFrequency = resolveRenegotiationInstallmentFrequency(params.installmentFrequency);
    // Validate the date before any obligation is mutated, including legacy/local test paths.
    calculateRenegotiationDueDate(params.firstDueDate, 1, installmentFrequency);

    await FinancialAuthorizationService.authorize(params.userId, params.companyId, 'FINANCIAL_RENEGOTIATION', txContext);

    await FinancialPeriodService.assertDateOpen(params.companyId, params.firstDueDate, txContext);

    const renegotiationId = generateUUID();

    // Exact centavos calculation
    const totalCents = Math.round(params.newTotalAmount * 100);
    const baseCentsPerInstallment = Math.floor(totalCents / params.installmentsCount);
    const remainderCents = totalCents - (baseCentsPerInstallment * params.installmentsCount);

    if (params.type === 'RECEIVABLE') {
      // 1. Pre-validate all original receivables to ensure atomicity locally
      for (const id of params.obligationIds) {
        if (txContext) {
          const item = await txContext.getReceivableRepo().findById(id);
          if (!item) {
            throw new Error(`Título a receber ${id} não encontrado ou pertence a outra empresa.`);
          }
        } else {
          const item = await this.recRepo.findByIdForCompany(id, params.companyId);
          if (!item) {
            throw new Error(`Título a receber ${id} não encontrado ou pertence a outra empresa.`);
          }
        }
      }

      // 2. Mark original receivables as CANCELLED (Renegotiated)
      for (const id of params.obligationIds) {
        if (txContext) {
          await txContext.getReceivableRepo().update(id, {
            status: ObligationStatus.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancelReason: `Renegociado através do lote ${renegotiationId}`,
            renegotiationId,
          });
        } else {
          await this.recRepo.updateForCompany(id, params.companyId, {
            status: ObligationStatus.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancelReason: `Renegociado através do lote ${renegotiationId}`,
            renegotiationId,
          });
        }
      }

      // 3. Create new consolidated receivables with exact centavos
      const createdList = [];

      for (let i = 1; i <= params.installmentsCount; i++) {
        const installmentCents = baseCentsPerInstallment + (i === params.installmentsCount ? remainderCents : 0);
        const installmentAmount = installmentCents / 100;

        const idempotencyKey = IdempotencyService.buildKey(OriginType.RENEGOTIATION, renegotiationId, i, undefined, params.companyId);
        const calculatedDueDate = calculateRenegotiationDueDate(
          params.firstDueDate,
          i,
          installmentFrequency
        );

        const createPayload = {
          id: generateUUID(),
          companyId: params.companyId,
          originType: OriginType.RENEGOTIATION,
          originId: renegotiationId,
          categoryId: params.categoryId,
          description: `${params.description} (${i}/${params.installmentsCount})`,
          originalAmount: installmentAmount,
          discountAmount: 0,
          fineAmount: 0,
          interestAmount: 0,
          updatedAmount: installmentAmount,
          paidAmount: 0,
          balanceAmount: installmentAmount,
          dueDate: calculatedDueDate,
          competenceDate: calculatedDueDate,
          status: ObligationStatus.PENDING,
          installmentNumber: i,
          totalInstallments: params.installmentsCount,
          renegotiationId,
          idempotencyKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        let item;
        if (txContext) {
          item = await txContext.getReceivableRepo().create(createPayload);
        } else {
          item = await this.recRepo.createForCompany(params.companyId, createPayload);
        }

        createdList.push(item);
      }

      await AuditLogger.logAction(
        params.companyId,
        'Renegotiation',
        renegotiationId,
        AuditAction.CREATE,
        params.userId,
        params.userName,
        null,
        { obligationIds: params.obligationIds, installmentFrequency, newInstallments: createdList },
        txContext
      );

      return createdList;
    } else {
      // PAYABLE
      // 1. Pre-validate all original payables to ensure atomicity locally
      for (const id of params.obligationIds) {
        if (txContext) {
          const item = await txContext.getPayableRepo().findById(id);
          if (!item) {
            throw new Error(`Título a pagar ${id} não encontrado ou pertence a outra empresa.`);
          }
        } else {
          const item = await this.payRepo.findByIdForCompany(id, params.companyId);
          if (!item) {
            throw new Error(`Título a pagar ${id} não encontrado ou pertence a outra empresa.`);
          }
        }
      }

      // 2. Mark original payables as CANCELLED (Renegotiated)
      for (const id of params.obligationIds) {
        if (txContext) {
          await txContext.getPayableRepo().update(id, {
            status: ObligationStatus.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancelReason: `Renegociado através do lote ${renegotiationId}`,
            renegotiationId,
          });
        } else {
          await this.payRepo.updateForCompany(id, params.companyId, {
            status: ObligationStatus.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancelReason: `Renegociado através do lote ${renegotiationId}`,
            renegotiationId,
          });
        }
      }

      // 3. Create new consolidated payables with exact centavos
      const createdList = [];

      for (let i = 1; i <= params.installmentsCount; i++) {
        const installmentCents = baseCentsPerInstallment + (i === params.installmentsCount ? remainderCents : 0);
        const installmentAmount = installmentCents / 100;

        const idempotencyKey = IdempotencyService.buildKey(OriginType.RENEGOTIATION, renegotiationId, i, undefined, params.companyId);
        const calculatedDueDate = calculateRenegotiationDueDate(
          params.firstDueDate,
          i,
          installmentFrequency
        );

        const createPayload = {
          id: generateUUID(),
          companyId: params.companyId,
          originType: OriginType.RENEGOTIATION,
          originId: renegotiationId,
          categoryId: params.categoryId,
          description: `${params.description} (${i}/${params.installmentsCount})`,
          originalAmount: installmentAmount,
          discountAmount: 0,
          fineAmount: 0,
          interestAmount: 0,
          updatedAmount: installmentAmount,
          paidAmount: 0,
          balanceAmount: installmentAmount,
          dueDate: calculatedDueDate,
          competenceDate: calculatedDueDate,
          status: ObligationStatus.PENDING,
          installmentNumber: i,
          totalInstallments: params.installmentsCount,
          renegotiationId,
          idempotencyKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        let item;
        if (txContext) {
          item = await txContext.getPayableRepo().create(createPayload);
        } else {
          item = await this.payRepo.createForCompany(params.companyId, createPayload);
        }

        createdList.push(item);
      }

      await AuditLogger.logAction(
        params.companyId,
        'Renegotiation',
        renegotiationId,
        AuditAction.CREATE,
        params.userId,
        params.userName,
        null,
        { obligationIds: params.obligationIds, installmentFrequency, newInstallments: createdList },
        txContext
      );

      return createdList;
    }
  }
}
