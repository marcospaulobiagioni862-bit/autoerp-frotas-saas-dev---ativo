import { ITransactionContext } from './ITransactionContext';
import { FinancialTransaction } from '../../types/entities';
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
  public static async transferFunds(params: TransferParams, txContext?: ITransactionContext): Promise<FinancialTransaction> {
    if (!txContext) throw new Error('PostgreSQL txContext required');

    await FinancialAuthorizationService.authorize(params.userId, params.companyId, 'FINANCIAL_TRANSFER', txContext);
    await FinancialPeriodService.assertDateOpen(params.companyId, params.transferDate, txContext);
    
    if (params.sourceAccountId === params.destinationAccountId) {
      throw new Error('Conta de origem e destino devem ser diferentes');
    }

    if (params.amount <= 0) {
      throw new Error('Valor da transferência deve ser maior que zero');
    }

    // LOCK deterministically before ANY read to avoid lost updates
    if ((txContext.getAccountRepo() as any).lockTwoAccounts) {
      await (txContext.getAccountRepo() as any).lockTwoAccounts(params.sourceAccountId, params.destinationAccountId);
    }

    const sourceAcc = await txContext.getAccountRepo().findById(params.sourceAccountId);
    const destAcc = await txContext.getAccountRepo().findById(params.destinationAccountId);

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

    // Execute balance updates atomically (the lock ensures it's safe)
    await txContext.getAccountRepo().updateBalance(params.sourceAccountId, -params.amount);
    await txContext.getAccountRepo().updateBalance(params.destinationAccountId, params.amount);

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

    const savedTx = await txContext.getTransactionRepo().create(transaction);

    await txContext.getAuditLogRepo().create({
      id: generateUUID(),
      companyId: params.companyId,
      entityName: 'FinancialTransaction',
      entityId: savedTx.id,
      action: AuditAction.CREATE as any,
      userId: params.userId,
      userName: params.userName,
      newState: JSON.stringify(savedTx),
      timestamp: new Date().toISOString()
    });

    return savedTx;
  }
}
