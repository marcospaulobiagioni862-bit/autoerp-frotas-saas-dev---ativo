import { Vehicle, Contract, Maintenance, VehicleDocument, TrafficTicket } from '../../types/entities';
import { VehicleStatus, ContractStatus, MaintenanceStatus, DocumentStatus, TicketStatus } from '../../types/enums';

export interface OperationalMetricsInput {
  vehicles?: Vehicle[];
  contracts?: Contract[];
  maintenances?: Maintenance[];
  documents?: VehicleDocument[];
  tickets?: TrafficTicket[];
}

export interface OperationalMetricsResult {
  score: number;
  status: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
  components: {
    fleetAvailability: number;
    contractHealth: number;
    maintenanceHealth: number;
    documentationHealth: number;
    complianceHealth: number;
  };
  indicators: {
    totalVehicles: number;
    availableVehicles: number;
    activeContracts: number;
    overdueMaintenance: number;
    expiredDocuments: number;
    openTickets: number;
  };
}

/**
 * Read-only operational metrics aggregation service for AutoERP Dashboard.
 * Calculates the composite Operational Health Score based on real fleet, contract,
 * maintenance, document, and ticket records.
 * 
 * GUARANTEES:
 * - 100% Read-only (zero financial side effects, zero mutations, zero DB/storage writes)
 * - Deterministic and safe against edge cases (nulls, empty arrays, division by zero)
 */
export function calculateHealthScore(data: OperationalMetricsInput = {}): OperationalMetricsResult {
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles.filter(v => v && !v.isArchived) : [];
  const contracts = Array.isArray(data.contracts) ? data.contracts.filter(c => c && !c.isArchived) : [];
  const maintenances = Array.isArray(data.maintenances) ? data.maintenances.filter(Boolean) : [];
  const documents = Array.isArray(data.documents) ? data.documents.filter(Boolean) : [];
  const tickets = Array.isArray(data.tickets) ? data.tickets.filter(Boolean) : [];

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Fleet Availability (25% weight)
  const totalVehicles = vehicles.length;
  let fleetAvailability = 100;
  let availableVehiclesCount = 0;

  if (totalVehicles > 0) {
    availableVehiclesCount = vehicles.filter(
      v => v.status === VehicleStatus.AVAILABLE || v.status === VehicleStatus.RENTED
    ).length;
    fleetAvailability = Math.max(0, Math.min(100, (availableVehiclesCount / totalVehicles) * 100));
  }

  // 2. Contract Health (20% weight)
  const totalContracts = contracts.length;
  let activeContractsCount = 0;
  let contractHealth = 100;

  if (totalContracts > 0) {
    activeContractsCount = contracts.filter(c => c.status === ContractStatus.ACTIVE).length;
    contractHealth = Math.max(0, Math.min(100, (activeContractsCount / totalContracts) * 100));
  }

  // 3. Maintenance Health (20% weight)
  let overdueMaintenanceCount = 0;
  let maintenanceHealth = 100;

  if (maintenances.length > 0) {
    const activeMaintenances = maintenances.filter(
      m => m.status === MaintenanceStatus.SCHEDULED || m.status === MaintenanceStatus.IN_PROGRESS
    );
    overdueMaintenanceCount = activeMaintenances.filter(m => {
      if (!m.startDate) return false;
      return m.startDate < todayStr;
    }).length;

    const totalOpenOrScheduled = activeMaintenances.length;
    if (totalOpenOrScheduled > 0) {
      const penaltyRatio = overdueMaintenanceCount / totalOpenOrScheduled;
      maintenanceHealth = Math.max(0, Math.min(100, (1 - penaltyRatio) * 100));
    }
  }

  // 4. Documentation Health (20% weight)
  let expiredDocumentsCount = 0;
  let documentationHealth = 100;

  if (documents.length > 0) {
    expiredDocumentsCount = documents.filter(d => {
      if (!d.expirationDate) return false;
      return d.status === DocumentStatus.EXPIRED || d.expirationDate < todayStr;
    }).length;
    const penalty = (expiredDocumentsCount / documents.length) * 100;
    documentationHealth = Math.max(0, Math.min(100, 100 - penalty));
  }

  // 5. Compliance / Fines Health (15% weight)
  let openTicketsCount = 0;
  let complianceHealth = 100;

  if (tickets.length > 0) {
    openTicketsCount = tickets.filter(
      t => t.status === TicketStatus.PENDING_IDENTIFICATION || t.status === TicketStatus.IDENTIFIED
    ).length;
    const penalty = (openTicketsCount / tickets.length) * 100;
    complianceHealth = Math.max(0, Math.min(100, 100 - penalty));
  }

  // Composite Score Calculation (Normalized 0 - 100)
  const rawScore =
    fleetAvailability * 0.25 +
    contractHealth * 0.20 +
    maintenanceHealth * 0.20 +
    documentationHealth * 0.20 +
    complianceHealth * 0.15;

  const score = Math.round(Math.max(0, Math.min(100, isNaN(rawScore) ? 100 : rawScore)));

  let status: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL' = 'EXCELLENT';
  if (score >= 90) {
    status = 'EXCELLENT';
  } else if (score >= 75) {
    status = 'GOOD';
  } else if (score >= 60) {
    status = 'WARNING';
  } else {
    status = 'CRITICAL';
  }

  return {
    score,
    status,
    components: {
      fleetAvailability: Math.round(fleetAvailability),
      contractHealth: Math.round(contractHealth),
      maintenanceHealth: Math.round(maintenanceHealth),
      documentationHealth: Math.round(documentationHealth),
      complianceHealth: Math.round(complianceHealth),
    },
    indicators: {
      totalVehicles,
      availableVehicles: availableVehiclesCount,
      activeContracts: activeContractsCount,
      overdueMaintenance: overdueMaintenanceCount,
      expiredDocuments: expiredDocumentsCount,
      openTickets: openTicketsCount,
    },
  };
}
