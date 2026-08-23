import { readFile } from 'node:fs/promises';
import { runAdminUserAuthorityIntegration } from './adminUserAuthorityIntegration';
import { AdminUserClientTestRunner } from '../../api/__tests__/adminUserClientTestRunner';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const [vite, boundary, sidebar, app, adminAuthority, adminRoutes, adminClient, adminView, cashFlowRoutes] = await Promise.all([
    readFile('vite.config.ts', 'utf8'),
    readFile('src/components/security/ProductionCockpitBoundary.tsx', 'utf8'),
    readFile('src/components/layout/ProductionSidebar.tsx', 'utf8'),
    readFile('src/App.tsx', 'utf8'),
    readFile('src/server/adminUserAuthority.ts', 'utf8'),
    readFile('src/server/adminUserRoutes.ts', 'utf8'),
    readFile('src/api/adminUserClient.ts', 'utf8'),
    readFile('src/components/admin/ProductionUserAdministrationView.tsx', 'utf8'),
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
    assert(app.includes(symbol), `Expected App legacy entry ${symbol} changed; review alias coverage explicitly`);
    assert(boundary.includes(`export const ${symbol}`), `Production boundary does not export ${symbol}`);
  }

  assert(boundary.includes('OperationalIncidentCenterView'), 'Incident duplicate is not routed to SECURITY-2O authority');
  assert(boundary.includes('OperationalTasksView'), 'Workflow duplicate is not routed to SECURITY-2O task authority');
  assert(boundary.includes('ExecutiveOperationsCenterView'), 'Executive duplicate is not routed to SECURITY-2O authority');
  assert(boundary.includes('ProductionUserAdministrationView'), 'SECURITY-2Q1 production Users slice is not routed to server authority');

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

  const safeProductionRoutes = ['executive-operations', 'incident-management', 'workflow-center', 'resilience'];
  for (const route of safeProductionRoutes) {
    assert(sidebar.includes(`id: '${route}'`), `Trusted production route missing: ${route}`);
  }

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
  assert(adminView.includes('somente Usuários foi promovido'), 'SECURITY-2Q1 UI must keep unpromoted admin slices visibly fail-closed');
  assert(cashFlowRoutes.includes('registerAdminUserRoutes(app)'), 'SECURITY-2Q1 routes are not mounted in production bootstrap');
  for (const [name, source] of Object.entries({ adminAuthority, adminRoutes, adminClient, adminView })) {
    assert(!source.includes('localRepositories'), `SECURITY-2Q1 ${name} references localRepositories`);
    assert(!source.includes('localStorage'), `SECURITY-2Q1 ${name} references localStorage`);
  }
  assert(!adminClient.includes('companyId'), 'SECURITY-2Q1 client must not transmit browser tenant authority');
  assert(!adminClient.includes('passwordHash'), 'SECURITY-2Q1 client contract must not contain credential material');

  const clientResult = await AdminUserClientTestRunner.runAllTests();
  assert(clientResult.failed === 0, 'SECURITY-2Q1 administration client transport regression failed');
  await runAdminUserAuthorityIntegration();

  console.log(JSON.stringify({
    suite: 'SECURITY-2P/2Q1 production trust-boundary invariants',
    status: 'PASS',
    aliasedLegacyEntries: cockpitEntries.length,
    trustedCockpitRoutes: safeProductionRoutes,
    security2q1: 'PostgreSQL user administration authority PASS',
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
