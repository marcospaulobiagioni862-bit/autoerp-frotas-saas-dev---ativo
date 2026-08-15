import { Vehicle, Contract, Maintenance, VehicleDocument, DriverDocument, TrafficTicket, Driver, Insurance, Tracker } from '../../types/entities';
import { VehicleStatus, ContractStatus } from '../../types/enums';
import { generateRentalLifecycleSummary, RentalLifecycleItem } from '../../domain/rental/RentalLifecycleService';
import { generateOperationalPendings, OperationalPendingItem } from './OperationalPendingService';

export type RentalControlOperationalStatus =
  | 'READY'
  | 'PREPARING'
  | 'BLOCKED'
  | 'ACTIVE'
  | 'RETURN_PENDING'
  | 'RETURN_LATE'
  | 'OCCURRENCE'
  | 'CLOSED_WITH_PENDING'
  | 'CLOSED';

export interface RentalControlItem {
  id: string;
  contractId: string;
  contractNumber: string;
  companyId: string;
  vehicleId: string;
  vehiclePlate?: string;
  driverId: string;
  driverName?: string;
  lifecycleStage: string;
  operationalStatus: RentalControlOperationalStatus;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  blockers: string[];
  warnings: string[];
  startDate: string;
  endDate?: string;
  daysOverdue: number;
  recommendedAction: string;
  destinationTab: string;
}

export interface RentalControlSummary {
  companyId: string;
  generatedAt: string;
  counts: {
    total: number;
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    ready: number;
    preparing: number;
    blocked: number;
    active: number;
    returnLate: number;
    occurrence: number;
  };
  items: RentalControlItem[];
}

export interface RentalControlInput {
  companyId?: string;
  vehicles?: Vehicle[];
  contracts?: Contract[];
  drivers?: Driver[];
  maintenances?: Maintenance[];
  vehicleDocuments?: VehicleDocument[];
  driverDocuments?: DriverDocument[];
  tickets?: TrafficTicket[];
  insurances?: Insurance[];
  trackers?: Tracker[];
}

/**
 * Service for Rental Control Center, Exceptions & Operational Occurrences (Phase 3.39).
 * 
 * GUARANTEES:
 * - 100% Read-only / Zero financial structure alterations
 * - Deterministic exception classification and priority assignment (P0 to P3)
 * - Multi-tenancy isolation via companyId filtering
 * - Safe against NaN, Infinity, and null/undefined values
 */
