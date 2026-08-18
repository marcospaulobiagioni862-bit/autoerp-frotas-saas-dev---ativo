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
    await FinancialAuthorizationService.authorize(
      userId,
      companyId,
      'FINANCIAL_REVERSAL',
      txContext
    );

    if (!Number.isFinite(reversalAmount) || reversalAmount <= 0) {
      throw new Error('Valor de estorno inválido');
    }

    let originalTx: FinancialTransaction | null;
    if (txContext) {
      originalTx = await txContext.getTransactionRepo().findById(transactionId);
    } else {
      originalTx = await this.transactionRepo.findByIdForCompany(transactionId, companyId);
    }
    if (!originalTx) throw new Error('Transação não encontrada');
    if (originalTx.companyId && originalTx.companyId !== companyId) {
      throw new Error('Acesso negado: Transação pertence a outra empresa');
    }
    if (originalTx.type === TransactionType.REVERSAL) {
      throw new Error('Transação do tipo REVERSAL não pode ser estornada');
    }
    if (originalTx.isReversed) throw new Error('Transação já foi estornada');

    await FinancialPeriodService.assertDateOpen(companyId, originalTx.transactionDate, txContext);
    await FinancialPeriodService.assertDateOpen(
      companyId,
      new Date().toISOString().split('T')[0],
      txContext
    );

    let allTxs: FinancialTransaction[];
    if (txContext) {
      allTxs = await txContext.getTransactionRepo().findAll({ companyId });
    } else {
      allTxs = await this.transactionRepo.findAllForCompany(companyId);
    }
    const previousReversals = allTxs.filter(
      (t) => t.type === TransactionType.REVERSAL && t.reversalTransactionId === originalTx!.id
    );
    const reversedAmount = roundCurrency(
      previousReversals.reduce((sum, r) => sum + Number(r.amount), 0)
    );
    const originalAmount = Number(originalTx.amount);
    const reversibleRemaining = roundCurrency(originalAmount - reversedAmount);

    if (roundCurrency(reversalAmount) > roundCurrency(reversibleRemaining)) {
      throw new Error(`Valor de estorno inválido (Disponível para estorno: R$ ${reversibleRemaining})`);
    }

    const totalReversedAfter = roundCurrency(reversedAmount + reversalAmount);
    const isFullReversal = Math.abs(totalReversedAfter - originalAmount) < 0.01;
    if (txContext) {
      await txContext.getTransactionRepo().update(originalTx.id, {
        isReversed: isFullReversal,
      });
    } else {
      await this.transactionRepo.updateForCompany(originalTx.id, companyId, {
        isReversed: isFullReversal,
      });
    }

    const reversalTx: FinancialTransaction = {
      id: generateUUID(),
      companyId,
      financialAccountId: originalTx.financialAccountId,
      destinationAccountId: originalTx.destinationAccountId,
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

    let savedReversal: FinancialTransaction;
    if (txContext) {
      savedReversal = await txContext.getTransactionRepo().create(reversalTx);
    } else {
      savedReversal = await this.transactionRepo.createForCompany(companyId, reversalTx);
    }

    if (originalTx.type === TransactionType.TRANSFER) {
      if (!originalTx.destinationAccountId) {
        throw new Error('Transferência original sem conta de destino');
      }

      if (txContext) {
        const source = await txContext.getAccountRepo().findById(originalTx.financialAccountId);
        const destination = await txContext.getAccountRepo().findById(originalTx.destinationAccountId);
        if (!source || !destination) throw new Error('Conta financeira de origem ou destino não encontrada');
        if (
          source.companyId !== companyId ||
          destination.companyId !== companyId ||
          source.companyId !== destination.companyId
        ) {
          throw new Error('Acesso negado: Transferência pertence a contas de outro tenant');
        }
        await txContext.getAccountRepo().updateBalance(originalTx.financialAccountId, reversalAmount);
        await txContext.getAccountRepo().updateBalance(originalTx.destinationAccountId, -reversalAmount);
      } else {
        const source = await this.accountRepo.findByIdForCompany(originalTx.financialAccountId, companyId);
        const destination = await this.accountRepo.findByIdForCompany(originalTx.destinationAccountId, companyId);
        if (!source || !destination) throw new Error('Conta financeira de origem ou destino não encontrada');
        await this.accountRepo.updateBalanceForCompany(companyId, originalTx.financialAccountId, reversalAmount);
        await this.accountRepo.updateBalanceForCompany(companyId, originalTx.destinationAccountId, -reversalAmount);
      }
    } else {
      const balanceDelta = originalTx.type === TransactionType.INCOME ? -reversalAmount : reversalAmount;
      if (txContext) {
        await txContext.getAccountRepo().updateBalance(originalTx.financialAccountId, balanceDelta);
      } else {
        await this.accountRepo.updateBalanceForCompany(companyId, originalTx.financialAccountId, balanceDelta);
      }
    }

    if (originalTx.receivableId) {
      if (txContext) {
        const rec = await txContext.getReceivableRepo().findById(originalTx.receivableId);
        if (rec) {
          const newPaid = Math.max(0, Number(rec.paidAmount) - reversalAmount);
          const newBalance = roundCurrency(Number(rec.updatedAmount) - newPaid);
          const newStatus = newBalance >= Number(rec.updatedAmount) ? ObligationStatus.PENDING : ObligationStatus.PARTIALLY_PAID;
          await txContext.getReceivableRepo().update(rec.id, {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            status: newStatus,
          });
        }
      } else {
        const rec = await this.receivableRepo.findByIdForCompany(originalTx.receivableId, companyId);
        if (rec) {
          const newPaid = Math.max(0, Number(rec.paidAmount) - reversalAmount);
          const newBalance = roundCurrency(Number(rec.updatedAmount) - newPaid);
          const newStatus = newBalance >= Number(rec.updatedAmount) ? ObligationStatus.PENDING : ObligationStatus.PARTIALLY_PAID;
          await this.receivableRepo.updateForCompany(rec.id, companyId, {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            status: newStatus,
          });
        }
      }
    } else if (originalTx.payableId) {
      if (txContext) {
        const pay = await txContext.getPayableRepo().findById(originalTx.payableId);
        if (pay) {
          const newPaid = Math.max(0, Number(pay.paidAmount) - reversalAmount);
          const newBalance = roundCurrency(Number(pay.updatedAmount) - newPaid);
          const newStatus = newBalance >= Number(pay.updatedAmount) ? ObligationStatus.PENDING : ObligationStatus.PARTIALLY_PAID;
          await txContext.getPayableRepo().update(pay.id, {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            status: newStatus,
          });
        }
      } else {
        const pay = await this.payableRepo.findByIdForCompany(originalTx.payableId, companyId);
        if (pay) {
          const newPaid = Math.max(0, Number(pay.paidAmount) - reversalAmount);
          const newBalance = roundCurrency(Number(pay.updatedAmount) - newPaid);
          const newStatus = newBalance >= Number(pay.updatedAmount) ? ObligationStatus.PENDING : ObligationStatus.PARTIALLY_PAID;
          await this.payableRepo.updateForCompany(pay.id, companyId, {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            status: newStatus,
          });
        }
      }
    }

    await AuditLogger.logAction(
      companyId,
      'FinancialTransaction',
      originalTx.id,
      isFullReversal ? AuditAction.REVERSE : AuditAction.PARTIAL_REVERSE,
      userId,
      userName,
      originalTx,
      savedReversal,
      txContext
    );

    return savedReversal;
  }
}
