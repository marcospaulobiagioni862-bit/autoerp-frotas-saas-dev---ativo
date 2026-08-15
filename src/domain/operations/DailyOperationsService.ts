import { Vehicle, Contract, Maintenance, VehicleDocument, DriverDocument, TrafficTicket, Driver, Insurance, Tracker } from '../../types/entities';
import { VehicleStatus, ContractStatus, MaintenanceStatus, DocumentStatus, TicketStatus } from '../../types/enums';
import { generateOperationalPendings, OperationalPendingItem } from './OperationalPendingService';

export interface DailyActionItem {
  id: string;
  category: 'DELIVERY' | 'RETURN' | 'CONTRACT' | 'MAINTENANCE' | 'DOCUMENT' | 'INSURANCE' | 'TICKET' | 'GENERAL';
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  occurrenceDate: string;
  dueDate: string;
  overdueDays: number;
  vehicleId?: string;
  vehiclePlate?: string;
  driverId?: string;
  driverName?: string;
  contractId?: string;
  contractNumber?: string;
  actionRecommended: string;
  destinationTab: string;
}

export interface DailyOperationsSummary {
  companyId: string;
  generatedAt: string;
  todayStr: string;
  counts: {
    total: number;
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    deliveriesToday: number;
    returnsToday: number;
    contractsExpiringToday: number;
    maintenancesDueToday: number;
    documentsExpiringToday: number;
    overdueItems: number;
  };
  actions: DailyActionItem[];
}

export interface DailyOperationsInput {
  companyId?: string;
  vehicles?: Vehicle[];
  contracts?: Contract[];
  maintenances?: Maintenance[];
  vehicleDocuments?: VehicleDocument[];
  driverDocuments?: DriverDocument[];
  tickets?: TrafficTicket[];
  drivers?: Driver[];
  insurances?: Insurance[];
  trackers?: Tracker[];
  targetDate?: string; // YYYY-MM-DD
}

/**
 * Service for Daily Operations & Operational Productivity (Fase 3.37).
 * 
 * GUARANTEES:
 * - 100% Read-only (zero financial side effects, zero mutations, zero writes)
 * - Deterministic aggregation, safe against division by zero, nulls, and NaN
 * - Multi-tenancy isolation via companyId filtering
 */
