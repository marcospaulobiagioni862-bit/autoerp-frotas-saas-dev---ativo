import type {
  Vehicle,
  Contract,
  Maintenance,
  VehicleDocument,
  DriverDocument,
  TrafficTicket,
  Driver,
  Insurance,
  Tracker,
} from '../../types/entities';
import {
  VehicleStatus,
  ContractStatus,
  MaintenanceStatus,
  DocumentStatus,
  TicketStatus,
} from '../../types/enums';

export type PendingType =
  | 'VEHICLE'
  | 'CONTRACT'
  | 'MAINTENANCE'
  | 'DOCUMENT'
  | 'FINE'
  | 'DRIVER'
  | 'INSURANCE'
  | 'TRACKER'
  | 'DELIVERY_RETURN';
export type PendingPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type PendingSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type PendingStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';

export interface OperationalPendingItem {
  id: string;
  type: PendingType;
  category: string;
  priority: PendingPriority;
  severity: PendingSeverity;
  title: string;
  description: string;
  entity: string;
  entityId: string;
  vehiclePlate?: string;
  driverName?: string;
  contractNumber?: string;
  occurrenceDate?: string;
  dueDate?: string;
  overdueDays: number;
  status: PendingStatus;
  origin: string;
  actionRecommended: string;
  destinationTab: string;
  companyId: string;
  timestamp: string;
}

