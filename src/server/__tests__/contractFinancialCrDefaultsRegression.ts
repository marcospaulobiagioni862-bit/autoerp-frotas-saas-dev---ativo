import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Contract, KmRecord } from '../../types/entities';
import { ContractStatus, RecurringFrequency } from '../../types/enums';
import { calculateContractExcessKmCharge } from '../contractFinanceAuthority';

const contract: Contract = {
  id: 'contract-1069',
  companyId: 'company-a',
  contractNumber: 'CNT-1069',
  driverId: 'driver-a',
  vehicleId: 'vehicle-a',
  startDate: '2026-09-01',
  endDate: '2026-09-14',
  status: ContractStatus.CLOSED,
  rentalAmount: 700,
  billingPeriodicity: RecurringFrequency.WEEKLY,
  billingDueDayOfWeek: 1,
  billingDueDayOfMonth: 1,
  securityDepositAmount: 1500,
  franchiseKm: 1000,
  excessKmRate: 0.75,
  signatureRequired: true,
  isArchived: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z',
};

const km = (id: string, value: number, date: string, type: KmRecord['readingType'], contractId = contract.id): KmRecord => ({
  id,
  companyId: contract.companyId,
  vehicleId: contract.vehicleId,
  driverId: contract.driverId,
  contractId,
  kmValue: value,
  recordDate: date,
  readingType: type,
  createdAt: `${date}T12:00:00.000Z`,
});

const charge = calculateContractExcessKmCharge(contract, '2026-09-14', [
  km('out', 10000, '2026-09-01', 'CHECK_OUT'),
  km('periodic', 11000, '2026-09-07', 'PERIODIC'),
  km('foreign', 90000, '2026-09-10', 'CHECK_IN', 'another-contract'),
  km('in', 12600, '2026-09-14', 'CHECK_IN'),
]);
assert.deepEqual(charge, {
  startKm: 10000,
  endKm: 12600,
  travelledKm: 2600,
  allowedKm: 2000,
  excessKm: 600,
  amount: 450,
});

assert.equal(
  calculateContractExcessKmCharge(contract, '2026-09-14', [km('out-only', 10000, '2026-09-01', 'CHECK_OUT')]),
  null,
  'KM excess must not be charged without authoritative CHECK_IN evidence',
);
assert.equal(
  calculateContractExcessKmCharge({ ...contract, excessKmRate: 0 }, '2026-09-14', [
    km('out-zero', 10000, '2026-09-01', 'CHECK_OUT'),
    km('in-zero', 12600, '2026-09-14', 'CHECK_IN'),
  ]),
  null,
  'zero agreed excess-km rate must not create a charge',
);

const root = fileURLToPath(new URL('../../../', import.meta.url));
const financeAuthority = readFileSync(`${root}src/server/contractFinanceAuthority.ts`, 'utf8');
const reconcileRoutes = readFileSync(`${root}src/server/contractFinanceReconcileRoutes.ts`, 'utf8');
const contractClient = readFileSync(`${root}src/api/contractClient.ts`, 'utf8');
const depositClient = readFileSync(`${root}src/api/financeDepositClient.ts`, 'utf8');

assert.match(financeAuthority, /OriginType\.CONTRACT_RENT/);
assert.match(financeAuthority, /OriginType\.SECURITY_DEPOSIT/);
assert.match(financeAuthority, /OriginType\.KM_EXCESS/);
assert.match(financeAuthority, /contract\.securityDepositAmount/);
assert.match(financeAuthority, /contract\.franchiseKm/);
assert.match(financeAuthority, /contract\.excessKmRate/);
assert.match(financeAuthority, /`\$\{contract\.id\}:deposit`/);
assert.match(financeAuthority, /originId:`\$\{contract\.id\}:close`/);
assert.match(reconcileRoutes, /ContractStatus\.CLOSED/);
assert.match(reconcileRoutes, /findByContractId\(contract\.id\)/);
assert.match(contractClient, /reconcile-close-finance/);
assert.match(depositClient, /reconcile-deposit-receivable/);

console.log('contract financial CR defaults regression: ok');
