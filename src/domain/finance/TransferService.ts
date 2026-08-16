import { ITransactionContext } from './ITransactionContext';
import {
  FinancialTransactionRepository,
  FinancialAccountRepository,
} from '../../persistence/repositories/localRepositories';
    import { FinancialTransaction, FinancialAccount } from '../../types/entities';
import { TransactionType, AuditAction } from '../../types/enums';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export interface TransferParams {
  companyId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  transferDate: string;
  paymentMethodId: string;
  description: string;
  userId: string;
  userName: string;
}

export class TransferService {
  private static accountRepo = new FinancialAccountRepository();
  private static txRepo = new FinancialTransactionRepository();

  public static async transferFunds(params: TransferParams, txContext?: ITransactionContext): Promise<FinancialTransaction> {
    await FinancialAuthorizationService.authorize(params.userId, params.companyId, 'FINANCIAL_TRANSFER');

    await FinancialPeriodService.assertDateOpen(params.companyId, params.transferDate);

    if (params.sourceAccountId === params.destinationAccountId) {
      throw new Error('Conta de origem e destino devem ser diferentes');
    }

    if (params.amount <= 0) {
      throw new Error('Valor da transferência deve ser maior que zero');
    }

    let sourceAcc: FinancialAccount | null;
    let destAcc: FinancialAccount | null;

    if (txContext) {
      sourceAcc = await txContext.getAccountRepo().findById(params.sourceAccountId);
      destAcc = await txContext.getAccountRepo().findById(params.destinationAccountId);
    } else {
      sourceAcc = await this.accountRepo.findByIdForCompany(params.sourceAccountId, params.companyId);
      destAcc = await this.accountRepo.findByIdForCompany(params.destinationAccountId, params.companyId);
    }

    if (!sourceAcc || !destAcc) {
      throw new Error('Conta financeira de origem ou destino não encontrada');
    }

    if (
      !sourceAcc.companyId ||
      sourceAcc.companyId !== params.companyId ||
      !destAcc.companyId ||
      destAcc.companyId !== params.companyId ||
      sourceAcc.companyId !== destAcc.companyId
    ) {
      throw new Error('Acesso negado: Transferência entre contas de empresas diferentes ou não autorizadas');
    }

    // Execute balance updates
    if (txContext) {
      await txContext.getAccountRepo().updateBalance(params.sourceAccountId, -params.amount);
      await txContext.getAccountRepo().updateBalance(params.destinationAccountId, params.amount);
    } else {
      await this.accountRepo.updateBalanceForCompany(params.companyId, params.sourceAccountId, -params.amount);
      await this.accountRepo.updateBalanceForCompany(params.companyId, params.destinationAccountId, params.amount);
    }

    try {
      const transaction: FinancialTransaction = {
        id: generateUUID(),
        companyId: params.companyId,
        financialAccountId: params.sourceAccountId,
        destinationAccountId: params.destinationAccountId,
        type: TransactionType.TRANSFER,
        amount: params.amount,
        paymentMethodId: params.paymentMethodId,
        transactionDate: params.transferDate,
        competenceDate: params.transferDate,
        description: params.description,
        isReversed: false,
        createdById: params.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let savedTx: FinancialTransaction;
      if (txContext) {
        savedTx = await txContext.getTransactionRepo().create(transaction);
      } else {
        savedTx = await this.txRepo.createForCompany(params.companyId, transaction);
      }

      await AuditLogger.logAction(
        params.companyId,
        'FinancialTransaction',
        savedTx.id,
        AuditAction.CREATE,
        params.userId,
        params.userName,
        null,
        savedTx
      );

      return savedTx;
    } catch (error) {
      // Rollback balances on failure
      if (txContext) {
        await txContext.getAccountRepo().updateBalance(params.sourceAccountId, params.amount);
        await txContext.getAccountRepo().updateBalance(params.destinationAccountId, -params.amount);
      } else {
        await this.accountRepo.updateBalanceForCompany(params.companyId, params.sourceAccountId, params.amount);
        await this.accountRepo.updateBalanceForCompany(params.companyId, params.destinationAccountId, -params.amount);
      }
      throw error;
    }
  }
}
