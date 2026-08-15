import { 
  IAccountReceivableRepository, 
  IAccountPayableRepository,
  IFinancialTransactionRepository,
  IFinancialAccountRepository,
  IAuditLogRepository,
  IFinancialPeriodRepository,
  IBaseRepository
} from '../../persistence/repositories/interfaces';
import { User } from '../../types/entities';

export interface ITransactionContext {
  getReceivableRepo(): IAccountReceivableRepository;
  getPayableRepo(): IAccountPayableRepository;
  getTransactionRepo(): IFinancialTransactionRepository;
  getAccountRepo(): IFinancialAccountRepository;
  getAuditLogRepo(): IAuditLogRepository;
  getUserRepo(): IBaseRepository<User>;
  getFinancialPeriodRepo(): IFinancialPeriodRepository;
}
