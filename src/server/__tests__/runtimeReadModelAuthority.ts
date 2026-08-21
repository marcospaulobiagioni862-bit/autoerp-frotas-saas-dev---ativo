import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VehicleRepository } from '../../persistence/repositories/serverReadModelRepositories';
import { generateOperationalPendings } from '../../domain/operations/serverOperationalPendingProjection';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const vite = read('vite.config.ts');
assert.match(vite, /serverReadModelRepositories\.ts/, 'Vite must route legacy repository reads to the server read-model adapter');
assert.match(vite, /productionSeedStub\.ts/, 'Vite must disable browser seed authority');
assert.match(vite, /serverOperationalPendingProjection\.ts/, 'Vite must route operational pending projection to the tenant-safe deterministic implementation');
assert.match(vite, /ProductionTestRunnerPanel\.tsx/, 'Production build must exclude the historical browser test runner graph');
assert.match(vite, /ProductionResilienceCenterView\.tsx/, 'Production build must exclude browser-local backup/restore authority');
assert.match(vite, /localRepositories/, 'Compatibility alias must explicitly match the historical repository import');

const adapter = read('src/persistence/repositories/serverReadModelRepositories.ts');
assert.doesNotMatch(adapter, /StorageAdapter/, 'Server read-model adapter must never import StorageAdapter');
assert.doesNotMatch(adapter, /indexedDB/i, 'Server read-model adapter must never use IndexedDB');
assert.doesNotMatch(adapter, /localStorage/i, 'Server read-model adapter must never use localStorage');
assert.match(adapter, /VehicleClient\.list\(\)/, 'Vehicle reads must use the authenticated server client');
assert.match(adapter, /FinanceObligationClient\.listReceivables\(\)/, 'Receivable reads must use the authenticated server client');
assert.match(adapter, /MaintenanceClient\.listWorkOrders\(\)/, 'Maintenance reads must use the authenticated server client');
assert.match(adapter, /DocumentClient\.list/, 'Document reads must use the authenticated server client');
assert.match(adapter, /BROWSER_WRITE_DISABLED_SERVER_AUTHORITY_REQUIRED/, 'Legacy browser writes must fail closed');

const projection = read('src/domain/operations/serverOperationalPendingProjection.ts');
assert.doesNotMatch(projection, /company-main-uuid/, 'Operational pending runtime must not use a fixed tenant fallback');
assert.doesNotMatch(projection, /Math\.random|Date\.now/, 'Operational pending IDs must be deterministic');
assert.doesNotMatch(projection, /StorageAdapter|indexedDB|localStorage/i, 'Operational pending projection must be pure and read-only');
assert.match(projection, /SERVER_READ_MODEL_CROSS_TENANT_PAYLOAD/, 'Mixed-tenant canonical payloads must fail closed');
assert.match(projection, /SERVER_READ_MODEL_TENANT_MISMATCH/, 'Forged/mismatched tenant hints must fail closed');

const seedStub = read('src/persistence/seed/productionSeedStub.ts');
assert.doesNotMatch(seedStub, /StorageAdapter|indexedDB|localStorage/i, 'Production seed stub must have no browser persistence path');
assert.match(seedStub, /BROWSER_SEED_RESET_DISABLED_SERVER_AUTHORITY_REQUIRED/, 'Browser reset must fail closed');

const migratedRuntimeFiles = [
  'src/App.tsx',
  'src/components/dashboard/OverviewDashboard.tsx',
  'src/components/dashboard/PerformanceMetricsWidget.tsx',
  'src/components/operations/PendingCenterView.tsx',
  'src/components/operations/DailyOperationsView.tsx',
  'src/components/rental/RentalLifecycleView.tsx',
  'src/components/operations/RentalControlCenterView.tsx',
  'src/components/reports/ManagementReportsView.tsx',
];
for (const path of migratedRuntimeFiles) {
  const source = read(path);
  assert.doesNotMatch(source, /StorageAdapter|indexedDB|localStorage/i, `${path} must not directly access browser persistence`);
}

const testPanel = read('src/components/tests/ProductionTestRunnerPanel.tsx');
assert.doesNotMatch(testPanel, /PersistenceTestRunner|StorageAdapter|seedAutoERPTestData/, 'Production test panel must not pull browser test persistence');
assert.match(testPanel, /GitHub Actions/, 'Production test panel must direct technical authority to CI');

const resiliencePanel = read('src/components/resilience/ProductionResilienceCenterView.tsx');
assert.doesNotMatch(resiliencePanel, /BackupService|StorageAdapter|company-default|admin-user-01/, 'Production resilience panel must not load local backup authority or simulated tenant identity');
assert.match(resiliencePanel, /fail-closed/i, 'Production resilience panel must explicitly remain fail-closed');

const header = read('src/components/layout/Header.tsx');
assert.doesNotMatch(header, /Reset Seed/, 'Production header must not expose Reset Seed');
assert.doesNotMatch(header, /Carlos Silva|Gestor de Operações/, 'Production header must not contain a simulated operator identity');
assert.match(header, /useAuth\(\)/, 'Header identity must come from the authenticated session');
assert.match(header, /GitHub Actions/, 'Header must point test status to the authoritative CI environment when browser tests are disabled');

await assert.rejects(
  () => new VehicleRepository().create({} as never),
  /BROWSER_WRITE_DISABLED_SERVER_AUTHORITY_REQUIRED/,
  'Legacy repository writes must be rejected before any browser persistence can run'
);

assert.throws(
  () => generateOperationalPendings({}),
  /SERVER_READ_MODEL_COMPANY_REQUIRED/,
  'Pending projection must fail closed when no canonical tenant can be derived'
);
assert.throws(
  () => generateOperationalPendings({ companyId: 'forged-company', vehicles: [{ id: 'v1', companyId: 'canonical-company' } as never] }),
  /SERVER_READ_MODEL_TENANT_MISMATCH/,
  'Pending projection must reject a forged tenant hint that conflicts with canonical server payload'
);

console.log('SECURITY-2N runtime read-model authority: PASS');
