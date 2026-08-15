// AutoERP Repository Interfaces

import {
  Vehicle,
  Driver,
  Contract,
  ContractTemplate,
  FinancialAccount,
  PaymentMethod,
  FinancialCategory,
  SecurityDeposit,
  SecurityDepositMovement,
  AccountReceivable,
  AccountPayable,
  FinancialTransaction,
  RecurringRule,
  Supplier,
  Maintenance,
  Part,
  ServiceItem,
  WorkOrder,
  OilChangeRecord,
  TireRecord,
  VehicleDocument,
  DriverDocument,
  Insurance,
  Tracker,
  TrafficTicket,
  KmRecord,
  AuditLog,
  FileAttachment,
  ArchivedRecord,
  Notification,
  BankStatementEntry,
  FinancialPeriod,
  CommunicationLog,
} from '../../types/entities';

export interface FilterOptions {
  companyId?: string;
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  vehicleId?: string;
  driverId?: string;
  supplierId?: string;
  isArchived?: boolean;
}

export type TenantFilterOptions = Omit<FilterOptions, 'companyId'>;

export interface ITenantSafeRepository<T> {
  findByIdForCompany(id: string, companyId: string): Promise<T | null>;
  findAllForCompany(companyId: string, filters?: TenantFilterOptions): Promise<T[]>;
  createForCompany(companyId: string, item: T): Promise<T>;
  updateForCompany(id: string, companyId: string, item: Partial<T>): Promise<T>;
  deleteForCompany(id: string, companyId: string): Promise<boolean>;
  countForCompany(companyId: string, filters?: TenantFilterOptions): Promise<number>;
}

