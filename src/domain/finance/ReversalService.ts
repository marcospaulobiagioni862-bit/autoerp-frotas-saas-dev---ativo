import { ITransactionContext } from './ITransactionContext';
import {
  FinancialTransactionRepository,
  FinancialAccountRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { FinancialTransaction } from '../../types/entities';
import { TransactionType, ObligationStatus, AuditAction } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export class ReversalService {
  private static transactionRepo = new FinancialTransactionRepository();
  private static accountRepo = new FinancialAccountRepository();
  private static receivableRepo = new AccountReceivableRepository();
  private static payableRepo = new AccountPayableRepository();

  public static async reverseTransaction(
    companyId: string,
    transactionId: string,
    reversalAmount: number,
    reason: string,
    userId: string,
    userName: string,
    txContext?: ITransactionContext
  ): Promise<FinancialTransaction> {
    await FinancialAuthorizationService.authorize(userId, companyId, 'FINANCIAL_REVERSAL', txContext);

    const originalTx = await (txContext ? txContext.getTransactionRepo() : this.transactionRepo).findById(transactionId);
    if (!originalTx) throw new Error('Transação não encontrada');
    if (originalTx.companyId && originalTx.companyId !== companyId) {
      throw new Error('Acesso negado: Transação pertence a outra empresa');
    }
    if (originalTx.isReversed) throw new Error('Transação já foi estornada');

    await FinancialPeriodService.assertDateOpen(companyId, originalTx.transactionDate, txContext);
    await FinancialPeriodService.assertDateOpen(companyId, new Date().toISOString().split('T')[0], txContext);

    const allTxs = await (txContext ? txContext.getTransactionRepo() : this.transactionRepo).findAll({ companyId });
    const previousReversals = allTxs.filter(
      (t) => t.type === TransactionType.REVERSAL && t.reversalTransactionId === originalTx.id
    );
    const reversedAmount = roundCurrency(
      previousReversals.reduce((sum, r) => sum + r.amount, 0)
    );
    const reversibleRemaining = roundCurrency(originalTx.amount - reversedAmount);

    if (reversalAmount <= 0 || roundCurrency(reversalAmount) > roundCurrency(reversibleRemaining)) {
      throw new Error(`Valor de estorno inválido (Disponível para estorno: R$ ${reversibleRemaining})`);
    }

    const totalReversedAfter = roundCurrency(reversedAmount + reversalAmount);
    const isFullReversal = Math.abs(totalReversedAfter - originalTx.amount) < 0.01;
    await (txContext ? txContext.getTransactionRepo() : this.transactionRepo).update(originalTx.id, {
      isReversed: isFullReversal,
    });

    const reversalTx: FinancialTransaction = {
      id: generateUUID(),
      companyId,
      financialAccountId: originalTx.financialAccountId,
      receivableId: originalTx.receivableId,
      payableId: originalTx.payableId,
      type: TransactionType.REVERSAL,
      amount: reversalAmount,
      paymentMethodId: originalTx.paymentMethodId,
      transactionDate: new Date().toISOString().split('T')[0],
      competenceDate: originalTx.competenceDate,
      description: `ESTORNO (${reason}): ${originalTx.description}`,
      isReversed: false,
      reversalTransactionId: originalTx.id,
      vehicleId: originalTx.vehicleId,
      driverId: originalTx.driverId,
      supplierId: originalTx.supplierId,
      createdById: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedReversal = await (txContext ? txContext.getTransactionRepo() : this.transactionRepo).create(reversalTx);

    // Balance Delta: Reversing an Income reduces cash; reversing an Expense adds cash back
    const balanceDelta = originalTx.type === TransactionType.INCOME ? -reversalAmount : reversalAmount;
    await (txContext ? txContext.getAccountRepo() : this.accountRepo).updateBalance(originalTx.financialAccountId, balanceDelta);

    // Update Receivable / Payable
    if (originalTx.receivableId) {
      const rec = await (txContext ? txContext.getReceivableRepo() : this.receivableRepo).findById(originalTx.receivableId);
      if (rec) {
        const newPaid = Math.max(0, rec.paidAmount - reversalAmount);
        const newBalance = roundCurrency(rec.updatedAmount - newPaid);
        const newStatus = newBalance >= rec.updatedAmount ? ObligationStatus.PENDING : ObligationStatus.PARTIALLY_PAID;

        await (txContext ? txContext.getReceivableRepo() : this.receivableRepo).update(rec.id, {
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: newStatus,
        });
      }
    } else if (originalTx.payableId) {
      const pay = await (txContext ? txContext.getPayableRepo() : this.payableRepo).findById(originalTx.payableId);
      if (pay) {
        const newPaid = Math.max(0, pay.paidAmount - reversalAmount);
        const newBalance = roundCurrency(pay.updatedAmount - newPaid);
        const newStatus = newBalance >= pay.updatedAmount ? ObligationStatus.PENDING : ObligationStatus.PARTIALLY_PAID;

        await (txContext ? txContext.getPayableRepo() : this.payableRepo).update(pay.id, {
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: newStatus,
        });
      }
    }

    if (txContext) {
      await txContext.getAuditLogRepo().create({
        id: generateUUID(),
        companyId: companyId,
        entityName: 'FinancialTransaction',
        entityId: transactionId,
        action: 'FINANCIAL_REVERSAL' as any,
        userId: userId,
        userName: userName,
        timestamp: new Date().toISOString()
      });
    }

    return savedReversal;
  }
}
