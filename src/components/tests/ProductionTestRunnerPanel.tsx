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
 <div className="p-2 rounded-lg bg-success-bg text-success-text ">
 <ShieldCheck className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-semibold text-graphite-900 dark:text-graphite-100">Testes de produção protegidos</h3>
 <p className="text-sm text-graphite-600 dark:text-graphite-400 mt-1">
 Esta tela não altera os dados da empresa. As verificações do sistema são realizadas em ambiente separado.
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2 text-xs text-graphite-500 dark:text-graphite-400">
 <GitBranch className="w-4 h-4" />
 Consulte a área de validação para ver os resultados mais recentes.
 </div>
 </Card>
 </div>
);
