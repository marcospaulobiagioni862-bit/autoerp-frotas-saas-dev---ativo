import React from 'react';
import { LockKeyhole, ShieldAlert } from 'lucide-react';
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
              <LockKeyhole className="h-3 w-3" /> Este recurso está temporariamente indisponível
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Este módulo está temporariamente indisponível. Ele será liberado quando o armazenamento seguro, o controle de acesso e o registro das ações estiverem prontos.
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

// SECURITY-2Q2 promotes the production Users and Empresa / Tenant slices. The
// rendered view keeps every remaining administration surface explicitly unavailable.
export const AdministrationCenterView: React.FC<LegacyViewProps> = () => (
  <ProductionUserAdministrationView />
);

// Experimental/browser-authoritative surfaces remain fail-closed until promoted separately.
export const PerformanceManagementCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Gestão de Resultados"
    description="Metas e indicadores ainda não estão disponíveis nesta área."
  />
);

export const DecisionManagementCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Gestão de Decisões"
    description="O fluxo de decisões ainda não está disponível."
  />
);

export const OperationalExecutionCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Execução Operacional Experimental"
    description="Agenda, planejamento e execução ainda não estão disponíveis nesta área."
  />
);

export const ReleaseGovernanceCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Governança de Releases"
    description="A gestão de versões e configurações ainda não está disponível nesta área."
  />
);

export const SystemIntegrityAuditView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Auditoria Transversal"
    description="A equipe responsável valida a segurança e o funcionamento do sistema. Esta tela não confirma essas verificações."
  />
);

export const SystemHealthCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Saúde e Diagnóstico Técnico"
    description="As informações de disponibilidade, cópias de segurança, acessos e infraestrutura ainda não estão disponíveis nesta área."
  />
);

export const EnterpriseConsolidationView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Consolidação Empresarial"
    description="Fechamentos e checklists só serão considerados concluídos depois de registrados e revisados."
  />
);

export const PostGoLiveObservabilityView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Observabilidade & Pós-Go-Live"
    description="As informações de funcionamento ainda não estão disponíveis nesta área."
  />
);

export const GovernanceCenterView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Governança Operacional"
    description="Os relatórios serão exibidos quando as ações e os eventos puderem ser confirmados com segurança."
  />
);

export const OperationalProductivityView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Produtividade Operacional"
    description="Os indicadores de produtividade ainda não estão disponíveis nesta área."
  />
);

export const ManagementGoalsView: React.FC<LegacyViewProps> = () => (
  <ServerAuthorityUnavailableView
    title="Metas Gerenciais"
    description="Metas e alertas ainda não estão disponíveis nesta área."
  />
);
