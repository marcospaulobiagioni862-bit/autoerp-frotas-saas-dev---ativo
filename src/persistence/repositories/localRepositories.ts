// AutoERP Concrete Repositories Implementation

import { StorageAdapter } from '../adapters/storageAdapter';
import {
  FilterOptions,
  TenantFilterOptions,
  IBaseRepository,
  IVehicleRepository,
  IDriverRepository,
  IContractRepository,
  IFinancialAccountRepository,
  IAccountReceivableRepository,
  IAccountPayableRepository,
  IFinancialTransactionRepository,
  ISecurityDepositRepository,
  ISecurityDepositMovementRepository,
  IMaintenanceRepository,
  ITrafficTicketRepository,
  IVehicleDocumentRepository,
  IDriverDocumentRepository,
  IInsuranceRepository,
  ITrackerRepository,
  IKmRecordRepository,
  ISupplierRepository,
  IPartRepository,
  IServiceItemRepository,
  IWorkOrderRepository,
  IOilChangeRepository,
  ITireRepository,
  IFinancialCategoryRepository,
  IPaymentMethodRepository,
  IContractTemplateRepository,
  IRecurringRuleRepository,
  IAuditLogRepository,
  IFileAttachmentRepository,
  IArchivedRecordRepository,
  INotificationRepository,
  IBankStatementEntryRepository,
  IFinancialPeriodRepository,
  ICommunicationLogRepository,
} from './interfaces';

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

import { VehicleStatus, DriverStatus, ContractStatus, ObligationStatus } from '../../types/enums';

export class BaseRepository<T extends { id: string; companyId?: string }> implements IBaseRepository<T> {
  protected storage = StorageAdapter.getInstance();

  constructor(protected collectionName: string) {}

