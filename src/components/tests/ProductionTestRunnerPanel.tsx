import React from 'react';
import { Card, PageHeader } from '../ui';
import { ShieldCheck, GitBranch } from 'lucide-react';

interface TestRunnerPanelProps {
  onTestsCompleted?: (summary: { total: number; passed: number; failed: number }) => void;
}

/**
 * SECURITY-2N production replacement for the historical in-browser test runner.
 * The legacy runner imports persistence/seed test fixtures and must never be
 * bundled into the production application. Authoritative validation runs in CI.
 */
export const TestRunnerPanel: React.FC<TestRunnerPanelProps> = () => (
  <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
    <PageHeader
      title="Validação Técnica"
      description="As suítes autoritativas são executadas fora do navegador."
      breadcrumb="Segurança & Qualidade"
    />
    <Card padding="md" className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Testes de produção protegidos</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            O AutoERP não executa seeds, persistência de teste ou mutações de banco no browser. Os gates oficiais rodam no GitHub Actions contra PostgreSQL isolado.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <GitBranch className="w-4 h-4" />
        Consulte o workflow da wave atual para o resultado técnico autoritativo.
      </div>
    </Card>
  </div>
);
