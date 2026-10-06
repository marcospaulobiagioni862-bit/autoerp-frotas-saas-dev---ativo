// AutoERP Vehicle Domain Service

import {
  VehicleRepository,
  DriverRepository,
  ContractRepository,
  MaintenanceRepository,
  TrafficTicketRepository,
  VehicleDocumentRepository,
  InsuranceRepository,
  TrackerRepository,
  KmRecordRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { Vehicle, KmRecord } from '../../types/entities';
import { VehicleStatus, AuditAction, ObligationStatus } from '../../types/enums';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { generateUUID } from '../../shared/utils/uuid';

export interface CreateVehicleDTO {
  companyId: string;
  plate: string;
  brand: string;
  model: string;
  version?: string;
  yearFabrication: number;
  yearModel: number;
  color: string;
  renavam: string;
  chassis: string;
  currentKm: number;
  nextMaintenanceKm?: number;
  fuelType: string;
  category: string;
  acquisitionValue: number;
  currentValue: number;
  rentalValueBase: number;
  notes?: string;
}

export interface UpdateVehicleDTO extends Partial<CreateVehicleDTO> {
  status?: VehicleStatus;
  currentDriverId?: string;
  currentContractId?: string;
}

export interface VehicleDetailedSummary {
  vehicle: Vehicle;
  driver?: any;
  activeContract?: any;
  contractHistory: any[];
  maintenances: any[];
  trafficTickets: any[];
  documents: any[];
  insurances: any[];
  trackers: any[];
  kmRecords: KmRecord[];
  financialSummary: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
  };
}

export class VehicleService {
  private vehicleRepo = new VehicleRepository();
  private driverRepo = new DriverRepository();
  private contractRepo = new ContractRepository();
  private maintenanceRepo = new MaintenanceRepository();
  private ticketRepo = new TrafficTicketRepository();
  private documentRepo = new VehicleDocumentRepository();
  private insuranceRepo = new InsuranceRepository();
  private trackerRepo = new TrackerRepository();
  private kmRepo = new KmRecordRepository();
  private receivableRepo = new AccountReceivableRepository();
  private payableRepo = new AccountPayableRepository();

