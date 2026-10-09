import React from 'react';
import { AlertTriangle, Database, ShieldCheck } from 'lucide-react';
import { Card, PageHeader } from '../ui';

/**
 * SECURITY-2N production replacement for the historical browser-local backup UI.
 * Local backup/restore can create false confidence and tenant authority in the
 * browser. It stays fail-closed until a dedicated server-authoritative DR wave.
 */
export const ResilienceCenterView: React.FC = () => (
  <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
    <PageHeader
      title="Continuidade Operacional"
      description="O acesso a cópias de segurança e restaurações depende da validação dos procedimentos de segurança."
      breadcrumb="Resiliência & Disaster Recovery"
    />
    <Card padding="md" className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Backup local do navegador desabilitado</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            A criação, restauração e validação de cópias de segurança estão temporariamente indisponíveis. A função será liberada quando o armazenamento e a recuperação segura dos dados estiverem prontos.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600" /> Fail-closed no browser
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <Database className="w-4 h-4 text-blue-600" /> Próxima etapa: validar a segurança dos dados
        </div>
      </div>
    </Card>
  </div>
);
