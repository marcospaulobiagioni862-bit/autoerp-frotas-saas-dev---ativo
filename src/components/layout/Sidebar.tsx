import React from 'react';
import {
  LayoutDashboard,
  Car,
  Users,
  FileText,
  TrendingUp,
  CreditCard,
  ArrowRightLeft,
  Radio,
  ClipboardCheck,
  ChevronRight,
  X,
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
  | 'trackers'
  | 'inspections'
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
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const categories = [
    {
      title: 'INÍCIO',
      items: [
        { id: 'dashboard' as NavigationTab, label: 'Visão Geral', icon: LayoutDashboard, badge: null },
      ],
    },
    {
      title: 'LOCAÇÃO',
      items: [
        { id: 'fleet' as NavigationTab, label: 'Veículos', icon: Car, badge: null },
        { id: 'drivers' as NavigationTab, label: 'Motoristas', icon: Users, badge: null },
        { id: 'contracts' as NavigationTab, label: 'Contratos', icon: FileText, badge: null },
        { id: 'inspections' as NavigationTab, label: 'Vistorias', icon: ClipboardCheck, badge: null },
        { id: 'trackers' as NavigationTab, label: 'Rastreador', icon: Radio, badge: null },
      ],
    },
    {
      title: 'FINANCEIRO',
      items: [
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
        { id: 'transactions' as NavigationTab, label: 'Movimentações', icon: ArrowRightLeft, badge: null },
      ],
    },
  ];

  const sidebarContent = (
    <aside className="w-64 h-full min-h-0 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-sm font-black tracking-wide text-white block">MoveFlex</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 block">AutoERP V2</span>
        </div>
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
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all group focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-900/30'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.badge !== null && (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${'badgeColor' in item && item.badgeColor ? item.badgeColor : 'bg-slate-800 text-slate-300'}`}>
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
      </nav>

      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-500">
        <div className="font-semibold text-slate-300">V2 Núcleo Operacional</div>
        <div className="mt-1">Poucos cliques. Só o essencial.</div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:block h-full min-h-0">{sidebarContent}</div>
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar menu"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
