import assert from 'node:assert/strict';
import type { Tracker } from '../../types/entities';
import {
  loadContractVehicleTrackerSnapshot,
  sameContractVehicleTrackerSnapshot,
  selectContractVehicleTrackerSnapshot,
} from '../contractVehicleTrackerSnapshot';

function tracker(overrides: Partial<Tracker> = {}): Tracker {
  return {
    id: 'tracker-1',
    companyId: 'company-1',
    vehicleId: 'vehicle-1',
    equipmentModel: 'Modelo X',
    imei: '123456789012345',
    serialNumber: 'SER-001',
    chipCarrier: 'Operadora',
    chipNumber: '5511999999999',
    monthlyCost: 99.9,
    installationDate: '2026-01-10',
    status: 'ACTIVE',
    createdBy: 'user-1',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z',
    ...overrides,
  };
}

assert.equal(selectContractVehicleTrackerSnapshot([]), null, 'absence of tracker must remain explicit');
assert.equal(
  selectContractVehicleTrackerSnapshot([tracker({ status: 'REMOVED' })]),
  null,
  'removed tracker must not enter the contract snapshot',
);

const selected = selectContractVehicleTrackerSnapshot([
  tracker({ id: 'older', installationDate: '2026-01-10', imei: '111111111111111' }),
  tracker({ id: 'newer', installationDate: '2026-06-20', imei: '222222222222222' }),
]);
assert.equal(selected?.id, 'newer', 'newest active installation must be selected deterministically');
assert.equal(selected?.imei, '222222222222222');
assert.equal(selected?.equipmentModel, 'Modelo X');
assert.ok(!('monthlyCost' in (selected ?? {})), 'tracker monthly cost must not leak into contract snapshot');

let capturedCompanyId = '';
let capturedVehicleId = '';
const loaded = await loadContractVehicleTrackerSnapshot({
  getTrackerRepo: () => ({
    findAllByCompany: async (companyId: string, vehicleId: string) => {
      capturedCompanyId = companyId;
      capturedVehicleId = vehicleId;
      return [tracker({ id: 'loaded' })];
    },
  }),
}, 'company-1', 'vehicle-1');

assert.equal(capturedCompanyId, 'company-1', 'loader must stay tenant-scoped');
assert.equal(capturedVehicleId, 'vehicle-1', 'loader must stay vehicle-scoped');
assert.equal(loaded?.id, 'loaded');
assert.equal(sameContractVehicleTrackerSnapshot(loaded, loaded), true);
assert.equal(
  sameContractVehicleTrackerSnapshot(loaded, loaded ? { ...loaded, imei: '999999999999999' } : null),
  false,
  'tracker changes must invalidate the prepared snapshot',
);
assert.equal(sameContractVehicleTrackerSnapshot(null, null), true);

console.log('Contract vehicle tracker snapshot regression: PASS');
