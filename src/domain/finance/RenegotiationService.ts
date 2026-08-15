import { ITransactionContext } from './ITransactionContext';
import {
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { ObligationStatus, OriginType, AuditAction } from '../../types/enums';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
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
  categoryId: string;
  description: string;
  userId: string;
  userName: string;
}

export class RenegotiationService {
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();

  public static async renegociate(params: RenegotiateParams, txContext?: ITransactionContext) {
    await FinancialAuthorizationService.authorize(params.userId, params.companyId, 'FINANCIAL_RENEGOTIATION', txContext);

    await FinancialPeriodService.assertDateOpen(params.companyId, params.firstDueDate, txContext);

    const renegotiationId = generateUUID();

    // Exact centavos calculation
    const totalCents = Math.round(params.newTotalAmount * 100);
    const baseCentsPerInstallment = Math.floor(totalCents / params.installmentsCount);
    const remainderCents = totalCents - (baseCentsPerInstallment * params.installmentsCount);

    if (params.type === 'RECEIVABLE') {
      // 1. Mark original receivables as CANCELLED (Renegotiated)
      for (const id of params.obligationIds) {
        const item = await (txContext ? txContext.getReceivableRepo() : this.recRepo).findById(id);
        if (item) {
          await (txContext ? txContext.getReceivableRepo() : this.recRepo).update(id, {
            status: ObligationStatus.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancelReason: `Renegociado através do lote ${renegotiationId}`,
            renegotiationId,
          });
        }
      }

      // 2. Create new consolidated receivables with exact centavos
      const createdList = [];

      for (let i = 1; i <= params.installmentsCount; i++) {
        const installmentCents = baseCentsPerInstallment + (i === params.installmentsCount ? remainderCents : 0);
        const installmentAmount = installmentCents / 100;

        const idempotencyKey = IdempotencyService.buildKey(OriginType.RENEGOTIATION, renegotiationId, i, undefined, params.companyId);

        const dueDateObj = new Date(params.firstDueDate);
        if (i > 1) dueDateObj.setMonth(dueDateObj.getMonth() + (i - 1));
        const calculatedDueDate = dueDateObj.toISOString().split('T')[0];

        const item = await (txContext ? txContext.getReceivableRepo() : this.recRepo).create({
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
        });

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
        { obligationIds: params.obligationIds, newInstallments: createdList },
        txContext
      );

      return createdList;
    } else {
      // PAYABLE
      for (const id of params.obligationIds) {
        const item = await (txContext ? txContext.getPayableRepo() : this.payRepo).findById(id);
        if (item) {
          await (txContext ? txContext.getPayableRepo() : this.payRepo).update(id, {
            status: ObligationStatus.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancelReason: `Renegociado através do lote ${renegotiationId}`,
            renegotiationId,
          });
        }
      }

      const createdList = [];

      for (let i = 1; i <= params.installmentsCount; i++) {
        const installmentCents = baseCentsPerInstallment + (i === params.installmentsCount ? remainderCents : 0);
        const installmentAmount = installmentCents / 100;

        const idempotencyKey = IdempotencyService.buildKey(OriginType.RENEGOTIATION, renegotiationId, i, undefined, params.companyId);

        const dueDateObj = new Date(params.firstDueDate);
        if (i > 1) dueDateObj.setMonth(dueDateObj.getMonth() + (i - 1));
        const calculatedDueDate = dueDateObj.toISOString().split('T')[0];

        const item = await (txContext ? txContext.getPayableRepo() : this.payRepo).create({
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
        });

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
        { obligationIds: params.obligationIds, newInstallments: createdList },
        txContext
      );

      return createdList;
    }
  }
}
