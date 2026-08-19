import {
  AccountReceivable,
  AccountPayable,
  FinancialTransaction,
  FinancialAccount,
  PaymentMethod,
  AuditLog,
  User,
  FinancialPeriod,
  SecurityDeposit,
  SecurityDepositMovement,
  DriverHealthAndEmergency,
} from '../../types/entities';

export interface TransactionFilterOptions {
  companyId?: string;
}

export interface TransactionFinancialPeriodFilterOptions {
  companyId?: string;
}

export interface ITransactionReceivableRepository {
  findById(id: string): Promise<AccountReceivable | null>;
  findByIdempotencyKey(key: string): Promise<AccountReceivable | null>;
  findAll(filters?: TransactionFilterOptions): Promise<AccountReceivable[]>;
  create(item: AccountReceivable): Promise<AccountReceivable>;
  update(id: string, item: Partial<AccountReceivable>): Promise<AccountReceivable>;
}

export interface ITransactionPayableRepository {
  findById(id: string): Promise<AccountPayable | null>;
  findByIdempotencyKey(key: string): Promise<AccountPayable | null>;
  findAll(filters?: TransactionFilterOptions): Promise<AccountPayable[]>;
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
  findAll?(filters?: TransactionFilterOptions): Promise<FinancialAccount[]>;
  updateBalance(accountId: string, delta: number): Promise<FinancialAccount>;
}

export interface ITransactionPaymentMethodRepository {
  findById(id: string): Promise<PaymentMethod | null>;
  findAll(filters?: TransactionFilterOptions): Promise<PaymentMethod[]>;
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

export interface ITransactionSecurityDepositRepository {
  lockContract(companyId: string, contractId: string): Promise<void>;
  findById(id: string): Promise<SecurityDeposit | null>;
  findByContractId(contractId: string): Promise<SecurityDeposit | null>;
  create(item: SecurityDeposit): Promise<SecurityDeposit>;
  update(id: string, item: Partial<SecurityDeposit>): Promise<SecurityDeposit>;
}

export interface ITransactionSecurityDepositMovementRepository {
  create(item: SecurityDepositMovement): Promise<SecurityDepositMovement>;
}


export interface TransactionDriverHealthProfile extends DriverHealthAndEmergency {
  id: string;
  companyId: string;
  driverId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ITransactionDriverHealthProfileRepository {
  findByDriverId(driverId: string): Promise<TransactionDriverHealthProfile | null>;
  upsert(item: TransactionDriverHealthProfile): Promise<TransactionDriverHealthProfile>;
}

export interface ITransactionContractRepository {
  findById(id: string): Promise<{
    id: string;
    companyId: string;
    driverId: string;
    vehicleId: string;
  } | null>;
}

export interface ITransactionContext {
  getReceivableRepo(): ITransactionReceivableRepository;
  getPayableRepo(): ITransactionPayableRepository;
  getTransactionRepo(): ITransactionFinancialTransactionRepository;
  getAccountRepo(): ITransactionFinancialAccountRepository;
  getPaymentMethodRepo?(): ITransactionPaymentMethodRepository;
  getAuditLogRepo(): ITransactionAuditLogRepository;
  getUserRepo(): ITransactionUserRepository;
  getFinancialPeriodRepo(): ITransactionFinancialPeriodRepository;
  getSecurityDepositRepo(): ITransactionSecurityDepositRepository;
  getSecurityDepositMovementRepo(): ITransactionSecurityDepositMovementRepository;
  getContractRepo(): ITransactionContractRepository;
  getDriverHealthRepo(): ITransactionDriverHealthProfileRepository;
}
