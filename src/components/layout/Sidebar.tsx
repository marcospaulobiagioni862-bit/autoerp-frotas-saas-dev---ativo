import React, { useState } from 'react';
import {
  LayoutDashboard,
  Car,
  Users,
  FileText,
  TrendingUp,
  CreditCard,
  ArrowRightLeft,
  Banknote,
  PieChart,
  ShieldAlert,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  X,
  AlertTriangle,
  Wrench,
  BellRing,
  Calendar,
  Layers,
  CheckSquare,
  Award,
  Target,
  Zap,
  Lock,
  Sliders,
  Activity,
  HardDrive,
  GitBranch,
  LifeBuoy,
  FolderOpen,
} from 'lucide-react';

export type NavigationTab =
  | 'dashboard'
  | 'performance-management'
  | 'decision-management'
  | 'executive-operations'
  | 'administration'
  | 'release-governance'
  | 'incident-management'
  | 'workflow-center'
  | 'execution-center'
  | 'system-integrity'
  | 'enterprise-consolidation'
  | 'system-health'
  | 'executive'
  | 'governance'
  | 'observability'
  | 'resilience'
  | 'operacao-diaria'
  | 'ciclo-locacao'
  | 'central-controle'
  | 'central-incidentes'
  | 'central-tarefas'
  | 'produtividade'
  | 'metas'
  | 'pendencias'
  | 'documentos'
  | 'relatorios'
  | 'fleet'
  | 'compliance'
  | 'drivers'
  | 'contracts'
  | 'trafficTickets'
  | 'maintenance'
  | 'receivables'
  | 'payables'
  | 'transactions'
  | 'cashflow'
  | 'dre'
  | 'finance-overview'
  | 'tests';

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  pendingReceivablesCount?: number;
  pendingPayablesCount?: number;
  pendingPendingsCount?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  pendingReceivablesCount = 0,
  pendingPayablesCount = 0,
  pendingPendingsCount = 0,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const sreTabIds: NavigationTab[] = [
    'performance-management',
    'decision-management',
    'executive-operations',
    'executive',
    'governance',
    'observability',
    'resilience',
    'release-governance',
    'incident-management',
    'system-integrity',
    'enterprise-consolidation',
    'workflow-center',
    'execution-center',
  ];

  const isSreActive = sreTabIds.includes(activeTab);
  const [isSreExpanded, setIsSreExpanded] = useState<boolean>(isSreActive);

  const categories = [
    {
      title: 'DASHBOARD',
      items: [
        {
          id: 'dashboard' as NavigationTab,
          label: 'Visão Geral',
          icon: LayoutDashboard,
          badge: null,
        },
      ],
    },
    {
      title: 'OPERAÇÃO',
      items: [
        {
          id: 'fleet' as NavigationTab,
          label: 'Veículos',
          icon: Car,
          badge: null,
        },
        {
          id: 'drivers' as NavigationTab,
          label: 'Motoristas',
          icon: Users,
          badge: null,
        },
        {
          id: 'contracts' as NavigationTab,
          label: 'Contratos',
          icon: FileText,
          badge: null,
        },
        {
          id: 'maintenance' as NavigationTab,
          label: 'Manutenção',
          icon: Wrench,
          badge: null,
        },
        {
          id: 'trafficTickets' as NavigationTab,
          label: 'Multas',
          icon: AlertTriangle,
          badge: null,
        },
      ],
    },
    {
      title: 'FINANCEIRO',
      items: [
        {
          id: 'finance-overview' as NavigationTab,
          label: 'Dashboard Financeiro',
          icon: LayoutDashboard,
          badge: null,
        },
        {
          id: 'receivables' as NavigationTab,
          label: 'Contas a Receber',
          icon: TrendingUp,
          badge: pendingReceivablesCount > 0 ? pendingReceivablesCount : null,
          badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300',
        },
        {
          id: 'payables' as NavigationTab,
          label: 'Contas a Pagar',
          icon: CreditCard,
          badge: pendingPayablesCount > 0 ? pendingPayablesCount : null,
          badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
        },
        {
          id: 'transactions' as NavigationTab,
          label: 'Movimentações',
          icon: ArrowRightLeft,
          badge: null,
        },
        {
          id: 'cashflow' as NavigationTab,
          label: 'Fluxo de Caixa',
          icon: Banknote,
          badge: null,
        },
        {
          id: 'receivables' as NavigationTab,
          label: 'Inadimplência',
          icon: ShieldAlert,
          badge: null,
        },
        {
          id: 'transactions' as NavigationTab,
          label: 'Conciliação',
          icon: ArrowRightLeft,
          badge: null,
        },
        {
          id: 'dre' as NavigationTab,
          label: 'Relatórios Financeiros',
          icon: PieChart,
          badge: null,
        },
      ],
    },
    {
      title: 'GESTÃO',
      items: [
        {
          id: 'documentos' as NavigationTab,
          label: 'Central de Documentos',
          icon: FolderOpen,
        },
        {
          id: 'pendencias' as NavigationTab,
          label: 'Documentos e Alertas',
          icon: BellRing,
          badge: pendingPendingsCount > 0 ? pendingPendingsCount : null,
          badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300',
        },
        {
          id: 'relatorios' as NavigationTab,
          label: 'Relatórios Gerenciais',
          icon: TrendingUp,
          badge: null,
        },
      ],
    },
    {
      title: 'ADMINISTRAÇÃO',
      items: [
        {
          id: 'administration' as NavigationTab,
          label: 'Usuários e Permissões',
          icon: Sliders,
          badge: null,
        },
        {
          id: 'system-health' as NavigationTab,
          label: 'Configurações',
          icon: Sliders,
          badge: null,
        },
        {
          id: 'tests' as NavigationTab,
          label: 'Auditoria de Testes',
          icon: ShieldCheck,
          badge: '42/42',
          badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300',
        },
      ],
    },
  ];

  const sreItems = [
    { id: 'executive-operations' as NavigationTab, label: 'Central Executiva Operações', icon: ShieldCheck, badge: null },
    { id: 'performance-management' as NavigationTab, label: 'Gestão de Resultados (3.60)', icon: Target, badge: 'v3.60', badgeColor: 'bg-indigo-100/50 text-indigo-800' },
    { id: 'decision-management' as NavigationTab, label: 'Gestão de Decisões (3.59)', icon: Award, badge: null },
    { id: 'executive' as NavigationTab, label: 'Centro Executivo', icon: Zap, badge: null },
    { id: 'governance' as NavigationTab, label: 'Governança e Auditoria', icon: Lock, badge: null },
    { id: 'observability' as NavigationTab, label: 'Observabilidade & Pós-Go-Live', icon: Activity, badge: null },
    { id: 'resilience' as NavigationTab, label: 'Continuidade & Disaster Recovery', icon: HardDrive, badge: null },
    { id: 'release-governance' as NavigationTab, label: 'Governança de Releases', icon: GitBranch, badge: 'v3.52' },
    { id: 'incident-management' as NavigationTab, label: 'Gestão de Incidentes (SRE)', icon: LifeBuoy, badge: 'v3.53' },
    { id: 'system-integrity' as NavigationTab, label: 'Auditoria Transversal', icon: ShieldCheck, badge: 'v3.54' },
    { id: 'enterprise-consolidation' as NavigationTab, label: 'Consolidação Empresarial', icon: Layers, badge: 'v3.55' },
    { id: 'workflow-center' as NavigationTab, label: 'Workflow & SLA', icon: CheckSquare, badge: 'v3.56' },
    { id: 'execution-center' as NavigationTab, label: 'Execução Operacional', icon: Calendar, badge: 'v3.57' },
  ];

  const sidebarContent = (
    <aside className="w-64 h-full min-h-0 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
          AutoERP Fleet Manager
        </span>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1 text-slate-400 hover:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 min-h-0 p-3 space-y-4 overflow-y-auto">
        {categories.map((category) => (
          <div key={category.title} className="space-y-1">
            <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase px-3.5 py-1">
              {category.title}
            </div>
            <div className="space-y-0.5">
              {category.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.label + '-' + item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-medium transition-all group focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-900/30'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-3.5 h-3.5 transition-transform group-hover:scale-105 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.badge !== null && (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                          {item.badge}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-3 h-3 text-blue-200" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* COCKPIT SRE EXPANDABLE CATEGORY */}
        <div className="space-y-1 border-t border-slate-800/60 pt-3">
          <button
            onClick={() => setIsSreExpanded(!isSreExpanded)}
            className="w-full flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-500 uppercase px-3.5 py-1 hover:text-slate-300"
          >
            <span>COCKPIT SRE & GOV</span>
            {isSreExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {isSreExpanded && (
            <div className="space-y-0.5 mt-1 pl-1">
              {sreItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-1.5 rounded-lg text-[11px] font-medium transition-all group focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      isActive
                        ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-900/30'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                      <span>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.badge !== null && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-800 text-slate-400">
                          {item.badge}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-3 h-3 text-indigo-200" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-500 flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono">
          <span>Ambiente:</span>
          <span className="text-emerald-400 font-semibold">Cloud Run Baseline</span>
        </div>
        <div className="flex items-center justify-between font-mono">
          <span>Versão:</span>
          <span>v2.0.0-FASE2</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block h-full min-h-0">
        {sidebarContent}
      </div>

      {/* Mobile drawer sidebar */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

