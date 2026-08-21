// SECURITY-2N browser compatibility adapter.
// The old repository class names are intentionally preserved so legacy read-only
// views can migrate without a large UI rewrite. In the browser, every supported
// read goes through authenticated server APIs and every legacy write fails closed.

import type {
  AccountPayable,
  AccountReceivable,
  Contract,
  Driver,
  DriverDocument,
  FinancialAccount,
  FinancialTransaction,
  Insurance,
  KmRecord,
  Maintenance,
  OilChangeRecord,
  Part,
  PaymentMethod,
  Supplier,
  TireRecord,
  Tracker,
  TrafficTicket,
  Vehicle,
  VehicleDocument,
  WorkOrder,
} from '../../types/entities';
import {
  ContractStatus,
  MaintenanceStatus,
  MaintenanceType,
  ObligationStatus,
  VehicleStatus,
} from '../../types/enums';
import { ContractClient } from '../../api/contractClient';
import { DocumentClient } from '../../api/documentClient';
import { DriverClient } from '../../api/driverClient';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import { FinanceSettlementClient } from '../../api/financeSettlementClient';
import { FinanceTransactionClient } from '../../api/financeTransactionClient';
import { InsuranceClient } from '../../api/insuranceClient';
import { MaintenanceClient } from '../../api/maintenanceClient';
import { MaintenancePreventiveClient } from '../../api/maintenancePreventiveClient';
import { TrackerClient } from '../../api/trackerClient';
import { TrafficTicketClient } from '../../api/trafficTicketClient';
import { VehicleClient } from '../../api/vehicleClient';

type AnyEntity = { id: string; companyId?: string; [key: string]: any };
type ReadFilters = {
  companyId?: string;
  search?: string;
  status?: string;
  isArchived?: boolean;
  vehicleId?: string;
  driverId?: string;
  supplierId?: string;
};

type SessionPrincipal = { companyId: string };
let principalCache: { expiresAt: number; promise: Promise<SessionPrincipal> } | null = null;

async function sessionPrincipal(): Promise<SessionPrincipal> {
  const now = Date.now();
  if (principalCache && principalCache.expiresAt > now) return principalCache.promise;
  const promise = (async () => {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`SERVER_AUTHORITY_SESSION_REQUIRED:${response.status}`);
    const body = await response.json() as { user?: { companyId?: unknown } };
    const companyId = typeof body?.user?.companyId === 'string' ? body.user.companyId.trim() : '';
    if (!companyId) throw new Error('SERVER_AUTHORITY_INVALID_SESSION');
    return { companyId };
  })();
  principalCache = { expiresAt: now + 500, promise };
  try {
    return await promise;
  } catch (error) {
    principalCache = null;
    throw error;
  }
}

function applyFilters<T extends AnyEntity>(items: T[], filters?: ReadFilters): T[] {
  if (!filters) return items;
  let result = [...items];
  if (filters.companyId) result = result.filter((item) => item.companyId === filters.companyId);
  if (filters.status) result = result.filter((item) => item.status === filters.status);
  if (filters.isArchived !== undefined) result = result.filter((item) => Boolean(item.isArchived) === filters.isArchived);
  if (filters.vehicleId) result = result.filter((item) => item.vehicleId === filters.vehicleId || item.id === filters.vehicleId && 'plate' in item);
  if (filters.driverId) result = result.filter((item) => item.driverId === filters.driverId || item.id === filters.driverId && 'cnhNumber' in item);
  if (filters.supplierId) result = result.filter((item) => item.supplierId === filters.supplierId);
  if (filters.search) {
    const search = filters.search.toLowerCase();
    result = result.filter((item) => JSON.stringify(item).toLowerCase().includes(search));
  }
  return result;
}

function assertTenant<T extends AnyEntity>(items: T[], requestedCompanyId: string): T[] {
  if (!requestedCompanyId?.trim()) throw new Error('SERVER_AUTHORITY_COMPANY_REQUIRED');
  const foreign = items.find((item) => item.companyId && item.companyId !== requestedCompanyId);
  if (foreign) throw new Error('SERVER_AUTHORITY_TENANT_MISMATCH');
  return items.filter((item) => !item.companyId || item.companyId === requestedCompanyId);
}

