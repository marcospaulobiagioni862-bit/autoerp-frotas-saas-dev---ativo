import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ContractStatus, VehicleStatus } from '../../../types/enums';
import {
  BLOCKING_CONTRACT_STATUSES,
  isContractBlocking,
  projectVehicleOperationalState,
  selectCurrentBlockingContract,
  summarizeFleetOperationalState,
} from '../fleetOperationalState';

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

function testOperationalProjection(): void {
  const vehicle = { id: 'veh-a', status: VehicleStatus.AVAILABLE, isArchived: false };

  const available = projectVehicleOperationalState(vehicle, []);
  assert.equal(available.state, 'AVAILABLE', 'vehicle without blockers must be available');
  assert.equal(available.availableForNewContract, true);

  for (const status of [
    ContractStatus.DRAFT,
    ContractStatus.AWAITING_SIGNATURE,
    ContractStatus.SUSPENDED,
  ]) {
    const projected = projectVehicleOperationalState(vehicle, [{
      id: `contract-${status}`,
      vehicleId: vehicle.id,
      status,
      isArchived: false,
    }]);
    assert.equal(projected.state, 'CONTRACTING', `${status} must reserve the vehicle as CONTRACTING`);
    assert.equal(projected.availableForNewContract, false, `${status} must block a new contract`);
    assert.equal(projected.blockingContractId, `contract-${status}`);
  }

  const active = projectVehicleOperationalState(vehicle, [{
    id: 'contract-active',
    vehicleId: vehicle.id,
    status: ContractStatus.ACTIVE,
    isArchived: false,
  }]);
  assert.equal(active.state, 'RENTED', 'ACTIVE contract must make vehicle RENTED');
  assert.equal(active.availableForNewContract, false);

  const cancelled = projectVehicleOperationalState(vehicle, [{
    id: 'contract-cancelled',
    vehicleId: vehicle.id,
    status: ContractStatus.CANCELLED,
    isArchived: false,
  }]);
  assert.equal(cancelled.state, 'AVAILABLE', 'CANCELLED contract must release the vehicle');

  const historical = projectVehicleOperationalState(
    { id: 'veh-historical', status: VehicleStatus.SOLD, isArchived: true },
    []
  );
  assert.equal(historical.state, 'HISTORICAL');
  assert.equal(historical.availableForNewContract, false);

  const duplicate = projectVehicleOperationalState(vehicle, [
    { id: 'c1', vehicleId: vehicle.id, status: ContractStatus.DRAFT },
    { id: 'c2', vehicleId: vehicle.id, status: ContractStatus.AWAITING_SIGNATURE },
  ]);
  assert.ok(
    duplicate.integrityViolations.includes('MULTIPLE_BLOCKING_CONTRACTS_FOR_VEHICLE'),
    'multiple blocking contracts must surface an integrity violation'
  );

  const summary = summarizeFleetOperationalState(
    [
      { id: 'v1', status: VehicleStatus.AVAILABLE },
      { id: 'v2', status: VehicleStatus.AVAILABLE },
      { id: 'v3', status: VehicleStatus.MAINTENANCE },
      { id: 'v4', status: VehicleStatus.SOLD, isArchived: true },
    ],
    [
      { id: 'draft-v1', vehicleId: 'v1', status: ContractStatus.AWAITING_SIGNATURE },
      { id: 'active-v2', vehicleId: 'v2', status: ContractStatus.ACTIVE },
    ]
  );
  assert.deepEqual(summary, {
    HISTORICAL: 1,
    MAINTENANCE: 1,
    BLOCKED: 0,
    RENTED: 1,
    CONTRACTING: 1,
    RESERVED: 0,
    AVAILABLE: 0,
  }, 'fleet buckets must be mutually exclusive and coherent');
  assert.equal(Object.values(summary).reduce((sum, value) => sum + value, 0), 4);
}

