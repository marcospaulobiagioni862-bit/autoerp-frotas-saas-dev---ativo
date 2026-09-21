import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  BellRing,
  Calendar,
  Car,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  LifeBuoy,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { OpsHealthClient } from '../../api/opsHealthClient';

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

type MenuItem = {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  badgeColor?: string;
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  pendingReceivablesCount = 0,
  pendingPayablesCount = 0,
  pendingPendingsCount = 0,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { user, authMode } = useAuth();
  const [isAuthorityExpanded, setIsAuthorityExpanded] = useState(false);
  const [runtimeEnvironment, setRuntimeEnvironment] = useState('server');
  const isAdmin = String(user.role || '').toUpperCase() === 'ADMIN';

  useEffect(() => {
    let cancelled = false;
    if (authMode !== 'server-session') {
      setRuntimeEnvironment('development');
      return () => { cancelled = true; };
    }
    void OpsHealthClient.get()
      .then((summary) => { if (!cancelled) setRuntimeEnvironment(summary.build.environment.toLowerCase()); })
      .catch(() => { if (!cancelled) setRuntimeEnvironment('server'); });
    return () => { cancelled = true; };
  }, [authMode]);

  // V2 preview: the runtime can report "production" because Render runs an optimized
  // build. The user-facing label must describe this isolated branch, not V1.
  const authorityEnvironmentLabel = 'V2 PREVIEW ISOLADO';

  const categories: Array<{ title: string; items: MenuItem[] }> = [
    {
      title: 'DASHBOARD',
      items: [{ id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard }],
    },
    {
      title: 'OPERAÇÃO',
      items: [
        { id: 'fleet', label: 'Veículos', icon: Car },
        { id: 'drivers', label: 'Motoristas', icon: Users },
        { id: 'contracts', label: 'Contratos', icon: FileText },

      ],
    },
    {
      title: 'FINANCEIRO',
      items: [
        { id: 'finance-overview', label: 'Dashboard Financeiro', icon: LayoutDashboard },
        {
          id: 'receivables',
          label: 'CR → Recebimento',
          icon: TrendingUp,
          badge: pendingReceivablesCount > 0 ? pendingReceivablesCount : undefined,
          badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300',
        },
        {
          id: 'payables',
          label: 'Despesa → CP → Pagamento',
          icon: CreditCard,
          badge: pendingPayablesCount > 0 ? pendingPayablesCount : undefined,
          badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
        },
        { id: 'transactions', label: 'Movimentações', icon: ArrowRightLeft },
        { id: 'cashflow', label: 'Fluxo de Caixa', icon: Banknote },
        { id: 'dre', label: 'Relatórios Financeiros', icon: PieChart },
      ],
    },
  ];

  const authorityItems: MenuItem[] = [
    ...(isAdmin
      ? [{ id: 'administration' as const, label: 'Administração', icon: Users, badge: 'Admin' }]
      : []),
    { id: 'executive-operations', label: 'Central Executiva', icon: ShieldCheck, badge: 'Server' },
    { id: 'incident-management', label: 'Incidentes', icon: LifeBuoy, badge: 'Server' },
    { id: 'workflow-center', label: 'Tarefas & Workflow', icon: CheckSquare, badge: 'Server' },
    { id: 'resilience', label: 'Continuidade & DR', icon: HardDrive, badge: 'Server' },
  ];

  const navigate = (tab: NavigationTab) => {
    onTabChange(tab);
    onCloseMobile?.();
  };

  const renderItem = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => navigate(item.id)}
        className={`w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-medium transition-all group focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          isActive
            ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-900/30'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
          <span>{item.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {item.badge !== undefined && item.badge !== null && (
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
              {item.badge}
            </span>
          )}
          {isActive && <ChevronRight className="w-3 h-3 text-blue-200" />}
        </div>
      </button>
    );
  };

  const sidebarContent = (
    <aside className="w-64 h-full max-h-full min-h-0 overflow-hidden bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
      <div className="shrink-0 p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-mono">AutoERP Fleet Manager</span>
          <span className="mt-1 block text-[9px] uppercase tracking-wide text-emerald-400">{authorityEnvironmentLabel}</span>
        </div>
        {onCloseMobile && (
          <button onClick={onCloseMobile} className="md:hidden p-1 text-slate-400 hover:text-white rounded-lg" aria-label="Fechar menu">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 p-3 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain">
        {categories.map((category) => (
          <div key={category.title} className="space-y-1">
            <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase px-3.5 py-1">{category.title}</div>
            <div className="space-y-0.5">{category.items.map(renderItem)}</div>
          </div>
        ))}

        {/* V2 preview intentionally hides the legacy COCKPIT SERVER AUTHORITY.
            Technical/admin screens remain in code but are outside this visual review. */}
      </nav>

      <div className="shrink-0 p-4 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-500">
        <div className="flex items-center justify-between font-mono">
          <span>Ambiente:</span>
          <span className="text-emerald-400 font-semibold">V2 isolado</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:block h-full max-h-full min-h-0 overflow-hidden">{sidebarContent}</div>
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={onCloseMobile} aria-hidden="true" />
          <div className="relative z-50 h-full max-h-full min-h-0 overflow-hidden">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
