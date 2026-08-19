import {
  AccountReceivable,
  AccountPayable,
  FinancialTransaction,
  FinancialAccount,
  PaymentMethod,
  AuditLog,
  FileAttachment,
  DocumentRecord,
  DocumentSubjectType,
  User,
  FinancialPeriod,
  SecurityDeposit,
  SecurityDepositMovement,
  DriverHealthAndEmergency,
  Driver,
  Vehicle,
  KmRecord,
  Contract,
  ContractTemplate,
  ContractArtifact,
  ContractArtifactType,
} from '../../types/entities';

export interface TransactionFilterOptions {
  companyId?: string;
}

export interface TransactionFinancialPeriodFilterOptions {
  companyId?: string;
}

export interface ITransactionDriverRepository {
  findByIdForCompany(companyId: string, id: string): Promise<Driver | null>;
  findByIdForCompanyWithLock(companyId: string, id: string): Promise<Driver | null>;
  findAllByCompany(companyId: string): Promise<Driver[]>;
  findByCpf(companyId: string, cpf: string): Promise<Driver | null>;
  findByCnh(companyId: string, cnh: string): Promise<Driver | null>;
  create(item: Driver): Promise<Driver>;
  updateForCompany(companyId: string, id: string, item: Driver): Promise<Driver | null>;
}

export interface ITransactionVehicleRepository {
  findByIdForCompany(companyId: string, id: string): Promise<Vehicle | null>;
  findByIdForCompanyWithLock(companyId: string, id: string): Promise<Vehicle | null>;
  findAllByCompany(companyId: string): Promise<Vehicle[]>;
  findByPlate(companyId: string, plate: string): Promise<Vehicle | null>;
  findByRenavam(companyId: string, renavam: string): Promise<Vehicle | null>;
  create(item: Vehicle): Promise<Vehicle>;
  updateForCompany(companyId: string, id: string, item: Partial<Vehicle>): Promise<Vehicle | null>;
}

export interface ITransactionKmRecordRepository {
  findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<KmRecord[]>;
  create(item: KmRecord): Promise<KmRecord>;
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

export interface ITransactionAttachmentRepository {
  findByIdForCompany(companyId: string, id: string): Promise<FileAttachment | null>;
  findAllByCompany(companyId: string): Promise<FileAttachment[]>;
  findByEntity(companyId: string, entityType: string, entityId: string): Promise<FileAttachment[]>;
  create(item: FileAttachment): Promise<FileAttachment>;
  updateForCompany(
    companyId: string,
    id: string,
    item: Partial<Pick<FileAttachment, 'isArchived' | 'contentState'>>
  ): Promise<FileAttachment | null>;
}

export interface TransactionDocumentFilters {
  subjectType?: DocumentSubjectType;
  subjectId?: string;
  documentType?: string;
  referenceYear?: number;
  currentOnly?: boolean;
  includeArchived?: boolean;
}

export interface ITransactionDocumentRepository {
  findByIdForCompany(companyId: string, id: string): Promise<DocumentRecord | null>;
  findAllByCompany(companyId: string, filters?: TransactionDocumentFilters): Promise<DocumentRecord[]>;
  findVersions(
    companyId: string,
    subjectType: DocumentSubjectType,
    subjectId: string,
    documentType: string,
    referenceYear?: number
  ): Promise<DocumentRecord[]>;
  findCurrentWithLock(
    companyId: string,
    subjectType: DocumentSubjectType,
    subjectId: string,
    documentType: string,
    referenceYear?: number
  ): Promise<DocumentRecord | null>;
  create(item: DocumentRecord): Promise<DocumentRecord>;
  updateForCompany(
    companyId: string,
    id: string,
    item: Partial<Pick<DocumentRecord, 'isCurrent' | 'isArchived' | 'payableId' | 'updatedAt'>>
  ): Promise<DocumentRecord | null>;
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
  findById(id: string): Promise<Contract | null>;
  findByIdForCompany(companyId: string, id: string): Promise<Contract | null>;
  findByIdForCompanyWithLock(companyId: string, id: string): Promise<Contract | null>;
  findAllByCompany(companyId: string): Promise<Contract[]>;
  findByNumber(companyId: string, contractNumber: string): Promise<Contract | null>;
  findActiveByVehicle(companyId: string, vehicleId: string, excludeContractId?: string): Promise<Contract | null>;
  findActiveByDriver(companyId: string, driverId: string, excludeContractId?: string): Promise<Contract | null>;
  create(item: Contract): Promise<Contract>;
  updateForCompany(companyId: string, id: string, item: Partial<Contract>): Promise<Contract | null>;
}

export interface ITransactionContractTemplateRepository {
  findByIdForCompany(companyId: string, id: string): Promise<ContractTemplate | null>;
  findByIdForCompanyWithLock(companyId: string, id: string): Promise<ContractTemplate | null>;
  findAllByCompany(companyId: string, includeArchived?: boolean): Promise<ContractTemplate[]>;
  findVersions(companyId: string, templateKey: string): Promise<ContractTemplate[]>;
  findCurrentWithLock(companyId: string, templateKey: string): Promise<ContractTemplate | null>;
  create(item: ContractTemplate): Promise<ContractTemplate>;
  updateForCompany(
    companyId: string,
    id: string,
    item: Partial<Pick<ContractTemplate, 'isCurrent' | 'isActive' | 'isArchived' | 'updatedAt'>>
  ): Promise<ContractTemplate | null>;
}

export interface ITransactionContractArtifactRepository {
  findByIdForCompany(companyId: string, id: string): Promise<ContractArtifact | null>;
  findCurrentForContract(
    companyId: string,
    contractId: string,
    artifactType: ContractArtifactType,
    lock?: boolean
  ): Promise<ContractArtifact | null>;
  findAllForContract(companyId: string, contractId: string): Promise<ContractArtifact[]>;
  create(item: ContractArtifact): Promise<ContractArtifact>;
  updateForCompany(
    companyId: string,
    id: string,
    item: Partial<Pick<ContractArtifact, 'isCurrent' | 'isArchived' | 'updatedAt'>>
  ): Promise<ContractArtifact | null>;
}

export interface ITransactionContext {
  getDriverRepo(): ITransactionDriverRepository;
  getVehicleRepo(): ITransactionVehicleRepository;
  getKmRecordRepo(): ITransactionKmRecordRepository;
  getReceivableRepo(): ITransactionReceivableRepository;
  getPayableRepo(): ITransactionPayableRepository;
  getTransactionRepo(): ITransactionFinancialTransactionRepository;
  getAccountRepo(): ITransactionFinancialAccountRepository;
  getPaymentMethodRepo?(): ITransactionPaymentMethodRepository;
  getAuditLogRepo(): ITransactionAuditLogRepository;
  getAttachmentRepo(): ITransactionAttachmentRepository;
  getDocumentRepo(): ITransactionDocumentRepository;
  getUserRepo(): ITransactionUserRepository;
  getFinancialPeriodRepo(): ITransactionFinancialPeriodRepository;
  getSecurityDepositRepo(): ITransactionSecurityDepositRepository;
  getSecurityDepositMovementRepo(): ITransactionSecurityDepositMovementRepository;
  getContractRepo(): ITransactionContractRepository;
  getContractTemplateRepo(): ITransactionContractTemplateRepository;
  getContractArtifactRepo(): ITransactionContractArtifactRepository;
  getDriverHealthRepo(): ITransactionDriverHealthProfileRepository;
}