export function generateRentalControlSummary(input: RentalControlInput = {}): RentalControlSummary {
  const targetCompanyId = input.companyId || 'company-main-uuid';
  const todayStr = new Date().toISOString().split('T')[0];
  const todayTime = new Date(todayStr).getTime();

  const vehicles = Array.isArray(input.vehicles) ? input.vehicles.filter(v => v && !v.isArchived && (!input.companyId || v.companyId === targetCompanyId)) : [];
  const contracts = Array.isArray(input.contracts) ? input.contracts.filter(c => c && !c.isArchived && (!input.companyId || c.companyId === targetCompanyId)) : [];
  const drivers = Array.isArray(input.drivers) ? input.drivers.filter(d => d && !d.isArchived && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const maintenances = Array.isArray(input.maintenances) ? input.maintenances.filter(m => m && (!input.companyId || m.companyId === targetCompanyId)) : [];
  const vehicleDocuments = Array.isArray(input.vehicleDocuments) ? input.vehicleDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const driverDocuments = Array.isArray(input.driverDocuments) ? input.driverDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const tickets = Array.isArray(input.tickets) ? input.tickets.filter(t => t && (!input.companyId || t.companyId === targetCompanyId)) : [];
  const insurances = Array.isArray(input.insurances) ? input.insurances.filter(i => i && (!input.companyId || i.companyId === targetCompanyId)) : [];
  const trackers = Array.isArray(input.trackers) ? input.trackers.filter(t => t && (!input.companyId || t.companyId === targetCompanyId)) : [];

  const lifecycleSummary = generateRentalLifecycleSummary({
    companyId: targetCompanyId,
    contracts,
    vehicles,
    drivers,
    maintenances,
    vehicleDocuments,
    driverDocuments,
    insurances,
    trackers,
  });

  const operationalPendings = generateOperationalPendings({
    companyId: targetCompanyId,
    vehicles,
    contracts,
    maintenances,
    vehicleDocuments,
    driverDocuments,
    tickets,
    drivers,
    insurances,
    trackers,
  });

  const pendingsByVehicle = new Map<string, OperationalPendingItem[]>();
  operationalPendings.forEach(op => {
    if (op.entityId) {
      const list = pendingsByVehicle.get(op.entityId) || [];
      list.push(op);
      pendingsByVehicle.set(op.entityId, list);
    }
  });

  const items: RentalControlItem[] = lifecycleSummary.items.map(lc => {
    const vehPendings = pendingsByVehicle.get(lc.vehicleId) || [];
    const contractPendings = operationalPendings.filter(op => op.contractNumber === lc.contractNumber);
    const allRelatedPendings = [...vehPendings, ...contractPendings];

    const blockers: string[] = [...lc.readinessBlockers];
    const warnings: string[] = [];
    let priority: 'P0' | 'P1' | 'P2' | 'P3' = 'P3';
    let operationalStatus: RentalControlOperationalStatus = 'ACTIVE';

    allRelatedPendings.forEach(p => {
      if (p.priority === 'P0') {
        blockers.push(p.description);
        priority = 'P0';
      } else if (p.priority === 'P1') {
        warnings.push(p.description);
        if ((priority as string) !== 'P0') priority = 'P1';
      } else if (p.priority === 'P2') {
        warnings.push(p.description);
        if ((priority as string) !== 'P0' && (priority as string) !== 'P1') priority = 'P2';
      }
    });

    let daysOverdue = 0;
    if (lc.endDate && lc.currentStage === 'ACTIVE') {
      const endTime = new Date(lc.endDate).getTime();
      const diff = Math.floor((todayTime - endTime) / (1000 * 60 * 60 * 24));
      if (diff > 0) {
        daysOverdue = diff;
        operationalStatus = 'RETURN_LATE';
        if ((priority as string) !== 'P0') priority = 'P1';
        blockers.push(`Devolução em atraso há ${diff} dia(s).`);
      } else if (diff === 0) {
        operationalStatus = 'RETURN_PENDING';
      }
    }

    if (blockers.length > 0) {
      operationalStatus = 'BLOCKED';
      priority = 'P0';
    } else if (lc.currentStage === 'RESERVED') {
      operationalStatus = 'PREPARING';
    } else if (lc.currentStage === 'READY_FOR_DELIVERY') {
      operationalStatus = 'READY';
    } else if (lc.currentStage === 'ACTIVE' && operationalStatus !== 'RETURN_LATE') {
      operationalStatus = 'ACTIVE';
    } else if (lc.currentStage === 'CLOSED') {
      operationalStatus = 'CLOSED';
    }

    const recommendedAction = blockers.length > 0
      ? 'Resolver bloqueios operacionais na Central de Pendências'
      : lc.currentStage === 'RESERVED'
      ? 'Concluir preparação e vistoria de entrega'
      : lc.currentStage === 'ACTIVE'
      ? 'Monitorar locação e manutenções'
      : 'Acompanhar encerramento';

    return {
      id: `ctrl-${lc.contractId}`,
      contractId: lc.contractId,
      contractNumber: lc.contractNumber,
      companyId: lc.companyId,
      vehicleId: lc.vehicleId,
      vehiclePlate: lc.vehiclePlate,
      driverId: lc.driverId,
      driverName: lc.driverName,
      lifecycleStage: lc.currentStage,
      operationalStatus,
      priority,
      blockers,
      warnings,
      startDate: lc.startDate,
      endDate: lc.endDate,
      daysOverdue,
      recommendedAction,
      destinationTab: 'ciclo-locacao',
    };
  });

  const p0 = items.filter(i => i.priority === 'P0').length;
  const p1 = items.filter(i => i.priority === 'P1').length;
  const p2 = items.filter(i => i.priority === 'P2').length;
  const p3 = items.filter(i => i.priority === 'P3').length;

  const ready = items.filter(i => i.operationalStatus === 'READY').length;
  const preparing = items.filter(i => i.operationalStatus === 'PREPARING').length;
  const blocked = items.filter(i => i.operationalStatus === 'BLOCKED').length;
  const active = items.filter(i => i.operationalStatus === 'ACTIVE').length;
  const returnLate = items.filter(i => i.operationalStatus === 'RETURN_LATE').length;
  const occurrence = items.filter(i => i.blockers.length > 0 || i.warnings.length > 0).length;

  return {
    companyId: targetCompanyId,
    generatedAt: new Date().toISOString(),
    counts: {
      total: items.length,
      p0,
      p1,
      p2,
      p3,
      ready,
      preparing,
      blocked,
      active,
      returnLate,
      occurrence,
    },
    items,
  };
}
