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
assert.match(projection, /receivables\?: AccountReceivable\[\]/, 'Central alerts projection must accept receivable read models');
assert.match(projection, /payables\?: AccountPayable\[\]/, 'Central alerts projection must accept payable read models');
assert.match(projection, /Documentos do Motorista/, 'Central alerts projection must include driver document pendings');

const seedStub = read('src/persistence/seed/productionSeedStub.ts');
assert.doesNotMatch(seedStub, /StorageAdapter|indexedDB|localStorage/i, 'Production seed stub must have no browser persistence path');
assert.match(seedStub, /BROWSER_SEED_RESET_DISABLED_SERVER_AUTHORITY_REQUIRED/, 'Browser reset must fail closed');

const migratedRuntimeFiles = [
  'src/app/navigationBadgeLoader.ts',
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
  assert.doesNotMatch(source, /persistence\/repositories\/localRepositories/, `${path} must not depend on the legacy repository alias`);
  assert.match(source, /serverReadModelRepositories/, `${path} must import the explicit authenticated server read-model adapter`);
}

const appSource = read('src/App.tsx');
assert.doesNotMatch(appSource, /StorageAdapter|indexedDB|localStorage/i, 'App must not directly access browser persistence');
assert.doesNotMatch(appSource, /persistence\/repositories\/(?:localRepositories|serverReadModelRepositories)/, 'App must defer the read-model repository graph');
assert.doesNotMatch(appSource, /persistence\/seed\/seedData|seedAutoERPTestData|handleResetSeedData/, 'App runtime must not depend on browser seed/reset authority');
assert.match(appSource, /import\('\.\/app\/navigationBadgeLoader'\)/, 'App must load the authenticated badge read-model boundary explicitly and on demand');
assert.match(appSource, /handleResolveNotification/, 'App must route notification clicks to the source module');
assert.match(appSource, /DocumentClient\.get\(item\.entityId\)/, 'Document notifications must resolve their canonical document before navigation');
assert.match(appSource, /setActiveTab\('documentos'\)/, 'Document notifications must navigate to the document center');
assert.match(appSource, /className="h-full min-h-0 overflow-hidden/, 'App shell must inherit the root height instead of creating a second viewport-sized scroll boundary');
const globalCssSource = read('src/index.css');
assert.match(globalCssSource, /html,[\s\S]*body,[\s\S]*#root[\s\S]*overflow:\s*hidden;/, 'Global document/root scroll must remain disabled so only the application scroll regions can move');
assert.match(globalCssSource, /height:\s*100%;/, 'Global document/root height must remain anchored to the viewport');
const badgeLoaderSource = read('src/app/navigationBadgeLoader.ts');
assert.match(badgeLoaderSource, /persistence\/repositories\/serverReadModelRepositories/, 'Badge loader must import the authenticated server read-model adapter');
assert.match(badgeLoaderSource, /domain\/operations\/serverOperationalPendingProjection/, 'Badge loader must import the tenant-safe pending projection explicitly');
const overviewSource = read('src/components/dashboard/OverviewDashboard.tsx');
assert.match(overviewSource, /domain\/operations\/serverOperationalPendingProjection/, 'Overview must import the tenant-safe pending projection explicitly');
assert.match(overviewSource, /companyId:\s*companyIdSnapshot/, 'Overview must pass the authenticated company snapshot into the pending projection');
const pendingSource = read('src/components/operations/PendingCenterView.tsx');
assert.match(pendingSource, /domain\/operations\/serverOperationalPendingProjection/, 'Pending center must import the tenant-safe pending projection explicitly');
assert.doesNotMatch(pendingSource, /WhatsappClient\.createCnhReminder\(item\.entityId\)/, 'Inactive WhatsApp provider must not expose a misleading send action in Central alerts');
assert.match(pendingSource, /id: 'FINANCE', label: 'Financeiro'/, 'Central alerts must expose the consolidated Financeiro filter');
const notificationBellSource = read('src/components/layout/NotificationBell.tsx');
assert.match(notificationBellSource, /Arquivo: \$\{attachment\.fileName\}/, 'Notification bell must show the human-readable document file name instead of an entity id');
assert.doesNotMatch(notificationBellSource, /\$\{item\.entityType\} · \$\{item\.entityId\}/, 'Notification bell must not expose raw entity ids as the primary label');
assert.match(notificationBellSource, /resolveNotification\(item\)/, 'Notification click must invoke resolution navigation');
const documentCenterSource = read('src/components/documents/DocumentCenter.tsx');
assert.match(documentCenterSource, /focusFileName\?: string/, 'Document center must accept a file focus from alerts');
assert.match(documentCenterSource, /setSearchTerm\(focusFileName\)/, 'Document center must focus the exact file name supplied by the alert navigation');

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
