import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  false,
);
assert.equal(
  canManuallyTransitionVehicleStatus(VehicleStatus.MAINTENANCE, VehicleStatus.AVAILABLE, { hasBlockingMaintenance: false }),
  true,
);

const maintenanceLockedTargets = manuallyAllowedVehicleStatuses(VehicleStatus.MAINTENANCE, { hasBlockingMaintenance: true });
assert.equal(maintenanceLockedTargets.length, 0);

assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.AVAILABLE, VehicleStatus.SOLD), true);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.DAMAGED, VehicleStatus.SOLD), true);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.INACTIVE, VehicleStatus.SOLD), true);
assert.equal(
  canManuallyTransitionVehicleStatus(VehicleStatus.AVAILABLE, VehicleStatus.SOLD, { hasActiveContract: true }),
  false,
  'sale must fail closed while an active/current contract binding exists',
);
assert.equal(
  canManuallyTransitionVehicleStatus(VehicleStatus.AVAILABLE, VehicleStatus.SOLD, { hasBlockingMaintenance: true }),
  false,
  'sale must fail closed while blocking maintenance exists',
);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.RESERVED, VehicleStatus.SOLD), false);

const lifecycleRoute = readFileSync(new URL('../../../server/vehicleLifecycleRoutes.ts', import.meta.url), 'utf8');
const vehicleRoutes = readFileSync(new URL('../../../server/vehicleRoutes.ts', import.meta.url), 'utf8');
const vehicleClient = readFileSync(new URL('../../../api/vehicleClient.ts', import.meta.url), 'utf8');
const fleetManagement = readFileSync(new URL('../../../components/fleet/FleetManagement.tsx', import.meta.url), 'utf8');
const saleModal = readFileSync(new URL('../../../components/fleet/VehicleSaleModal.tsx', import.meta.url), 'utf8');
const lifecycleMigration = readFileSync(new URL('../../../../drizzle/0053_vehicle_lifecycle_events.sql', import.meta.url), 'utf8');

assert.match(lifecycleRoute, /app\.post\('\/api\/fleet\/vehicles\/:id\/sale'/, 'sale must use a dedicated server route');
assert.match(lifecycleRoute, /findByIdForCompanyWithLock/, 'sale must lock the authoritative vehicle row');
assert.match(lifecycleRoute, /findActiveByVehicle/, 'sale must derive active contract server-side');
assert.match(lifecycleRoute, /hasBlockingWorkOrder/, 'sale must derive blocking maintenance server-side');
assert.match(lifecycleRoute, /finalKm < existing\.currentKm/, 'sale must reject KM regression');
assert.match(lifecycleRoute, /status: VehicleStatus\.SOLD/, 'sale must persist canonical SOLD status');
assert.match(lifecycleRoute, /INSERT INTO vehicle_lifecycle_events/, 'sale metadata must be durable');
assert.match(lifecycleRoute, /getAuditLogRepo\(\)\.create/, 'sale must be auditable');
assert.match(
  vehicleRoutes,
  /status === VehicleStatus\.SOLD \|\| status === VehicleStatus\.ARCHIVED[\s\S]*dedicated vehicle lifecycle action/,
  'generic status mutation must not bypass terminal lifecycle metadata',
);
assert.match(vehicleClient, /static async markSold\(/, 'authorized client must expose the dedicated sale action');
assert.match(fleetManagement, /setVehicleForSale\(vehicle\)/, 'fleet UI must expose an explicit sale action');
assert.match(saleModal, /Data da venda \*/, 'sale form must require the sale date');
assert.match(saleModal, /Valor da venda \*/, 'sale form must require the sale value');
assert.match(saleModal, /KM final \*/, 'sale form must require final KM');
assert.match(saleModal, /Observação \*/, 'sale form must require an observation');
assert.match(lifecycleMigration, /FORCE ROW LEVEL SECURITY/, 'lifecycle persistence must enforce tenant RLS');
assert.match(lifecycleMigration, /vehicle_lifecycle_events_tenant_policy/, 'lifecycle persistence must define tenant policy');

assert.equal(vehicleStatusLabel(VehicleStatus.DOCUMENTATION_PENDING), 'Documentação pendente');
assert.equal(vehicleStatusLabel(VehicleStatus.WAITING_MAINTENANCE), 'Aguardando manutenção');
assert.equal(vehicleStatusLabel(VehicleStatus.DAMAGED), 'Sinistrado');

console.log('vehicle status policy regressions: PASS');
