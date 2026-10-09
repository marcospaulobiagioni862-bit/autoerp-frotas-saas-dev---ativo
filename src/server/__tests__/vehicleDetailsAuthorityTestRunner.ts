import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const filename = path.resolve('src/server/vehicleDetailsAuthority.ts');
const mod = new Module(filename);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));

let mockVehicle: any = null;
let mockDriver: any = null;
let mockContracts: any[] = [];
let mockWorkOrders: any[] = [];
let mockSuppliers: any[] = [];
let mockOilChanges: any[] = [];
let mockTires: any[] = [];
let mockTickets: any[] = [];
let mockDocuments: any[] = [];
let mockInsurances: any[] = [];
let mockTrackers: any[] = [];
let mockKm: any[] = [];
let mockOwnershipHistory: any[] = [];
let rawExecuteResults: Record<string, any> = {};

const mockContext: any = {
  getRawTransaction: () => ({
    execute: async (query: any) => {
      const sqlStr = typeof query === 'string' ? query : JSON.stringify(query);
      if (sqlStr.includes('account_receivables')) {
        return { rows: [{ total: '1500.50' }] };
      }
      if (sqlStr.includes('account_payables')) {
        return { rows: [{ total: '450.25' }] };
      }
      if (sqlStr.includes('FROM contracts')) {
        return { rows: mockContracts };
      }
      if (sqlStr.includes('FROM vehicle_inspections') && sqlStr.includes('COUNT(')) {
        return { rows: [{ count: 2 }] };
      }
      if (sqlStr.includes('FROM vehicle_inspections')) {
        return { rows: [{ id: 'insp-1', inspection_type: 'CHECK_IN', inspection_date: '2026-10-01', km: 25000, result: 'APPROVED', inspector_name: 'Carlos' }] };
      }
      if (sqlStr.includes('FROM file_attachments')) {
        return { rows: [{ count: 5 }] };
      }
      return { rows: [] };
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [
              {
                id: 'audit-1',
                companyId: 'company-test',
                entityType: 'Vehicle',
                entityId: 'vehicle-1',
                action: 'UPDATE',
                changes: JSON.stringify({ previousState: { status: 'AVAILABLE' }, newState: { status: 'RENTED' }, userName: 'Operador' }),
                userId: 'user-1',
                timestamp: new Date('2026-10-05T10:00:00Z'),
              },
            ],
          }),
        }),
      }),
    }),
  }),
  getVehicleRepo: () => ({
    findByIdForCompany: async (companyId: string, id: string) => {
      if (id === mockVehicle?.id) return mockVehicle;
      return null;
    },
    getOwnershipHistoryForVehicle: async () => mockOwnershipHistory,
  }),
  getDriverRepo: () => ({
    findByIdForCompany: async (companyId: string, id: string) => {
      if (id === mockDriver?.id) return mockDriver;
      return null;
    },
  }),
  getWorkOrderRepo: () => ({
    findAllByCompany: async () => mockWorkOrders,
  }),
  getSupplierRepo: () => ({
    findAllByCompany: async () => mockSuppliers,
  }),
  getOilChangeRepo: () => ({
    findAllByCompany: async () => mockOilChanges,
  }),
  getTireRepo: () => ({
    findAllByCompany: async () => mockTires,
  }),
  getTrafficTicketRepo: () => ({
    findAllByCompany: async () => mockTickets,
  }),
  getDocumentRepo: () => ({
    findAllByCompany: async () => mockDocuments,
  }),
  getInsuranceRepo: () => ({
    findAllByCompany: async () => mockInsurances,
  }),
  getTrackerRepo: () => ({
    findAllByCompany: async () => mockTrackers,
  }),
  getKmRecordRepo: () => ({
    findByVehicleIdForCompany: async () => mockKm,
  }),
};

const original = mod.require.bind(mod);
mod.require = (id: string) => {
  if (id === '../db/uow') {
    return {
      UnitOfWork: {
        run: async (company: string, fn: Function) => {
          assert.equal(company, 'company-test');
          return await fn(mockContext);
        },
      },
    };
  }
  return original(id);
};

mod._compile(
  ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  filename
);

const { getVehicleDetailsSummary, VehicleDetailsNotFoundError } = mod.exports;

// Setup fixtures
mockVehicle = {
  id: 'vehicle-1',
  companyId: 'company-test',
  plate: 'BRA2E19',
  brand: 'FIAT',
  model: 'ARGO',
  version: 'TREKKING 1.3',
  status: 'RENTED',
  currentKm: 32000,
  nextMaintenanceKm: 30000,
  rentalValueBase: 700,
  currentDriverId: 'driver-1',
  currentContractId: 'contract-1',
  crlvExerciseYear: 2025,
};

mockDriver = {
  id: 'driver-1',
  fullName: 'Marcos Silva',
  cpf: '12345678901',
  cnh: '987654321',
  cnhCategory: 'B',
};

mockContracts = [
  {
    id: 'contract-1',
    company_id: 'company-test',
    contract_number: 'CTR-001',
    driver_id: 'driver-1',
    vehicle_id: 'vehicle-1',
    start_date: '2026-09-01',
    status: 'ACTIVE',
    rental_amount: 700,
    security_deposit_amount: 1500,
  },
];

mockSuppliers = [
  { id: 'supp-1', tradeName: 'Oficina Central', name: 'Oficina Central' },
];

