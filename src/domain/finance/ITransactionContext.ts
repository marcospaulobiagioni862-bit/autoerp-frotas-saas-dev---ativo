import {
  AccountReceivable,
  AccountPayable,
  FinancialTransaction,
  FinancialAccount,
  AuditLog,
  User,
  FinancialPeriod,
} from '../../types/entities';

export interface TransactionFilterOptions {
  companyId?: string;
}

export interface TransactionFinancialPeriodFilterOptions {
  companyId?: string;
}

export interface ITransactionReceivableRepository {
  findById(id: string): Promise<AccountReceivable | null>;
  create(item: AccountReceivable): Promise<AccountReceivable>;
  update(id: string, item: Partial<AccountReceivable>): Promise<AccountReceivable>;
}

export interface ITransactionPayableRepository {
  findById(id: string): Promise<AccountPayable | null>;
  create(item: AccountPayable): Promise<AccountPayable>;
  update(id: string, item: Partial<AccountPayable>): Promise<AccountPayable>;
}

export interface ITransactionFinancialTransactionRepository {
  findById(id: string): Promise<FinancialTransaction | null>;
  findAll(filters?: TransactionFilterOptions): Promise<FinancialTransaction[]>;
  create(item: FinancialTransaction): Promise<FinancialTransaction>;
  update(id: string, item: Partial<FinancialTransaction>): Promise<FinancialTransaction>;
}

export interface ITransactionFinancialAccountRepository {
  findById(id: string): Promise<FinancialAccount | null>;
  updateBalance(accountId: string, delta: number): Promise<FinancialAccount>;
}

export interface ITransactionAuditLogRepository {
  create(item: AuditLog): Promise<AuditLog>;
}

export interface ITransactionUserRepository {
  findById(id: string): Promise<User | null>;
}

export interface ITransactionFinancialPeriodRepository {
  findAll(filters?: TransactionFinancialPeriodFilterOptions): Promise<FinancialPeriod[]>;
  findById(id: string): Promise<FinancialPeriod | null>;
  create(item: FinancialPeriod): Promise<FinancialPeriod>;
  update(id: string, item: Partial<FinancialPeriod>): Promise<FinancialPeriod>;
}

export interface ITransactionContext {
  getReceivableRepo(): ITransactionReceivableRepository;
  getPayableRepo(): ITransactionPayableRepository;
  getTransactionRepo(): ITransactionFinancialTransactionRepository;
  getAccountRepo(): ITransactionFinancialAccountRepository;
  getAuditLogRepo(): ITransactionAuditLogRepository;
  getUserRepo(): ITransactionUserRepository;
  getFinancialPeriodRepo(): ITransactionFinancialPeriodRepository;
}

