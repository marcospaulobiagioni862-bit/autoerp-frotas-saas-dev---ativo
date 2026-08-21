import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
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

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
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
