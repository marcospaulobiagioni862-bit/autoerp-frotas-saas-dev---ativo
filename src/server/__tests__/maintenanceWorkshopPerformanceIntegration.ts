import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { MaintenanceAuthorityService } from '../maintenanceAuthority';
import { MaintenanceSlaAuthorityService } from '../maintenanceSlaAuthority';
import { MaintenanceTimelineAuthorityService } from '../maintenanceTimelineAuthority';
import { MaintenanceWorkshopPerformanceAuthorityService } from '../maintenanceWorkshopPerformanceAuthority';

const companyA = 'maint-perf-company-a';
const companyB = 'maint-perf-company-b';
const adminAId = 'maint-perf-admin-a';
const adminBId = 'maint-perf-admin-b';
const vehicleA = 'maint-perf-vehicle-a';
const vehicleB = 'maint-perf-vehicle-b';

const adminA: AuthenticatedPrincipal = { companyId: companyA, userId: adminAId, name: 'Performance Admin A', role: 'ADMIN', permissions: ['*'] };
const adminB: AuthenticatedPrincipal = { companyId: companyB, userId: adminBId, name: 'Performance Admin B', role: 'ADMIN', permissions: ['*'] };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const rows = (result: any): any[] => Array.isArray(result?.rows) ? result.rows : [];
async function scalar(query: any): Promise<number> {
  const row = rows(await db.execute(query))[0];
  return Number(row?.count ?? 0);
}

async function seed(): Promise<void> {
  await db.execute(sql`INSERT INTO companies (id,name,status,created_at,updated_at) VALUES
    (${companyA},'Performance Company A','ACTIVE',NOW(),NOW()),
    (${companyB},'Performance Company B','ACTIVE',NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users (id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminAId},${companyA},'Performance Admin A','maint-perf-a@example.test','ADMIN',true,NOW(),NOW()),
    (${adminBId},${companyB},'Performance Admin B','maint-perf-b@example.test','ADMIN',true,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles (id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES
    (${vehicleA},${companyA},'MPA1A01','MPAREN-A','AVAILABLE',10000,NOW(),NOW()),
    (${vehicleB},${companyB},'MPB1B01','MPAREN-B','AVAILABLE',20000,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
}

async function financialCounts(companyId: string): Promise<[number, number, number]> {
  return [
    await scalar(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyId}`),
    await scalar(sql`SELECT count(*)::int count FROM account_receivables WHERE company_id=${companyId}`),
    await scalar(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}`),
  ];
}

async function completeSyntheticTimeline(principal: AuthenticatedPrincipal, workOrderId: string, prefix: string): Promise<void> {
  await MaintenanceTimelineAuthorityService.register(principal, workOrderId, { eventType: 'ENTERED_WORKSHOP', idempotencyKey: `${prefix}-entered` });
  await MaintenanceTimelineAuthorityService.register(principal, workOrderId, { eventType: 'WORK_STARTED', idempotencyKey: `${prefix}-started` });
  await MaintenanceTimelineAuthorityService.register(principal, workOrderId, { eventType: 'TECHNICALLY_COMPLETED', idempotencyKey: `${prefix}-completed` });
  await MaintenanceTimelineAuthorityService.register(principal, workOrderId, { eventType: 'VEHICLE_RELEASED', idempotencyKey: `${prefix}-released` });
}

export async function runMaintenanceWorkshopPerformanceIntegration(): Promise<void> {
  await seed();

  const beforeFinance = await financialCounts(companyA);
  const supplierA = await MaintenanceAuthorityService.createSupplier(adminA, {
    name: 'Oficina Sintética A', document: 'PERF-OFC-A', category: 'WORKSHOP',
  });
  const supplierB = await MaintenanceAuthorityService.createSupplier(adminB, {
    name: 'Oficina Sintética B', document: 'PERF-OFC-B', category: 'WORKSHOP',
  });

  const orderA = await MaintenanceAuthorityService.createWorkOrder(adminA, {
    number: 'OS-PERF-A', vehicleId: vehicleA, supplierId: supplierA.id, entryKm: 10000, description: 'Synthetic performance A',
  });
  const orderB = await MaintenanceAuthorityService.createWorkOrder(adminB, {
    number: 'OS-PERF-B', vehicleId: vehicleB, supplierId: supplierB.id, entryKm: 20000, description: 'Synthetic performance B',
  });

  await MaintenanceSlaAuthorityService.setExpectedDuration(adminA, orderA.id, 60);
  await MaintenanceSlaAuthorityService.setExpectedDuration(adminB, orderB.id, 60);
  await completeSyntheticTimeline(adminA, orderA.id, 'perf-a');
  await completeSyntheticTimeline(adminB, orderB.id, 'perf-b');

  const resultA = await MaintenanceWorkshopPerformanceAuthorityService.get(companyA);
  assert(resultA.totalCompletedWorkOrders === 1, `company A expected exactly one completed work order, got ${resultA.totalCompletedWorkOrders}`);
  assert(resultA.workshops.length === 1, `company A expected exactly one workshop, got ${resultA.workshops.length}`);
  const workshopA = resultA.workshops[0];
  assert(workshopA.supplierId === supplierA.id, 'company A workshop identity mismatch');
  assert(workshopA.workshopName === supplierA.name, 'company A workshop name mismatch');
  assert(workshopA.completedWorkOrders === 1, 'completed work order sample mismatch');
  assert(workshopA.slaEligibleWorkOrders === 1, 'explicit SLA sample mismatch');
  assert(workshopA.completedWithinSla === 1 && workshopA.completedLate === 0, 'SLA classification mismatch');
  assert(workshopA.slaCompliancePercent === 100, 'SLA compliance percentage mismatch');
  assert(workshopA.averageTotalMinutes !== null && workshopA.averageTotalMinutes >= 0, 'total duration was not derived');

  const filtered = await MaintenanceWorkshopPerformanceAuthorityService.get(companyA, { supplierId: supplierA.id, vehicleId: vehicleA });
  assert(filtered.totalCompletedWorkOrders === 1, 'valid workshop/vehicle filters lost the authorized order');
  const foreignFilter = await MaintenanceWorkshopPerformanceAuthorityService.get(companyA, { supplierId: supplierB.id });
  assert(foreignFilter.totalCompletedWorkOrders === 0 && foreignFilter.workshops.length === 0, 'cross-tenant supplier filter leaked data');

  const afterFinance = await financialCounts(companyA);
  assert(JSON.stringify(afterFinance) === JSON.stringify(beforeFinance), 'performance read-model flow mutated financial records');

  console.log('MAINT-SLA-1D-A workshop performance persistence/tenant/zero-finance integration: PASS');
}
