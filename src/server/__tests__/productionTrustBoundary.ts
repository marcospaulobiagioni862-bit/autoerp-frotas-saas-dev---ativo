import { readFile } from 'node:fs/promises';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const [vite, boundary, sidebar, app] = await Promise.all([
    readFile('vite.config.ts', 'utf8'),
    readFile('src/components/security/ProductionCockpitBoundary.tsx', 'utf8'),
    readFile('src/components/layout/ProductionSidebar.tsx', 'utf8'),
    readFile('src/App.tsx', 'utf8'),
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

  console.log(JSON.stringify({
    suite: 'SECURITY-2P production trust-boundary invariants',
    status: 'PASS',
    aliasedLegacyEntries: cockpitEntries.length,
    trustedCockpitRoutes: safeProductionRoutes,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
