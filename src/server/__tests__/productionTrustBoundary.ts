import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runAdminUserAuthorityIntegration } from './adminUserAuthorityIntegration';
import { AdminUserClientTestRunner } from '../../api/__tests__/adminUserClientTestRunner';
import { normalizePostgresConnectionString } from '../../db/postgresConnectionString';

const require = createRequire(import.meta.url);
const migrationConnection = require('../../../migrate_db.cjs') as {
  normalizePostgresConnectionString(value: string): string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const [vite, boundary, sidebar, app, financeHub, adminAuthority, adminRoutes, adminClient, adminView, tenantAuthority, tenantRoutes, tenantClient, tenantView, cashFlowRoutes] = await Promise.all([
    readFile('vite.config.ts', 'utf8'),
    readFile('src/components/security/ProductionCockpitBoundary.tsx', 'utf8'),
    readFile('src/components/layout/ProductionSidebar.tsx', 'utf8'),
    readFile('src/App.tsx', 'utf8'),
    readFile('src/components/finance/FinanceHubView.tsx', 'utf8'),
    readFile('src/server/adminUserAuthority.ts', 'utf8'),
    readFile('src/server/adminUserRoutes.ts', 'utf8'),
    readFile('src/api/adminUserClient.ts', 'utf8'),
    readFile('src/components/admin/ProductionUserAdministrationView.tsx', 'utf8'),
    readFile('src/server/tenantProfileAuthority.ts', 'utf8'),
    readFile('src/server/tenantProfileRoutes.ts', 'utf8'),
    readFile('src/api/tenantProfileClient.ts', 'utf8'),
    readFile('src/components/admin/ProductionTenantProfileView.tsx', 'utf8'),
    readFile('src/server/financeCashFlowRoutes.ts', 'utf8'),
  ]);

  assert(vite.includes("defineConfig(({ command })"), 'Vite config must distinguish production build from development runtime');
  assert(vite.includes("command === 'build'"), 'Legacy cockpit quarantine must be active for production build');
  assert(vite.includes('ProductionCockpitBoundary.tsx'), 'Production cockpit boundary is not wired');
  assert(vite.includes('ProductionSidebar.tsx'), 'Production navigation boundary is not wired');

  const cockpitEntries = [
    'components/incident-management/IncidentManagementCenterView',
    'components/workflow/OperationalWorkflowCenterView',
    'components/executive/ExecutiveDashboardView',
    'components/performance/PerformanceManagementCenterView',
    'components/decision-management/DecisionManagementCenterView',
    'components/execution/OperationalExecutionCenterView',
    'components/release/ReleaseGovernanceCenterView',
    'components/audit/SystemIntegrityAuditView',
    'components/admin/SystemHealthCenterView',
    'components/consolidation/EnterpriseConsolidationView',
    'components/observability/PostGoLiveObservabilityView',
    'components/governance/GovernanceCenterView',
    'components/productivity/OperationalProductivityView',
    'components/goals/ManagementGoalsView',
  ];
  for (const entry of cockpitEntries) {
    const normalized = entry.replaceAll('/', '\\/');
    assert(vite.includes(normalized), `Missing production alias for ${entry}`);
  }

  const appLegacyImports = [
    'IncidentManagementCenterView',
    'OperationalWorkflowCenterView',
    'ExecutiveDashboardView',
    'PerformanceManagementCenterView',
    'DecisionManagementCenterView',
    'OperationalExecutionCenterView',
    'ReleaseGovernanceCenterView',
    'SystemIntegrityAuditView',
    'SystemHealthCenterView',
    'EnterpriseConsolidationView',
    'PostGoLiveObservabilityView',
    'GovernanceCenterView',
    'OperationalProductivityView',
    'ManagementGoalsView',
  ];
  for (const symbol of appLegacyImports) {
    assert(boundary.includes(`export const ${symbol}`), `Production boundary does not export ${symbol}`);
  }

  const purgedAppLegacyImports = [
    'IncidentManagementCenterView',
    'ReleaseGovernanceCenterView',
    'SystemIntegrityAuditView',
    'SystemHealthCenterView',
    'EnterpriseConsolidationView',
    'PostGoLiveObservabilityView',
    'GovernanceCenterView',
    'OperationalProductivityView',
  ];
  for (const symbol of purgedAppLegacyImports) {
    assert(!app.includes(symbol), `Purged legacy App entry ${symbol} must not return to V2 shell`);
  }

  const retainedAppLegacyImports = [
    'OperationalWorkflowCenterView',
    'ExecutiveDashboardView',
    'PerformanceManagementCenterView',
    'DecisionManagementCenterView',
    'OperationalExecutionCenterView',
    'ManagementGoalsView',
  ];
  for (const symbol of retainedAppLegacyImports) {
    assert(app.includes(symbol), `Expected retained App entry ${symbol} changed; review boundary coverage explicitly`);
  }

  assert(boundary.includes('OperationalIncidentCenterView'), 'Incident duplicate is not routed to SECURITY-2O authority');
  assert(boundary.includes('OperationalTasksView'), 'Workflow duplicate is not routed to SECURITY-2O task authority');
  assert(boundary.includes('ExecutiveOperationsCenterView'), 'Executive duplicate is not routed to SECURITY-2O authority');
  assert(boundary.includes('ProductionUserAdministrationView'), 'SECURITY-2Q2 production administration is not routed to server authority');

  const forbiddenBoundaryMarkers = [
    'localStorage',
    'StorageAdapter',
    'localRepositories',
    'AuditLogRepository',
    'EnterpriseWorkflowTestRunner',
    'EnterpriseExecutionTestRunner',
    'EnterprisePerformanceTestRunner',
    'usr-sre-admin',
    'usr-exec-1',
    'usr-admin-default',
    'comp-main-tenant-360',
    'admin-consolidator',
    '__autoerp_executive_decisions_v1_',
    '__autoerp_goals_v1_',
  ];
  for (const marker of forbiddenBoundaryMarkers) {
    assert(!boundary.includes(marker), `Production boundary reintroduced forbidden marker: ${marker}`);
  }

  const safeProductionRoutes = ['administration', 'executive-operations', 'incident-management', 'workflow-center', 'resilience'];
  for (const route of safeProductionRoutes) {
    assert(sidebar.includes(`id: '${route}'`), `Trusted production route missing: ${route}`);
  }
  assert(
    sidebar.includes("const isAdmin = String(user.role || '').toUpperCase() === 'ADMIN';"),
    'Production administration navigation must derive visibility from the authenticated ADMIN principal'
  );
  assert(
    sidebar.includes("label: 'Administração'"),
    'Production ADMIN navigation label for the promoted Users and Tenant slices is missing'
  );

  const quarantinedNavigationLabels = [
    'Gestão de Resultados (3.60)',
    'Gestão de Decisões (3.59)',
    'Governança de Releases',
    'Auditoria Transversal',
    'Consolidação Empresarial',
    'Execução Operacional',
    'Observabilidade & Pós-Go-Live',
  ];
  for (const label of quarantinedNavigationLabels) {
    assert(!sidebar.includes(label), `Legacy cockpit remains exposed in production navigation: ${label}`);
  }

  assert(!sidebar.includes("id: 'system-health'"), 'Browser-derived system health remains exposed in production navigation');
  assert(!sidebar.includes("badge: '42/42'"), 'Production navigation still fabricates a 42/42 test badge');
  assert(sidebar.includes("badge: 'CI'"), 'Production validation entry must point users to CI authority');
  assert(sidebar.includes('COCKPIT SERVER AUTHORITY'), 'Production cockpit is not clearly identified as server-authoritative');
  assert(!sidebar.includes('h-dvh max-h-dvh'), 'Production sidebar must not size itself to the full viewport below the fixed header');
  assert(sidebar.includes('h-full max-h-full min-h-0 overflow-hidden'), 'Production sidebar must inherit the available post-header height so its lower menu remains reachable');
  assert(sidebar.includes('useState(false)'), 'Production authority submenu must start collapsed');
  assert(sidebar.includes("id: 'transactions', label: 'Movimentações'"), 'Production navigation must expose Movimentações explicitly');
  assert(sidebar.includes("id: 'cashflow', label: 'Fluxo de Caixa'"), 'Production navigation must expose Fluxo de Caixa explicitly');
  assert(app.includes("activeTab==='cashflow'&&<FinanceHubView initialSubTab=\"cashflow\""), 'Fluxo de Caixa navigation must select the cashflow sub-tab');
  assert(financeHub.includes("id: 'transactions' as const, label: 'Movimentações'"), 'Finance hub Movimentações sub-tab is missing');
  assert(financeHub.includes("id: 'cashflow' as const, label: 'Fluxo de Caixa'"), 'Finance hub Fluxo de Caixa sub-tab is missing');

  // SECURITY-2Q1 source invariants. Browser identity must never be authority,
  // credentials must not be returned, and no local/browser repository may appear
  // anywhere in the promoted production path.
  assert(adminAuthority.includes("String(actor.role || '').toUpperCase() !== 'ADMIN'"), 'SECURITY-2Q1 authority must be ADMIN-only');
  assert(adminAuthority.includes('pg_advisory_xact_lock'), 'SECURITY-2Q1 must serialize tenant ADMIN status races');
  assert(adminAuthority.includes("eq(users.companyId, actor.companyId)"), 'SECURITY-2Q1 authority lacks explicit tenant predicate');
  assert(adminAuthority.includes("eq(users.id, targetUserId)"), 'SECURITY-2Q1 mutation lacks target row predicate');
  assert(adminAuthority.includes(".for('update')"), 'SECURITY-2Q1 target mutation must lock rows');
  assert(adminAuthority.includes('Administrador não pode desativar a própria conta autenticada'), 'SECURITY-2Q1 self-lockout guard missing');
  assert(adminAuthority.includes('Não é possível desativar o último administrador ativo'), 'SECURITY-2Q1 last-admin guard missing');
  assert(adminRoutes.includes("app.get('/api/admin/users'"), 'SECURITY-2Q1 ADMIN list route missing');
  assert(adminRoutes.includes("app.patch('/api/admin/users/:id/status'"), 'SECURITY-2Q1 ADMIN status route missing');
  assert(adminRoutes.includes("Object.keys(body).length !== 1"), 'SECURITY-2Q1 route must reject forged extra authority fields');
  assert(adminClient.includes("credentials: 'include'"), 'SECURITY-2Q1 client must use authenticated cookie transport');
  assert(adminView.includes("type AdministrationTab = 'users' | 'tenant'"), 'SECURITY-2Q2 UI must expose exactly Users and Tenant tabs');
  assert(adminView.includes('Empresa / Tenant foram promovidos'), 'SECURITY-2Q2 UI must keep unpromoted admin slices visibly fail-closed');
  assert(adminView.includes('ProductionTenantProfileView'), 'SECURITY-2Q2 tenant profile view is not mounted in production administration');
  assert(cashFlowRoutes.includes('registerAdminUserRoutes(app)'), 'SECURITY-2Q1 routes are not mounted in production bootstrap');
  assert(cashFlowRoutes.includes('registerTenantProfileRoutes(app)'), 'SECURITY-2Q2 routes are not mounted in production bootstrap');
  for (const [name, source] of Object.entries({ adminAuthority, adminRoutes, adminClient, adminView })) {
    assert(!source.includes('localRepositories'), `SECURITY-2Q1 ${name} references localRepositories`);
    assert(!source.includes('localStorage'), `SECURITY-2Q1 ${name} references localStorage`);
  }
  assert(!adminClient.includes('companyId'), 'SECURITY-2Q1 client must not transmit browser tenant authority');
  assert(!adminClient.includes('passwordHash'), 'SECURITY-2Q1 client contract must not contain credential material');

  // SECURITY-2Q2 source invariants for Empresa / Tenant.
  assert(tenantAuthority.includes("String(actor.role || '').toUpperCase() !== 'ADMIN'"), 'SECURITY-2Q2 authority must be ADMIN-only');
  assert(tenantAuthority.includes("eq(companies.id, actor.companyId)"), 'SECURITY-2Q2 authority lacks explicit tenant predicate');
  assert(tenantAuthority.includes(".for('update')"), 'SECURITY-2Q2 mutation must lock authoritative rows');
  assert(tenantAuthority.includes("entityName: 'TenantOperationalConfig'"), 'SECURITY-2Q2 mutation lacks atomic audit evidence');
  assert(tenantRoutes.includes("app.get('/api/admin/tenant-profile'"), 'SECURITY-2Q2 GET route missing');
  assert(tenantRoutes.includes("app.patch('/api/admin/tenant-profile'"), 'SECURITY-2Q2 PATCH route missing');
  assert(tenantRoutes.includes("new Set(['companyName', 'timezone', 'currency', 'maxVehiclesLimit', 'maxDriversLimit'])"), 'SECURITY-2Q2 PATCH allowlist changed');
  assert(tenantClient.includes("credentials: 'include'"), 'SECURITY-2Q2 client must use authenticated cookie transport');
  assert(tenantClient.includes("fetch('/api/admin/tenant-profile'"), 'SECURITY-2Q2 client route missing');
  assert(tenantView.includes('Documento da empresa somente leitura'), 'SECURITY-2Q2 immutable document UI guard missing');
  for (const [name, source] of Object.entries({ tenantAuthority, tenantRoutes, tenantClient, tenantView })) {
    assert(!source.includes('localRepositories'), `SECURITY-2Q2 ${name} references localRepositories`);
    assert(!source.includes('localStorage'), `SECURITY-2Q2 ${name} references localStorage`);
  }

  // DB-TLS-1 preserves today's verified TLS behavior explicitly before pg v9 changes aliases.
  const tlsAliases = ['prefer', 'require', 'verify-ca'];
  for (const mode of tlsAliases) {
    const input = `postgres://user:p%40ss@db.example.test:5432/autoerp?application_name=autoerp&sslmode=${mode}`;
    for (const [surface, normalizer] of [
      ['runtime', normalizePostgresConnectionString],
      ['migrations', migrationConnection.normalizePostgresConnectionString],
    ] as const) {
      const original = new URL(input);
      const normalized = new URL(normalizer(input));
      assert(normalized.searchParams.get('sslmode') === 'verify-full', `DB-TLS-1 ${surface} did not preserve verified TLS for ${mode}`);
      assert(normalized.username === original.username && normalized.password === original.password, `DB-TLS-1 ${surface} changed credentials`);
      assert(normalized.searchParams.get('application_name') === 'autoerp', `DB-TLS-1 ${surface} changed unrelated parameters`);
    }
  }
  const preservedTlsUrls = [
    'postgres://user:secret@localhost:5432/autoerp',
    'postgres://user:secret@localhost:5432/autoerp?sslmode=disable',
    'postgres://user:secret@localhost:5432/autoerp?sslmode=verify-full',
    'postgres://user:secret@localhost:5432/autoerp?uselibpqcompat=true&sslmode=require',
    'not-a-postgres-url',
  ];
  for (const input of preservedTlsUrls) {
    assert(normalizePostgresConnectionString(input) === input, 'DB-TLS-1 runtime changed an explicit/non-TLS connection mode');
    assert(migrationConnection.normalizePostgresConnectionString(input) === input, 'DB-TLS-1 migrations changed an explicit/non-TLS connection mode');
  }

  const clientResult = await AdminUserClientTestRunner.runAllTests();
  assert(clientResult.failed === 0, 'SECURITY-2Q1/2Q2 administration client transport regression failed');
  await runAdminUserAuthorityIntegration();

  console.log(JSON.stringify({
    suite: 'SECURITY-2P/2Q1/2Q2 production trust-boundary invariants',
    status: 'PASS',
    aliasedLegacyEntries: cockpitEntries.length,
    trustedCockpitRoutes: safeProductionRoutes,
    security2q1: 'PostgreSQL user administration authority PASS',
    security2q2: 'PostgreSQL tenant profile authority PASS',
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
