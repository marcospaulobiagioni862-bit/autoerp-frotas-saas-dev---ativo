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
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.DAMAGED, VehicleStatus.WAITING_MAINTENANCE), false);

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

assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.AVAILABLE, VehicleStatus.ARCHIVED), true);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.INACTIVE, VehicleStatus.ARCHIVED), true);
assert.equal(canManuallyTransitionVehicleStatus(VehicleStatus.SOLD, VehicleStatus.ARCHIVED), true);
assert.equal(
  canManuallyTransitionVehicleStatus(VehicleStatus.AVAILABLE, VehicleStatus.ARCHIVED, { hasActiveContract: true }),
  false,
  'archive must fail closed while an active/current contract binding exists',
);
assert.equal(
  canManuallyTransitionVehicleStatus(VehicleStatus.AVAILABLE, VehicleStatus.ARCHIVED, { hasBlockingMaintenance: true }),
  false,
  'archive must fail closed while blocking maintenance exists',
);

const lifecycleRoute = readFileSync(new URL('../../../server/vehicleLifecycleRoutes.ts', import.meta.url), 'utf8');
const vehicleRoutes = readFileSync(new URL('../../../server/vehicleRoutes.ts', import.meta.url), 'utf8');
const kmAuthority = readFileSync(new URL('../../../server/vehicleKmReadingAuthority.ts', import.meta.url), 'utf8');
const vehicleClient = readFileSync(new URL('../../../api/vehicleClient.ts', import.meta.url), 'utf8');
const fleetManagement = readFileSync(new URL('../../../components/fleet/FleetManagement.tsx', import.meta.url), 'utf8');
const saleModal = readFileSync(new URL('../../../components/fleet/VehicleSaleModal.tsx', import.meta.url), 'utf8');
const archiveModal = readFileSync(new URL('../../../components/fleet/VehicleArchiveModal.tsx', import.meta.url), 'utf8');
const archivedHistoryModal = readFileSync(new URL('../../../components/fleet/ArchivedVehicleHistoryModal.tsx', import.meta.url), 'utf8');
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

assert.match(lifecycleRoute, /app\.post\('\/api\/fleet\/vehicles\/:id\/archive'/, 'archive must use a dedicated server route');
assert.match(lifecycleRoute, /app\.get\('\/api\/fleet\/vehicles\/archived'/, 'archived vehicles must have an explicit read-only collection');
assert.match(lifecycleRoute, /app\.get\('\/api\/fleet\/vehicles\/:id\/lifecycle'/, 'lifecycle history must be tenant-scoped and readable');
assert.match(lifecycleRoute, /status: VehicleStatus\.ARCHIVED,[\s\S]*isArchived: true/, 'archive must soft-delete through canonical archived state');
assert.doesNotMatch(lifecycleRoute, /DELETE\s+FROM\s+vehicles/i, 'archive must never hard-delete a vehicle');
assert.match(
  vehicleRoutes,
  /items\.filter\(\(item\) => !item\.isArchived && item\.status !== VehicleStatus\.SOLD\)/,
  'active fleet collection must exclude sold vehicles',
);
assert.match(
  lifecycleRoute,
  /item\.isArchived \|\| item\.status === VehicleStatus\.SOLD/,
  'historical collection must retain sold vehicles for read-only access',
);
assert.match(fleetManagement, /Ver vendidos \/ arquivados/, 'fleet UI must expose sold vehicles only through historical access');
assert.match(fleetManagement, />Inativos</, 'active fleet summary must not count sold vehicles as active inventory');
assert.match(vehicleClient, /static async listArchived\(/, 'client must expose archived collection');
assert.match(vehicleClient, /static async lifecycle\(/, 'client must expose lifecycle history');
assert.match(vehicleClient, /static async archive\(/, 'client must expose dedicated archive action');
assert.match(fleetManagement, /showArchived \? await VehicleClient\.listArchived\(\) : await VehicleClient\.list\(\)/, 'fleet must separate active and archived collections');
assert.match(fleetManagement, /setVehicleForArchive\(vehicle\)/, 'fleet UI must expose explicit archive action');
assert.match(fleetManagement, /Abrir histórico somente leitura/, 'archived cards must expose read-only history instead of operational actions');
assert.match(archiveModal, /Data do arquivamento \*/, 'archive form must require an effective date');
assert.match(archiveModal, /Motivo do arquivamento \*/, 'archive form must require a reason');
assert.match(archiveModal, /O histórico não será apagado/, 'archive confirmation must explain history preservation');
assert.match(archivedHistoryModal, /Visualização somente leitura/, 'archived history must be explicitly read-only');
assert.match(archivedHistoryModal, /AttachmentList/, 'archived history must retain document visibility');
assert.doesNotMatch(archivedHistoryModal, /FileUpload|VehicleCrlvImportPanel|recordKm|markSold|archive\(/, 'archived history must not expose mutation controls');
assert.match(vehicleRoutes, /app\.get\('\/api\/fleet\/vehicles\/:id'[\s\S]*if \(!item\) throw new VehicleNotFoundError/, 'archived vehicle detail must remain readable');
assert.match(vehicleRoutes, /app\.get\('\/api\/fleet\/vehicles\/:id\/km-records'[\s\S]*if \(!vehicle\) throw new VehicleNotFoundError/, 'archived KM history must remain readable');
assert.match(vehicleRoutes, /app\.post\('\/api\/fleet\/vehicles\/:id\/km-records'[\s\S]*advanceVehicleKmInContext/, 'KM endpoint must delegate mutation to the central authority');
assert.match(kmAuthority, /vehicle\.isArchived\|\|vehicle\.status===VehicleStatus\.SOLD\|\|vehicle\.status===VehicleStatus\.ARCHIVED/, 'archived vehicles must remain immutable for new KM writes inside the central authority');

assert.match(lifecycleMigration, /FORCE ROW LEVEL SECURITY/, 'lifecycle persistence must enforce tenant RLS');
assert.match(lifecycleMigration, /vehicle_lifecycle_events_tenant_policy/, 'lifecycle persistence must define tenant policy');

assert.equal(vehicleStatusLabel(VehicleStatus.DOCUMENTATION_PENDING), 'Documentação pendente');
assert.equal(vehicleStatusLabel(VehicleStatus.WAITING_MAINTENANCE), 'Em manutenção');
assert.equal(vehicleStatusLabel(VehicleStatus.DAMAGED), 'Sinistrado');
assert.equal(
  manuallyAllowedVehicleStatuses(VehicleStatus.AVAILABLE).includes(VehicleStatus.WAITING_MAINTENANCE),
  false,
  'legacy waiting-maintenance must not be an allowed destination',
);

console.log('vehicle status policy regressions: PASS');

assert.match(
  readFileSync(new URL('../../../components/fleet/VehicleDetailsModal.tsx', import.meta.url), 'utf8'),
  /Situação \/ Ciclo de Vida/,
  'vehicle details must expose lifecycle controls',
);
assert.match(
  readFileSync(new URL('../../../components/fleet/FleetManagement.tsx', import.meta.url), 'utf8'),
  /onStatusChangeRequest/,
  'vehicle details lifecycle actions must reuse fleet status authority',
);
