import { ContractStatus, VehicleStatus } from '../../types/enums';

export const BLOCKING_CONTRACT_STATUSES = Object.freeze([
  ContractStatus.DRAFT,
  ContractStatus.AWAITING_SIGNATURE,
  ContractStatus.ACTIVE,
  ContractStatus.SUSPENDED,
] as const);

export const PRE_ACTIVE_CONTRACT_STATUSES = Object.freeze([
  ContractStatus.DRAFT,
  ContractStatus.AWAITING_SIGNATURE,
  ContractStatus.SUSPENDED,
] as const);

export type VehicleOperationalState =
  | 'HISTORICAL'
  | 'MAINTENANCE'
  | 'BLOCKED'
  | 'RENTED'
  | 'CONTRACTING'
  | 'RESERVED'
  | 'AVAILABLE';

export interface OperationalVehicleLike {
  id: string;
  status: VehicleStatus | string;
  isArchived?: boolean;
}

export interface OperationalContractLike {
  id: string;
  vehicleId: string;
  driverId?: string;
  status: ContractStatus | string;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VehicleOperationalProjection {
  state: VehicleOperationalState;
  availableForNewContract: boolean;
  blockingContractId?: string;
  reasons: string[];
  integrityViolations: string[];
}

function normalizedStatus(value: ContractStatus | string): ContractStatus | string {
  return String(value || '').toUpperCase();
}

export function isContractBlocking(status: ContractStatus | string): boolean {
  return (BLOCKING_CONTRACT_STATUSES as readonly string[]).includes(String(status));
}

export function isContractPreActive(status: ContractStatus | string): boolean {
  return (PRE_ACTIVE_CONTRACT_STATUSES as readonly string[]).includes(String(status));
}

export function blockingContractsForVehicle<T extends OperationalContractLike>(
  vehicleId: string,
  contracts: readonly T[]
): T[] {
  return contracts.filter((item) =>
    !item.isArchived &&
    item.vehicleId === vehicleId &&
    isContractBlocking(item.status)
  );
}

export function blockingContractsForDriver<T extends OperationalContractLike>(
  driverId: string,
  contracts: readonly T[]
): T[] {
  return contracts.filter((item) =>
    !item.isArchived &&
    item.driverId === driverId &&
    isContractBlocking(item.status)
  );
}

export function selectCurrentBlockingContract<T extends OperationalContractLike>(
  items: readonly T[]
): T | undefined {
  const blocking = items.filter((item) => !item.isArchived && isContractBlocking(item.status));
  return [...blocking].sort((a, b) => {
    const activeA = normalizedStatus(a.status) === ContractStatus.ACTIVE ? 1 : 0;
    const activeB = normalizedStatus(b.status) === ContractStatus.ACTIVE ? 1 : 0;
    if (activeA !== activeB) return activeB - activeA;
    const timeA = String(a.updatedAt || a.createdAt || '');
    const timeB = String(b.updatedAt || b.createdAt || '');
    return timeB.localeCompare(timeA);
  })[0];
}

export function projectVehicleOperationalState(
  vehicle: OperationalVehicleLike,
  contracts: readonly OperationalContractLike[]
): VehicleOperationalProjection {
  const reasons: string[] = [];
  const integrityViolations: string[] = [];
  const vehicleStatus = String(vehicle.status);
  const blocking = blockingContractsForVehicle(vehicle.id, contracts);

  if (blocking.length > 1) {
    integrityViolations.push('MULTIPLE_BLOCKING_CONTRACTS_FOR_VEHICLE');
  }

  if (
    vehicle.isArchived ||
    vehicleStatus === VehicleStatus.SOLD ||
    vehicleStatus === VehicleStatus.ARCHIVED ||
    vehicleStatus === VehicleStatus.INACTIVE
  ) {
    return {
      state: 'HISTORICAL',
      availableForNewContract: false,
      reasons: ['VEHICLE_HISTORICAL'],
      integrityViolations,
    };
  }

  if (
    vehicleStatus === VehicleStatus.MAINTENANCE ||
    vehicleStatus === VehicleStatus.WAITING_MAINTENANCE
  ) {
    return {
      state: 'MAINTENANCE',
      availableForNewContract: false,
      reasons: ['VEHICLE_MAINTENANCE'],
      integrityViolations,
    };
  }

  if (
    vehicleStatus === VehicleStatus.BLOCKED ||
    vehicleStatus === VehicleStatus.DAMAGED ||
    vehicleStatus === VehicleStatus.INSPECTION ||
    vehicleStatus === VehicleStatus.DOCUMENTATION_PENDING
  ) {
    return {
      state: 'BLOCKED',
      availableForNewContract: false,
      reasons: [`VEHICLE_${vehicleStatus}`],
      integrityViolations,
    };
  }

  const activeContract = blocking.find((item) => normalizedStatus(item.status) === ContractStatus.ACTIVE);
  if (activeContract) {
    return {
      state: 'RENTED',
      availableForNewContract: false,
      blockingContractId: activeContract.id,
      reasons: ['CONTRACT_ACTIVE'],
      integrityViolations,
    };
  }

  const preActiveContract = selectCurrentBlockingContract(blocking);
  if (preActiveContract) {
    return {
      state: 'CONTRACTING',
      availableForNewContract: false,
      blockingContractId: preActiveContract.id,
      reasons: [`CONTRACT_${String(preActiveContract.status)}`],
      integrityViolations,
    };
  }

  if (vehicleStatus === VehicleStatus.RESERVED) {
    return {
      state: 'RESERVED',
      availableForNewContract: false,
      reasons: ['VEHICLE_RESERVED'],
      integrityViolations,
    };
  }

  if (vehicleStatus === VehicleStatus.AVAILABLE) {
    return {
      state: 'AVAILABLE',
      availableForNewContract: true,
      reasons,
      integrityViolations,
    };
  }

  return {
    state: 'BLOCKED',
    availableForNewContract: false,
    reasons: [`VEHICLE_STATUS_${vehicleStatus || 'UNKNOWN'}`],
    integrityViolations,
  };
}

export function summarizeFleetOperationalState(
  vehicles: readonly OperationalVehicleLike[],
  contracts: readonly OperationalContractLike[]
): Record<VehicleOperationalState, number> {
  const summary: Record<VehicleOperationalState, number> = {
    HISTORICAL: 0,
    MAINTENANCE: 0,
    BLOCKED: 0,
    RENTED: 0,
    CONTRACTING: 0,
    RESERVED: 0,
    AVAILABLE: 0,
  };
  for (const vehicle of vehicles) {
    summary[projectVehicleOperationalState(vehicle, contracts).state] += 1;
  }
  return summary;
}
