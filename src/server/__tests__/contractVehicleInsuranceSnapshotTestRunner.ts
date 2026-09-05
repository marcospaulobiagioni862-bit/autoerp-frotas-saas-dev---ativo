import assert from 'node:assert/strict';
import type { Insurance } from '../../types/entities';
import { selectContractVehicleInsuranceSnapshot } from '../contractVehicleInsuranceSnapshot';

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

console.log('Contract vehicle insurance snapshot regression: PASS');
