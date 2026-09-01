import assert from 'node:assert/strict';
import { VehicleStatus } from '../../../types/enums';
import {
  canManuallyTransitionVehicleStatus,
  manuallyAllowedVehicleStatuses,
  vehicleStatusLabel,
} from '../vehicleStatusPolicy';

assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.AVAILABLE, VehicleStatus.RESERVED), true);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.RESERVED, VehicleStatus.AVAILABLE), true);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.BLOCKED, VehicleStatus.INSPECTION), true);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.DAMAGED, VehicleStatus.WAITING_MAINTENANCE), true);

assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.RENTED, VehicleStatus.AVAILABLE), false);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.AVAILABLE, VehicleStatus.RENTED), false);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.ARCHIVED, VehicleStatus.AVAILABLE), false);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.SOLD, VehicleStatus.AVAILABLE), false);

assert.equal(
  canManuallyTransitionVehicleStatus(VehicleStatus.AVAILABLE, VehicleStatus.BLOCKED, { hasActiveContract: true }),
  false,
);
assert.equal(
  canManuallyTransitionVehicleStatus(VehicleStatus.MAINTENANCE, VehicleStatus.AVAILABLE, { hasBlockingMaintenance: true }),
  true,
);
assert.equal(
  canManuallyTransitionVehicleStatus(VehicleStatus.MAINTENANCE, VehicleStatus.AVAILABLE, { hasBlockingMaintenance: false }),
  true,
);

const maintenanceTargets = manuallyAllowedVehicleStatuses(VehicleStatus.MAINTENANCE, { hasBlockingMaintenance: true });
assert.ok(maintenanceTargets.includes(VehicleStatus.AVAILABLE));
assert.ok(maintenanceTargets.includes(VehicleStatus.BLOCKED));

assert.equal(vehicleStatusLabel(VehicleStatus.DOCUMENTATION_PENDING), 'Documentação pendente');
assert.equal(vehicleStatusLabel(VehicleStatus.WAITING_MAINTENANCE), 'Aguardando manutenção');
assert.equal(vehicleStatusLabel(VehicleStatus.DAMAGED), 'Sinistrado');

console.log('vehicle status policy regressions: PASS');