  public async createVehicle(
    dto: CreateVehicleDTO,
    userId: string,
    userName: string
  ): Promise<Vehicle> {
    const cleanPlate = dto.plate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    if (!cleanPlate || cleanPlate.length < 7) {
      throw new Error('Placa inválida. Forneça uma placa válida com 7 caracteres.');
    }

    const cleanRenavam = dto.renavam.trim();
    if (!cleanRenavam) {
      throw new Error('RENAVAM é obrigatório.');
    }

    // Check plate uniqueness
    const existingPlate = await this.vehicleRepo.findByPlate(cleanPlate);
    if (existingPlate) {
      throw new Error(`A placa ${cleanPlate} já está cadastrada no sistema.`);
    }

    // Check RENAVAM uniqueness
    const existingRenavam = await this.vehicleRepo.findByRenavam(cleanRenavam);
    if (existingRenavam) {
      throw new Error(`O RENAVAM ${cleanRenavam} já está cadastrado no sistema.`);
    }

    if (!dto.brand || !dto.model) {
      throw new Error('Marca e modelo são obrigatórios.');
    }

    if (dto.currentKm < 0) {
      throw new Error('A quilometragem não pode ser negativa.');
    }

    if (dto.acquisitionValue < 0 || dto.currentValue < 0 || dto.rentalValueBase < 0) {
      throw new Error('Valores financeiros do veículo não podem ser negativos.');
    }

    const now = new Date().toISOString();
    const newVehicle: Vehicle = {
      id: generateUUID(),
      companyId: dto.companyId,
      plate: cleanPlate,
      brand: dto.brand.trim(),
      model: dto.model.trim(),
      version: dto.version?.trim(),
      yearFabrication: Number(dto.yearFabrication),
      yearModel: Number(dto.yearModel),
      color: dto.color.trim(),
      renavam: cleanRenavam,
      chassis: dto.chassis.trim().toUpperCase(),
      currentKm: Number(dto.currentKm),
      nextMaintenanceKm: dto.nextMaintenanceKm ? Number(dto.nextMaintenanceKm) : undefined,
      fuelType: dto.fuelType || 'Flex',
      category: dto.category || 'Padrão',
      acquisitionValue: Number(dto.acquisitionValue),
      currentValue: Number(dto.currentValue),
      rentalValueBase: Number(dto.rentalValueBase),
      status: VehicleStatus.AVAILABLE,
      notes: dto.notes,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.vehicleRepo.create(newVehicle);

    // Initial KM Record
    if (dto.currentKm >= 0) {
      await this.kmRepo.create({
        id: generateUUID(),
        companyId: dto.companyId,
        vehicleId: created.id,
        kmValue: Number(dto.currentKm),
        recordDate: now.split('T')[0],
        readingType: 'PERIODIC',
        notes: 'Cadastro inicial do veículo',
        createdAt: now,
      });
    }

    await AuditLogger.logAction(
      dto.companyId,
      'Vehicle',
      created.id,
      AuditAction.CREATE,
      userId,
      userName,
      null,
      created
    );

    return created;
  }

  public async updateVehicle(
    vehicleId: string,
    dto: UpdateVehicleDTO,
    userId: string,
    userName: string
  ): Promise<Vehicle> {
    const existing = await this.vehicleRepo.findById(vehicleId);
    if (!existing) {
      throw new Error(`Veículo com ID ${vehicleId} não foi encontrado.`);
    }

    const changes: Partial<Vehicle> = {};

    if (dto.plate) {
      const cleanPlate = dto.plate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      if (cleanPlate !== existing.plate) {
        const checkPlate = await this.vehicleRepo.findByPlate(cleanPlate);
        if (checkPlate && checkPlate.id !== vehicleId) {
          throw new Error(`A placa ${cleanPlate} já pertence a outro veículo.`);
        }
        changes.plate = cleanPlate;
      }
    }

    if (dto.renavam) {
      const cleanRenavam = dto.renavam.trim();
      if (cleanRenavam !== existing.renavam) {
        const checkRenavam = await this.vehicleRepo.findByRenavam(cleanRenavam);
        if (checkRenavam && checkRenavam.id !== vehicleId) {
          throw new Error(`O RENAVAM ${cleanRenavam} já pertence a outro veículo.`);
        }
        changes.renavam = cleanRenavam;
      }
    }

    if (dto.brand) changes.brand = dto.brand.trim();
    if (dto.model) changes.model = dto.model.trim();
    if (dto.version !== undefined) changes.version = dto.version;
    if (dto.yearFabrication) changes.yearFabrication = Number(dto.yearFabrication);
    if (dto.yearModel) changes.yearModel = Number(dto.yearModel);
    if (dto.color) changes.color = dto.color.trim();
    if (dto.chassis) changes.chassis = dto.chassis.trim().toUpperCase();
    if (dto.fuelType) changes.fuelType = dto.fuelType;
    if (dto.category) changes.category = dto.category;
    if (dto.acquisitionValue !== undefined) changes.acquisitionValue = Number(dto.acquisitionValue);
    if (dto.currentValue !== undefined) changes.currentValue = Number(dto.currentValue);
    if (dto.rentalValueBase !== undefined) changes.rentalValueBase = Number(dto.rentalValueBase);
    if (dto.nextMaintenanceKm !== undefined) changes.nextMaintenanceKm = Number(dto.nextMaintenanceKm);
    if (dto.notes !== undefined) changes.notes = dto.notes;
    if (dto.status) changes.status = dto.status;
    if (dto.currentDriverId !== undefined) changes.currentDriverId = dto.currentDriverId;
    if (dto.currentContractId !== undefined) changes.currentContractId = dto.currentContractId;

    const updated = await this.vehicleRepo.update(vehicleId, changes);

    await AuditLogger.logAction(
      existing.companyId,
      'Vehicle',
      vehicleId,
      AuditAction.UPDATE,
      userId,
      userName,
      existing,
      updated
    );

    return updated;
  }

  public async recordKm(
    vehicleId: string,
    newKm: number,
    readingType: 'CHECK_IN' | 'CHECK_OUT' | 'PERIODIC' | 'MAINTENANCE',
    notes: string | undefined,
    userId: string,
    userName: string
  ): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) {
      throw new Error(`Veículo ${vehicleId} não encontrado.`);
    }

