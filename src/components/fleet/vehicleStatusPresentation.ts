import { VehicleStatus } from '../../types/enums';
import { vehicleStatusLabel } from '../../domain/fleet/vehicleStatusPolicy';

export type VehicleStatusBadgeVariant = 'success' | 'warning' | 'info' | 'danger' | 'default';

export interface VehicleStatusFilterOption {
  id: 'ALL' | VehicleStatus;
  label: string;
}

export const VEHICLE_STATUS_FILTERS: VehicleStatusFilterOption[] = [
  { id: 'ALL', label: 'Todos' },
  { id: VehicleStatus.AVAILABLE, label: vehicleStatusLabel(VehicleStatus.AVAILABLE) },
  { id: VehicleStatus.RESERVED, label: vehicleStatusLabel(VehicleStatus.RESERVED) },
  { id: VehicleStatus.RENTED, label: vehicleStatusLabel(VehicleStatus.RENTED) },
  { id: VehicleStatus.WAITING_MAINTENANCE, label: vehicleStatusLabel(VehicleStatus.WAITING_MAINTENANCE) },
  { id: VehicleStatus.MAINTENANCE, label: vehicleStatusLabel(VehicleStatus.MAINTENANCE) },
  { id: VehicleStatus.BLOCKED, label: vehicleStatusLabel(VehicleStatus.BLOCKED) },
  { id: VehicleStatus.DAMAGED, label: vehicleStatusLabel(VehicleStatus.DAMAGED) },
  { id: VehicleStatus.INSPECTION, label: vehicleStatusLabel(VehicleStatus.INSPECTION) },
  { id: VehicleStatus.DOCUMENTATION_PENDING, label: vehicleStatusLabel(VehicleStatus.DOCUMENTATION_PENDING) },
  { id: VehicleStatus.INACTIVE, label: vehicleStatusLabel(VehicleStatus.INACTIVE) },
  { id: VehicleStatus.SOLD, label: vehicleStatusLabel(VehicleStatus.SOLD) },
];

export function vehicleStatusBadgeVariant(status: VehicleStatus): VehicleStatusBadgeVariant {
  switch (status) {
    case VehicleStatus.AVAILABLE:
      return 'info';
    case VehicleStatus.RENTED:
      return 'success';
    case VehicleStatus.RESERVED:
    case VehicleStatus.WAITING_MAINTENANCE:
    case VehicleStatus.MAINTENANCE:
    case VehicleStatus.INSPECTION:
    case VehicleStatus.DOCUMENTATION_PENDING:
      return 'warning';
    case VehicleStatus.BLOCKED:
    case VehicleStatus.DAMAGED:
      return 'danger';
    case VehicleStatus.INACTIVE:
    case VehicleStatus.SOLD:
    case VehicleStatus.ARCHIVED:
      return 'default';
  }
}
