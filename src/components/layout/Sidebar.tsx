import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Car,
  Users,
  FileText,
  ClipboardCheck,
  Wrench,
  AlertTriangle,
  FolderOpen,
  TrendingUp,
  CreditCard,
  ArrowRightLeft,
  Banknote,
  PieChart,
  ChevronRight,
  X,
} from 'lucide-react';
import { TenantProfileClient, type TenantBrandingDto } from '../../api/tenantProfileClient';

export type NavigationTab =
  | 'dashboard'
  | 'performance-management'
  | 'decision-management'
  | 'executive-operations'
  | 'administration'
  | 'workflow-center'
  | 'execution-center'
  | 'executive'
  | 'operacao-diaria'
  | 'ciclo-locacao'
  | 'central-controle'
  | 'central-incidentes'
  | 'central-tarefas'
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

export interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  pendingReceivablesCount?: number;
  pendingPayablesCount?: number;
  pendingPendingsCount?: number;
  companyName?: string;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function getBrowserTabTitle(brand?: string | null): string {
  const clean = (brand || '').trim();
  if (clean && clean !== 'AutoERP') {
    return `${clean} · AutoERP`;
  }
  return 'AutoERP';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  pendingReceivablesCount = 0,
  pendingPayablesCount = 0,
  companyName,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const [branding, setBranding] = useState<TenantBrandingDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    void TenantProfileClient.getBranding()
      .then((data) => { if (!cancelled) setBranding(data); })
      .catch(() => { /* fail closed: fallback below */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = getBrowserTabTitle(companyName || branding?.companyName);
  }, [companyName, branding?.companyName]);

  const displayName = companyName || branding?.companyName || 'AutoERP';
  const categories = [
    {
      title: 'INÍCIO',
      items: [
        { id: 'dashboard' as NavigationTab, label: 'Visão Geral', icon: LayoutDashboard, badge: null },
      ],
    },
    {
      title: 'OPERAÇÃO',
      items: [
        { id: 'fleet' as NavigationTab, label: 'Veículos', icon: Car, badge: null },
        { id: 'drivers' as NavigationTab, label: 'Motoristas', icon: Users, badge: null },
        { id: 'contracts' as NavigationTab, label: 'Contratos', icon: FileText, badge: null },
        { id: 'inspections' as NavigationTab, label: 'Vistorias', icon: ClipboardCheck, badge: null },
        { id: 'maintenance' as NavigationTab, label: 'Manutenção', icon: Wrench, badge: null },
        { id: 'trafficTickets' as NavigationTab, label: 'Multas', icon: AlertTriangle, badge: null },
        { id: 'documentos' as NavigationTab, label: 'Documentos', icon: FolderOpen, badge: null },
      ],
    },
    {
      title: 'FINANCEIRO',
      items: [
        { id: 'finance-overview' as NavigationTab, label: 'Dashboard Financeiro', icon: LayoutDashboard, badge: null },
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
        { id: 'cashflow' as NavigationTab, label: 'Fluxo de Caixa', icon: Banknote, badge: null },
        { id: 'dre' as NavigationTab, label: 'Relatórios Financeiros', icon: PieChart, badge: null },
      ],
    },
  ];

  const sidebarContent = (
    <aside className="w-64 h-full min-h-0 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {branding?.logoUrl && (
            <img
              src={branding.logoUrl}
              alt={displayName}
              className="h-7 max-w-[70px] object-contain rounded bg-white/10 p-0.5 shrink-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="min-w-0">
            <span className="text-sm font-black tracking-wide text-white block truncate">{displayName}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 block">AutoERP V2</span>
          </div>
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

      <nav className="min-h-0 flex-1 p-3 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      <div className="shrink-0 p-4 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-500">
        <div className="flex items-center justify-between font-mono">
          <span>Ambiente:</span>
          <span className="text-emerald-400 font-semibold">V2 Operacional</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:block h-full max-h-full min-h-0 overflow-hidden">{sidebarContent}</div>
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 h-full max-h-full min-h-0 overflow-hidden">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
