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
        // SECURITY-2N: any browser import that still names the historical
        // repository module resolves to an authenticated server-read adapter.
        // Match the complete relative specifier so Vite never leaves a leading
        // './' or '../' attached to the absolute replacement path.
        {
          find: /^(?:\.\.?\/)*persistence\/repositories\/localRepositories(?:\.ts)?$/,
          replacement: browserReadModelRepositories,
        },
        // SECURITY-2N: the React runtime can no longer seed/reset business data.
        {
          find: /^(?:\.\.?\/)*persistence\/seed\/seedData(?:\.ts)?$/,
          replacement: browserSeedStub,
        },
        // SECURITY-2N: browser test suites import local persistence fixtures and
        // are excluded from the production graph. CI/GitHub Actions is the
        // authoritative test environment.
        {
          find: /^(?:\.\.?\/)*components\/tests\/TestRunnerPanel(?:\.tsx)?$/,
          replacement: productionTestRunnerPanel,
        },
        // SECURITY-2N: the historical disaster-recovery screen performs local
        // backup/restore with simulated tenant identity. Production stays
        // fail-closed until a dedicated server-authoritative DR wave.
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