export function generateDailyOperations(input: DailyOperationsInput = {}): DailyOperationsSummary {
  const targetCompanyId = input.companyId || 'company-main-uuid';
  const todayStr = input.targetDate || new Date().toISOString().split('T')[0];
  const todayTime = new Date(todayStr).getTime();

  const vehicles = Array.isArray(input.vehicles) ? input.vehicles.filter(v => v && !v.isArchived && (!input.companyId || v.companyId === targetCompanyId)) : [];
  const contracts = Array.isArray(input.contracts) ? input.contracts.filter(c => c && !c.isArchived && (!input.companyId || c.companyId === targetCompanyId)) : [];
  const maintenances = Array.isArray(input.maintenances) ? input.maintenances.filter(m => m && (!input.companyId || m.companyId === targetCompanyId)) : [];
  const vehicleDocuments = Array.isArray(input.vehicleDocuments) ? input.vehicleDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const driverDocuments = Array.isArray(input.driverDocuments) ? input.driverDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const tickets = Array.isArray(input.tickets) ? input.tickets.filter(t => t && (!input.companyId || t.companyId === targetCompanyId)) : [];
  const drivers = Array.isArray(input.drivers) ? input.drivers.filter(d => d && !d.isArchived && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const insurances = Array.isArray(input.insurances) ? input.insurances.filter(i => i && (!input.companyId || i.companyId === targetCompanyId)) : [];
  const trackers = Array.isArray(input.trackers) ? input.trackers.filter(t => t && (!input.companyId || t.companyId === targetCompanyId)) : [];

  const vehiclesMap = new Map(vehicles.map(v => [v.id, v]));
  const driversMap = new Map(drivers.map(d => [d.id, d]));

  const actions: DailyActionItem[] = [];

  // 1. Re-use OperationalPendingService for foundational operational risks
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

  operationalPendings.forEach(op => {
    actions.push({
      id: `pend-${op.id}`,
      category: op.type === 'VEHICLE' ? 'MAINTENANCE' : op.type === 'CONTRACT' ? 'CONTRACT' : op.type === 'DOCUMENT' ? 'DOCUMENT' : op.type === 'FINE' ? 'TICKET' : 'GENERAL',
      title: op.title,
      description: op.description,
      priority: op.priority as any,
      occurrenceDate: op.dueDate || todayStr,
      dueDate: op.dueDate || todayStr,
      overdueDays: op.overdueDays,
      vehicleId: op.entityId,
      vehiclePlate: op.vehiclePlate,
      driverName: op.driverName,
      contractNumber: op.contractNumber,
      actionRecommended: op.actionRecommended,
      destinationTab: op.destinationTab,
    });
  });

  // 2. Add Contract Deliveries & Returns (Start / End dates)
  contracts.forEach(c => {
    const veh = vehiclesMap.get(c.vehicleId);
    const drv = driversMap.get(c.driverId);

    if (c.startDate === todayStr && c.status === ContractStatus.ACTIVE) {
      actions.push({
        id: `delivery-${c.id}`,
        category: 'DELIVERY',
        title: `Entrega de Veículo prevista para hoje`,
        description: `Contrato ${c.contractNumber} prevê a entrega do veículo ${veh?.plate || 'Veículo'} para o motorista ${drv?.fullName || 'Motorista'}.`,
        priority: 'P1',
        occurrenceDate: c.startDate,
        dueDate: c.startDate,
        overdueDays: 0,
        vehicleId: c.vehicleId,
        vehiclePlate: veh?.plate,
        driverId: c.driverId,
        driverName: drv?.fullName,
        contractId: c.id,
        contractNumber: c.contractNumber,
        actionRecommended: 'Realizar Check-in e Entrega',
        destinationTab: 'contracts',
      });
    }

    if (c.endDate && c.status === ContractStatus.ACTIVE) {
      const targetTime = new Date(c.endDate).getTime();
      const diffDays = Math.floor((targetTime - todayTime) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        actions.push({
          id: `return-overdue-${c.id}`,
          category: 'RETURN',
          title: `Devolução de Veículo em Atraso`,
          description: `Contrato ${c.contractNumber} venceu em ${c.endDate} (${Math.abs(diffDays)} dia(s) atrás).`,
          priority: 'P0',
          occurrenceDate: c.endDate,
          dueDate: c.endDate,
          overdueDays: Math.abs(diffDays),
          vehicleId: c.vehicleId,
          vehiclePlate: veh?.plate,
          driverId: c.driverId,
          driverName: drv?.fullName,
          contractId: c.id,
          contractNumber: c.contractNumber,
          actionRecommended: 'Cobrar Devolução / Check-out',
          destinationTab: 'contracts',
        });
      } else if (diffDays === 0) {
        actions.push({
          id: `return-today-${c.id}`,
          category: 'RETURN',
          title: `Devolução de Veículo programada para hoje`,
          description: `Contrato ${c.contractNumber} encerra hoje. Veículo: ${veh?.plate || ''}.`,
          priority: 'P1',
          occurrenceDate: c.endDate,
          dueDate: c.endDate,
          overdueDays: 0,
          vehicleId: c.vehicleId,
          vehiclePlate: veh?.plate,
          driverId: c.driverId,
          driverName: drv?.fullName,
          contractId: c.id,
          contractNumber: c.contractNumber,
          actionRecommended: 'Preparar Check-out',
          destinationTab: 'contracts',
        });
      }
    }
  });

  // Deduplicate actions by id
  const uniqueActionsMap = new Map<string, DailyActionItem>();
  actions.forEach(a => uniqueActionsMap.set(a.id, a));
  const uniqueActions = Array.from(uniqueActionsMap.values());

  // Sort by priority (P0 > P1 > P2 > P3) then overdueDays descending
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  uniqueActions.sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
    if (pDiff !== 0) return pDiff;
    return b.overdueDays - a.overdueDays;
  });

  const p0 = uniqueActions.filter(a => a.priority === 'P0').length;
  const p1 = uniqueActions.filter(a => a.priority === 'P1').length;
  const p2 = uniqueActions.filter(a => a.priority === 'P2').length;
  const p3 = uniqueActions.filter(a => a.priority === 'P3').length;

  const deliveriesToday = uniqueActions.filter(a => a.category === 'DELIVERY' && a.occurrenceDate === todayStr).length;
  const returnsToday = uniqueActions.filter(a => a.category === 'RETURN' && a.occurrenceDate === todayStr).length;
  const contractsExpiringToday = uniqueActions.filter(a => a.category === 'CONTRACT' && a.dueDate === todayStr).length;
  const maintenancesDueToday = uniqueActions.filter(a => a.category === 'MAINTENANCE' && a.dueDate === todayStr).length;
  const documentsExpiringToday = uniqueActions.filter(a => a.category === 'DOCUMENT' && a.dueDate === todayStr).length;
  const overdueItems = uniqueActions.filter(a => a.overdueDays > 0).length;

  return {
    companyId: targetCompanyId,
    generatedAt: new Date().toISOString(),
    todayStr,
    counts: {
      total: uniqueActions.length,
      p0,
      p1,
      p2,
      p3,
      deliveriesToday,
      returnsToday,
      contractsExpiringToday,
      maintenancesDueToday,
      documentsExpiringToday,
      overdueItems,
    },
    actions: uniqueActions,
  };
}