export interface OperationalPendingInput {
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

type TenantEntity = { companyId?: string };

function canonicalCompanyId(data: OperationalPendingInput): string {
  const candidates = [
    data.vehicles,
    data.contracts,
    data.maintenances,
    data.vehicleDocuments,
    data.driverDocuments,
    data.tickets,
    data.drivers,
    data.insurances,
    data.trackers,
  ];
  const serverCompanyIds = new Set<string>();
  for (const collection of candidates) {
    if (!Array.isArray(collection)) continue;
    for (const entity of collection as TenantEntity[]) {
      const id = typeof entity?.companyId === 'string' ? entity.companyId.trim() : '';
      if (id) serverCompanyIds.add(id);
    }
  }
  if (serverCompanyIds.size > 1) throw new Error('SERVER_READ_MODEL_CROSS_TENANT_PAYLOAD');
  const serverCompanyId = [...serverCompanyIds][0];
  const requestedCompanyId = typeof data.companyId === 'string' ? data.companyId.trim() : '';
  if (requestedCompanyId && serverCompanyId && requestedCompanyId !== serverCompanyId) {
    throw new Error('SERVER_READ_MODEL_TENANT_MISMATCH');
  }
  const resolved = serverCompanyId || requestedCompanyId;
  if (!resolved) throw new Error('SERVER_READ_MODEL_COMPANY_REQUIRED');
  return resolved;
}

function deterministicId(key: string): string {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pend_${(hash >>> 0).toString(36)}_${key.length.toString(36)}`;
}

export function generateOperationalPendings(data: OperationalPendingInput = {}): OperationalPendingItem[] {
  const companyId = canonicalCompanyId(data);
  const sameTenant = <T extends TenantEntity>(items?: T[]): T[] =>
    Array.isArray(items) ? items.filter((item) => item && item.companyId === companyId) : [];

  const vehicles = sameTenant(data.vehicles).filter((vehicle) => !vehicle.isArchived);
  const contracts = sameTenant(data.contracts).filter((contract) => !contract.isArchived);
  const maintenances = sameTenant(data.maintenances);
  const vehicleDocuments = sameTenant(data.vehicleDocuments);
  const tickets = sameTenant(data.tickets);
  const drivers = sameTenant(data.drivers).filter((driver) => !driver.isArchived);
  const insurances = sameTenant(data.insurances);
  const trackers = sameTenant(data.trackers);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTime = Date.parse(`${todayStr}T00:00:00.000Z`);
  const timestamp = `${todayStr}T00:00:00.000Z`;
  const pendings: OperationalPendingItem[] = [];
  const seen = new Set<string>();
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));

  const daysFrom = (date?: string): number => {
    if (!date) return 0;
    const value = Date.parse(`${date.slice(0, 10)}T00:00:00.000Z`);
    return Number.isFinite(value) ? Math.floor((todayTime - value) / 86400000) : 0;
  };
  const daysUntil = (date?: string): number => -daysFrom(date);
  const add = (item: Omit<OperationalPendingItem, 'id' | 'companyId' | 'timestamp'>) => {
    const key = `${companyId}|${item.type}|${item.entity}|${item.entityId}|${item.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    pendings.push({ ...item, id: deterministicId(key), companyId, timestamp });
  };

  for (const vehicle of vehicles) {
    if (vehicle.status === VehicleStatus.MAINTENANCE) {
      add({ type: 'VEHICLE', category: 'Frota', priority: 'P1', severity: 'CRITICAL', title: `Veículo em Manutenção: ${vehicle.plate}`, description: `O veículo ${vehicle.brand} ${vehicle.model} (${vehicle.plate}) está marcado como em manutenção na oficina.`, entity: 'Vehicle', entityId: vehicle.id, vehiclePlate: vehicle.plate, overdueDays: 0, status: 'OPEN', origin: 'Status do Veículo', actionRecommended: 'Verificar ordem de serviço ou liberação da oficina', destinationTab: 'fleet' });
    } else if (vehicle.status === VehicleStatus.INACTIVE) {
      add({ type: 'VEHICLE', category: 'Frota', priority: 'P0', severity: 'CRITICAL', title: `Veículo Indisponível/Bloqueado: ${vehicle.plate}`, description: `O veículo ${vehicle.plate} encontra-se com status ${vehicle.status}, impedindo novas locações.`, entity: 'Vehicle', entityId: vehicle.id, vehiclePlate: vehicle.plate, overdueDays: 0, status: 'OPEN', origin: 'Controle de Frota', actionRecommended: 'Regularizar situação cadastral ou desbloquear veículo', destinationTab: 'fleet' });
    }
  }

  for (const contract of contracts) {
    if (contract.status !== ContractStatus.ACTIVE) continue;
    const vehicle = vehicleMap.get(contract.vehicleId);
    const driver = driverMap.get(contract.driverId);
    if (contract.endDate && contract.endDate < todayStr) {
      const overdueDays = daysFrom(contract.endDate);
      add({ type: 'CONTRACT', category: 'Contratos', priority: 'P1', severity: 'CRITICAL', title: `Contrato Vencido: ${contract.contractNumber}`, description: `O contrato ${contract.contractNumber} do veículo ${vehicle?.plate || 'N/A'} expirou em ${contract.endDate} (${overdueDays} dias atrás).`, entity: 'Contract', entityId: contract.id, vehiclePlate: vehicle?.plate, driverName: driver?.fullName, contractNumber: contract.contractNumber, dueDate: contract.endDate, overdueDays, status: 'OPEN', origin: 'Gestão de Contratos', actionRecommended: 'Realizar renovação, encerramento ou devolução', destinationTab: 'contracts' });
    } else if (contract.endDate) {
      const remaining = daysUntil(contract.endDate);
      if (remaining >= 0 && remaining <= 7) add({ type: 'CONTRACT', category: 'Contratos', priority: 'P2', severity: 'WARNING', title: `Contrato Próximo do Vencimento: ${contract.contractNumber}`, description: `O contrato ${contract.contractNumber} vence em ${remaining} dia(s) (${contract.endDate}).`, entity: 'Contract', entityId: contract.id, vehiclePlate: vehicle?.plate, driverName: driver?.fullName, contractNumber: contract.contractNumber, dueDate: contract.endDate, overdueDays: 0, status: 'OPEN', origin: 'Gestão de Contratos', actionRecommended: 'Contatar motorista para renovação', destinationTab: 'contracts' });
    }
    if (!vehicle || vehicle.isArchived) add({ type: 'CONTRACT', category: 'Contratos', priority: 'P0', severity: 'CRITICAL', title: `Contrato com Veículo Inválido: ${contract.contractNumber}`, description: `O contrato ativo ${contract.contractNumber} referencia um veículo inexistente ou arquivado.`, entity: 'Contract', entityId: contract.id, contractNumber: contract.contractNumber, overdueDays: 0, status: 'OPEN', origin: 'Integridade de Contratos', actionRecommended: 'Revisar vínculo do veículo no contrato', destinationTab: 'contracts' });
    if (!driver || driver.isArchived) add({ type: 'CONTRACT', category: 'Contratos', priority: 'P0', severity: 'CRITICAL', title: `Contrato com Motorista Inválido: ${contract.contractNumber}`, description: `O contrato ativo ${contract.contractNumber} referencia um motorista inexistente ou arquivado.`, entity: 'Contract', entityId: contract.id, contractNumber: contract.contractNumber, overdueDays: 0, status: 'OPEN', origin: 'Integridade de Contratos', actionRecommended: 'Revisar cadastro do motorista no contrato', destinationTab: 'contracts' });
  }

  for (const maintenance of maintenances) {
    if (maintenance.status !== MaintenanceStatus.SCHEDULED && maintenance.status !== MaintenanceStatus.IN_PROGRESS) continue;
    const vehicle = vehicleMap.get(maintenance.vehicleId);
    if (maintenance.startDate && maintenance.startDate < todayStr) {
      const overdueDays = daysFrom(maintenance.startDate);
      add({ type: 'MAINTENANCE', category: 'Manutenção', priority: 'P1', severity: 'CRITICAL', title: `Manutenção Atrasada: ${vehicle?.plate || 'Veículo'}`, description: `Manutenção (${maintenance.description}) programada para ${maintenance.startDate} está em atraso por ${overdueDays} dia(s).`, entity: 'Maintenance', entityId: maintenance.id, vehiclePlate: vehicle?.plate, dueDate: maintenance.startDate, overdueDays, status: 'OPEN', origin: 'Oficina & Manutenção', actionRecommended: 'Executar ou concluir ordem de serviço', destinationTab: 'maintenance' });
    } else if (maintenance.startDate) {
      const remaining = daysUntil(maintenance.startDate);
      if (remaining >= 0 && remaining <= 3) add({ type: 'MAINTENANCE', category: 'Manutenção', priority: 'P2', severity: 'WARNING', title: `Manutenção Próxima: ${vehicle?.plate || 'Veículo'}`, description: `Manutenção (${maintenance.description}) agendada para daqui a ${remaining} dia(s) (${maintenance.startDate}).`, entity: 'Maintenance', entityId: maintenance.id, vehiclePlate: vehicle?.plate, dueDate: maintenance.startDate, overdueDays: 0, status: 'OPEN', origin: 'Oficina & Manutenção', actionRecommended: 'Preparar veículo para atendimento', destinationTab: 'maintenance' });
    }
  }

  for (const document of vehicleDocuments) {
    const vehicle = vehicleMap.get(document.vehicleId);
    if (!document.expirationDate) continue;
    if (document.expirationDate < todayStr || document.status === DocumentStatus.EXPIRED) {
      const overdueDays = daysFrom(document.expirationDate);
      add({ type: 'DOCUMENT', category: 'Documentos', priority: 'P0', severity: 'CRITICAL', title: `Documento de Veículo Vencido: ${document.documentType} (${vehicle?.plate || 'N/A'})`, description: `O documento ${document.documentType} do veículo ${vehicle?.plate || ''} venceu em ${document.expirationDate} (${overdueDays} dias atrás).`, entity: 'VehicleDocument', entityId: document.id, vehiclePlate: vehicle?.plate, dueDate: document.expirationDate, overdueDays, status: 'OPEN', origin: 'Compliance & Documentos', actionRecommended: 'Regularizar documentação junto ao órgão competente', destinationTab: 'compliance' });
    } else {
      const remaining = daysUntil(document.expirationDate);
      if (remaining >= 0 && remaining <= 15) add({ type: 'DOCUMENT', category: 'Documentos', priority: 'P2', severity: 'WARNING', title: `Documento Vencendo: ${document.documentType} (${vehicle?.plate || 'N/A'})`, description: `O documento ${document.documentType} do veículo ${vehicle?.plate || ''} vence em ${remaining} dia(s) (${document.expirationDate}).`, entity: 'VehicleDocument', entityId: document.id, vehiclePlate: vehicle?.plate, dueDate: document.expirationDate, overdueDays: 0, status: 'OPEN', origin: 'Compliance & Documentos', actionRecommended: 'Renovar documentação antecipadamente', destinationTab: 'compliance' });
    }
  }

  for (const driver of drivers) {
    if (!driver.cnhExpiration) continue;
    if (driver.cnhExpiration < todayStr || driver.cnhStatus === DocumentStatus.EXPIRED) {
      const overdueDays = daysFrom(driver.cnhExpiration);
      add({ type: 'DRIVER', category: 'Motoristas', priority: 'P1', severity: 'CRITICAL', title: `CNH Vencida: ${driver.fullName}`, description: `A CNH do motorista ${driver.fullName} venceu em ${driver.cnhExpiration} (${overdueDays} dias atrás).`, entity: 'Driver', entityId: driver.id, driverName: driver.fullName, dueDate: driver.cnhExpiration, overdueDays, status: 'OPEN', origin: 'Gestão de Motoristas', actionRecommended: 'Exigir renovação imediata da CNH para manter locação', destinationTab: 'drivers' });
    } else {
      const remaining = daysUntil(driver.cnhExpiration);
      if (remaining >= 0 && remaining <= 30) add({ type: 'DRIVER', category: 'Motoristas', priority: 'P2', severity: 'WARNING', title: `CNH Próxima do Vencimento: ${driver.fullName}`, description: `A CNH do motorista ${driver.fullName} vence em ${remaining} dia(s) (${driver.cnhExpiration}).`, entity: 'Driver', entityId: driver.id, driverName: driver.fullName, dueDate: driver.cnhExpiration, overdueDays: 0, status: 'OPEN', origin: 'Gestão de Motoristas', actionRecommended: 'Avisar motorista sobre renovação de CNH', destinationTab: 'drivers' });
    }
  }

  for (const ticket of tickets) {
    if (ticket.status !== TicketStatus.PENDING_IDENTIFICATION && ticket.status !== TicketStatus.IDENTIFIED) continue;
    const vehicle = vehicleMap.get(ticket.vehicleId);
    const driver = ticket.driverId ? driverMap.get(ticket.driverId) : undefined;
    const overdue = ticket.dueDate < todayStr;
    const overdueDays = overdue ? daysFrom(ticket.dueDate) : 0;
    add({ type: 'FINE', category: 'Multas', priority: overdue ? 'P1' : 'P2', severity: overdue ? 'CRITICAL' : 'WARNING', title: `Multa Pendente: Auto ${ticket.autoNumber} (${vehicle?.plate || 'Veículo'})`, description: `Multa por infração (${ticket.description}) pendente de tratamento/recurso. Vencimento: ${ticket.dueDate}.`, entity: 'TrafficTicket', entityId: ticket.id, vehiclePlate: vehicle?.plate, driverName: driver?.fullName, dueDate: ticket.dueDate, overdueDays, status: 'OPEN', origin: 'Multas & Infrações', actionRecommended: 'Identificar condutor ou regularizar pagamento/recurso', destinationTab: 'trafficTickets' });
  }

  for (const insurance of insurances) {
    const vehicle = vehicleMap.get(insurance.vehicleId);
    if (!insurance.endDate) continue;
    if (insurance.endDate < todayStr || insurance.status === DocumentStatus.EXPIRED) {
      const overdueDays = daysFrom(insurance.endDate);
      add({ type: 'INSURANCE', category: 'Seguros', priority: 'P1', severity: 'CRITICAL', title: `Seguro Vencido: Veículo ${vehicle?.plate || 'N/A'}`, description: `A apólice de seguro ${insurance.policyNumber} (${insurance.insuranceCompany}) venceu em ${insurance.endDate} (${overdueDays} dias atrás).`, entity: 'Insurance', entityId: insurance.id, vehiclePlate: vehicle?.plate, dueDate: insurance.endDate, overdueDays, status: 'OPEN', origin: 'Gestão de Seguros', actionRecommended: 'Renovar apólice de seguro imediatamente', destinationTab: 'compliance' });
    } else {
      const remaining = daysUntil(insurance.endDate);
      if (remaining >= 0 && remaining <= 15) add({ type: 'INSURANCE', category: 'Seguros', priority: 'P2', severity: 'WARNING', title: `Seguro Próximo do Vencimento: Veículo ${vehicle?.plate || 'N/A'}`, description: `A apólice ${insurance.policyNumber} vence em ${remaining} dia(s) (${insurance.endDate}).`, entity: 'Insurance', entityId: insurance.id, vehiclePlate: vehicle?.plate, dueDate: insurance.endDate, overdueDays: 0, status: 'OPEN', origin: 'Gestão de Seguros', actionRecommended: 'Cotar renovação de seguro com corretor', destinationTab: 'compliance' });
    }
  }

  for (const vehicle of vehicles) {
    const hasTracker = trackers.some((tracker) => tracker.vehicleId === vehicle.id && tracker.status === 'ACTIVE');
    if (!hasTracker && vehicle.status === VehicleStatus.AVAILABLE) add({ type: 'TRACKER', category: 'Rastreadores', priority: 'P2', severity: 'WARNING', title: `Veículo sem Rastreador Ativo: ${vehicle.plate}`, description: `O veículo ${vehicle.plate} está disponível na frota mas não possui rastreador ativo cadastrado.`, entity: 'Tracker', entityId: vehicle.id, vehiclePlate: vehicle.plate, overdueDays: 0, status: 'OPEN', origin: 'Monitoramento & Telemetria', actionRecommended: 'Instalar ou ativar rastreador no veículo', destinationTab: 'fleet' });
  }

  const priorityOrder: Record<PendingPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return pendings.sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority] || right.overdueDays - left.overdueDays || left.id.localeCompare(right.id));
}
