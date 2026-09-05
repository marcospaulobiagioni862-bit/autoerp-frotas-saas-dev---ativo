import assert from 'node:assert/strict';
import type { Insurance } from '../../types/entities';
import {
  loadContractVehicleInsuranceSnapshot,
  sameContractVehicleInsuranceSnapshot,
  selectContractVehicleInsuranceSnapshot,
} from '../contractVehicleInsuranceSnapshot';
import { contractVehicleInsuranceTemplateValues } from '../contractVehicleInsuranceTemplateValues';

function insurance(overrides: Partial<Insurance> = {}): Insurance {
  return {
    id: 'insurance-1',
    companyId: 'company-1',
    vehicleId: 'vehicle-1',
    insuranceCompany: 'Seguradora Exemplo',
    policyNumber: 'POL-001',
    coverageDetails: 'Cobertura total',
    deductibleAmount: 2500,
    totalPremiumAmount: 6000,
    installmentsCount: 12,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

assert.equal(
  selectContractVehicleInsuranceSnapshot([], '2026-09-05'),
  null,
  'absence of insurance must remain explicit',
);

assert.equal(
  selectContractVehicleInsuranceSnapshot([
    insurance({ status: 'EXPIRED' }),
    insurance({ id: 'future', startDate: '2026-10-01', endDate: '2027-09-30' }),
  ], '2026-09-05'),
  null,
  'expired or future policies must not enter the contract snapshot',
);

const selected = selectContractVehicleInsuranceSnapshot([
  insurance({ id: 'older', startDate: '2026-01-01', endDate: '2026-12-31', policyNumber: 'OLD' }),
  insurance({ id: 'newer', startDate: '2026-06-01', endDate: '2027-05-31', policyNumber: 'NEW' }),
], '2026-09-05');

assert.equal(selected?.id, 'newer', 'most recent eligible policy must be selected deterministically');
assert.equal(selected?.policyNumber, 'NEW');
assert.equal(selected?.insuranceCompany, 'Seguradora Exemplo');
assert.equal(selected?.deductibleAmount, 2500);
assert.ok(!('totalPremiumAmount' in (selected ?? {})), 'financial premium must not leak into the contract snapshot slice');

const templateValues = contractVehicleInsuranceTemplateValues(selected);
assert.deepEqual(templateValues, {
  'vehicle.insurance.company': 'Seguradora Exemplo',
  'vehicle.insurance.policyNumber': 'NEW',
  'vehicle.insurance.coverageDetails': 'Cobertura total',
  'vehicle.insurance.deductibleAmount': new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(2500),
  'vehicle.insurance.startDate': '2026-06-01',
  'vehicle.insurance.endDate': '2027-05-31',
}, 'template mapping must expose only the approved insurance snapshot slice');
assert.deepEqual(contractVehicleInsuranceTemplateValues(null), {
  'vehicle.insurance.company': '',
  'vehicle.insurance.policyNumber': '',
  'vehicle.insurance.coverageDetails': '',
  'vehicle.insurance.deductibleAmount': '',
  'vehicle.insurance.startDate': '',
  'vehicle.insurance.endDate': '',
}, 'contracts without an eligible policy must render insurance placeholders as empty values');

let capturedCompanyId = '';
let capturedVehicleId = '';
const loaded = await loadContractVehicleInsuranceSnapshot({
  getInsuranceRepo: () => ({
    findAllByCompany: async (companyId: string, filters: { vehicleId?: string }) => {
      capturedCompanyId = companyId;
      capturedVehicleId = filters.vehicleId || '';
      return [insurance({ id: 'loaded', policyNumber: 'LOAD-001' })];
    },
  }),
}, 'company-1', 'vehicle-1', '2026-09-05');

assert.equal(capturedCompanyId, 'company-1', 'loader must stay tenant-scoped');
assert.equal(capturedVehicleId, 'vehicle-1', 'loader must stay vehicle-scoped');
assert.equal(loaded?.policyNumber, 'LOAD-001', 'loader must project the server-authoritative policy');
assert.equal(sameContractVehicleInsuranceSnapshot(loaded, loaded), true, 'unchanged policy snapshot must revalidate');
assert.equal(
  sameContractVehicleInsuranceSnapshot(loaded, loaded ? { ...loaded, policyNumber: 'CHANGED' } : null),
  false,
  'policy changes between preparation and persistence must invalidate the snapshot',
);
assert.equal(sameContractVehicleInsuranceSnapshot(null, null), true, 'absence must also revalidate deterministically');

console.log('Contract vehicle insurance snapshot regression: PASS');
