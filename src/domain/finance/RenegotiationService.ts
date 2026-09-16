import { ITransactionContext } from './ITransactionContext';
import {
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { ObligationStatus, OriginType, AuditAction } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
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
    if (!params.companyId) throw new Error('companyId é obrigatório');
    if (!params.userId) throw new Error('userId é obrigatório');
    if (!Array.isArray(params.obligationIds) || params.obligationIds.length === 0) throw new Error('obligationIds deve conter ao menos uma obrigação');
    if (params.type !== 'RECEIVABLE' && params.type !== 'PAYABLE') throw new Error('type inválido');
    if (!(params.newTotalAmount > 0)) throw new Error('newTotalAmount deve ser maior que zero');
    if (!Number.isInteger(params.installmentsCount) || params.installmentsCount < 1) throw new Error('installmentsCount deve ser inteiro >= 1');
    if (!params.firstDueDate) throw new Error('firstDueDate é obrigatório');

    await FinancialAuthorizationService.authorize(params.userId, params.companyId, 'FINANCIAL_RENEGOTIATION', txContext);
    await FinancialPeriodService.assertDateOpen(params.companyId, params.firstDueDate, txContext);

    const renegotiationId = generateUUID();
    const totalCents = Math.round(params.newTotalAmount * 100);
    const baseCents = Math.floor(totalCents / params.installmentsCount);
    const remainderCents = totalCents - (baseCents * params.installmentsCount);
    const installmentAmount = (index: number) => (baseCents + (index === params.installmentsCount ? remainderCents : 0)) / 100;

    if (params.type === 'RECEIVABLE') {
      // 1. Mark original receivables as CANCELLED (Renegotiated)
      for (const id of params.obligationIds) {
        const item = await (txContext ? txContext.getReceivableRepo() : this.recRepo).findById(id);
        if (item) {
          if (item.companyId !== params.companyId) throw new Error('Acesso negado: obrigação pertence a outra empresa');
          await (txContext ? txContext.getReceivableRepo() : this.recRepo).update(id, {
            status: ObligationStatus.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancelReason: `Renegociado através do lote ${renegotiationId}`,
            renegotiationId,
          });
        }
      }

      // 2. Create new consolidated receivables
      const createdList = [];

      for (let i = 1; i <= params.installmentsCount; i++) {
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
          originalAmount: installmentAmount(i),
          discountAmount: 0,
          fineAmount: 0,
          interestAmount: 0,
          updatedAmount: installmentAmount(i),
          paidAmount: 0,
          balanceAmount: installmentAmount(i),
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

      if (txContext) {
        await txContext.getAuditLogRepo().create({
          id: generateUUID(),
          companyId: params.companyId,
          entityName: 'Renegotiation',
          entityId: renegotiationId,
          action: 'FINANCIAL_RENEGOTIATION' as any,
          userId: params.userId,
          userName: params.userName,
          timestamp: new Date().toISOString()
        });
      }

      return createdList;
    } else {
      // PAYABLE
      for (const id of params.obligationIds) {
        const item = await (txContext ? txContext.getPayableRepo() : this.payRepo).findById(id);
        if (item) {
          if (item.companyId !== params.companyId) throw new Error('Acesso negado: obrigação pertence a outra empresa');
          await (txContext ? txContext.getPayableRepo() : this.payRepo).update(id, {
            status: ObligationStatus.CANCELLED,
            cancelledAt: new Date().toISOString(),
            cancelReason: `Renegociado através do lote ${renegotiationId}`,
            renegotiationId,
          });
        }
      }

      // 2. Create new consolidated payables
      const createdList = [];

      for (let i = 1; i <= params.installmentsCount; i++) {
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
          originalAmount: installmentAmount(i),
          discountAmount: 0,
          fineAmount: 0,
          interestAmount: 0,
          updatedAmount: installmentAmount(i),
          paidAmount: 0,
          balanceAmount: installmentAmount(i),
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

      if (txContext) {
        await txContext.getAuditLogRepo().create({
          id: generateUUID(),
          companyId: params.companyId,
          entityName: 'Renegotiation',
          entityId: renegotiationId,
          action: 'FINANCIAL_RENEGOTIATION' as any,
          userId: params.userId,
          userName: params.userName,
          timestamp: new Date().toISOString()
        });
      }

      return createdList;
    }
  }
}