function browserWriteDisabled(): never {
  throw new Error('BROWSER_WRITE_DISABLED_SERVER_AUTHORITY_REQUIRED');
}

export class BaseRepository<T extends AnyEntity = AnyEntity> {
  [key: string]: any;
  constructor(_collectionName?: string) {}
  protected async load(): Promise<T[]> {
    throw new Error('SERVER_READ_MODEL_UNAVAILABLE_FOR_LEGACY_REPOSITORY');
  }
  async findAll(filters?: ReadFilters): Promise<T[]> {
    return applyFilters(await this.load(), filters);
  }
  async findById(id: string): Promise<T | null> {
    return (await this.load()).find((item) => item.id === id) || null;
  }
  async findAllForCompany(companyId: string, filters?: Omit<ReadFilters, 'companyId'>): Promise<T[]> {
    return applyFilters(assertTenant(await this.load(), companyId), { ...filters, companyId });
  }
  async findByIdForCompany(id: string, companyId: string): Promise<T | null> {
    return (await this.findAllForCompany(companyId)).find((item) => item.id === id) || null;
  }
  async count(filters?: ReadFilters): Promise<number> { return (await this.findAll(filters)).length; }
  async countForCompany(companyId: string, filters?: Omit<ReadFilters, 'companyId'>): Promise<number> {
    return (await this.findAllForCompany(companyId, filters)).length;
  }
  async create(_item: T): Promise<T> { return browserWriteDisabled(); }
  async update(_id: string, _item: Partial<T>): Promise<T> { return browserWriteDisabled(); }
  async delete(_id: string): Promise<boolean> { return browserWriteDisabled(); }
  async createForCompany(_companyId: string, _item: T): Promise<T> { return browserWriteDisabled(); }
  async updateForCompany(_id: string, _companyId: string, _item: Partial<T>): Promise<T> { return browserWriteDisabled(); }
  async deleteForCompany(_id: string, _companyId: string): Promise<boolean> { return browserWriteDisabled(); }
}

export class VehicleRepository extends BaseRepository<Vehicle> {
  protected override load(): Promise<Vehicle[]> { return VehicleClient.list(); }
  async findByPlate(plate: string) { return (await this.load()).find((v) => v.plate.toUpperCase() === plate.toUpperCase()) || null; }
  async findByRenavam(renavam: string) { return (await this.load()).find((v) => v.renavam === renavam) || null; }
  async getAvailableVehicles(companyId: string) { return (await this.findAllForCompany(companyId)).filter((v) => v.status === VehicleStatus.AVAILABLE && !v.isArchived); }
  async findByPlateForCompany(companyId: string, plate: string) { return (await this.findAllForCompany(companyId)).find((v) => v.plate.toUpperCase() === plate.toUpperCase()) || null; }
  async findByRenavamForCompany(companyId: string, renavam: string) { return (await this.findAllForCompany(companyId)).find((v) => v.renavam === renavam) || null; }
}

export class DriverRepository extends BaseRepository<Driver> {
  protected override load(): Promise<Driver[]> { return DriverClient.list(); }
  async findByCpf(cpf: string) { const key = cpf.replace(/\D/g, ''); return (await this.load()).find((d) => d.cpf.replace(/\D/g, '') === key) || null; }
  async findByCnh(cnh: string) { const key = cnh.replace(/\D/g, ''); return (await this.load()).find((d) => d.cnhNumber.replace(/\D/g, '') === key) || null; }
  async findByCpfForCompany(companyId: string, cpf: string) { const key = cpf.replace(/\D/g, ''); return (await this.findAllForCompany(companyId)).find((d) => d.cpf.replace(/\D/g, '') === key) || null; }
  async findByCnhForCompany(companyId: string, cnh: string) { const key = cnh.replace(/\D/g, ''); return (await this.findAllForCompany(companyId)).find((d) => d.cnhNumber.replace(/\D/g, '') === key) || null; }
}

