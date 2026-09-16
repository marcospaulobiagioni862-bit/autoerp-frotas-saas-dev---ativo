import { 
  IAccountReceivableRepository, 
  IAccountPayableRepository,
  IFinancialTransactionRepository,
  IFinancialAccountRepository,
  IAuditLogRepository,
  IUserRepository,
  IFinancialPeriodRepository
} from '../../persistence/repositories/interfaces';

export interface ITransactionContext {
  getUserRepo(): IUserRepository;
  getFinancialPeriodRepo(): IFinancialPeriodRepository;
  getReceivableRepo(): IAccountReceivableRepository;
  getPayableRepo(): IAccountPayableRepository;
  getTransactionRepo(): IFinancialTransactionRepository;
  getAccountRepo(): IFinancialAccountRepository;
  getAuditLogRepo(): IAuditLogRepository;
}