    if (newKm < vehicle.currentKm) {
      throw new Error(`O novo KM (${newKm}) não pode ser inferior ao KM atual (${vehicle.currentKm}).`);
    }

    const now = new Date().toISOString();
    await this.kmRepo.create({
      id: generateUUID(),
      companyId: vehicle.companyId,
      vehicleId,
      driverId: vehicle.currentDriverId,
      contractId: vehicle.currentContractId,
      kmValue: Number(newKm),
      recordDate: now.split('T')[0],
      readingType,
      notes,
      createdAt: now,
    });

    const updated = await this.vehicleRepo.update(vehicleId, { currentKm: Number(newKm) });

    await AuditLogger.logAction(
      vehicle.companyId,
      'Vehicle',
      vehicleId,
      AuditAction.UPDATE,
      userId,
      userName,
      { currentKm: vehicle.currentKm },
      { currentKm: newKm, readingType }
    );

    return updated;
  }

  public async changeStatus(
    vehicleId: string,
    newStatus: VehicleStatus,
    notes: string | undefined,
    userId: string,
    userName: string
  ): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) {
      throw new Error(`Veículo ${vehicleId} não encontrado.`);
    }

    const previousStatus = vehicle.status;
    if (previousStatus === newStatus) {
      return vehicle;
    }

    // Business validation on status change
    if (newStatus === VehicleStatus.AVAILABLE && vehicle.currentContractId) {
      // If returning to AVAILABLE, make sure driver/contract references are reset or cleared
      await this.vehicleRepo.update(vehicleId, {
        status: VehicleStatus.AVAILABLE,
        currentDriverId: undefined,
        currentContractId: undefined,
        notes: notes ? `${vehicle.notes || ''}\n[Status]: ${notes}` : vehicle.notes,
      });
    } else {
      await this.vehicleRepo.update(vehicleId, {
        status: newStatus,
        notes: notes ? `${vehicle.notes || ''}\n[Status]: ${notes}` : vehicle.notes,
      });
    }

    const updated = await this.vehicleRepo.findById(vehicleId);

    await AuditLogger.logAction(
      vehicle.companyId,
      'Vehicle',
      vehicleId,
      AuditAction.UPDATE,
      userId,
      userName,
      { status: previousStatus },
      { status: newStatus, notes }
    );

    return updated!;
  }

  public async getVehicleDetailedSummary(vehicleId: string): Promise<VehicleDetailedSummary> {
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) {
      throw new Error(`Veículo ${vehicleId} não encontrado.`);
    }

    const [
      driver,
      activeContract,
      allContracts,
      maintenances,
      trafficTickets,
      documents,
      insurances,
      trackers,
      kmRecords,
      receivables,
      payables,
    ] = await Promise.all([
      vehicle.currentDriverId ? this.driverRepo.findById(vehicle.currentDriverId) : Promise.resolve(null),
      vehicle.currentContractId ? this.contractRepo.findById(vehicle.currentContractId) : Promise.resolve(null),
      this.contractRepo.findAll({ vehicleId }),
      this.maintenanceRepo.findAll({ vehicleId }),
      this.ticketRepo.findAll({ vehicleId }),
      this.documentRepo.findAll({ vehicleId }),
      this.insuranceRepo.findAll({ vehicleId }),
      this.trackerRepo.findAll({ vehicleId }),
      this.kmRepo.findAll({ vehicleId }),
      this.receivableRepo.findAll({ vehicleId }),
      this.payableRepo.findAll({ vehicleId }),
    ]);

    // Financial calculations specific to this vehicle
    const totalRevenue = receivables
      .filter((r) => r.status === ObligationStatus.PAID)
      .reduce((sum, r) => sum + r.paidAmount, 0);

    const totalExpenses = payables
      .filter((p) => p.status === ObligationStatus.PAID)
      .reduce((sum, p) => sum + p.paidAmount, 0);

    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      vehicle,
      driver,
      activeContract,
      contractHistory: allContracts,
      maintenances,
      trafficTickets,
      documents,
      insurances,
      trackers,
      kmRecords: kmRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      financialSummary: {
        totalRevenue,
        totalExpenses,
        netProfit,
        profitMargin,
      },
    };
  }
}
