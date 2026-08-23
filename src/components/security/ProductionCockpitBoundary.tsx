import React from 'react';
import { LockKeyhole, Server, ShieldAlert } from 'lucide-react';
import { OperationalIncidentCenterView } from '../incidents/OperationalIncidentCenterView';
import { ExecutiveOperationsCenterView } from '../operations/ExecutiveOperationsCenterView';
import { OperationalTasksView } from '../tasks/OperationalTasksView';
import { ProductionUserAdministrationView } from '../admin/ProductionUserAdministrationView';

type LegacyViewProps = { [key: string]: unknown };

type UnavailableViewProps = {
  title: string;
  description: string;
};

const ServerAuthorityUnavailableView: React.FC<UnavailableViewProps> = ({ title, description }) => (
  <div className="p-4 sm:p-6">
    <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm dark:border-amber-900/70 dark:bg-slate-900">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-amber-50 p-3 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Server className="h-3 w-3" /> Server authority required
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Este módulo legado foi isolado do build de produção porque ainda não possui persistência, RBAC e auditoria server-side canônicos. Nenhum dado local do navegador é usado como fonte de verdade.
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/**
 * SECURITY-2P production compatibility module, progressively promoted by later
 * server-authority waves. Legacy source files remain available for development/history,
 * but production never treats their browser-local stores as source of truth.
 */

// Canonical replacements backed by server authorities.
export const IncidentManagementCenterView: React.FC<LegacyViewProps> = () => (
  <OperationalIncidentCenterView />
);

export const OperationalWorkflowCenterView: React.FC<LegacyViewProps> = () => (
  <div className="p-4 sm:p-6">
    <OperationalTasksView />
  </div>
);

export const ExecutiveDashboardView: React.FC<LegacyViewProps> = () => (
  <ExecutiveOperationsCenterView />
);

// SECURITY-2Q1 promotes only the production Users slice. The rendered view itself
// makes the remaining administration surfaces explicitly unavailable.
export const AdministrationCenterView: React.FC<LegacyViewProps> = () => (
  <ProductionUserAdministrationView />
);

// Experimental/browser-authoritative surfaces remain fail-closed until promoted separately.
export const PerformanceManagementCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Gestão de Resultados"
    description="Metas, OKRs e indicadores experimentais ainda não foram promovidos para uma autoridade PostgreSQL autenticada."
  />
);

export const DecisionManagementCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Gestão de Decisões"
    description="O fluxo experimental de decisões permanece fora da produção até possuir persistência, idempotência e auditoria transacionais no servidor."
  />
);

export const OperationalExecutionCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Execução Operacional Experimental"
    description="Agenda, planejamento e execução desta superfície legada permanecem isolados até migração para authorities server-side."
  />
);

export const ReleaseGovernanceCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Governança de Releases"
    description="Releases, mudanças, configurações e feature flags não usam autoridade browser-local no ambiente de produção."
  />
);

export const SystemIntegrityAuditView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Auditoria Transversal"
    description="Resultados de segurança, build e testes são autoritativos somente quando produzidos pelos gates de servidor e CI; o navegador não declara homologação."
  />
);

export const SystemHealthCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Saúde e Diagnóstico Técnico"
    description="Saúde de persistência, backup, RBAC e infraestrutura não é inferida de LocalStorage ou constantes do navegador. Esta superfície aguarda telemetria e evidência server-side canônicas."
  />
);

export const EnterpriseConsolidationView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Consolidação Empresarial"
    description="Fechamentos e checklists experimentais não são considerados executados sem uma authority server-side persistente e auditável."
  />
);

export const PostGoLiveObservabilityView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Observabilidade & Pós-Go-Live"
    description="Métricas de saúde não são simuladas no browser; esta superfície permanece isolada até consumir telemetria server-side confiável."
  />
);

export const GovernanceCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Governança Operacional"
    description="Relatórios de governança precisam derivar de auditoria e eventos canônicos do servidor antes de serem expostos como evidência de produção."
  />
);

export const OperationalProductivityView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Produtividade Operacional"
    description="Indicadores de produtividade permanecem indisponíveis até serem derivados de tarefas, incidentes e SLAs canônicos do servidor."
  />
);

export const ManagementGoalsView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Metas Gerenciais"
    description="Metas e alertas experimentais permanecem fora do runtime de produção até possuírem uma fonte server-side autoritativa."
  />
);