function testSharedBlockingContractAuthority(): void {
  assert.deepEqual([...BLOCKING_CONTRACT_STATUSES], [
    ContractStatus.DRAFT,
    ContractStatus.AWAITING_SIGNATURE,
    ContractStatus.ACTIVE,
    ContractStatus.SUSPENDED,
  ]);
  for (const status of BLOCKING_CONTRACT_STATUSES) assert.equal(isContractBlocking(status), true);
  for (const status of [
    ContractStatus.FINISHED,
    ContractStatus.CLOSED,
    ContractStatus.CANCELLED,
    ContractStatus.ARCHIVED,
  ]) assert.equal(isContractBlocking(status), false);

  const current = selectCurrentBlockingContract([
    { id: 'draft-old', vehicleId: 'v', driverId: 'd', status: ContractStatus.DRAFT, updatedAt: '2026-09-01' },
    { id: 'await-new', vehicleId: 'v', driverId: 'd', status: ContractStatus.AWAITING_SIGNATURE, updatedAt: '2026-09-09' },
  ]);
  assert.equal(current?.id, 'await-new', 'driver summary must select the newest blocking contract');

  const activeWins = selectCurrentBlockingContract([
    { id: 'await-new', vehicleId: 'v', driverId: 'd', status: ContractStatus.AWAITING_SIGNATURE, updatedAt: '2026-09-09' },
    { id: 'active-old', vehicleId: 'v', driverId: 'd', status: ContractStatus.ACTIVE, updatedAt: '2026-09-01' },
  ]);
  assert.equal(activeWins?.id, 'active-old', 'ACTIVE contract must win the operational binding projection');
}

function testCrossLayerConsumersUseSameAuthority(): void {
  const dashboard = source('../../../components/dashboard/OverviewDashboard.tsx');
  const contractForm = source('../../../components/contracts/ContractFormModal.tsx');
  const driverBridge = source('../../../components/drivers/DriverLegacyDetailsBridge.ts');
  const postgresContractRepo = source('../../../db/repositories/postgresContractRepository.ts');
  const exclusivityMigration = source('../../../../drizzle/0070_contract_exclusive_bindings.sql');

  assert.match(
    dashboard,
    /summarizeFleetOperationalState\(vehicles, contracts\)/,
    'Dashboard must derive fleet state from the shared authority'
  );
  assert.doesNotMatch(
    dashboard,
    /vehicles\.filter\(\(v\) => v\.status === 'AVAILABLE'\)/,
    'Dashboard must not define availability from vehicle.status alone'
  );
  assert.match(dashboard, /Em contratação/, 'Dashboard must expose the pre-active contractual state');

  assert.match(
    contractForm,
    /isContractBlocking\(item\.status\)/,
    'New Contract selector must use the shared blocking-contract authority'
  );
  assert.doesNotMatch(
    contractForm,
    /new Set<ContractStatus>/,
    'New Contract selector must not carry its own copied status matrix'
  );

  assert.match(
    driverBridge,
    /selectCurrentBlockingContract\(contractHistory\)/,
    'Driver summary must use the shared blocking-contract authority'
  );
  assert.doesNotMatch(
    driverBridge,
    /blockingStatuses = new Set/,
    'Driver summary must not carry its own copied status matrix'
  );

  const serverStatusPattern = /status IN \('DRAFT','AWAITING_SIGNATURE','ACTIVE','SUSPENDED'\)/g;
  assert.ok(
    (postgresContractRepo.match(serverStatusPattern) || []).length >= 2,
    'PostgreSQL contract repository must enforce the same blocking statuses for vehicle and driver'
  );
  assert.ok(
    (exclusivityMigration.match(serverStatusPattern) || []).length >= 2,
    'Database unique indexes must enforce the same blocking statuses for vehicle and driver'
  );
}

testOperationalProjection();
testSharedBlockingContractAuthority();
testCrossLayerConsumersUseSameAuthority();

console.log('AUDIT-WAVE-A source-of-truth transversal invariants: PASS');
