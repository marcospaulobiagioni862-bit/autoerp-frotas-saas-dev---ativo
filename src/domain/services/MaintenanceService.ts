import {
  WorkOrderRepository,
  SupplierRepository,
  PartRepository,
  ServiceItemRepository,
  OilChangeRepository,
  TireRepository,
  VehicleRepository,
  KmRecordRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import {
  WorkOrder,
  Supplier,
  Part,
  ServiceItem,
  OilChangeRecord,
  TireRecord,
  KmRecord,
  WorkOrderStatus,
} from '../../types/entities';
import {
  VehicleStatus,
  OriginType,
  AuditAction,
} from '../../types/enums';
import { PayableService } from '../finance/PayableService';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { roundCurrency } from '../../shared/utils/currency';

export class MaintenanceService {
  private static workOrderRepo = new WorkOrderRepository();
  private static supplierRepo = new SupplierRepository();
  private static partRepo = new PartRepository();
  private static serviceRepo = new ServiceItemRepository();
  private static oilRepo = new OilChangeRepository();
  private static tireRepo = new TireRepository();
  private static vehicleRepo = new VehicleRepository();
  private static kmRepo = new KmRecordRepository();

  public static async createSupplier(params: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>, userId: string, userName: string): Promise<Supplier> {
    const item: Supplier = {
      id: generateUUID(),
      ...params,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.supplierRepo.create(item);
    await AuditLogger.logAction(params.companyId, 'Supplier', saved.id, AuditAction.CREATE, userId, userName, null, saved);
    return saved;
  }

  public static async createPart(params: Omit<Part, 'id' | 'createdAt' | 'updatedAt'>, userId: string, userName: string): Promise<Part> {
    const item: Part = {
      id: generateUUID(),
      ...params,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.partRepo.create(item);
    await AuditLogger.logAction(params.companyId, 'Part', saved.id, AuditAction.CREATE, userId, userName, null, saved);
    return saved;
  }

  public static async createServiceItem(params: Omit<ServiceItem, 'id' | 'createdAt' | 'updatedAt'>, userId: string, userName: string): Promise<ServiceItem> {
    const item: ServiceItem = {
      id: generateUUID(),
      ...params,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.serviceRepo.create(item);
    await AuditLogger.logAction(params.companyId, 'ServiceItem', saved.id, AuditAction.CREATE, userId, userName, null, saved);
    return saved;
  }

  public static async createWorkOrder(params: {
    companyId: string;
    number: string;
    vehicleId: string;
    supplierId?: string;
    entryKm: number;
    description: string;
    parts?: Array<{ partId?: string; description: string; quantity: number; unitCost: number }>;
    services?: Array<{ serviceId?: string; description: string; quantity: number; unitCost: number }>;
    laborItems?: Array<{ description: string; hours: number; hourlyRate: number }>;
    discount?: number;
    notes?: string;
    userId: string;
    userName: string;
  }): Promise<WorkOrder> {
    // Validate vehicle
    const vehicle = await this.vehicleRepo.findById(params.vehicleId);
    if (!vehicle) throw new Error('Veículo não encontrado');

    const parts = (params.parts || []).map((p) => ({
      id: generateUUID(),
      partId: p.partId,
      description: p.description,
      quantity: p.quantity,
      unitCost: roundCurrency(p.unitCost),
      totalCost: roundCurrency(p.quantity * p.unitCost),
    }));

    const services = (params.services || []).map((s) => ({
      id: generateUUID(),
      serviceId: s.serviceId,
      description: s.description,
      quantity: s.quantity,
      unitCost: roundCurrency(s.unitCost),
      totalCost: roundCurrency(s.quantity * s.unitCost),
    }));

    const laborItems = (params.laborItems || []).map((l) => ({
      id: generateUUID(),
      description: l.description,
      hours: l.hours,
      hourlyRate: roundCurrency(l.hourlyRate),
      totalCost: roundCurrency(l.hours * l.hourlyRate),
    }));

    const subtotalParts = roundCurrency(parts.reduce((acc, p) => acc + p.totalCost, 0));
    const subtotalServices = roundCurrency(services.reduce((acc, s) => acc + s.totalCost, 0));
    const subtotalLabor = roundCurrency(laborItems.reduce((acc, l) => acc + l.totalCost, 0));
    const discount = roundCurrency(params.discount || 0);
    const total = roundCurrency(Math.max(0, subtotalParts + subtotalServices + subtotalLabor - discount));

    const workOrder: WorkOrder = {
      id: generateUUID(),
      companyId: params.companyId,
      number: params.number,
      vehicleId: params.vehicleId,
      supplierId: params.supplierId,
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      entryKm: params.entryKm,
      description: params.description,
      notes: params.notes,
      parts,
      services,
      laborItems,
      subtotalParts,
      subtotalServices,
      subtotalLabor,
      discount,
      total,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.workOrderRepo.create(workOrder);

    await AuditLogger.logAction(
      params.companyId,
      'WorkOrder',
      saved.id,
      AuditAction.CREATE,
      params.userId,
      params.userName,
      null,
      saved
    );

    return saved;
  }

  public static async startWorkOrder(workOrderId: string, userId: string, userName: string): Promise<WorkOrder> {
    const wo = await this.workOrderRepo.findById(workOrderId);
    if (!wo) throw new Error('Ordem de serviço não encontrada');
    if (wo.status !== 'OPEN' && wo.status !== 'WAITING_APPROVAL' && wo.status !== 'WAITING_PARTS') {
      throw new Error(`Não é possível iniciar OS com status ${wo.status}`);
    }

    const previousState = { ...wo };
    const updated = await this.workOrderRepo.update(workOrderId, {
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
    });

    // Update vehicle status to MAINTENANCE
    await this.vehicleRepo.update(wo.vehicleId, { status: VehicleStatus.MAINTENANCE });

    await AuditLogger.logAction(
      wo.companyId,
      'WorkOrder',
      wo.id,
      AuditAction.UPDATE,
      userId,
      userName,
      previousState,
      updated
    );

    return updated;
  }

  public static async completeWorkOrder(params: {
    workOrderId: string;
    exitKm: number;
    categoryId: string; // Financial category for AccountPayable (e.g. 'cat-maint-exp')
    dueDate: string;
    installmentsCount?: number;
    userId: string;
    userName: string;
  }): Promise<WorkOrder> {
    const wo = await this.workOrderRepo.findById(params.workOrderId);
    if (!wo) throw new Error('Ordem de serviço não encontrada');
    if (wo.status === 'COMPLETED') throw new Error('Ordem de serviço já está concluída');
    if (wo.status === 'CANCELLED') throw new Error('Ordem de serviço cancelada');

    if (params.exitKm < wo.entryKm) {
      throw new Error('KM de saída não pode ser menor que o KM de entrada');
    }

    const previousState = { ...wo };

    // Create AccountPayable via PayableService (Financial Core Integration)
    const payables = await PayableService.create({
      companyId: wo.companyId,
      originType: OriginType.MAINTENANCE,
      originId: wo.id,
      vehicleId: wo.vehicleId,
      supplierId: wo.supplierId,
      categoryId: params.categoryId,
      description: `Manutenção OS #${wo.number} - ${wo.description}`,
      totalAmount: wo.total,
      dueDate: params.dueDate,
      installmentsCount: params.installmentsCount || 1,
      userId: params.userId,
      userName: params.userName,
    });

    const payableId = payables[0]?.id;

    const updated = await this.workOrderRepo.update(wo.id, {
      status: 'COMPLETED',
      exitKm: params.exitKm,
      completedAt: new Date().toISOString(),
      accountPayableId: payableId,
    });

    // Return vehicle to AVAILABLE status
    await this.vehicleRepo.update(wo.vehicleId, {
      status: VehicleStatus.AVAILABLE,
      currentKm: params.exitKm,
    });

    // Record KM
    await this.kmRepo.create({
      id: generateUUID(),
      companyId: wo.companyId,
      vehicleId: wo.vehicleId,
      kmValue: params.exitKm,
      recordDate: new Date().toISOString().split('T')[0],
      readingType: 'MAINTENANCE',
      notes: `Conclusão OS #${wo.number}`,
      createdAt: new Date().toISOString(),
    });

    await AuditLogger.logAction(
      wo.companyId,
      'WorkOrder',
      wo.id,
      AuditAction.UPDATE,
      params.userId,
      params.userName,
      previousState,
      updated
    );

    return updated;
  }

  public static async cancelWorkOrder(workOrderId: string, reason: string, userId: string, userName: string): Promise<WorkOrder> {
    const wo = await this.workOrderRepo.findById(workOrderId);
    if (!wo) throw new Error('Ordem de serviço não encontrada');
    if (wo.status === 'COMPLETED') throw new Error('Não é possível cancelar uma OS já concluída');
    if (wo.status === 'CANCELLED') throw new Error('OS já está cancelada');

    const previousState = { ...wo };
    const updated = await this.workOrderRepo.update(workOrderId, {
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
      notes: `${wo.notes || ''}\n[Cancelada: ${reason}]`,
    });

    // If vehicle was in maintenance, return to available
    const vehicle = await this.vehicleRepo.findById(wo.vehicleId);
    if (vehicle && vehicle.status === VehicleStatus.MAINTENANCE) {
      await this.vehicleRepo.update(wo.vehicleId, { status: VehicleStatus.AVAILABLE });
    }

    await AuditLogger.logAction(
      wo.companyId,
      'WorkOrder',
      wo.id,
      AuditAction.CANCEL,
      userId,
      userName,
      previousState,
      updated
    );

    return updated;
  }

  public static async recordOilChange(params: Omit<OilChangeRecord, 'id' | 'createdAt' | 'updatedAt'>, userId: string, userName: string): Promise<OilChangeRecord> {
    const item: OilChangeRecord = {
      id: generateUUID(),
      ...params,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.oilRepo.create(item);
    await AuditLogger.logAction(params.companyId, 'OilChangeRecord', saved.id, AuditAction.CREATE, userId, userName, null, saved);
    return saved;
  }

  public static async recordTire(params: Omit<TireRecord, 'id' | 'createdAt' | 'updatedAt'>, userId: string, userName: string): Promise<TireRecord> {
    const item: TireRecord = {
      id: generateUUID(),
      ...params,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.tireRepo.create(item);
    await AuditLogger.logAction(params.companyId, 'TireRecord', saved.id, AuditAction.CREATE, userId, userName, null, saved);
    return saved;
  }
}
