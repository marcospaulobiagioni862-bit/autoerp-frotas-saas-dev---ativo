import { VehicleStatus } from '../../types/enums';

export interface VehicleStatusTransitionContext {
  hasActiveContract?: boolean;
  hasBlockingMaintenance?: boolean;
}

const MANUAL_TRANSITIONS: Record<VehicleStatus, ReadonlySet<VehicleStatus>> = {
  [VehicleStatus.AVAILABLE]: new Set([
    VehicleStatus.RESERVED,
    VehicleStatus.MAINTENANCE,
    VehicleStatus.BLOCKED,
    VehicleStatus.DAMAGED,
    VehicleStatus.INSPECTION,
    VehicleStatus.DOCUMENTATION_PENDING,
    VehicleStatus.INACTIVE,
    VehicleStatus.SOLD,
    VehicleStatus.ARCHIVED,
  ]),
  [VehicleStatus.RESERVED]: new Set([
    VehicleStatus.AVAILABLE,
    VehicleStatus.BLOCKED,
    VehicleStatus.DOCUMENTATION_PENDING,
    VehicleStatus.INACTIVE,
    VehicleStatus.ARCHIVED,
  ]),
  [VehicleStatus.RENTED]: new Set([]),
  [VehicleStatus.WAITING_MAINTENANCE]: new Set([
    VehicleStatus.AVAILABLE,
    VehicleStatus.MAINTENANCE,
    VehicleStatus.BLOCKED,
    VehicleStatus.INACTIVE,
    VehicleStatus.ARCHIVED,
  ]),
  [VehicleStatus.MAINTENANCE]: new Set([
    VehicleStatus.AVAILABLE,
    VehicleStatus.BLOCKED,
    VehicleStatus.DAMAGED,
    VehicleStatus.INACTIVE,
    VehicleStatus.ARCHIVED,
  ]),
  [VehicleStatus.BLOCKED]: new Set([
    VehicleStatus.AVAILABLE,
    VehicleStatus.DAMAGED,
    VehicleStatus.INSPECTION,
    VehicleStatus.DOCUMENTATION_PENDING,
    VehicleStatus.INACTIVE,
    VehicleStatus.ARCHIVED,
  ]),
  [VehicleStatus.DAMAGED]: new Set([
    VehicleStatus.MAINTENANCE,
    VehicleStatus.BLOCKED,
    VehicleStatus.INACTIVE,
    VehicleStatus.SOLD,
    VehicleStatus.ARCHIVED,
  ]),
  [VehicleStatus.INSPECTION]: new Set([
    VehicleStatus.AVAILABLE,
    VehicleStatus.BLOCKED,
    VehicleStatus.DOCUMENTATION_PENDING,
    VehicleStatus.INACTIVE,
    VehicleStatus.ARCHIVED,
  ]),
  [VehicleStatus.DOCUMENTATION_PENDING]: new Set([
    VehicleStatus.AVAILABLE,
    VehicleStatus.BLOCKED,
    VehicleStatus.INSPECTION,
    VehicleStatus.INACTIVE,
    VehicleStatus.ARCHIVED,
  ]),
  [VehicleStatus.INACTIVE]: new Set([
    VehicleStatus.AVAILABLE,
    VehicleStatus.BLOCKED,
    VehicleStatus.INSPECTION,
    VehicleStatus.SOLD,
    VehicleStatus.ARCHIVED,
  ]),
  [VehicleStatus.SOLD]: new Set([VehicleStatus.ARCHIVED]),
  [VehicleStatus.ARCHIVED]: new Set([]),
};

export function canManuallyTransitionVehicleStatus(
  from: VehicleStatus,
  to: VehicleStatus,
  context: VehicleStatusTransitionContext = {},
): boolean {
  if (from === to) return true;
  if (to === VehicleStatus.RENTED) return false;
  if (context.hasActiveContract) return false;
  if (context.hasBlockingMaintenance && to !== VehicleStatus.MAINTENANCE) return false;
  // A vehicle being labelled MAINTENANCE must not, by itself, become a circular lock.
  // Blocking work orders must be enforced by the maintenance workflow, not inferred from
  // the current vehicle status. This keeps MAINTENANCE -> AVAILABLE/BLOCKED transitions usable.
  return MANUAL_TRANSITIONS[from]?.has(to) ?? false;
}

export function vehicleStatusLabel(status: VehicleStatus): string {
  switch (status) {
    case VehicleStatus.AVAILABLE: return 'Disponível';
    case VehicleStatus.RESERVED: return 'Reservado';
    case VehicleStatus.RENTED: return 'Locado';
    case VehicleStatus.WAITING_MAINTENANCE: return 'Em manutenção';
    case VehicleStatus.MAINTENANCE: return 'Em manutenção';
    case VehicleStatus.BLOCKED: return 'Bloqueado';
    case VehicleStatus.DAMAGED: return 'Sinistrado';
    case VehicleStatus.INSPECTION: return 'Em vistoria';
    case VehicleStatus.DOCUMENTATION_PENDING: return 'Documentação pendente';
    case VehicleStatus.INACTIVE: return 'Inativo';
    case VehicleStatus.SOLD: return 'Vendido';
    case VehicleStatus.ARCHIVED: return 'Arquivado';
  }
}

export function manuallyAllowedVehicleStatuses(
  from: VehicleStatus,
  context: VehicleStatusTransitionContext = {},
): VehicleStatus[] {
  return [...(MANUAL_TRANSITIONS[from] ?? [])].filter((status) =>
    canManuallyTransitionVehicleStatus(from, status, context)
  );
}
