import { Vehicle, Contract, Maintenance, VehicleDocument, DriverDocument, TrafficTicket, Driver, Insurance, Tracker } from '../../types/entities';
import { generateRentalControlSummary, RentalControlSummary } from '../operations/RentalControlCenterService';
import { generateOperationalPendings, OperationalPendingItem } from '../operations/OperationalPendingService';

export type IncidentCategory =
  | 'VEHICLE'
  | 'DRIVER'
  | 'CONTRACT'
  | 'RENTAL'
  | 'DELIVERY'
  | 'RETURN'
  | 'MAINTENANCE'
  | 'DOCUMENT'
  | 'INSURANCE'
  | 'TRACKER'
  | 'FINE'
  | 'OPERATIONAL'
  | 'COMPLIANCE'
  | 'OTHER';

export type IncidentPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type IncidentStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED';

export type SlaStatus = 'ON_TIME' | 'AT_RISK' | 'OVERDUE' | 'RESOLVED';

export type RootCause =
  | 'HUMAN_ERROR'
  | 'VEHICLE_FAILURE'
  | 'PROCESS_FAILURE'
  | 'DOCUMENTATION'
  | 'SUPPLIER'
  | 'DRIVER'
  | 'SYSTEM'
  | 'EXTERNAL'
  | 'UNKNOWN'
  | 'OTHER';

