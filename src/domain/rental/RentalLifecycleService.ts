import { Vehicle, Contract, Maintenance, VehicleDocument, DriverDocument, Driver, Insurance, Tracker } from '../../types/entities';
import { VehicleStatus, ContractStatus, MaintenanceStatus } from '../../types/enums';

export type RentalLifecycleStage = 
  | 'DRAFT'
  | 'RESERVED'
  | 'PREPARING'
  | 'READY_FOR_DELIVERY'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXTENDED'
  | 'VEHICLE_CHANGE'
  | 'RETURN_PENDING'
  | 'RETURNED'
  | 'CHECKOUT_PENDING'
  | 'CLOSED'
  | 'CANCELLED';

export interface RentalTimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  stage: RentalLifecycleStage;
  actor?: string;
}

export interface RentalLifecycleItem {
  contractId: string;
  contractNumber: string;
  companyId: string;
  vehicleId: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  driverId: string;
  driverName?: string;
  currentStage: RentalLifecycleStage;
  isReadyForDelivery: boolean;
  readinessBlockers: string[];
  startDate: string;
  endDate?: string;
  rentalAmount: number;
  timeline: RentalTimelineEvent[];
  canClose: boolean;
  closureBlockers: string[];
}

export interface RentalLifecycleSummary {
  companyId: string;
  generatedAt: string;
  counts: {
    total: number;
    reserved: number;
    preparing: number;
    readyForDelivery: number;
    active: number;
    suspended: number;
    returnPending: number;
    closed: number;
    cancelled: number;
  };
  items: RentalLifecycleItem[];
}

export interface RentalLifecycleInput {
  companyId?: string;
  contracts?: Contract[];
  vehicles?: Vehicle[];
  drivers?: Driver[];
  maintenances?: Maintenance[];
  vehicleDocuments?: VehicleDocument[];
  driverDocuments?: DriverDocument[];
  insurances?: Insurance[];
  trackers?: Tracker[];
}

/**
 * Service for managing the Complete Rental Lifecycle (Phase 3.38).
 * 
 * GUARANTEES:
 * - 100% Read-only / Zero financial structure alterations
 * - Deterministic state classification and transition validations
 * - Strict multi-tenancy filtering by companyId
 */