mockWorkOrders = [
  {
    id: 'wo-1',
    companyId: 'company-test',
    vehicleId: 'vehicle-1',
    supplierId: 'supp-1',
    number: 'OS-100',
    description: 'Revisão geral',
    subtotalParts: 200,
    subtotalLabor: 150,
    subtotalServices: 0,
    total: 350,
    status: 'COMPLETED',
    serviceDate: '2026-09-20',
    parts: [],
    services: [],
    laborItems: [],
  },
];

mockOilChanges = [
  {
    id: 'oil-1',
    companyId: 'company-test',
    vehicleId: 'vehicle-1',
    supplierId: 'supp-1',
    km: 20000,
    oilBrand: 'Mobil',
    oilType: '5W30',
    filterChanged: true,
    date: '2026-08-10',
  },
];

mockTires = [
  {
    id: 'tire-1',
    companyId: 'company-test',
    vehicleId: 'vehicle-1',
    position: 'DIANTEIRO_ESQUERDO',
    brand: 'Pirelli',
    model: 'Cinturato',
    cost: 400,
    installationDate: '2026-07-01',
  },
];

mockTickets = [
  {
    id: 'ticket-1',
    autoNumber: 'AUT-999',
    infractionDate: '2026-09-15',
    originalAmount: 195.23,
    responsibility: 'DRIVER',
    driverIndicatedAt: null,
    status: 'PENDING_IDENTIFICATION',
  },
];

mockDocuments = [
  { id: 'doc-1', documentType: 'CRLV', status: 'ACTIVE' },
];

mockInsurances = [
  { id: 'ins-1', insuranceCompany: 'Porto Seguro', status: 'ACTIVE', endDate: '2026-12-31' },
];

mockTrackers = [
  { id: 'tr-1', equipmentModel: 'Suntech ST310U', imei: '123456789012345' },
];

// Consecutive duplicate readings: 30000, 30000 (duplicate), 32000
mockKm = [
  { id: 'km-1', kmValue: 30000, recordDate: '2026-09-01' },
  { id: 'km-2', kmValue: 30000, recordDate: '2026-09-02' },
  { id: 'km-3', kmValue: 32000, recordDate: '2026-09-15' },
];

mockOwnershipHistory = [
  { id: 'own-1', ownerName: 'MoveFlex Locadora', ownerType: 'COMPANY', effectiveFrom: '2025-01-01' },
];

// Test execution
const summary = await getVehicleDetailsSummary('company-test', 'vehicle-1');

// 1. Vehicle assertions
assert.equal(summary.vehicle.id, 'vehicle-1');
assert.equal(summary.vehicle.plate, 'BRA2E19');

// 2. Driver & Active Contract assertions
assert.equal(summary.driver?.name, 'Marcos Silva');
assert.equal(summary.activeContract?.contractNumber, 'CTR-001');
assert.equal(summary.activeContract?.recurringValue, 700);

// 3. Maintenances assertions (work orders, oil changes, tires merged with supplier resolution)
assert.equal(summary.maintenances.length, 3);
const wo = summary.maintenances.find((m: any) => m.type === 'WORK_ORDER');
assert.ok(wo);
assert.equal(wo.supplierName, 'Oficina Central');
assert.equal(wo.workOrderNumber, 'OS-100');

const oil = summary.maintenances.find((m: any) => m.type === 'OIL_CHANGE');
assert.ok(oil);
assert.equal(oil.supplierName, 'Oficina Central');

const tire = summary.maintenances.find((m: any) => m.type === 'TIRE');
assert.ok(tire);

// 4. Traffic ticket assertions
assert.equal(summary.trafficTickets.length, 1);
assert.equal(summary.trafficTickets[0].noticeNumber, 'AUT-999');
assert.equal(summary.trafficTickets[0].amount, 195.23);

// 5. KM duplicate suppression assertion
assert.equal(summary.kmRecords.length, 2, 'consecutive duplicate KM reading must be filtered');
assert.equal(summary.kmRecords[0].kmValue, 30000);
assert.equal(summary.kmRecords[1].kmValue, 32000);

// 6. Financial summary assertions (SQL aggregate directly mapped)
assert.equal(summary.financialSummary.totalRevenue, 1500.50);
assert.equal(summary.financialSummary.totalExpenses, 450.25);
assert.equal(summary.financialSummary.netProfit, 1500.50 - 450.25);

// 7. Inspections summary & files assertions
assert.equal(summary.inspectionsSummary?.total, 2);
assert.equal(summary.inspectionsSummary?.latest?.result, 'APPROVED');
assert.equal(summary.filesCount, 5);

// 8. Compliance alerts assertions
assert.equal(summary.complianceAlerts?.isMaintenanceOverdue, true, '32000 >= 30000 must trigger maintenance overdue');
assert.equal(summary.complianceAlerts?.isInsuranceExpired, false, 'active insurance until Dec 2026 must be valid');
assert.equal(summary.complianceAlerts?.hasPendingTickets, true, 'unindicated driver ticket must trigger alert');

// 9. NotFound error assertion
await assert.rejects(
  async () => getVehicleDetailsSummary('company-test', 'unknown-vehicle'),
  VehicleDetailsNotFoundError
);

console.log('vehicleDetailsAuthorityTestRunner: PASS (All aggregate fields, invariants and error cases verified)');