export interface IncidentAction {
  id: string;
  incidentId: string;
  companyId: string;
  actionType: string;
  description: string;
  performedBy: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface OperationalIncident {
  id: string;
  companyId: string;
  type: string;
  category: IncidentCategory;
  priority: IncidentPriority;
  status: IncidentStatus;
  title: string;
  description: string;
  vehicleId?: string;
  vehiclePlate?: string;
  driverId?: string;
  driverName?: string;
  contractId?: string;
  contractNumber?: string;
  maintenanceId?: string;
  fineId?: string;
  documentId?: string;
  insuranceId?: string;
  trackerId?: string;
  sourceType?: string;
  sourceId?: string;
  assignedTo?: string;
  assignedTeam?: string;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  resolvedBy?: string;
  closedBy?: string;
  resolution?: string;
  rootCause?: RootCause;
  recurrenceCount: number;
  isRecurring: boolean;
  slaStatus: SlaStatus;
  lastActionAt?: string;
  actions: IncidentAction[];
  auditLogId?: string;
}

export interface IncidentSummary {
  companyId: string;
  generatedAt: string;
  counts: {
    total: number;
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    open: number;
    inProgress: number;
    waiting: number;
    resolved: number;
    closed: number;
    cancelled: number;
    overdue: number;
    recurring: number;
  };
  incidents: OperationalIncident[];
}

export interface IncidentInput {
  companyId?: string;
  incidents?: OperationalIncident[];
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
 * Validates incident status state machine transitions.
 */
export function validateIncidentStateTransition(currentStatus: IncidentStatus, targetStatus: IncidentStatus): boolean {
  if (currentStatus === targetStatus) return true;
  switch (currentStatus) {
    case 'OPEN':
      return ['IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED'].includes(targetStatus);
    case 'IN_PROGRESS':
      return ['WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED'].includes(targetStatus);
    case 'WAITING':
      return ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'].includes(targetStatus);
    case 'RESOLVED':
      return ['CLOSED', 'IN_PROGRESS'].includes(targetStatus);
    case 'CLOSED':
    case 'CANCELLED':
      return ['OPEN'].includes(targetStatus); // Reopen requires special authorization/audit
    default:
      return false;
  }
}

/**
 * Generates and synchronizes operational incident summary for Phase 3.40.
 * Automatically ingests critical blockers from Rental Control and Operational Pendings as core operational incidents.
 */
export function generateOperationalIncidentSummary(input: IncidentInput = {}): IncidentSummary {
  const targetCompanyId = input.companyId || 'company-main-uuid';
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const todayTime = now.getTime();

  const vehicles = Array.isArray(input.vehicles) ? input.vehicles.filter(v => v && !v.isArchived && (!input.companyId || v.companyId === targetCompanyId)) : [];
  const contracts = Array.isArray(input.contracts) ? input.contracts.filter(c => c && !c.isArchived && (!input.companyId || c.companyId === targetCompanyId)) : [];
  const drivers = Array.isArray(input.drivers) ? input.drivers.filter(d => d && !d.isArchived && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const maintenances = Array.isArray(input.maintenances) ? input.maintenances.filter(m => m && (!input.companyId || m.companyId === targetCompanyId)) : [];
  const vehicleDocuments = Array.isArray(input.vehicleDocuments) ? input.vehicleDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const driverDocuments = Array.isArray(input.driverDocuments) ? input.driverDocuments.filter(d => d && (!input.companyId || d.companyId === targetCompanyId)) : [];
  const tickets = Array.isArray(input.tickets) ? input.tickets.filter(t => t && (!input.companyId || t.companyId === targetCompanyId)) : [];
  const insurances = Array.isArray(input.insurances) ? input.insurances.filter(i => i && (!input.companyId || i.companyId === targetCompanyId)) : [];
  const trackers = Array.isArray(input.trackers) ? input.trackers.filter(t => t && (!input.companyId || t.companyId === targetCompanyId)) : [];

  const existingIncidents = Array.isArray(input.incidents) ? input.incidents.filter(i => i && i.companyId === targetCompanyId) : [];

  // Generate control summary and operational pendings to auto-detect incidents if none provided or to sync
  const controlSummary = generateRentalControlSummary({
    companyId: targetCompanyId,
    vehicles,
    contracts,
    drivers,
    maintenances,
    vehicleDocuments,
    driverDocuments,
    tickets,
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

  const incidentMap = new Map<string, OperationalIncident>();
  existingIncidents.forEach(inc => {
    incidentMap.set(inc.id, { ...inc });
  });

  // Auto-seed/sync incidents from operational pendings & blockers if not already present
  operationalPendings.forEach((op, index) => {
    const sourceKey = `pend-${op.id || index}`;
    const found = Array.from(incidentMap.values()).find(i => i.sourceType === 'PENDING' && i.sourceId === op.id);

    if (!found) {
      const priority: IncidentPriority = op.priority === 'P0' ? 'P0' : op.priority === 'P1' ? 'P1' : op.priority === 'P2' ? 'P2' : 'P3';
      const category: IncidentCategory = op.type === 'MAINTENANCE' ? 'MAINTENANCE' : op.type === 'DOCUMENT' ? 'DOCUMENT' : op.type === 'FINE' ? 'FINE' : op.type === 'VEHICLE' ? 'VEHICLE' : op.type === 'DRIVER' ? 'DRIVER' : op.type === 'CONTRACT' ? 'CONTRACT' : op.type === 'INSURANCE' ? 'INSURANCE' : op.type === 'TRACKER' ? 'TRACKER' : 'OPERATIONAL';
      
      const newInc: OperationalIncident = {
        id: `inc-${targetCompanyId}-${op.id || index}`,
        companyId: targetCompanyId,
        type: op.type,
        category,
        priority,
        status: 'OPEN',
        title: op.title,
        description: op.description,
        vehicleId: op.entityId,
        vehiclePlate: op.vehiclePlate,
        contractNumber: op.contractNumber,
        sourceType: 'PENDING',
        sourceId: op.id,
        createdAt: todayStr,
        updatedAt: todayStr,
        dueAt: new Date(now.getTime() + 48 * 3600 * 1000).toISOString().split('T')[0],
        recurrenceCount: 0,
        isRecurring: false,
        slaStatus: 'ON_TIME',
        actions: [
          {
            id: `act-${Date.now()}-${index}`,
            incidentId: `inc-${targetCompanyId}-${op.id || index}`,
            companyId: targetCompanyId,
            actionType: 'CREATED',
            description: 'Incidente gerado automaticamente a partir da Central de Pendências.',
            performedBy: 'Sistema AutoERP',
            createdAt: now.toISOString(),
          }
        ],
      };
      incidentMap.set(newInc.id, newInc);
    }
  });

  // Also ingest control items with blockers
  controlSummary.items.forEach((ctrl, index) => {
    if (ctrl.blockers.length > 0 || ctrl.warnings.length > 0) {
      const sourceKey = `ctrl-${ctrl.contractId}`;
      const found = Array.from(incidentMap.values()).find(i => i.sourceType === 'CONTROL' && i.sourceId === ctrl.contractId);

      if (!found) {
        const newInc: OperationalIncident = {
          id: `inc-ctrl-${ctrl.contractId}`,
          companyId: targetCompanyId,
          type: 'RENTAL_EXCEPTION',
          category: 'RENTAL',
          priority: ctrl.priority,
          status: 'OPEN',
          title: `Exceção na Locação ${ctrl.contractNumber}`,
          description: ctrl.blockers.join(' | ') || ctrl.warnings.join(' | '),
          vehicleId: ctrl.vehicleId,
          vehiclePlate: ctrl.vehiclePlate,
          contractId: ctrl.contractId,
          contractNumber: ctrl.contractNumber,
          driverId: ctrl.driverId,
          driverName: ctrl.driverName,
          sourceType: 'CONTROL',
          sourceId: ctrl.contractId,
          createdAt: todayStr,
          updatedAt: todayStr,
          dueAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString().split('T')[0],
          recurrenceCount: 0,
          isRecurring: false,
          slaStatus: 'ON_TIME',
          actions: [
            {
              id: `act-ctrl-${Date.now()}-${index}`,
              incidentId: `inc-ctrl-${ctrl.contractId}`,
              companyId: targetCompanyId,
              actionType: 'CREATED',
              description: 'Incidente gerado automaticamente a partir da Central de Controle de Locação.',
              performedBy: 'Sistema AutoERP',
              createdAt: now.toISOString(),
            }
          ],
        };
        incidentMap.set(newInc.id, newInc);
      }
    }
  });

  const incidents = Array.from(incidentMap.values()).map(inc => {
    let slaStatus: SlaStatus = inc.slaStatus;
    if (inc.status === 'RESOLVED' || inc.status === 'CLOSED') {
      slaStatus = 'RESOLVED';
    } else if (inc.dueAt) {
      const dueTime = new Date(inc.dueAt).getTime();
      if (todayTime > dueTime) {
        slaStatus = 'OVERDUE';
      } else if (dueTime - todayTime < 24 * 3600 * 1000) {
        slaStatus = 'AT_RISK';
      } else {
        slaStatus = 'ON_TIME';
      }
    }
    return { ...inc, slaStatus };
  });

  // Calculate counts safely
  let p0 = 0, p1 = 0, p2 = 0, p3 = 0;
  let open = 0, inProgress = 0, waiting = 0, resolved = 0, closed = 0, cancelled = 0;
  let overdue = 0, recurring = 0;

  incidents.forEach(inc => {
    if (inc.priority === 'P0') p0++;
    else if (inc.priority === 'P1') p1++;
    else if (inc.priority === 'P2') p2++;
    else if (inc.priority === 'P3') p3++;

    if (inc.status === 'OPEN') open++;
    else if (inc.status === 'IN_PROGRESS') inProgress++;
    else if (inc.status === 'WAITING') waiting++;
    else if (inc.status === 'RESOLVED') resolved++;
    else if (inc.status === 'CLOSED') closed++;
    else if (inc.status === 'CANCELLED') cancelled++;

    if (inc.slaStatus === 'OVERDUE') overdue++;
    if (inc.isRecurring) recurring++;
  });

  return {
    companyId: targetCompanyId,
    generatedAt: now.toISOString(),
    counts: {
      total: incidents.length,
      p0,
      p1,
      p2,
      p3,
      open,
      inProgress,
      waiting,
      resolved,
      closed,
      cancelled,
      overdue,
      recurring,
    },
    incidents,
  };
}