export class ContractRepository extends BaseRepository<Contract> {
  protected override load(): Promise<Contract[]> { return ContractClient.list(); }
  async findActiveByVehicleId(vehicleId: string) { return (await this.findAll({ vehicleId })).find((c) => c.status === ContractStatus.ACTIVE && !c.isArchived) || null; }
  async findActiveByDriverId(driverId: string) { return (await this.findAll({ driverId })).find((c) => c.status === ContractStatus.ACTIVE && !c.isArchived) || null; }
  async findActiveByVehicleIdForCompany(companyId: string, vehicleId: string) { return (await this.findAllForCompany(companyId, { vehicleId })).find((c) => c.status === ContractStatus.ACTIVE && !c.isArchived) || null; }
  async findActiveByDriverIdForCompany(companyId: string, driverId: string) { return (await this.findAllForCompany(companyId, { driverId })).find((c) => c.status === ContractStatus.ACTIVE && !c.isArchived) || null; }
}

async function financialAccounts(): Promise<FinancialAccount[]> {
  const [{ accounts }, principal] = await Promise.all([FinanceSettlementClient.getOptions(), sessionPrincipal()]);
  return accounts.map((account) => ({
    id: account.id,
    companyId: principal.companyId,
    name: account.name,
    type: account.type as FinancialAccount['type'],
    initialBalance: 0,
    currentBalance: account.currentBalance,
    status: account.status as FinancialAccount['status'],
    createdAt: '',
    updatedAt: '',
  }));
}

export class FinancialAccountRepository extends BaseRepository<FinancialAccount> {
  protected override load(): Promise<FinancialAccount[]> { return financialAccounts(); }
  async updateBalance(): Promise<FinancialAccount> { return browserWriteDisabled(); }
  async updateBalanceForCompany(): Promise<FinancialAccount> { return browserWriteDisabled(); }
}

export class AccountReceivableRepository extends BaseRepository<AccountReceivable> {
  protected override load(): Promise<AccountReceivable[]> { return FinanceObligationClient.listReceivables(); }
  async findByIdempotencyKey(key: string) { return (await this.load()).find((r) => r.idempotencyKey === key) || null; }
  async findByContractId(contractId: string) { return (await this.load()).filter((r) => r.contractId === contractId); }
  async findByDriverId(driverId: string) { return this.findAll({ driverId }); }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findOverdue(companyId: string) { const today = new Date().toISOString().slice(0, 10); return (await this.findAllForCompany(companyId)).filter((r) => (r.status === ObligationStatus.PENDING || r.status === ObligationStatus.PARTIALLY_PAID) && r.dueDate < today); }
  async findByIdempotencyKeyForCompany(companyId: string, key: string) { return (await this.findAllForCompany(companyId)).find((r) => r.idempotencyKey === key) || null; }
  async findByContractIdForCompany(companyId: string, contractId: string) { return (await this.findAllForCompany(companyId)).filter((r) => r.contractId === contractId); }
  async findByDriverIdForCompany(companyId: string, driverId: string) { return this.findAllForCompany(companyId, { driverId }); }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
}

export class AccountPayableRepository extends BaseRepository<AccountPayable> {
  protected override load(): Promise<AccountPayable[]> { return FinanceObligationClient.listPayables(); }
  async findByIdempotencyKey(key: string) { return (await this.load()).find((p) => p.idempotencyKey === key) || null; }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findBySupplierId(supplierId: string) { return this.findAll({ supplierId }); }
  async findOverdue(companyId: string) { const today = new Date().toISOString().slice(0, 10); return (await this.findAllForCompany(companyId)).filter((p) => (p.status === ObligationStatus.PENDING || p.status === ObligationStatus.PARTIALLY_PAID) && p.dueDate < today); }
  async findByIdempotencyKeyForCompany(companyId: string, key: string) { return (await this.findAllForCompany(companyId)).find((p) => p.idempotencyKey === key) || null; }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
  async findBySupplierIdForCompany(companyId: string, supplierId: string) { return this.findAllForCompany(companyId, { supplierId }); }
}