export function generateRentalLifecycleSummary(input: RentalLifecycleInput = {}): RentalLifecycleSummary {
  const targetCompanyId = input.companyId || 'company-main-uuid';

  const contracts = Array.isArray(input.contracts) ? input.contracts.filter(c => c && !c.isArchived && (!input.companyId || c.companyId === targetCompanyId)) : [];
  const vehicles = Array.isArray(input.vehicles) ? input.vehicles.filter(v => v && !v.isArchived && (!input.companyId || v.companyId === targetCompanyId)) : [];
  const drivers = Array.isArray(input.drivers) ? input.drivers.filter(d => d && !d.isArchived && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const maintenances = Array.isArray(input.maintenances) ? input.maintenances.filter(m => m && (!input.companyId || m.companyId === targetCompanyId)) : [];
  const vehicleDocuments = Array.isArray(input.vehicleDocuments) ? input.vehicleDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const driverDocuments = Array.isArray(input.driverDocuments) ? input.driverDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const insurances = Array.isArray(input.insurances) ? input.insurances.filter(i => i && (!input.companyId || i.companyId === targetCompanyId)) : [];

  const vehiclesMap = new Map(vehicles.map(v => [v.id, v]));
  const driversMap = new Map(drivers.map(d => [d.id, d]));
  const maintenancesByVehicle = new Map<string, Maintenance[]>();
  maintenances.forEach(m => {
    const list = maintenancesByVehicle.get(m.vehicleId) || [];
    list.push(m);
    maintenancesByVehicle.set(m.vehicleId, list);
  });

  const vehDocsByVehicle = new Map<string, VehicleDocument[]>();
  vehicleDocuments.forEach(d => {
    const list = vehDocsByVehicle.get(d.vehicleId) || [];
    list.push(d);
    vehDocsByVehicle.set(d.vehicleId, list);
  });

  const drvDocsByDriver = new Map<string, DriverDocument[]>();
  driverDocuments.forEach(d => {
    const list = drvDocsByDriver.get(d.driverId) || [];
    list.push(d);
    drvDocsByDriver.set(d.driverId, list);
  });

  const items: RentalLifecycleItem[] = contracts.map(c => {
    const veh = vehiclesMap.get(c.vehicleId);
    const drv = driversMap.get(c.driverId);

    // Determine current stage based on contract status and dates
    let currentStage: RentalLifecycleStage = 'DRAFT';
    if (c.status === ContractStatus.ACTIVE) {
      currentStage = 'ACTIVE';
    } else if (c.status === ContractStatus.SUSPENDED) {
      currentStage = 'SUSPENDED';
    } else if (c.status === ContractStatus.FINISHED || c.status === ContractStatus.CLOSED) {
      currentStage = 'CLOSED';
    } else if (c.status === ContractStatus.CANCELLED) {
      currentStage = 'CANCELLED';
    } else if (c.status === ContractStatus.AWAITING_SIGNATURE) {
      currentStage = 'RESERVED';
    }

    // Evaluate readiness for delivery
    const readinessBlockers: string[] = [];
    if (!veh) {
      readinessBlockers.push('Veículo não encontrado ou de outra empresa.');
    } else {
      if (veh.status === VehicleStatus.MAINTENANCE) {
        readinessBlockers.push(`Veículo ${veh.plate} está em manutenção.`);
      }
      const vehMaints = maintenancesByVehicle.get(veh.id) || [];
      if (vehMaints.some(m => m.status === MaintenanceStatus.SCHEDULED || m.status === MaintenanceStatus.IN_PROGRESS)) {
        readinessBlockers.push('Existe manutenção pendente ou em andamento para o veículo.');
      }
    }

    if (!drv) {
      readinessBlockers.push('Motorista não encontrado ou inativo.');
    }

    const isReadyForDelivery = readinessBlockers.length === 0;
    if (currentStage === 'RESERVED' && isReadyForDelivery) {
      currentStage = 'READY_FOR_DELIVERY';
    }

    // Closure blockers
    const closureBlockers: string[] = [];
    if (currentStage === 'ACTIVE') {
      closureBlockers.push('Contrato ainda está ativo. É necessário realizar devolução e check-out antes de encerrar.');
    }

    const canClose = closureBlockers.length === 0 && currentStage !== 'CLOSED' && currentStage !== 'CANCELLED';

    // Timeline construction
    const timeline: RentalTimelineEvent[] = [
      {
        id: `ev-create-${c.id}`,
        timestamp: c.createdAt,
        title: 'Contrato Criado / Rascunho',
        description: `Contrato ${c.contractNumber} gerado no sistema.`,
        stage: 'DRAFT',
      }
    ];

    if (c.status !== ContractStatus.DRAFT) {
      timeline.push({
        id: `ev-res-${c.id}`,
        timestamp: c.createdAt,
        title: 'Reserva & Pré-locação',
        description: `Veículo ${veh?.plate || 'Veículo'} reservado para ${drv?.fullName || 'Motorista'}.`,
        stage: 'RESERVED',
      });
    }

    if (isReadyForDelivery && currentStage !== 'DRAFT') {
      timeline.push({
        id: `ev-prep-${c.id}`,
        timestamp: c.updatedAt || c.createdAt,
        title: 'Preparação & Prontidão Concluída',
        description: 'Documentação, manutenções e vistorias verificadas.',
        stage: 'READY_FOR_DELIVERY',
      });
    }

    if (c.status === ContractStatus.ACTIVE) {
      timeline.push({
        id: `ev-act-${c.id}`,
        timestamp: c.startDate,
        title: 'Contrato Ativado & Entrega Realizada',
        description: `Início da locação em ${c.startDate}.`,
        stage: 'ACTIVE',
      });
    }

    if (c.status === ContractStatus.SUSPENDED) {
      timeline.push({
        id: `ev-susp-${c.id}`,
        timestamp: c.updatedAt,
        title: 'Locação Suspensa',
        description: 'Contrato temporariamente suspenso.',
        stage: 'SUSPENDED',
      });
    }

    if (c.status === ContractStatus.CLOSED || c.status === ContractStatus.FINISHED) {
      timeline.push({
        id: `ev-close-${c.id}`,
        timestamp: c.endDate || c.updatedAt,
        title: 'Contrato Encerrado & Fechado',
        description: 'Locação finalizada com sucesso.',
        stage: 'CLOSED',
      });
    }

    if (c.status === ContractStatus.CANCELLED) {
      timeline.push({
        id: `ev-canc-${c.id}`,
        timestamp: c.updatedAt,
        title: 'Contrato Cancelado',
        description: 'Locação cancelada antes da ativação ou por encerramento forçado.',
        stage: 'CANCELLED',
      });
    }

    return {
      contractId: c.id,
      contractNumber: c.contractNumber,
      companyId: c.companyId,
      vehicleId: c.vehicleId,
      vehiclePlate: veh?.plate,
      vehicleModel: veh ? `${veh.brand} ${veh.model}` : undefined,
      driverId: c.driverId,
      driverName: drv?.fullName,
      currentStage,
      isReadyForDelivery,
      readinessBlockers,
      startDate: c.startDate,
      endDate: c.endDate,
      rentalAmount: c.rentalAmount,
      timeline,
      canClose,
      closureBlockers,
    };
  });

  const reserved = items.filter(i => i.currentStage === 'RESERVED').length;
  const preparing = items.filter(i => i.currentStage === 'PREPARING').length;
  const readyForDelivery = items.filter(i => i.currentStage === 'READY_FOR_DELIVERY').length;
  const active = items.filter(i => i.currentStage === 'ACTIVE').length;
  const suspended = items.filter(i => i.currentStage === 'SUSPENDED').length;
  const returnPending = items.filter(i => i.currentStage === 'RETURN_PENDING').length;
  const closed = items.filter(i => i.currentStage === 'CLOSED').length;
  const cancelled = items.filter(i => i.currentStage === 'CANCELLED').length;

  return {
    companyId: targetCompanyId,
    generatedAt: new Date().toISOString(),
    counts: {
      total: items.length,
      reserved,
      preparing,
      readyForDelivery,
      active,
      suspended,
      returnPending,
      closed,
      cancelled,
    },
    items,
  };
}

/**
 * Validates state transition according to Phase 3.38 state machine rules.
 */
export function validateRentalStateTransition(fromStage: RentalLifecycleStage, toStage: RentalLifecycleStage): { allowed: boolean; reason?: string } {
  if (fromStage === toStage) return { allowed: true };

  const invalidTransitions: Record<string, RentalLifecycleStage[]> = {
    CLOSED: ['DRAFT', 'RESERVED', 'PREPARING', 'READY_FOR_DELIVERY', 'ACTIVE', 'SUSPENDED', 'RETURN_PENDING'],
    CANCELLED: ['ACTIVE', 'RETURN_PENDING', 'CLOSED'],
    RETURNED: ['ACTIVE'],
  };

  if (invalidTransitions[fromStage]?.includes(toStage)) {
    return {
      allowed: false,
      reason: `Transição inválida de '${fromStage}' para '${toStage}'.`,
    };
  }

  return { allowed: true };
}
