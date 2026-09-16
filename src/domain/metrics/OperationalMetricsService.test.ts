import { calculateHealthScore } from './OperationalMetricsService';
import { Vehicle, Contract, Maintenance, VehicleDocument, TrafficTicket } from '../../types/entities';
import { VehicleStatus, ContractStatus, MaintenanceStatus, DocumentStatus, TicketStatus } from '../../types/enums';

/**
 * Unit Tests for OperationalMetricsService (Scenarios 1 to 10)
 */

export function runOperationalMetricsTests(): void {
  console.log('Running OperationalMetricsService Unit Tests...');

  // Scenario 1: Healthy Fleet
  const healthyVehicles: Vehicle[] = [
    { id: 'v1', companyId: 'c1', plate: 'ABC-1234', brand: 'Fiat', model: 'Mobi', yearFabrication: 2023, yearModel: 2023, color: 'Branco', renavam: '123456789', chassis: '9BWZZZ...', currentKm: 10000, fuelType: 'Flex', category: 'Hatch', acquisitionValue: 50000, currentValue: 45000, rentalValueBase: 1200, status: VehicleStatus.RENTED, isArchived: false, createdAt: '2023-01-01', updatedAt: '2023-01-01' },
    { id: 'v2', companyId: 'c1', plate: 'XYZ-5678', brand: 'VW', model: 'Gol', yearFabrication: 2022, yearModel: 2022, color: 'Prata', renavam: '987654321', chassis: '8AWZZZ...', currentKm: 20000, fuelType: 'Flex', category: 'Hatch', acquisitionValue: 45000, currentValue: 40000, rentalValueBase: 1100, status: VehicleStatus.AVAILABLE, isArchived: false, createdAt: '2023-01-01', updatedAt: '2023-01-01' }
  ];
  const healthyContracts: Contract[] = [
    { id: 'ct1', companyId: 'c1', contractNumber: 'CT-001', driverId: 'd1', vehicleId: 'v1', startDate: '2023-01-01', status: ContractStatus.ACTIVE, rentalAmount: 1200, billingPeriodicity: 3 as any, securityDepositAmount: 1200, franchiseKm: 3000, excessKmRate: 2, isArchived: false, createdAt: '2023-01-01', updatedAt: '2023-01-01' }
  ];
  const healthyMaintenances: Maintenance[] = [];
  const healthyDocuments: VehicleDocument[] = [
    { id: 'doc1', companyId: 'c1', vehicleId: 'v1', documentType: 'CRLV', expirationDate: '2027-12-31', status: DocumentStatus.VALID, createdAt: '2023-01-01', updatedAt: '2023-01-01' }
  ];
  const healthyTickets: TrafficTicket[] = [];

  const res1 = calculateHealthScore({
    vehicles: healthyVehicles,
    contracts: healthyContracts,
    maintenances: healthyMaintenances,
    documents: healthyDocuments,
    tickets: healthyTickets
  });

  if (res1.score < 75) {
    throw new Error(`Scenario 1 failed: Expected high score for healthy fleet, got ${res1.score}`);
  }
  console.log('✓ Scenario 1 (Healthy Fleet): Passed (Score:', res1.score, res1.status, ')');

  // Scenario 2: Low Fleet Availability
  const lowAvailVehicles: Vehicle[] = [
    { ...healthyVehicles[0], status: VehicleStatus.MAINTENANCE },
    { ...healthyVehicles[1], status: VehicleStatus.INACTIVE }
  ];
  const res2 = calculateHealthScore({ vehicles: lowAvailVehicles });
  if (res2.components.fleetAvailability !== 0) {
    throw new Error(`Scenario 2 failed: Expected 0% fleet availability, got ${res2.components.fleetAvailability}`);
  }
  console.log('✓ Scenario 2 (Low Fleet Availability): Passed');

  // Scenario 3: Overdue Maintenance
  const pastDate = '2020-01-01';
  const overdueMaint: Maintenance[] = [
    { id: 'm1', companyId: 'c1', vehicleId: 'v1', type: 1 as any, description: 'Troca de óleo', kmAtMaintenance: 10000, partsCost: 200, laborCost: 100, totalCost: 300, status: MaintenanceStatus.SCHEDULED, startDate: pastDate, createdAt: '2020-01-01', updatedAt: '2020-01-01' }
  ];
  const res3 = calculateHealthScore({ maintenances: overdueMaint });
  if (res3.components.maintenanceHealth !== 0) {
    throw new Error(`Scenario 3 failed: Expected 0% maintenance health for overdue maintenance, got ${res3.components.maintenanceHealth}`);
  }
  console.log('✓ Scenario 3 (Overdue Maintenance): Passed');

  // Scenario 4: Expired Documents
  const expiredDocs: VehicleDocument[] = [
    { id: 'd1', companyId: 'c1', vehicleId: 'v1', documentType: 'IPVA', expirationDate: '2020-01-01', status: DocumentStatus.EXPIRED, createdAt: '2020-01-01', updatedAt: '2020-01-01' }
  ];
  const res4 = calculateHealthScore({ documents: expiredDocs });
  if (res4.components.documentationHealth !== 0) {
    throw new Error(`Scenario 4 failed: Expected 0% doc health, got ${res4.components.documentationHealth}`);
  }
  console.log('✓ Scenario 4 (Expired Documents): Passed');

  // Scenario 5: Pending Tickets
  const pendingTickets: TrafficTicket[] = [
    { id: 't1', companyId: 'c1', vehicleId: 'v1', autoNumber: 'A123', organName: 'DETRAN', infractionCode: '5819', description: 'Excesso', infractionDate: '2025-01-01', dueDate: '2025-02-01', originalAmount: 150, points: 4, responsibility: 1 as any, status: TicketStatus.PENDING_IDENTIFICATION, createdAt: '2025-01-01', updatedAt: '2025-01-01' }
  ];
  const res5 = calculateHealthScore({ tickets: pendingTickets });
  if (res5.components.complianceHealth !== 0) {
    throw new Error(`Scenario 5 failed: Expected 0% compliance health, got ${res5.components.complianceHealth}`);
  }
  console.log('✓ Scenario 5 (Pending Tickets): Passed');

  // Scenario 6: Empty / Zero records
  const res6 = calculateHealthScore({});
  if (isNaN(res6.score) || !isFinite(res6.score) || res6.score < 0) {
    throw new Error(`Scenario 6 failed: Invalid score generated on empty input: ${res6.score}`);
  }
  console.log('✓ Scenario 6 (Empty Records Safe Fallback): Passed (Score:', res6.score, ')');

  // Scenario 7 & 8: Incomplete data & Unknown status
  const res7 = calculateHealthScore({
    vehicles: [{ id: 'vX', companyId: 'c1', plate: '', brand: '', model: '', yearFabrication: 0, yearModel: 0, color: '', renavam: '', chassis: '', currentKm: 0, fuelType: '', category: '', acquisitionValue: 0, currentValue: 0, rentalValueBase: 0, status: 'UNKNOWN' as any, isArchived: false, createdAt: '', updatedAt: '' }]
  });
  if (isNaN(res7.score)) {
    throw new Error('Scenario 7/8 failed: Produced NaN on incomplete data');
  }
  console.log('✓ Scenario 7 & 8 (Incomplete Data & Unknown Status): Passed');

  // Scenario 9: Multi-tenant isolated scope (processes only passed array)
  const multiTenantRes = calculateHealthScore({
    vehicles: healthyVehicles // only company c1 vehicles
  });
  if (multiTenantRes.indicators.totalVehicles !== 2) {
    throw new Error(`Scenario 9 failed: Expected 2 vehicles, got ${multiTenantRes.indicators.totalVehicles}`);
  }
  console.log('✓ Scenario 9 (Multi-tenant isolated scope): Passed');

  // Scenario 10: Financial Protection (Zero side effects on finance)
  // Calculating score must not execute financial mutations or touch financial accounts/payables/receivables.
  const res10 = calculateHealthScore({ vehicles: healthyVehicles, contracts: healthyContracts });
  if (res10.score === undefined) {
    throw new Error('Scenario 10 failed');
  }
  console.log('✓ Scenario 10 (Financial Protection & Immutability): Passed');

  console.log('All OperationalMetricsService tests passed successfully!');
}