export interface IBaseRepository<T> {
  // Legacy methods (preserved for backward compatibility during transition)
  findById(id: string): Promise<T | null>;
  findAll(filters?: FilterOptions): Promise<T[]>;
  create(item: T): Promise<T>;
  update(id: string, item: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  count(filters?: FilterOptions): Promise<number>;

  // Tenant-safe explicit methods (optional in base interface for adapter structural compatibility)
  findByIdForCompany?(id: string, companyId: string): Promise<T | null>;
  findAllForCompany?(companyId: string, filters?: TenantFilterOptions): Promise<T[]>;
  createForCompany?(companyId: string, item: T): Promise<T>;
  updateForCompany?(id: string, companyId: string, item: Partial<T>): Promise<T>;
  deleteForCompany?(id: string, companyId: string): Promise<boolean>;
  countForCompany?(companyId: string, filters?: TenantFilterOptions): Promise<number>;
}

export interface IVehicleRepository extends IBaseRepository<Vehicle> {
  findByPlate(plate: string): Promise<Vehicle | null>;
  findByRenavam(renavam: string): Promise<Vehicle | null>;
  getAvailableVehicles(companyId: string): Promise<Vehicle[]>;
  findByPlateForCompany?(companyId: string, plate: string): Promise<Vehicle | null>;
  findByRenavamForCompany?(companyId: string, renavam: string): Promise<Vehicle | null>;
}

export interface IDriverRepository extends IBaseRepository<Driver> {
  findByCpf(cpf: string): Promise<Driver | null>;
  findByCnh(cnh: string): Promise<Driver | null>;
  findByCpfForCompany?(companyId: string, cpf: string): Promise<Driver | null>;
  findByCnhForCompany?(companyId: string, cnh: string): Promise<Driver | null>;
}

export interface IContractRepository extends IBaseRepository<Contract> {
  findActiveByVehicleId(vehicleId: string): Promise<Contract | null>;
  findActiveByDriverId(driverId: string): Promise<Contract | null>;
  findActiveByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<Contract | null>;
  findActiveByDriverIdForCompany?(companyId: string, driverId: string): Promise<Contract | null>;
}

export interface IFinancialAccountRepository extends IBaseRepository<FinancialAccount> {
  updateBalance(accountId: string, delta: number): Promise<FinancialAccount>;
  updateBalanceForCompany?(companyId: string, accountId: string, delta: number): Promise<FinancialAccount>;
}

export interface IAccountReceivableRepository extends IBaseRepository<AccountReceivable> {
  findByIdempotencyKey(key: string): Promise<AccountReceivable | null>;
  findByContractId(contractId: string): Promise<AccountReceivable[]>;
  findByDriverId(driverId: string): Promise<AccountReceivable[]>;
  findByVehicleId(vehicleId: string): Promise<AccountReceivable[]>;
  findOverdue(companyId: string): Promise<AccountReceivable[]>;
  findByIdempotencyKeyForCompany?(companyId: string, key: string): Promise<AccountReceivable | null>;
  findByContractIdForCompany?(companyId: string, contractId: string): Promise<AccountReceivable[]>;
  findByDriverIdForCompany?(companyId: string, driverId: string): Promise<AccountReceivable[]>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<AccountReceivable[]>;
}

export interface IAccountPayableRepository extends IBaseRepository<AccountPayable> {
  findByIdempotencyKey(key: string): Promise<AccountPayable | null>;
  findByVehicleId(vehicleId: string): Promise<AccountPayable[]>;
  findBySupplierId(supplierId: string): Promise<AccountPayable[]>;
  findOverdue(companyId: string): Promise<AccountPayable[]>;
  findByIdempotencyKeyForCompany?(companyId: string, key: string): Promise<AccountPayable | null>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<AccountPayable[]>;
  findBySupplierIdForCompany?(companyId: string, supplierId: string): Promise<AccountPayable[]>;
}

export interface IFinancialTransactionRepository extends IBaseRepository<FinancialTransaction> {
  findByReceivableId(receivableId: string): Promise<FinancialTransaction[]>;
  findByPayableId(payableId: string): Promise<FinancialTransaction[]>;
  findByVehicleId(vehicleId: string): Promise<FinancialTransaction[]>;
  findByReceivableIdForCompany?(companyId: string, receivableId: string): Promise<FinancialTransaction[]>;
  findByPayableIdForCompany?(companyId: string, payableId: string): Promise<FinancialTransaction[]>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<FinancialTransaction[]>;
}

export interface ISecurityDepositRepository extends IBaseRepository<SecurityDeposit> {
  findByContractId(contractId: string): Promise<SecurityDeposit | null>;
  findByDriverId(driverId: string): Promise<SecurityDeposit[]>;
  findByContractIdForCompany?(companyId: string, contractId: string): Promise<SecurityDeposit | null>;
  findByDriverIdForCompany?(companyId: string, driverId: string): Promise<SecurityDeposit[]>;
}

export interface ISecurityDepositMovementRepository extends IBaseRepository<SecurityDepositMovement> {
  findByDepositId(depositId: string): Promise<SecurityDepositMovement[]>;
  findByDepositIdForCompany?(companyId: string, depositId: string): Promise<SecurityDepositMovement[]>;
}

export interface IMaintenanceRepository extends IBaseRepository<Maintenance> {
  findByVehicleId(vehicleId: string): Promise<Maintenance[]>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<Maintenance[]>;
}

export interface ITrafficTicketRepository extends IBaseRepository<TrafficTicket> {
  findByVehicleId(vehicleId: string): Promise<TrafficTicket[]>;
  findByDriverId(driverId: string): Promise<TrafficTicket[]>;
  findByAutoNumber(autoNumber: string): Promise<TrafficTicket | null>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<TrafficTicket[]>;
  findByDriverIdForCompany?(companyId: string, driverId: string): Promise<TrafficTicket[]>;
  findByAutoNumberForCompany?(companyId: string, autoNumber: string): Promise<TrafficTicket | null>;
}

export interface IVehicleDocumentRepository extends IBaseRepository<VehicleDocument> {
  findByVehicleId(vehicleId: string): Promise<VehicleDocument[]>;
  findExpiring(companyId: string, daysAhead: number): Promise<VehicleDocument[]>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<VehicleDocument[]>;
}

export interface IDriverDocumentRepository extends IBaseRepository<DriverDocument> {
  findByDriverId(driverId: string): Promise<DriverDocument[]>;
  findByDriverIdForCompany?(companyId: string, driverId: string): Promise<DriverDocument[]>;
}

export interface IInsuranceRepository extends IBaseRepository<Insurance> {
  findByVehicleId(vehicleId: string): Promise<Insurance[]>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<Insurance[]>;
}

export interface ITrackerRepository extends IBaseRepository<Tracker> {
  findByVehicleId(vehicleId: string): Promise<Tracker | null>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<Tracker | null>;
}

export interface IKmRecordRepository extends IBaseRepository<KmRecord> {
  findByVehicleId(vehicleId: string): Promise<KmRecord[]>;
  getLatestForVehicle(vehicleId: string): Promise<KmRecord | null>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<KmRecord[]>;
  getLatestForVehicleForCompany?(companyId: string, vehicleId: string): Promise<KmRecord | null>;
}

export interface ISupplierRepository extends IBaseRepository<Supplier> {}
export interface IPartRepository extends IBaseRepository<Part> {}
export interface IServiceItemRepository extends IBaseRepository<ServiceItem> {}
export interface IWorkOrderRepository extends IBaseRepository<WorkOrder> {
  findByVehicleId(vehicleId: string): Promise<WorkOrder[]>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<WorkOrder[]>;
}
export interface IOilChangeRepository extends IBaseRepository<OilChangeRecord> {
  findByVehicleId(vehicleId: string): Promise<OilChangeRecord[]>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<OilChangeRecord[]>;
}
export interface ITireRepository extends IBaseRepository<TireRecord> {
  findByVehicleId(vehicleId: string): Promise<TireRecord[]>;
  findByVehicleIdForCompany?(companyId: string, vehicleId: string): Promise<TireRecord[]>;
}
export interface IFinancialCategoryRepository extends IBaseRepository<FinancialCategory> {}
export interface IPaymentMethodRepository extends IBaseRepository<PaymentMethod> {}
export interface IContractTemplateRepository extends IBaseRepository<ContractTemplate> {}
export interface IRecurringRuleRepository extends IBaseRepository<RecurringRule> {}
export interface IAuditLogRepository extends IBaseRepository<AuditLog> {}
export interface IFileAttachmentRepository extends IBaseRepository<FileAttachment> {}
export interface IArchivedRecordRepository extends IBaseRepository<ArchivedRecord> {}
export interface INotificationRepository extends IBaseRepository<Notification> {
  getUnreadCount(companyId: string): Promise<number>;
  markAllAsRead(companyId: string): Promise<void>;
}

export interface IBankStatementEntryRepository extends IBaseRepository<BankStatementEntry> {}
export interface IFinancialPeriodRepository extends IBaseRepository<FinancialPeriod> {}
export interface ICommunicationLogRepository extends IBaseRepository<CommunicationLog> {
  findByDriverId(driverId: string): Promise<CommunicationLog[]>;
  findByDriverIdForCompany?(companyId: string, driverId: string): Promise<CommunicationLog[]>;
}
