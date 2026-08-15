import { Vehicle, Contract, Maintenance, VehicleDocument, DriverDocument, TrafficTicket, Driver, Insurance, Tracker } from '../../types/entities';
import { VehicleStatus, ContractStatus, MaintenanceStatus, DocumentStatus, TicketStatus } from '../../types/enums';
import { calculateHealthScore, OperationalMetricsResult } from '../metrics/OperationalMetricsService';
import { generateOperationalPendings, OperationalPendingItem } from '../operations/OperationalPendingService';

export interface FleetReportSummary {
  totalVehicles: number;
  available: number;
  rented: number;
  maintenance: number;
  inactive: number;
  blocked: number;
  availabilityRate: number; // % available / total
  utilizationRate: number;  // % rented / total
  stoppedRate: number;      // % (maintenance + inactive + blocked) / total
}

export interface ContractReportSummary {
  totalContracts: number;
  activeContracts: number;
  closedContracts: number;
  cancelledContracts: number;
  expiringSoon: number; // next 7 days
  expired: number;
}

export interface MaintenanceReportSummary {
  totalMaintenances: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

export interface DocumentReportSummary {
  totalDocuments: number;
  valid: number;
  expiringSoon: number; // next 15 days
  expired: number;
  insurancesTotal: number;
  insurancesActive: number;
  insurancesExpired: number;
  trackersTotal: number;
  trackersActive: number;
}

export interface TrafficTicketReportSummary {
  totalTickets: number;
  pendingIdentification: number;
  identified: number;
  appealed: number;
  paidOrCharged: number;
  cancelled: number;
  inAppeal?: number;
  paid?: number;
  closed?: number;
}

export interface VehicleManagementDetail {
  vehicleId: string;
  plate: string;
  brand: string;
  model: string;
  status: VehicleStatus;
  currentKm: number;
  activeContractNumber?: string;
  driverName?: string;
  maintenanceCount: number;
  ticketCount: number;
  pendingCount: number;
  hasExpiredDocuments: boolean;
  healthStatus: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
}

export interface DriverManagementDetail {
  driverId: string;
  fullName: string;
  cnhNumber: string;
  cnhExpiration: string;
  cnhStatus: DocumentStatus;
  activeContractNumber?: string;
  vehiclePlate?: string;
  ticketCount: number;
  status: string;
}

export interface ManagementReportData {
  companyId: string;
  generatedAt: string;
  fleet: FleetReportSummary;
  contracts: ContractReportSummary;
  maintenance: MaintenanceReportSummary;
  documents: DocumentReportSummary;
  tickets: TrafficTicketReportSummary;
  healthScore: OperationalMetricsResult;
  pendings: OperationalPendingItem[];
  vehicleDetails: VehicleManagementDetail[];
  driverDetails: DriverManagementDetail[];
}

export interface ManagementReportsInput {
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
}

/**
 * Service to aggregate management reports and operational indicators (Fase 3.36).
 * 
 * GUARANTEES:
 * - 100% Read-only (zero financial side effects, zero mutations, zero writes)
 * - Deterministic calculations, safe against division by zero, nulls, and NaN
 * - Multi-tenancy isolation via companyId filtering
 */
export function generateManagementReport(input: ManagementReportsInput = {}): ManagementReportData {
  const targetCompanyId = input.companyId || 'company-main-uuid';

  const vehicles = Array.isArray(input.vehicles) ? input.vehicles.filter(v => v && !v.isArchived && (!input.companyId || v.companyId === targetCompanyId)) : [];
  const contracts = Array.isArray(input.contracts) ? input.contracts.filter(c => c && !c.isArchived && (!input.companyId || c.companyId === targetCompanyId)) : [];
  const maintenances = Array.isArray(input.maintenances) ? input.maintenances.filter(m => m && (!input.companyId || m.companyId === targetCompanyId)) : [];
  const vehicleDocuments = Array.isArray(input.vehicleDocuments) ? input.vehicleDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const driverDocuments = Array.isArray(input.driverDocuments) ? input.driverDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const tickets = Array.isArray(input.tickets) ? input.tickets.filter(t => t && (!input.companyId || t.companyId === targetCompanyId)) : [];
  const drivers = Array.isArray(input.drivers) ? input.drivers.filter(d => d && !d.isArchived && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const insurances = Array.isArray(input.insurances) ? input.insurances.filter(i => i && (!input.companyId || i.companyId === targetCompanyId)) : [];
  const trackers = Array.isArray(input.trackers) ? input.trackers.filter(t => t && (!input.companyId || t.companyId === targetCompanyId)) : [];

  const todayStr = new Date().toISOString().split('T')[0];
  const todayTime = new Date(todayStr).getTime();

  // 1. Fleet Summary
  const totalVehicles = vehicles.length;
  const available = vehicles.filter(v => v.status === VehicleStatus.AVAILABLE).length;
  const rented = vehicles.filter(v => v.status === VehicleStatus.RENTED).length;
  const maintenanceCount = vehicles.filter(v => v.status === VehicleStatus.MAINTENANCE).length;
  const inactive = vehicles.filter(v => v.status === VehicleStatus.INACTIVE).length;
  const blocked = vehicles.filter(v => v.status === VehicleStatus.SOLD).length;

  const availabilityRate = totalVehicles > 0 ? Math.round((available / totalVehicles) * 100) : 0;
  const utilizationRate = totalVehicles > 0 ? Math.round((rented / totalVehicles) * 100) : 0;
  const stoppedRate = totalVehicles > 0 ? Math.round(((maintenanceCount + inactive + blocked) / totalVehicles) * 100) : 0;

  const fleet: FleetReportSummary = {
    totalVehicles,
    available,
    rented,
    maintenance: maintenanceCount,
    inactive,
    blocked,
    availabilityRate,
    utilizationRate,
    stoppedRate,
  };

  // 2. Contracts Summary
  const totalContracts = contracts.length;
  let activeContracts = 0;
  let closedContracts = 0;
  let cancelledContracts = 0;
  let expiringSoonContracts = 0;
  let expiredContracts = 0;

  contracts.forEach(c => {
    if (c.status === ContractStatus.ACTIVE) {
      activeContracts++;
      if (c.endDate) {
        if (c.endDate < todayStr) {
          expiredContracts++;
        } else {
          const targetTime = new Date(c.endDate).getTime();
          const diffDays = Math.floor((targetTime - todayTime) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 7) {
            expiringSoonContracts++;
          }
        }
      }
    } else if (c.status === ContractStatus.FINISHED || c.status === ContractStatus.CLOSED) {
      closedContracts++;
    } else if (c.status === ContractStatus.CANCELLED) {
      cancelledContracts++;
    }
  });

  const contractSummary: ContractReportSummary = {
    totalContracts,
    activeContracts,
    closedContracts,
    cancelledContracts,
    expiringSoon: expiringSoonContracts,
    expired: expiredContracts,
  };

  // 3. Maintenance Summary
  let scheduledMaint = 0;
  let inProgressMaint = 0;
  let completedMaint = 0;
  let overdueMaint = 0;

  maintenances.forEach(m => {
    if (m.status === MaintenanceStatus.SCHEDULED) {
      scheduledMaint++;
      if (m.startDate && m.startDate < todayStr) overdueMaint++;
    } else if (m.status === MaintenanceStatus.IN_PROGRESS) {
      inProgressMaint++;
      if (m.startDate && m.startDate < todayStr) overdueMaint++;
    } else if (m.status === MaintenanceStatus.COMPLETED) {
      completedMaint++;
    }
  });

  const maintenanceSummary: MaintenanceReportSummary = {
    totalMaintenances: maintenances.length,
    scheduled: scheduledMaint,
    inProgress: inProgressMaint,
    completed: completedMaint,
    overdue: overdueMaint,
  };

  // 4. Document Summary
  let validDocs = 0;
  let expiringDocs = 0;
  let expiredDocs = 0;

  vehicleDocuments.forEach(d => {
    if (!d.expirationDate) {
      validDocs++;
      return;
    }
    if (d.expirationDate < todayStr || d.status === DocumentStatus.EXPIRED) {
      expiredDocs++;
    } else {
      const targetTime = new Date(d.expirationDate).getTime();
      const diffDays = Math.floor((targetTime - todayTime) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 15) {
        expiringDocs++;
      } else {
        validDocs++;
      }
    }
  });

  let insurancesActive = 0;
  let insurancesExpired = 0;
  insurances.forEach(i => {
    if (!i.endDate) {
      insurancesActive++;
      return;
    }
    if (i.endDate < todayStr || i.status === DocumentStatus.EXPIRED) {
      insurancesExpired++;
    } else {
      insurancesActive++;
    }
  });

  let trackersActive = 0;
  trackers.forEach(t => {
    if (t.status === 'ACTIVE') trackersActive++;
  });

  const documentSummary: DocumentReportSummary = {
    totalDocuments: vehicleDocuments.length,
    valid: validDocs,
    expiringSoon: expiringDocs,
    expired: expiredDocs,
    insurancesTotal: insurances.length,
    insurancesActive,
    insurancesExpired,
    trackersTotal: trackers.length,
    trackersActive,
  };

  // 5. Traffic Tickets Summary
  let pendingIdTickets = 0;
  let identifiedTickets = 0;
  let appealedTickets = 0;
  let paidOrChargedTickets = 0;
  let cancelledTickets = 0;

  tickets.forEach(t => {
    if (t.status === TicketStatus.PENDING_IDENTIFICATION) pendingIdTickets++;
    else if (t.status === TicketStatus.IDENTIFIED) identifiedTickets++;
    else if (t.status === TicketStatus.APPEALED) appealedTickets++;
    else if (t.status === TicketStatus.PAID_BY_COMPANY || t.status === TicketStatus.CHARGED_DRIVER) paidOrChargedTickets++;
    else if (t.status === TicketStatus.CANCELLED) cancelledTickets++;
  });

  const ticketSummary: TrafficTicketReportSummary = {
    totalTickets: tickets.length,
    pendingIdentification: pendingIdTickets,
    identified: identifiedTickets,
    appealed: appealedTickets,
    paidOrCharged: paidOrChargedTickets,
    cancelled: cancelledTickets,
    inAppeal: appealedTickets,
    paid: paidOrChargedTickets,
    closed: 0,
  };

  // 6. Health Score Integration
  const healthScore = calculateHealthScore({
    vehicles,
    contracts,
    maintenances,
    documents: vehicleDocuments,
    tickets,
  });

  // 7. Pendings Integration
  const pendings = generateOperationalPendings({
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

  // 8. Vehicle Management Details
  const activeContractsMap = new Map(
    contracts.filter(c => c.status === ContractStatus.ACTIVE).map(c => [c.vehicleId, c])
  );
  const driversMap = new Map(drivers.map(d => [d.id, d]));

  const vehicleDetails: VehicleManagementDetail[] = vehicles.map(v => {
    const activeContract = activeContractsMap.get(v.id);
    const driver = activeContract ? driversMap.get(activeContract.driverId) : undefined;
    const vehMaints = maintenances.filter(m => m.vehicleId === v.id);
    const vehTickets = tickets.filter(t => t.vehicleId === v.id);
    const vehPendings = pendings.filter(p => p.entityId === v.id || p.vehiclePlate === v.plate);
    const vehDocs = vehicleDocuments.filter(d => d.vehicleId === v.id);
    const hasExpiredDocuments = vehDocs.some(d => d.expirationDate && d.expirationDate < todayStr);

    let vehHealth: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL' = 'EXCELLENT';
    if (vehPendings.some(p => p.priority === 'P0' || p.priority === 'P1') || hasExpiredDocuments) {
      vehHealth = 'CRITICAL';
    } else if (vehPendings.length > 0) {
      vehHealth = 'WARNING';
    } else if (v.status === VehicleStatus.AVAILABLE) {
      vehHealth = 'EXCELLENT';
    } else {
      vehHealth = 'GOOD';
    }

    return {
      vehicleId: v.id,
      plate: v.plate,
      brand: v.brand,
      model: v.model,
      status: v.status,
      currentKm: v.currentKm || 0,
      activeContractNumber: activeContract?.contractNumber,
      driverName: driver?.fullName,
      maintenanceCount: vehMaints.length,
      ticketCount: vehTickets.length,
      pendingCount: vehPendings.length,
      hasExpiredDocuments,
      healthStatus: vehHealth,
    };
  });

  // 9. Driver Management Details
  const driverDetails: DriverManagementDetail[] = drivers.map(d => {
    const activeContract = contracts.find(c => c.driverId === d.id && c.status === ContractStatus.ACTIVE);
    const veh = activeContract ? vehicles.find(v => v.id === activeContract.vehicleId) : undefined;
    const drvTickets = tickets.filter(t => t.driverId === d.id);

    return {
      driverId: d.id,
      fullName: d.fullName,
      cnhNumber: d.cnhNumber,
      cnhExpiration: d.cnhExpiration,
      cnhStatus: d.cnhStatus,
      activeContractNumber: activeContract?.contractNumber,
      vehiclePlate: veh?.plate,
      ticketCount: drvTickets.length,
      status: d.status,
    };
  });

  return {
    companyId: targetCompanyId,
    generatedAt: new Date().toISOString(),
    fleet,
    contracts: contractSummary,
    maintenance: maintenanceSummary,
    documents: documentSummary,
    tickets: ticketSummary,
    healthScore,
    pendings,
    vehicleDetails,
    driverDetails,
  };
}
