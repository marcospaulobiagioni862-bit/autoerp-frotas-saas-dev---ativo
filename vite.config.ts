import { randomUUID } from 'node:crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ command }) => {
  const buildId = randomUUID();
  const browserReadModelRepositories = path.resolve(
    __dirname,
    'src/persistence/repositories/serverReadModelRepositories.ts'
  );
  const browserSeedStub = path.resolve(
    __dirname,
    'src/persistence/seed/productionSeedStub.ts'
  );
  const operationalPendingProjection = path.resolve(
    __dirname,
    'src/domain/operations/serverOperationalPendingProjection.ts'
  );
  const productionTestRunnerPanel = path.resolve(
    __dirname,
    'src/components/tests/ProductionTestRunnerPanel.tsx'
  );
  const productionResilienceCenter = path.resolve(
    __dirname,
    'src/components/resilience/ProductionResilienceCenterView.tsx'
  );
  const productionCockpitBoundary = path.resolve(
    __dirname,
    'src/components/security/ProductionCockpitBoundary.tsx'
  );
  const productionSidebar = path.resolve(
    __dirname,
    'src/components/layout/ProductionSidebar.tsx'
  );

  // SECURITY-2P: historical Phase 3.x and browser-authoritative admin sources
  // remain available to the development server for inspection, but production
  // builds replace every unsafe entry module before Rollup can include its graph.
  const productionCockpitAliases = command === 'build'
    ? [
        /^(?:\.\.?\/)*components\/incident-management\/IncidentManagementCenterView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/workflow\/OperationalWorkflowCenterView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/executive\/ExecutiveDashboardView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/admin\/AdministrationCenterView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/performance\/PerformanceManagementCenterView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/decision-management\/DecisionManagementCenterView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/execution\/OperationalExecutionCenterView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/release\/ReleaseGovernanceCenterView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/admin\/SystemHealthCenterView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/consolidation\/EnterpriseConsolidationView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/observability\/PostGoLiveObservabilityView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/governance\/GovernanceCenterView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/productivity\/OperationalProductivityView(?:\.tsx)?$/,
        /^(?:\.\.?\/)*components\/goals\/ManagementGoalsView(?:\.tsx)?$/,
      ].map((find) => ({ find, replacement: productionCockpitBoundary }))
    : [];

  // AUTOERP-67: dev e produção compartilham a mesma fonte unificada Sidebar.tsx.
  // Desativado o alias de navegação para garantir paridade total entre ambientes.
  const productionNavigationAliases: Array<{ find: RegExp; replacement: string }> = [];

  return {
    define: { __AUTOERP_BUILD_ID__: JSON.stringify(buildId) },
    plugins: [react(), { name: 'autoerp-build-version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) }); } }, tailwindcss()],
    resolve: {
      alias: [
        ...productionNavigationAliases,
        ...productionCockpitAliases,
        // SECURITY-2N compatibility bridge: historical read-only repository
        // imports resolve to authenticated server clients. Browser writes fail closed.
        {
          find: /^(?:\.\.?\/)*persistence\/repositories\/localRepositories(?:\.ts)?$/,
          replacement: browserReadModelRepositories,
        },
        // SECURITY-2N: startup/reset seed authority is disabled in production.
        {
          find: /^(?:\.\.?\/)*persistence\/seed\/seedData(?:\.ts)?$/,
          replacement: browserSeedStub,
        },
        // SECURITY-2N: operational pendings remain a pure projection, but tenant
        // identity is derived/validated from canonical server payloads and IDs are
        // deterministic. No fixed tenant fallback is allowed in the runtime graph.
        {
          find: /^(?:\.\.?\/)*domain\/operations\/OperationalPendingService(?:\.ts)?$/,
          replacement: operationalPendingProjection,
        },
        // Browser test suites import local persistence fixtures; CI/GitHub Actions
        // is the production test authority.
        {
          find: /^(?:\.\.?\/)*components\/tests\/TestRunnerPanel(?:\.tsx)?$/,
          replacement: productionTestRunnerPanel,
        },
        // Historical browser-local backup/restore is not production authority.
        {
          find: /^(?:\.\.?\/)*components\/resilience\/ResilienceCenterView(?:\.tsx)?$/,
          replacement: productionResilienceCenter,
        },
        {
          find: '@',
          replacement: path.resolve(__dirname, '.'),
        },
      ],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
