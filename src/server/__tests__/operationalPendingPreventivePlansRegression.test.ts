import assert from 'node:assert/strict';
import { generateOperationalPendings } from '../../domain/operations/serverOperationalPendingProjection';
import { generateOperationalPendings as generateOperationalPendingsClient } from '../../domain/operations/OperationalPendingService';
import { VehicleStatus } from '../../types/enums';
import type { Vehicle, MaintenancePlan } from '../../types/entities';

const companyId = 'company-preventive-test-001';

const vehicle: Vehicle = {
  id: 'veh-marcos-01',
  companyId,
  plate: 'BRA2E19',
  brand: 'Fiat',
  model: 'Mobi',
  yearFabrication: 2024,
  yearModel: 2024,
  color: 'Branco',
  renavam: '12345678901',
  chassis: 'CHASSISMARCOS001',
  currentKm: 18500, // 8.500 km acima de 10.000 km
  fuelType: 'Flex',
  category: 'Hatch',
  acquisitionValue: 60000,
  currentValue: 55000,
  rentalValueBase: 700,
  status: VehicleStatus.AVAILABLE,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// 1. Caso Positivo OVERDUE por KM (simulação verbatim do relato do Marcos)
const overduePlan: MaintenancePlan = {
  id: 'plan-overdue-km',
  companyId,
  vehicleId: vehicle.id,
  name: 'Troca de Óleo e Filtros',
  maintenanceType: 'OIL',
  intervalKm: 10000,
  nextDueKm: 10000,
  priority: 'HIGH',
  status: 'ACTIVE',
  cycleSequence: 1,
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Test with serverOperationalPendingProjection
const serverPendings = generateOperationalPendings({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [overduePlan],
});

const overduePending = serverPendings.find(
  (p) => p.entity === 'MaintenancePlan' && p.entityId === overduePlan.id
);

assert(overduePending, 'Plano preventivo vencido por KM deve gerar pendência operacional');
assert.equal(overduePending.type, 'MAINTENANCE');
assert.equal(overduePending.category, 'Manutenção Preventiva');
assert.equal(overduePending.priority, 'P1', 'Plano OVERDUE deve ter prioridade P1');
assert.equal(overduePending.severity, 'CRITICAL', 'Plano OVERDUE deve ter severidade CRITICAL');
assert.equal(overduePending.destinationTab, 'maintenance', 'destinationTab deve ser maintenance');
assert.equal(overduePending.vehiclePlate, 'BRA2E19');
assert(overduePending.title.includes('Preventiva Vencida'), 'Título deve indicar Preventiva Vencida');
assert(overduePending.title.includes('Troca de Óleo e Filtros'), 'Título deve conter o nome do plano');
assert(overduePending.description.includes('8.500 km vencidos'), 'Descrição deve detalhar exatamente 8.500 km vencidos');
assert(overduePending.description.includes('BRA2E19'), 'Descrição deve citar a placa');

// Paridade com OperationalPendingService
const clientPendings = generateOperationalPendingsClient({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [overduePlan],
});
const clientOverduePending = clientPendings.find(
  (p) => p.entity === 'MaintenancePlan' && p.entityId === overduePlan.id
);
assert(clientOverduePending, 'OperationalPendingService também deve projetar a pendência');
assert.equal(clientOverduePending.priority, 'P1');
assert.equal(clientOverduePending.severity, 'CRITICAL');
assert.equal(clientOverduePending.destinationTab, 'maintenance');

// 2. Caso Positivo DUE (vence agora)
const duePlan: MaintenancePlan = {
  id: 'plan-due-km',
  companyId,
  vehicleId: vehicle.id,
  name: 'Revisão de Pastilhas de Freio',
  maintenanceType: 'BRAKES',
  intervalKm: 18500,
  nextDueKm: 18500, // Igual ao KM atual do veículo -> DUE
  priority: 'MEDIUM',
  status: 'ACTIVE',
  cycleSequence: 1,
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const duePendings = generateOperationalPendings({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [duePlan],
});
const duePendingItem = duePendings.find(
  (p) => p.entity === 'MaintenancePlan' && p.entityId === duePlan.id
);
assert(duePendingItem, 'Plano em status DUE deve gerar pendência operacional');
assert.equal(duePendingItem.priority, 'P2', 'Plano DUE deve ter prioridade P2');
assert.equal(duePendingItem.severity, 'WARNING', 'Plano DUE deve ter severidade WARNING');
assert(duePendingItem.title.includes('Preventiva a Vencer'), 'Título deve indicar Preventiva a Vencer');

// 3. Caso Negativo UPCOMING (não deve gerar pendência de ruído)
const upcomingPlan: MaintenancePlan = {
  id: 'plan-upcoming-km',
  companyId,
  vehicleId: vehicle.id,
  name: 'Troca de Correia Dentada',
  maintenanceType: 'ENGINE',
  intervalKm: 50000,
  nextDueKm: 50000, // Bem acima de 18500 -> UPCOMING/OK
  priority: 'MEDIUM',
  status: 'ACTIVE',
  cycleSequence: 1,
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const upcomingPendings = generateOperationalPendings({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [upcomingPlan],
});
assert(
  !upcomingPendings.some((p) => p.entityId === upcomingPlan.id),
  'Plano UPCOMING não deve gerar pendência operacional'
);

// 4. Caso Negativo PAUSED (plano pausado já projetado como OVERDUE NUNCA gera pendência)
const pausedPlan: MaintenancePlan = {
  ...overduePlan,
  id: 'plan-paused-km',
  status: 'PAUSED',
  projectedStatus: 'OVERDUE',
  projectedStage: 'OVERDUE_KM',
  remainingKm: -8500,
};
const pausedPendingsServer = generateOperationalPendings({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [pausedPlan],
});
const pausedPendingsClient = generateOperationalPendingsClient({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [pausedPlan],
});
assert.equal(
  pausedPendingsServer.filter((p) => p.entityId === pausedPlan.id).length,
  0,
  'Plano com status PAUSED NUNCA deve gerar pendência no servidor'
);
assert.equal(
  pausedPendingsClient.filter((p) => p.entityId === pausedPlan.id).length,
  0,
  'Plano com status PAUSED NUNCA deve gerar pendência no cliente'
);

// 5. Caso Negativo ARCHIVED (Requisito PH-114: plano removido já projetado como OVERDUE NUNCA projeta pendência)
const archivedPlan: MaintenancePlan = {
  ...overduePlan,
  id: 'plan-archived-km',
  status: 'ARCHIVED',
  projectedStatus: 'OVERDUE',
  projectedStage: 'OVERDUE_KM',
  remainingKm: -8500,
  removedAt: '2026-10-25T12:00:00.000Z',
  removedBy: 'user-1',
  removalReason: 'Veículo descontinuado da frota',
};

const archivedPendingsServer = generateOperationalPendings({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [archivedPlan],
});
const archivedPendingsClient = generateOperationalPendingsClient({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [archivedPlan],
});
assert.equal(
  archivedPendingsServer.filter((p) => p.entityId === archivedPlan.id).length,
  0,
  'Plano com status ARCHIVED NUNCA deve gerar pendência no servidor (invariante PH-114)'
);
assert.equal(
  archivedPendingsClient.filter((p) => p.entityId === archivedPlan.id).length,
  0,
  'Plano com status ARCHIVED NUNCA deve gerar pendência no cliente (invariante PH-114)'
);

// 6. Caso Negativo COMPLETED (plano concluído já projetado como OVERDUE NUNCA gera pendência)
const completedPlan: MaintenancePlan = {
  ...overduePlan,
  id: 'plan-completed-km',
  status: 'COMPLETED',
  projectedStatus: 'OVERDUE',
  projectedStage: 'OVERDUE_KM',
  remainingKm: -8500,
};

const completedPendingsServer = generateOperationalPendings({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [completedPlan],
});
const completedPendingsClient = generateOperationalPendingsClient({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [completedPlan],
});
assert.equal(
  completedPendingsServer.filter((p) => p.entityId === completedPlan.id).length,
  0,
  'Plano com status COMPLETED NUNCA deve gerar pendência no servidor'
);
assert.equal(
  completedPendingsClient.filter((p) => p.entityId === completedPlan.id).length,
  0,
  'Plano com status COMPLETED NUNCA deve gerar pendência no cliente'
);

// 7. Caso Negativo: Veículo inexistente ou arquivado não deve gerar pendência fantasma (Observação b)
const orphanPlan: MaintenancePlan = {
  ...overduePlan,
  id: 'plan-orphan-vehicle',
  vehicleId: 'non-existent-or-archived-veh',
  projectedStatus: 'OVERDUE',
  projectedStage: 'OVERDUE_KM',
  remainingKm: -8500,
};
const orphanPendingsServer = generateOperationalPendings({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [orphanPlan],
});
const orphanPendingsClient = generateOperationalPendingsClient({
  companyId,
  vehicles: [vehicle],
  maintenancePlans: [orphanPlan],
});
assert.equal(
  orphanPendingsServer.filter((p) => p.entityId === orphanPlan.id).length,
  0,
  'Plano de veículo inexistente/arquivado NUNCA deve gerar pendência fantasma no servidor'
);
assert.equal(
  orphanPendingsClient.filter((p) => p.entityId === orphanPlan.id).length,
  0,
  'Plano de veículo inexistente/arquivado NUNCA deve gerar pendência fantasma no cliente'
);

// 7. Isolamento de Tenant (Multi-Tenant Fail-Closed)
assert.throws(
  () =>
    generateOperationalPendings({
      companyId,
      vehicles: [vehicle],
      maintenancePlans: [{ ...overduePlan, companyId: 'other-company-uuid' }],
    }),
  /SERVER_READ_MODEL_CROSS_TENANT_PAYLOAD/,
  'Payload com plano preventivo de outro tenant deve disparar SERVER_READ_MODEL_CROSS_TENANT_PAYLOAD'
);

console.log('operationalPendingPreventivePlansRegression: PASS');
