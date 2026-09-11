import assert from 'node:assert/strict';
import { generateOperationalPendings } from './serverOperationalPendingProjection';
import { ContractStatus, VehicleStatus } from '../../types/enums';
import type { Contract, Vehicle } from '../../types/entities';

const companyId = 'company-1075';
const vehicle: Vehicle = {
  id: 'vehicle-1075', companyId, plate: 'TST1A75', brand: 'Teste', model: 'Teste',
  yearFabrication: 2025, yearModel: 2025, color: 'Branco', renavam: '10750000000', chassis: 'CHASSIS1075',
  currentKm: 10000, fuelType: 'Flex', category: 'Hatch', acquisitionValue: 50000, currentValue: 45000,
  rentalValueBase: 1000, status: VehicleStatus.AVAILABLE, isArchived: false,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

const available = generateOperationalPendings({ companyId, vehicles: [vehicle] });
for (const type of ['INSURANCE', 'TRACKER'] as const) {
  const item = available.find((pending) => pending.type === type && pending.entityId === vehicle.id);
  assert.equal(item?.priority, 'P2');
  assert.equal(item?.severity, 'WARNING');
}

const contract: Contract = {
  id: 'contract-1075', companyId, contractNumber: 'CT-1075', driverId: 'driver-1075', vehicleId: vehicle.id,
  startDate: '2026-01-01', endDate: '2099-12-31', status: ContractStatus.ACTIVE, rentalAmount: 1000,
  billingPeriodicity: 'WEEKLY' as never, securityDepositAmount: 0, franchiseKm: 0, excessKmRate: 0,
  isArchived: false, createdAt: '2026-01-01', updatedAt: '2026-01-01',
};
const operational = generateOperationalPendings({ companyId, vehicles: [vehicle], contracts: [contract] });
for (const type of ['INSURANCE', 'TRACKER'] as const) {
  const item = operational.find((pending) => pending.type === type && pending.entityId === vehicle.id);
  assert.equal(item?.priority, 'P0');
  assert.equal(item?.severity, 'CRITICAL');
}

console.log('#1075 insurance/tracker operational severity regression: PASS');