export class FinancialTransactionRepository extends BaseRepository<FinancialTransaction> {
  protected override load(): Promise<FinancialTransaction[]> { return FinanceTransactionClient.listTransactions(); }
  async findByReceivableId(receivableId: string) { return (await this.load()).filter((t) => t.receivableId === receivableId && !t.isReversed); }
  async findByPayableId(payableId: string) { return (await this.load()).filter((t) => t.payableId === payableId && !t.isReversed); }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findByReceivableIdForCompany(companyId: string, receivableId: string) { return (await this.findAllForCompany(companyId)).filter((t) => t.receivableId === receivableId && !t.isReversed); }
  async findByPayableIdForCompany(companyId: string, payableId: string) { return (await this.findAllForCompany(companyId)).filter((t) => t.payableId === payableId && !t.isReversed); }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
}

function workOrderToMaintenance(order: WorkOrder): Maintenance {
  const status = order.status === 'COMPLETED'
    ? MaintenanceStatus.COMPLETED
    : order.status === 'CANCELLED'
      ? MaintenanceStatus.CANCELLED
      : order.status === 'OPEN'
        ? MaintenanceStatus.SCHEDULED
        : MaintenanceStatus.IN_PROGRESS;
  return {
    id: order.id,
    companyId: order.companyId,
    vehicleId: order.vehicleId,
    supplierId: order.supplierId,
    type: MaintenanceType.OTHER,
    description: order.description,
    kmAtMaintenance: order.exitKm ?? order.entryKm,
    partsCost: order.subtotalParts,
    laborCost: order.subtotalLabor + order.subtotalServices,
    totalCost: order.total,
    status,
    startDate: (order.startedAt || order.openedAt).slice(0, 10),
    completionDate: order.completedAt?.slice(0, 10),
    accountPayableId: order.accountPayableId,
    notes: order.notes,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export class MaintenanceRepository extends BaseRepository<Maintenance> {
  protected override async load(): Promise<Maintenance[]> { return (await MaintenanceClient.listWorkOrders()).map(workOrderToMaintenance); }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
}

function vehicleDocument(record: Awaited<ReturnType<typeof DocumentClient.list>>[number]): VehicleDocument {
  return {
    id: record.id,
    companyId: record.companyId,
    vehicleId: record.subjectId,
    documentType: record.documentType,
    documentNumber: record.documentNumber,
    issueDate: record.issueDate,
    expirationDate: record.expirationDate || '',
    status: record.complianceStatus,
    cost: record.cost,
    accountPayableId: record.payableId,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function driverDocument(record: Awaited<ReturnType<typeof DocumentClient.list>>[number]): DriverDocument {
  return {
    id: record.id,
    companyId: record.companyId,
    driverId: record.subjectId,
    documentType: record.documentType,
    documentNumber: record.documentNumber,
    expirationDate: record.expirationDate,
    status: record.complianceStatus,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class VehicleDocumentRepository extends BaseRepository<VehicleDocument> {
  protected override async load() { return (await DocumentClient.list({ subjectType: 'VEHICLE' })).map(vehicleDocument); }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
  async findExpiring(companyId: string, daysAhead: number) {
    const today = new Date(); const limit = new Date(today); limit.setUTCDate(limit.getUTCDate() + daysAhead);
    const from = today.toISOString().slice(0, 10), to = limit.toISOString().slice(0, 10);
    return (await this.findAllForCompany(companyId)).filter((d) => d.expirationDate >= from && d.expirationDate <= to);
  }
}

export class DriverDocumentRepository extends BaseRepository<DriverDocument> {
  protected override async load() { return (await DocumentClient.list({ subjectType: 'DRIVER' })).map(driverDocument); }
  async findByDriverId(driverId: string) { return this.findAll({ driverId }); }
  async findByDriverIdForCompany(companyId: string, driverId: string) { return this.findAllForCompany(companyId, { driverId }); }
}

export class InsuranceRepository extends BaseRepository<Insurance> {
  protected override load(): Promise<Insurance[]> { return InsuranceClient.list(); }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
}

export class TrackerRepository extends BaseRepository<Tracker> {
  protected override load(): Promise<Tracker[]> { return TrackerClient.list(); }
  async findByVehicleId(vehicleId: string) { const items = await this.findAll({ vehicleId }); return items.find((t) => t.status === 'ACTIVE') || items[0] || null; }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { const items = await this.findAllForCompany(companyId, { vehicleId }); return items.find((t) => t.status === 'ACTIVE') || items[0] || null; }
}

export class TrafficTicketRepository extends BaseRepository<TrafficTicket> {
  protected override load(): Promise<TrafficTicket[]> { return TrafficTicketClient.list(); }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findByDriverId(driverId: string) { return this.findAll({ driverId }); }
  async findByAutoNumber(autoNumber: string) { return (await this.load()).find((t) => t.autoNumber.toUpperCase() === autoNumber.toUpperCase()) || null; }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
  async findByDriverIdForCompany(companyId: string, driverId: string) { return this.findAllForCompany(companyId, { driverId }); }
  async findByAutoNumberForCompany(companyId: string, autoNumber: string) { return (await this.findAllForCompany(companyId)).find((t) => t.autoNumber.toUpperCase() === autoNumber.toUpperCase()) || null; }
}

export class SupplierRepository extends BaseRepository<Supplier> {
  protected override load(): Promise<Supplier[]> { return MaintenanceClient.listSuppliers(); }
}

export class PartRepository extends BaseRepository<Part> {
  protected override load(): Promise<Part[]> { return MaintenanceClient.listParts(); }
}

export class WorkOrderRepository extends BaseRepository<WorkOrder> {
  protected override load(): Promise<WorkOrder[]> { return MaintenanceClient.listWorkOrders(); }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
}

export class OilChangeRepository extends BaseRepository<OilChangeRecord> {
  protected override load(): Promise<OilChangeRecord[]> { return MaintenancePreventiveClient.listOilChanges(); }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
}

export class TireRepository extends BaseRepository<TireRecord> {
  protected override load(): Promise<TireRecord[]> { return MaintenancePreventiveClient.listTires(); }
  async findByVehicleId(vehicleId: string) { return this.findAll({ vehicleId }); }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return this.findAllForCompany(companyId, { vehicleId }); }
}

export class KmRecordRepository extends BaseRepository<KmRecord> {
  protected override async load(): Promise<KmRecord[]> { throw new Error('KM_LIST_REQUIRES_VEHICLE_SERVER_SCOPE'); }
  async findByVehicleId(vehicleId: string) { return VehicleClient.listKm(vehicleId); }
  async getLatestForVehicle(vehicleId: string) { return (await this.findByVehicleId(vehicleId))[0] || null; }
  async findByVehicleIdForCompany(companyId: string, vehicleId: string) { return assertTenant(await VehicleClient.listKm(vehicleId), companyId); }
  async getLatestForVehicleForCompany(companyId: string, vehicleId: string) { return (await this.findByVehicleIdForCompany(companyId, vehicleId))[0] || null; }
}

export class PaymentMethodRepository extends BaseRepository<PaymentMethod> {
  protected override async load(): Promise<PaymentMethod[]> {
    const [{ paymentMethods }, principal] = await Promise.all([FinanceSettlementClient.getOptions(), sessionPrincipal()]);
    return paymentMethods.map((method) => ({
      id: method.id,
      companyId: principal.companyId,
      name: method.name,
      code: method.name,
      active: method.active,
      requiresFinancialAccount: true,
      createdAt: '',
      updatedAt: '',
    }));
  }
}

// Unsupported legacy browser repositories remain import-compatible, but they can
// no longer read or mutate local business authority. Their next migration waves
// must add an authenticated server client before use.
export class SecurityDepositRepository extends BaseRepository<any> {}
export class SecurityDepositMovementRepository extends BaseRepository<any> {}
export class ServiceItemRepository extends BaseRepository<any> {}
export class FinancialCategoryRepository extends BaseRepository<any> {}
export class ContractTemplateRepository extends BaseRepository<any> {}
export class RecurringRuleRepository extends BaseRepository<any> {}
export class AuditLogRepository extends BaseRepository<any> {}
export class FileAttachmentRepository extends BaseRepository<any> {}
export class ArchivedRecordRepository extends BaseRepository<any> {}
export class NotificationRepository extends BaseRepository<any> {}
export class BankStatementEntryRepository extends BaseRepository<any> {}
export class FinancialPeriodRepository extends BaseRepository<any> {}
export class CommunicationLogRepository extends BaseRepository<any> {}