  /**
   * Validates that companyId is provided, non-empty, and valid for tenant scoping.
   */
  protected assertCompanyId(companyId: string): void {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('companyId is required for tenant-scoped repository operation');
    }
  }

  // --- LEGACY / UNSCOPED METHODS (Preserved for compatibility pending caller migration) ---

  async findById(id: string): Promise<T | null> {
    return this.storage.getItem<T>(this.collectionName, id);
  }

  async findAll(filters?: FilterOptions): Promise<T[]> {
    let items = await this.storage.getCollection<T>(this.collectionName);

    if (!filters) return items;

    if (filters.companyId) {
      items = items.filter((item) => !item.companyId || item.companyId === filters.companyId);
    }

    if (filters.search) {
      const s = filters.search.toLowerCase();
      items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(s));
    }

    if (filters.status && 'status' in (items[0] || {})) {
      items = items.filter((item: any) => item.status === filters.status);
    }

    if (filters.isArchived !== undefined && 'isArchived' in (items[0] || {})) {
      items = items.filter((item: any) => !!item.isArchived === filters.isArchived);
    }

    if (filters.vehicleId && 'vehicleId' in (items[0] || {})) {
      items = items.filter((item: any) => item.vehicleId === filters.vehicleId);
    }

    if (filters.driverId && 'driverId' in (items[0] || {})) {
      items = items.filter((item: any) => item.driverId === filters.driverId);
    }

    if (filters.supplierId && 'supplierId' in (items[0] || {})) {
      items = items.filter((item: any) => item.supplierId === filters.supplierId);
    }

    return items;
  }

  async create(item: T): Promise<T> {
    return this.storage.saveItem<T>(this.collectionName, item);
  }

  async update(id: string, partialItem: Partial<T>): Promise<T> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Item with id ${id} not found in ${this.collectionName}`);
    }
    const updated = {
      ...existing,
      ...partialItem,
      updatedAt: new Date().toISOString(),
    };
    return this.storage.saveItem<T>(this.collectionName, updated as T);
  }

  async delete(id: string): Promise<boolean> {
    return this.storage.removeItem(this.collectionName, id);
  }

  async count(filters?: FilterOptions): Promise<number> {
    const items = await this.findAll(filters);
    return items.length;
  }

  // --- TENANT-SAFE EXPLICIT METHODS ---

  async findByIdForCompany(id: string, companyId: string): Promise<T | null> {
    this.assertCompanyId(companyId);
    const item = await this.findById(id);
    if (!item) return null;
    if (!item.companyId || item.companyId !== companyId) {
      return null;
    }
    return item;
  }

  async findAllForCompany(companyId: string, filters?: TenantFilterOptions): Promise<T[]> {
    this.assertCompanyId(companyId);
    const fullFilters: FilterOptions = {
      ...filters,
      companyId,
    };
    const items = await this.findAll(fullFilters);
    // Strict isolation: strictly require item.companyId === companyId (never return orphan or other tenant records)
    return items.filter((item) => item.companyId === companyId);
  }

  async createForCompany(companyId: string, item: T): Promise<T> {
    this.assertCompanyId(companyId);
    if (!item || !item.companyId || typeof item.companyId !== 'string' || item.companyId.trim() === '') {
      throw new Error('Item companyId is required and cannot be empty in createForCompany');
    }
    if (item.companyId !== companyId) {
      throw new Error('Item companyId does not match repository tenant scope');
    }
    return this.create(item);
  }

  async updateForCompany(id: string, companyId: string, partialItem: Partial<T>): Promise<T> {
    this.assertCompanyId(companyId);
    const existing = await this.findById(id);
    if (!existing || !existing.companyId || existing.companyId !== companyId) {
      throw new Error(`Item with id ${id} not found or tenant mismatch in ${this.collectionName}`);
    }
    if (partialItem.companyId !== undefined) {
      if (!partialItem.companyId || typeof partialItem.companyId !== 'string' || partialItem.companyId.trim() === '' || partialItem.companyId !== companyId) {
        throw new Error('Cannot change companyId or set empty companyId during updateForCompany');
      }
    }
    const updated = {
      ...existing,
      ...partialItem,
      companyId, // Preserve verified tenant
      updatedAt: new Date().toISOString(),
    };
    return this.storage.saveItem<T>(this.collectionName, updated as T);
  }

  async deleteForCompany(id: string, companyId: string): Promise<boolean> {
    this.assertCompanyId(companyId);
    const existing = await this.findById(id);
    if (!existing || !existing.companyId || existing.companyId !== companyId) {
      throw new Error(`Item with id ${id} not found or tenant mismatch in ${this.collectionName}`);
    }
    return this.storage.removeItem(this.collectionName, id);
  }

  async countForCompany(companyId: string, filters?: TenantFilterOptions): Promise<number> {
    const items = await this.findAllForCompany(companyId, filters);
    return items.length;
  }
}

export class VehicleRepository extends BaseRepository<Vehicle> implements IVehicleRepository {
  constructor() {
    super('vehicles');
  }

  async findByPlate(plate: string): Promise<Vehicle | null> {
    const items = await this.findAll();
    return items.find((v) => v.plate.toUpperCase() === plate.toUpperCase()) || null;
  }

  async findByRenavam(renavam: string): Promise<Vehicle | null> {
    const items = await this.findAll();
    return items.find((v) => v.renavam === renavam) || null;
  }

  async getAvailableVehicles(companyId: string): Promise<Vehicle[]> {
    const items = await this.findAllForCompany(companyId);
    return items.filter((v) => v.status === VehicleStatus.AVAILABLE && !v.isArchived);
  }

  async findByPlateForCompany(companyId: string, plate: string): Promise<Vehicle | null> {
    const items = await this.findAllForCompany(companyId);
    return items.find((v) => v.plate.toUpperCase() === plate.toUpperCase()) || null;
  }

  async findByRenavamForCompany(companyId: string, renavam: string): Promise<Vehicle | null> {
    const items = await this.findAllForCompany(companyId);
    return items.find((v) => v.renavam === renavam) || null;
  }
}

export class DriverRepository extends BaseRepository<Driver> implements IDriverRepository {
  constructor() {
    super('drivers');
  }

  async findByCpf(cpf: string): Promise<Driver | null> {
    const cleanCpf = cpf.replace(/\D/g, '');
    const items = await this.findAll();
    return items.find((d) => d.cpf.replace(/\D/g, '') === cleanCpf) || null;
  }

  async findByCnh(cnh: string): Promise<Driver | null> {
    const cleanCnh = cnh.replace(/\D/g, '');
    const items = await this.findAll();
    return items.find((d) => d.cnhNumber.replace(/\D/g, '') === cleanCnh) || null;
  }

  async findByCpfForCompany(companyId: string, cpf: string): Promise<Driver | null> {
    const cleanCpf = cpf.replace(/\D/g, '');
    const items = await this.findAllForCompany(companyId);
    return items.find((d) => d.cpf.replace(/\D/g, '') === cleanCpf) || null;
  }

  async findByCnhForCompany(companyId: string, cnh: string): Promise<Driver | null> {
    const cleanCnh = cnh.replace(/\D/g, '');
    const items = await this.findAllForCompany(companyId);
    return items.find((d) => d.cnhNumber.replace(/\D/g, '') === cleanCnh) || null;
  }
}

export class ContractRepository extends BaseRepository<Contract> implements IContractRepository {
  constructor() {
    super('contracts');
  }

  async findActiveByVehicleId(vehicleId: string): Promise<Contract | null> {
    const items = await this.findAll({ vehicleId });
    return items.find((c) => c.status === ContractStatus.ACTIVE && !c.isArchived) || null;
  }

  async findActiveByDriverId(driverId: string): Promise<Contract | null> {
    const items = await this.findAll({ driverId });
    return items.find((c) => c.status === ContractStatus.ACTIVE && !c.isArchived) || null;
  }

  async findActiveByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<Contract | null> {
    const items = await this.findAllForCompany(companyId, { vehicleId });
    return items.find((c) => c.status === ContractStatus.ACTIVE && !c.isArchived) || null;
  }

  async findActiveByDriverIdForCompany(companyId: string, driverId: string): Promise<Contract | null> {
    const items = await this.findAllForCompany(companyId, { driverId });
    return items.find((c) => c.status === ContractStatus.ACTIVE && !c.isArchived) || null;
  }
}

export class FinancialAccountRepository extends BaseRepository<FinancialAccount> implements IFinancialAccountRepository {
  constructor() {
    super('financialAccounts');
  }

  async updateBalance(accountId: string, delta: number): Promise<FinancialAccount> {
    const acc = await this.findById(accountId);
    if (!acc) throw new Error(`Financial account ${accountId} not found`);

    const newBalance = acc.currentBalance + delta;
    return this.update(accountId, { currentBalance: newBalance });
  }

  async updateBalanceForCompany(companyId: string, accountId: string, delta: number): Promise<FinancialAccount> {
    const acc = await this.findByIdForCompany(accountId, companyId);
    if (!acc) throw new Error(`Financial account ${accountId} not found in company ${companyId}`);

    const newBalance = acc.currentBalance + delta;
    return this.updateForCompany(accountId, companyId, { currentBalance: newBalance });
  }
}

export class AccountReceivableRepository extends BaseRepository<AccountReceivable> implements IAccountReceivableRepository {
  constructor() {
    super('accountsReceivable');
  }

  async findByIdempotencyKey(key: string): Promise<AccountReceivable | null> {
    const items = await this.findAll();
    return items.find((r) => r.idempotencyKey === key) || null;
  }

  async findByContractId(contractId: string): Promise<AccountReceivable[]> {
    const items = await this.findAll();
    return items.filter((r) => r.contractId === contractId);
  }

  async findByDriverId(driverId: string): Promise<AccountReceivable[]> {
    const items = await this.findAll({ driverId });
    return items;
  }

  async findByVehicleId(vehicleId: string): Promise<AccountReceivable[]> {
    const items = await this.findAll({ vehicleId });
    return items;
  }

  async findOverdue(companyId: string): Promise<AccountReceivable[]> {
    const items = await this.findAllForCompany(companyId);
    const today = new Date().toISOString().split('T')[0];
    return items.filter(
      (r) =>
        (r.status === ObligationStatus.PENDING || r.status === ObligationStatus.PARTIALLY_PAID) &&
        r.dueDate < today
    );
  }

  async findByIdempotencyKeyForCompany(companyId: string, key: string): Promise<AccountReceivable | null> {
    const items = await this.findAllForCompany(companyId);
    return items.find((r) => r.idempotencyKey === key) || null;
  }

  async findByContractIdForCompany(companyId: string, contractId: string): Promise<AccountReceivable[]> {
    const items = await this.findAllForCompany(companyId);
    return items.filter((r) => r.contractId === contractId);
  }

  async findByDriverIdForCompany(companyId: string, driverId: string): Promise<AccountReceivable[]> {
    return this.findAllForCompany(companyId, { driverId });
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<AccountReceivable[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }
}

export class AccountPayableRepository extends BaseRepository<AccountPayable> implements IAccountPayableRepository {
  constructor() {
    super('accountsPayable');
  }

  async findByIdempotencyKey(key: string): Promise<AccountPayable | null> {
    const items = await this.findAll();
    return items.find((p) => p.idempotencyKey === key) || null;
  }

  async findByVehicleId(vehicleId: string): Promise<AccountPayable[]> {
    return this.findAll({ vehicleId });
  }

  async findBySupplierId(supplierId: string): Promise<AccountPayable[]> {
    return this.findAll({ supplierId });
  }

  async findOverdue(companyId: string): Promise<AccountPayable[]> {
    const items = await this.findAllForCompany(companyId);
    const today = new Date().toISOString().split('T')[0];
    return items.filter(
      (p) =>
        (p.status === ObligationStatus.PENDING || p.status === ObligationStatus.PARTIALLY_PAID) &&
        p.dueDate < today
    );
  }

  async findByIdempotencyKeyForCompany(companyId: string, key: string): Promise<AccountPayable | null> {
    const items = await this.findAllForCompany(companyId);
    return items.find((p) => p.idempotencyKey === key) || null;
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<AccountPayable[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }

  async findBySupplierIdForCompany(companyId: string, supplierId: string): Promise<AccountPayable[]> {
    return this.findAllForCompany(companyId, { supplierId });
  }
}

export class FinancialTransactionRepository extends BaseRepository<FinancialTransaction> implements IFinancialTransactionRepository {
  constructor() {
    super('financialTransactions');
  }

  async findByReceivableId(receivableId: string): Promise<FinancialTransaction[]> {
    const items = await this.findAll();
    return items.filter((t) => t.receivableId === receivableId && !t.isReversed);
  }

  async findByPayableId(payableId: string): Promise<FinancialTransaction[]> {
    const items = await this.findAll();
    return items.filter((t) => t.payableId === payableId && !t.isReversed);
  }

  async findByVehicleId(vehicleId: string): Promise<FinancialTransaction[]> {
    return this.findAll({ vehicleId });
  }

  async findByReceivableIdForCompany(companyId: string, receivableId: string): Promise<FinancialTransaction[]> {
    const items = await this.findAllForCompany(companyId);
    return items.filter((t) => t.receivableId === receivableId && !t.isReversed);
  }

  async findByPayableIdForCompany(companyId: string, payableId: string): Promise<FinancialTransaction[]> {
    const items = await this.findAllForCompany(companyId);
    return items.filter((t) => t.payableId === payableId && !t.isReversed);
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<FinancialTransaction[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }
}

export class SecurityDepositRepository extends BaseRepository<SecurityDeposit> implements ISecurityDepositRepository {
  constructor() {
    super('securityDeposits');
  }

  async findByContractId(contractId: string): Promise<SecurityDeposit | null> {
    const items = await this.findAll();
    return items.find((s) => s.contractId === contractId) || null;
  }

  async findByDriverId(driverId: string): Promise<SecurityDeposit[]> {
    return this.findAll({ driverId });
  }

  async findByContractIdForCompany(companyId: string, contractId: string): Promise<SecurityDeposit | null> {
    const items = await this.findAllForCompany(companyId);
    return items.find((s) => s.contractId === contractId) || null;
  }

  async findByDriverIdForCompany(companyId: string, driverId: string): Promise<SecurityDeposit[]> {
    return this.findAllForCompany(companyId, { driverId });
  }
}

export class SecurityDepositMovementRepository extends BaseRepository<SecurityDepositMovement> implements ISecurityDepositMovementRepository {
  constructor() {
    super('securityDepositMovements');
  }

  async findByDepositId(depositId: string): Promise<SecurityDepositMovement[]> {
    const items = await this.findAll();
    return items.filter((m) => m.securityDepositId === depositId);
  }

  async findByDepositIdForCompany(companyId: string, depositId: string): Promise<SecurityDepositMovement[]> {
    const items = await this.findAllForCompany(companyId);
    return items.filter((m) => m.securityDepositId === depositId);
  }
}

export class MaintenanceRepository extends BaseRepository<Maintenance> implements IMaintenanceRepository {
  constructor() {
    super('maintenances');
  }

  async findByVehicleId(vehicleId: string): Promise<Maintenance[]> {
    return this.findAll({ vehicleId });
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<Maintenance[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }
}

export class TrafficTicketRepository extends BaseRepository<TrafficTicket> implements ITrafficTicketRepository {
  constructor() {
    super('trafficTickets');
  }

  async findByVehicleId(vehicleId: string): Promise<TrafficTicket[]> {
    return this.findAll({ vehicleId });
  }

  async findByDriverId(driverId: string): Promise<TrafficTicket[]> {
    return this.findAll({ driverId });
  }

  async findByAutoNumber(autoNumber: string): Promise<TrafficTicket | null> {
    const items = await this.findAll();
    return items.find((t) => t.autoNumber.toUpperCase() === autoNumber.toUpperCase()) || null;
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<TrafficTicket[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }

  async findByDriverIdForCompany(companyId: string, driverId: string): Promise<TrafficTicket[]> {
    return this.findAllForCompany(companyId, { driverId });
  }

  async findByAutoNumberForCompany(companyId: string, autoNumber: string): Promise<TrafficTicket | null> {
    const items = await this.findAllForCompany(companyId);
    return items.find((t) => t.autoNumber.toUpperCase() === autoNumber.toUpperCase()) || null;
  }
}

export class VehicleDocumentRepository extends BaseRepository<VehicleDocument> implements IVehicleDocumentRepository {
  constructor() {
    super('vehicleDocuments');
  }

  async findByVehicleId(vehicleId: string): Promise<VehicleDocument[]> {
    return this.findAll({ vehicleId });
  }

  async findExpiring(companyId: string, daysAhead: number): Promise<VehicleDocument[]> {
    const items = await this.findAllForCompany(companyId);
    const today = new Date();
    const futureLimit = new Date();
    futureLimit.setDate(today.getDate() + daysAhead);

    const todayStr = today.toISOString().split('T')[0];
    const futureStr = futureLimit.toISOString().split('T')[0];

    return items.filter((d) => d.expirationDate >= todayStr && d.expirationDate <= futureStr);
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<VehicleDocument[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }
}

export class DriverDocumentRepository extends BaseRepository<DriverDocument> implements IDriverDocumentRepository {
  constructor() {
    super('driverDocuments');
  }

  async findByDriverId(driverId: string): Promise<DriverDocument[]> {
    return this.findAll({ driverId });
  }

  async findByDriverIdForCompany(companyId: string, driverId: string): Promise<DriverDocument[]> {
    return this.findAllForCompany(companyId, { driverId });
  }
}

export class InsuranceRepository extends BaseRepository<Insurance> implements IInsuranceRepository {
  constructor() {
    super('insurances');
  }

  async findByVehicleId(vehicleId: string): Promise<Insurance[]> {
    return this.findAll({ vehicleId });
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<Insurance[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }
}

export class TrackerRepository extends BaseRepository<Tracker> implements ITrackerRepository {
  constructor() {
    super('trackers');
  }

  async findByVehicleId(vehicleId: string): Promise<Tracker | null> {
    const items = await this.findAll({ vehicleId });
    return items.find((t) => t.status === 'ACTIVE') || items[0] || null;
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<Tracker | null> {
    const items = await this.findAllForCompany(companyId, { vehicleId });
    return items.find((t) => t.status === 'ACTIVE') || items[0] || null;
  }
}

export class KmRecordRepository extends BaseRepository<KmRecord> implements IKmRecordRepository {
  constructor() {
    super('kmRecords');
  }

  async findByVehicleId(vehicleId: string): Promise<KmRecord[]> {
    const items = await this.findAll({ vehicleId });
    return items.sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime());
  }

  async getLatestForVehicle(vehicleId: string): Promise<KmRecord | null> {
    const records = await this.findByVehicleId(vehicleId);
    return records[0] || null;
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<KmRecord[]> {
    const items = await this.findAllForCompany(companyId, { vehicleId });
    return items.sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime());
  }

  async getLatestForVehicleForCompany(companyId: string, vehicleId: string): Promise<KmRecord | null> {
    const records = await this.findByVehicleIdForCompany(companyId, vehicleId);
    return records[0] || null;
  }
}

export class SupplierRepository extends BaseRepository<Supplier> implements ISupplierRepository {
  constructor() { super('suppliers'); }
}

export class PartRepository extends BaseRepository<Part> implements IPartRepository {
  constructor() { super('parts'); }
}

export class ServiceItemRepository extends BaseRepository<ServiceItem> implements IServiceItemRepository {
  constructor() { super('serviceItems'); }
}

export class WorkOrderRepository extends BaseRepository<WorkOrder> implements IWorkOrderRepository {
  constructor() { super('workOrders'); }
  async findByVehicleId(vehicleId: string): Promise<WorkOrder[]> {
    return this.findAll({ vehicleId });
  }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<WorkOrder[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }
}

export class OilChangeRepository extends BaseRepository<OilChangeRecord> implements IOilChangeRepository {
  constructor() { super('oilChanges'); }
  async findByVehicleId(vehicleId: string): Promise<OilChangeRecord[]> {
    return this.findAll({ vehicleId });
  }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<OilChangeRecord[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }
}

export class TireRepository extends BaseRepository<TireRecord> implements ITireRepository {
  constructor() { super('tires'); }
  async findByVehicleId(vehicleId: string): Promise<TireRecord[]> {
    return this.findAll({ vehicleId });
  }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<TireRecord[]> {
    return this.findAllForCompany(companyId, { vehicleId });
  }
}

export class FinancialCategoryRepository extends BaseRepository<FinancialCategory> implements IFinancialCategoryRepository {
  constructor() { super('financialCategories'); }
}

export class PaymentMethodRepository extends BaseRepository<PaymentMethod> implements IPaymentMethodRepository {
  constructor() { super('paymentMethods'); }
}

export class ContractTemplateRepository extends BaseRepository<ContractTemplate> implements IContractTemplateRepository {
  constructor() { super('contractTemplates'); }
}

export class RecurringRuleRepository extends BaseRepository<RecurringRule> implements IRecurringRuleRepository {
  constructor() { super('recurringRules'); }
}

export class AuditLogRepository extends BaseRepository<AuditLog> implements IAuditLogRepository {
  constructor() { super('auditLogs'); }

  override async update(id: string, item: Partial<AuditLog>): Promise<AuditLog> {
    throw new Error('Acesso negado: Logs de auditoria são imutáveis');
  }

  override async delete(id: string): Promise<boolean> {
    throw new Error('Acesso negado: Logs de auditoria são imutáveis');
  }

  override async updateForCompany(id: string, companyId: string, partialItem: Partial<AuditLog>): Promise<AuditLog> {
    throw new Error('Acesso negado: Logs de auditoria são imutáveis');
  }

  override async deleteForCompany(id: string, companyId: string): Promise<boolean> {
    throw new Error('Acesso negado: Logs de auditoria são imutáveis');
  }
}

export class FileAttachmentRepository extends BaseRepository<FileAttachment> implements IFileAttachmentRepository {
  constructor() { super('fileAttachments'); }
}

export class ArchivedRecordRepository extends BaseRepository<ArchivedRecord> implements IArchivedRecordRepository {
  constructor() { super('archivedRecords'); }
}

export class NotificationRepository extends BaseRepository<Notification> implements INotificationRepository {
  constructor() {
    super('notifications');
  }

  async getUnreadCount(companyId: string): Promise<number> {
    const items = await this.findAllForCompany(companyId);
    return items.filter((n) => !n.read).length;
  }

  async markAllAsRead(companyId: string): Promise<void> {
    const items = await this.findAllForCompany(companyId);
    const unread = items.filter((n) => !n.read);
    for (const item of unread) {
      await this.updateForCompany(item.id, companyId, { read: true });
    }
  }
}

export class BankStatementEntryRepository extends BaseRepository<BankStatementEntry> implements IBankStatementEntryRepository {
  constructor() {
    super('bankStatementEntries');
  }
}

export class FinancialPeriodRepository extends BaseRepository<FinancialPeriod> implements IFinancialPeriodRepository {
  constructor() {
    super('financialPeriods');
  }
}

export class CommunicationLogRepository extends BaseRepository<CommunicationLog> implements ICommunicationLogRepository {
  constructor() {
    super('communicationLogs');
  }

  async findByDriverId(driverId: string): Promise<CommunicationLog[]> {
    const logs = await this.findAll();
    return logs.filter((l) => l.driverId === driverId)
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  }

  async findByDriverIdForCompany(companyId: string, driverId: string): Promise<CommunicationLog[]> {
    const logs = await this.findAllForCompany(companyId);
    return logs.filter((l) => l.driverId === driverId)
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  }
}
