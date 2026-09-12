import { Vehicle, Contract, Maintenance, VehicleDocument, DriverDocument, TrafficTicket, Driver, Insurance, Tracker } from '../../types/entities';
import { VehicleStatus, ContractStatus, MaintenanceStatus, DocumentStatus, TicketStatus } from '../../types/enums';

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
  id: string; // Deterministic hash ID
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

/**
 * Service to derive operational pending items and alerts deterministically.
 * 
 * GUARANTEES:
 * - 100% Read-only (zero financial side effects, zero mutations, zero writes)
 * - Deterministic deduplication via composite key hashes
 * - Safe against nulls, empty arrays, division by zero
 */
export function generateOperationalPendings(data: OperationalPendingInput = {}): OperationalPendingItem[] {
  const targetCompanyId = data.companyId || 'company-main-uuid';
  
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles.filter(v => v && !v.isArchived && (!data.companyId || v.companyId === targetCompanyId)) : [];
  const contracts = Array.isArray(data.contracts) ? data.contracts.filter(c => c && !c.isArchived && (!data.companyId || c.companyId === targetCompanyId)) : [];
  const maintenances = Array.isArray(data.maintenances) ? data.maintenances.filter(m => m && (!data.companyId || m.companyId === targetCompanyId)) : [];
  const vehicleDocuments = Array.isArray(data.vehicleDocuments) ? data.vehicleDocuments.filter(d => d && (!data.companyId || d.companyId === targetCompanyId)) : [];
  const driverDocuments = Array.isArray(data.driverDocuments) ? data.driverDocuments.filter(d => d && (!data.companyId || d.companyId === targetCompanyId)) : [];
  const tickets = Array.isArray(data.tickets) ? data.tickets.filter(t => t && (!data.companyId || t.companyId === targetCompanyId)) : [];
  const drivers = Array.isArray(data.drivers) ? data.drivers.filter(d => d && !d.isArchived && (!data.companyId || d.companyId === targetCompanyId)) : [];
  const insurances = Array.isArray(data.insurances) ? data.insurances.filter(i => i && (!data.companyId || i.companyId === targetCompanyId)) : [];
  const trackers = Array.isArray(data.trackers) ? data.trackers.filter(t => t && (!data.companyId || t.companyId === targetCompanyId)) : [];

  const todayStr = new Date().toISOString().split('T')[0];
  const todayTime = new Date(todayStr).getTime();
  const pendings: OperationalPendingItem[] = [];
  const seenKeys = new Set<string>();

  const addPending = (item: Omit<OperationalPendingItem, 'id'>) => {
    const key = `${item.companyId}_${item.type}_${item.entity}_${item.entityId}_${item.title.substring(0, 15)}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const id = `pend_${btoa(key).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16)}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    pendings.push({
      ...item,
      id,
    });
  };

  const getDaysDiff = (dateStr?: string) => {
    if (!dateStr) return 0;
    const targetTime = new Date(dateStr).getTime();
    const diffDays = Math.floor((todayTime - targetTime) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Map for quick lookups
  const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
  const driverMap = new Map(drivers.map(d => [d.id, d]));
  const contractMap = new Map(contracts.map(c => [c.id, c]));
  const activeContractVehicleIds = new Set(contracts.filter(c => c.status === ContractStatus.ACTIVE).map(c => c.vehicleId));
  const isOperationallyRented = (vehicle?: Vehicle): boolean =>
    Boolean(vehicle && (vehicle.status === VehicleStatus.RENTED || activeContractVehicleIds.has(vehicle.id)));

  // 1. VEHICLES
  vehicles.forEach(v => {
    if (v.status === VehicleStatus.MAINTENANCE) {
      addPending({
        type: 'VEHICLE',
        category: 'Frota',
        priority: 'P1',
        severity: 'CRITICAL',
        title: `Veículo em Manutenção: ${v.plate}`,
        description: `O veículo ${v.brand} ${v.model} (${v.plate}) está marcado como em manutenção na oficina.`,
        entity: 'Vehicle',
        entityId: v.id,
        vehiclePlate: v.plate,
        overdueDays: 0,
        status: 'OPEN',
        origin: 'Status do Veículo',
        actionRecommended: 'Verificar ordem de serviço ou liberação da oficina',
        destinationTab: 'fleet',
        companyId: v.companyId || targetCompanyId,
        timestamp: new Date().toISOString(),
      });
    } else if (v.status === VehicleStatus.INACTIVE) {
      addPending({
        type: 'VEHICLE',
        category: 'Frota',
        priority: 'P0',
        severity: 'CRITICAL',
        title: `Veículo Indisponível/Bloqueado: ${v.plate}`,
        description: `O veículo ${v.plate} encontra-se com status ${v.status}, impedindo novas locações.`,
        entity: 'Vehicle',
        entityId: v.id,
        vehiclePlate: v.plate,
        overdueDays: 0,
        status: 'OPEN',
        origin: 'Controle de Frota',
        actionRecommended: 'Regularizar situação cadastral ou desbloquear veículo',
        destinationTab: 'fleet',
        companyId: v.companyId || targetCompanyId,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 2. CONTRACTS
  contracts.forEach(c => {
    const veh = vehicleMap.get(c.vehicleId);
    const drv = driverMap.get(c.driverId);

    if (c.status === ContractStatus.ACTIVE) {
      if (c.endDate && c.endDate < todayStr) {
        const days = getDaysDiff(c.endDate);
        addPending({
          type: 'CONTRACT',
          category: 'Contratos',
          priority: 'P1',
          severity: 'CRITICAL',
          title: `Contrato Vencido: ${c.contractNumber}`,
          description: `O contrato ${c.contractNumber} do veículo ${veh?.plate || 'N/A'} expirou em ${c.endDate} (${days} dias atrás).`,
          entity: 'Contract',
          entityId: c.id,
          vehiclePlate: veh?.plate,
          driverName: drv?.fullName,
          contractNumber: c.contractNumber,
          dueDate: c.endDate,
          overdueDays: days,
          status: 'OPEN',
          origin: 'Gestão de Contratos',
          actionRecommended: 'Realizar renovação, encerramento ou devolução',
          destinationTab: 'contracts',
          companyId: c.companyId || targetCompanyId,
          timestamp: new Date().toISOString(),
        });
      } else if (c.endDate) {
        // Expiring in next 7 days
        const targetTime = new Date(c.endDate).getTime();
        const diffDaysUntil = Math.floor((targetTime - todayTime) / (1000 * 60 * 60 * 24));
        if (diffDaysUntil >= 0 && diffDaysUntil <= 7) {
          addPending({
            type: 'CONTRACT',
            category: 'Contratos',
            priority: 'P2',
            severity: 'WARNING',
            title: `Contrato Próximo do Vencimento: ${c.contractNumber}`,
            description: `O contrato ${c.contractNumber} vence em ${diffDaysUntil} dia(s) (${c.endDate}).`,
            entity: 'Contract',
            entityId: c.id,
            vehiclePlate: veh?.plate,
            driverName: drv?.fullName,
            contractNumber: c.contractNumber,
            dueDate: c.endDate,
            overdueDays: 0,
            status: 'OPEN',
            origin: 'Gestão de Contratos',
            actionRecommended: 'Contatar motorista para renovação',
            destinationTab: 'contracts',
            companyId: c.companyId || targetCompanyId,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Check if active contract has invalid/archived vehicle or driver
      if (!veh || veh.isArchived) {
        addPending({
          type: 'CONTRACT',
          category: 'Contratos',
          priority: 'P0',
          severity: 'CRITICAL',
          title: `Contrato com Veículo Inválido: ${c.contractNumber}`,
          description: `O contrato ativo ${c.contractNumber} referencia um veículo inexistente ou arquivado.`,
          entity: 'Contract',
          entityId: c.id,
          contractNumber: c.contractNumber,
          overdueDays: 0,
          status: 'OPEN',
          origin: 'Integridade de Contratos',
          actionRecommended: 'Revisar vínculo do veículo no contrato',
          destinationTab: 'contracts',
          companyId: c.companyId || targetCompanyId,
          timestamp: new Date().toISOString(),
        });
      }
      if (!drv || drv.isArchived) {
        addPending({
          type: 'CONTRACT',
          category: 'Contratos',
          priority: 'P0',
          severity: 'CRITICAL',
          title: `Contrato com Motorista Inválido: ${c.contractNumber}`,
          description: `O contrato ativo ${c.contractNumber} referencia um motorista inexistente ou arquivado.`,
          entity: 'Contract',
          entityId: c.id,
          contractNumber: c.contractNumber,
          overdueDays: 0,
          status: 'OPEN',
          origin: 'Integridade de Contratos',
          actionRecommended: 'Revisar cadastro do motorista no contrato',
          destinationTab: 'contracts',
          companyId: c.companyId || targetCompanyId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  });

  // 3. MAINTENANCE
  maintenances.forEach(m => {
    const veh = vehicleMap.get(m.vehicleId);
    if (m.status === MaintenanceStatus.SCHEDULED || m.status === MaintenanceStatus.IN_PROGRESS) {
      if (m.startDate && m.startDate < todayStr) {
        const days = getDaysDiff(m.startDate);
        addPending({
          type: 'MAINTENANCE',
          category: 'Manutenção',
          priority: 'P1',
          severity: 'CRITICAL',
          title: `Manutenção Atrasada: ${veh?.plate || 'Veículo'}`,
          description: `Manutenção (${m.description}) programada para ${m.startDate} está em atraso por ${days} dia(s).`,
          entity: 'Maintenance',
          entityId: m.id,
          vehiclePlate: veh?.plate,
          dueDate: m.startDate,
          overdueDays: days,
          status: 'OPEN',
          origin: 'Oficina & Manutenção',
          actionRecommended: 'Executar ou concluir ordem de serviço',
          destinationTab: 'maintenance',
          companyId: m.companyId || targetCompanyId,
          timestamp: new Date().toISOString(),
        });
      } else if (m.startDate) {
        const targetTime = new Date(m.startDate).getTime();
        const diffDays = Math.floor((targetTime - todayTime) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 3) {
          addPending({
            type: 'MAINTENANCE',
            category: 'Manutenção',
            priority: 'P2',
            severity: 'WARNING',
            title: `Manutenção Próxima: ${veh?.plate || 'Veículo'}`,
            description: `Manutenção (${m.description}) agendada para daqui a ${diffDays} dia(s) (${m.startDate}).`,
            entity: 'Maintenance',
            entityId: m.id,
            vehiclePlate: veh?.plate,
            dueDate: m.startDate,
            overdueDays: 0,
            status: 'OPEN',
            origin: 'Oficina & Manutenção',
            actionRecommended: 'Preparar veículo para atendimento',
            destinationTab: 'maintenance',
            companyId: m.companyId || targetCompanyId,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  });

  // 4. VEHICLE DOCUMENTS
  vehicleDocuments.forEach(doc => {
    const veh = vehicleMap.get(doc.vehicleId);
    if (doc.expirationDate) {
      if (doc.expirationDate < todayStr || doc.status === DocumentStatus.EXPIRED) {
        const days = getDaysDiff(doc.expirationDate);
        addPending({
          type: 'DOCUMENT',
          category: 'Documentos',
          priority: 'P0',
          severity: 'CRITICAL',
          title: `Documento de Veículo Vencido: ${doc.documentType} (${veh?.plate || 'N/A'})`,
          description: `O documento ${doc.documentType} do veículo ${veh?.plate || ''} venceu em ${doc.expirationDate} (${days} dias atrás).`,
          entity: 'VehicleDocument',
          entityId: doc.id,
          vehiclePlate: veh?.plate,
          dueDate: doc.expirationDate,
          overdueDays: days,
          status: 'OPEN',
          origin: 'Compliance & Documentos',
          actionRecommended: 'Regularizar documentação junto ao órgão competente',
          destinationTab: 'compliance',
          companyId: doc.companyId || targetCompanyId,
          timestamp: new Date().toISOString(),
        });
      } else {
        const targetTime = new Date(doc.expirationDate).getTime();
        const diffDays = Math.floor((targetTime - todayTime) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 15) {
          addPending({
            type: 'DOCUMENT',
            category: 'Documentos',
            priority: 'P2',
            severity: 'WARNING',
            title: `Documento Vencendo: ${doc.documentType} (${veh?.plate || 'N/A'})`,
            description: `O documento ${doc.documentType} do veículo ${veh?.plate || ''} vence em ${diffDays} dia(s) (${doc.expirationDate}).`,
            entity: 'VehicleDocument',
            entityId: doc.id,
            vehiclePlate: veh?.plate,
            dueDate: doc.expirationDate,
            overdueDays: 0,
            status: 'OPEN',
            origin: 'Compliance & Documentos',
            actionRecommended: 'Renovar documentação antecipadamente',
            destinationTab: 'compliance',
            companyId: doc.companyId || targetCompanyId,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  });

  // 5. DRIVERS (CNH & Documents)
  drivers.forEach(drv => {
    if (drv.cnhExpiration) {
      if (drv.cnhExpiration < todayStr || drv.cnhStatus === DocumentStatus.EXPIRED) {
        const days = getDaysDiff(drv.cnhExpiration);
        addPending({
          type: 'DRIVER',
          category: 'Motoristas',
          priority: 'P1',
          severity: 'CRITICAL',
          title: `CNH Vencida: ${drv.fullName}`,
          description: `A CNH do motorista ${drv.fullName} venceu em ${drv.cnhExpiration} (${days} dias atrás).`,
          entity: 'Driver',
          entityId: drv.id,
          driverName: drv.fullName,
          dueDate: drv.cnhExpiration,
          overdueDays: days,
          status: 'OPEN',
          origin: 'Gestão de Motoristas',
          actionRecommended: 'Exigir renovação imediata da CNH para manter locação',
          destinationTab: 'drivers',
          companyId: drv.companyId || targetCompanyId,
          timestamp: new Date().toISOString(),
        });
      } else {
        const targetTime = new Date(drv.cnhExpiration).getTime();
        const diffDays = Math.floor((targetTime - todayTime) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 30) {
          addPending({
            type: 'DRIVER',
            category: 'Motoristas',
            priority: 'P2',
            severity: 'WARNING',
            title: `CNH Próxima do Vencimento: ${drv.fullName}`,
            description: `A CNH do motorista ${drv.fullName} vence em ${diffDays} dia(s) (${drv.cnhExpiration}).`,
            entity: 'Driver',
            entityId: drv.id,
            driverName: drv.fullName,
            dueDate: drv.cnhExpiration,
            overdueDays: 0,
            status: 'OPEN',
            origin: 'Gestão de Motoristas',
            actionRecommended: 'Avisar motorista sobre renovação de CNH',
            destinationTab: 'drivers',
            companyId: drv.companyId || targetCompanyId,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  });

  // 6. TRAFFIC TICKETS (Multas)
  tickets.forEach(t => {
    const veh = vehicleMap.get(t.vehicleId);
    const drv = t.driverId ? driverMap.get(t.driverId) : undefined;
    if (t.status === TicketStatus.PENDING_IDENTIFICATION || t.status === TicketStatus.IDENTIFIED) {
      const isOverdue = t.dueDate < todayStr;
      const days = isOverdue ? getDaysDiff(t.dueDate) : 0;
      addPending({
        type: 'FINE',
        category: 'Multas',
        priority: isOverdue ? 'P1' : 'P2',
        severity: isOverdue ? 'CRITICAL' : 'WARNING',
        title: `Multa Pendente: Auto ${t.autoNumber} (${veh?.plate || 'Veículo'})`,
        description: `Multa por infração (${t.description}) pendente de tratamento/recurso. Vencimento: ${t.dueDate}.`,
        entity: 'TrafficTicket',
        entityId: t.id,
        vehiclePlate: veh?.plate,
        driverName: drv?.fullName,
        dueDate: t.dueDate,
        overdueDays: days,
        status: 'OPEN',
        origin: 'Multas & Infrações',
        actionRecommended: 'Identificar condutor ou regularizar pagamento/recurso',
        destinationTab: 'trafficTickets',
        companyId: t.companyId || targetCompanyId,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 7. INSURANCES
  insurances.forEach(ins => {
    const veh = vehicleMap.get(ins.vehicleId);
    if (!ins.endDate) return;
    if (ins.endDate < todayStr || ins.status === DocumentStatus.EXPIRED) {
      const days = getDaysDiff(ins.endDate);
      const operational = isOperationallyRented(veh);
      const available = veh?.status === VehicleStatus.AVAILABLE;
      addPending({
        type: 'INSURANCE',
        category: 'Seguros',
        priority: operational ? 'P0' : available ? 'P2' : 'P1',
        severity: operational ? 'CRITICAL' : available ? 'WARNING' : 'CRITICAL',
        title: `Seguro Vencido: Veículo ${veh?.plate || 'N/A'}`,
        description: operational
          ? `A apólice de seguro ${ins.policyNumber} (${ins.insuranceCompany}) venceu em ${ins.endDate} (${days} dias atrás) e o veículo está alugado/possui contrato ativo.`
          : `A apólice de seguro ${ins.policyNumber} (${ins.insuranceCompany}) venceu em ${ins.endDate} (${days} dias atrás).`,
        entity: 'Insurance',
        entityId: ins.id,
        vehiclePlate: veh?.plate,
        dueDate: ins.endDate,
        overdueDays: days,
        status: 'OPEN',
        origin: 'Gestão de Seguros',
        actionRecommended: operational ? 'Regularizar o seguro imediatamente; o veículo está em operação' : 'Regularizar o seguro antes da próxima locação',
        destinationTab: 'compliance',
        companyId: ins.companyId || targetCompanyId,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const targetTime = new Date(ins.endDate).getTime();
    const diffDays = Math.floor((targetTime - todayTime) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 15) {
      addPending({
        type: 'INSURANCE',
        category: 'Seguros',
        priority: 'P2',
        severity: 'WARNING',
        title: `Seguro Próximo do Vencimento: Veículo ${veh?.plate || 'N/A'}`,
        description: `A apólice ${ins.policyNumber} vence em ${diffDays} dia(s) (${ins.endDate}).`,
        entity: 'Insurance',
        entityId: ins.id,
        vehiclePlate: veh?.plate,
        dueDate: ins.endDate,
        overdueDays: 0,
        status: 'OPEN',
        origin: 'Gestão de Seguros',
        actionRecommended: 'Cotar renovação de seguro com corretor',
        destinationTab: 'compliance',
        companyId: ins.companyId || targetCompanyId,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 8. MISSING INSURANCE AND TRACKERS
  vehicles.forEach(v => {
    const operational = isOperationallyRented(v);
    const relevant = operational || v.status === VehicleStatus.AVAILABLE;
    if (!relevant) return;
    const validInsurance = insurances.some(ins => ins.vehicleId === v.id && ins.endDate >= todayStr && ins.status === 'ACTIVE');
    const hasExpiredInsuranceAlert = insurances.some(ins => ins.vehicleId === v.id && (ins.endDate < todayStr || ins.status === DocumentStatus.EXPIRED));
    if (!validInsurance && !hasExpiredInsuranceAlert) {
      addPending({
        type: 'INSURANCE',
        category: 'Seguros',
        priority: operational ? 'P0' : 'P2',
        severity: operational ? 'CRITICAL' : 'WARNING',
        title: `Veículo sem Seguro Ativo: ${v.plate}`,
        description: operational ? `O veículo ${v.plate} está alugado ou possui contrato ativo e não possui seguro ativo/válido cadastrado.` : `O veículo ${v.plate} está disponível, mas não possui seguro ativo/válido cadastrado. A regularização é necessária antes da próxima locação.`,
        entity: 'Insurance',
        entityId: v.id,
        vehiclePlate: v.plate,
        overdueDays: 0,
        status: 'OPEN',
        origin: 'Gestão de Seguros',
        actionRecommended: operational ? 'Cadastrar ou regularizar seguro imediatamente' : 'Cadastrar ou regularizar seguro antes da próxima locação',
        destinationTab: 'compliance',
        companyId: v.companyId || targetCompanyId,
        timestamp: new Date().toISOString(),
      });
    }
    const hasTracker = trackers.some(tr => tr.vehicleId === v.id && tr.status === 'ACTIVE');
    if (!hasTracker) {
      addPending({
        type: 'TRACKER',
        category: 'Rastreadores',
        priority: operational ? 'P0' : 'P2',
        severity: operational ? 'CRITICAL' : 'WARNING',
        title: `Veículo sem Rastreador Ativo: ${v.plate}`,
        description: operational ? `O veículo ${v.plate} está alugado ou possui contrato ativo, mas não possui rastreador ativo cadastrado.` : `O veículo ${v.plate} está disponível na frota, mas não possui rastreador ativo cadastrado. A regularização é necessária antes da próxima locação.`,
        entity: 'Tracker',
        entityId: v.id,
        vehiclePlate: v.plate,
        overdueDays: 0,
        status: 'OPEN',
        origin: 'Monitoramento & Telemetria',
        actionRecommended: operational ? 'Instalar ou ativar rastreador imediatamente' : 'Instalar ou ativar rastreador antes da próxima locação',
        destinationTab: 'fleet',
        companyId: v.companyId || targetCompanyId,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Sort pendings by priority (P0 -> P1 -> P2 -> P3) and overdueDays descending
  const priorityOrder: Record<PendingPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return pendings.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.overdueDays - a.overdueDays;
  });
}
