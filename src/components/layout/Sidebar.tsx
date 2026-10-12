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
 const totalFinancePending = (pendingReceivablesCount || 0) + (pendingPayablesCount || 0);
 const financeBadgeColor = pendingPayablesCount > 0
 ? 'bg-warning-bg text-warning-text '
 : 'bg-success-bg text-success-text ';

 const categories = [
 {
 title: 'INÍCIO',
 items: [
 { id: 'dashboard' as NavigationTab, label: 'Início', icon: LayoutDashboard, badge: null },
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
 title: 'GESTÃO',
 items: [
 {
 id: 'finance-overview' as NavigationTab,
 label: 'Financeiro',
 icon: Banknote,
 badge: totalFinancePending > 0 ? totalFinancePending : null,
 badgeColor: financeBadgeColor,
 },
 ],
 },
 ];

 const sidebarContent = (
 <aside className="w-64 h-full min-h-0 bg-structure text-fg-on-structure-muted flex flex-col border-r border-structure-border shrink-0 select-none">
 <div className="p-4 border-b border-graphite-800/80 flex items-center justify-between">
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
 <span className="text-[9px] font-semibold uppercase tracking-wider text-graphite-400 block">AutoERP V2</span>
 </div>
 </div>
 {onCloseMobile && (
 <button
 onClick={onCloseMobile}
 className="md:hidden p-1 text-graphite-400 hover:text-white rounded-lg focus:outline-none focus:ring-2 focus-visible:outline-focus-ring"
 aria-label="Fechar menu"
 >
 <X className="w-5 h-5" />
 </button>
 )}
 </div>

 <nav className="min-h-0 flex-1 p-3 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
 {categories.map((category) => (
 <div key={category.title || 'principal'} className="space-y-1">
 {Boolean(category.title) && (
 <div className="text-[10px] font-bold tracking-wider text-graphite-500 uppercase px-3.5 py-1">
 {category.title}
 </div>
 )}
 <div className="space-y-0.5">
 {category.items.map((item) => {
 const Icon = item.icon;
 const isFinanceTab = ['finance-overview', 'receivables', 'payables', 'transactions', 'cashflow', 'dre'].includes(activeTab);
 const isActive = item.id === 'finance-overview' ? isFinanceTab : activeTab === item.id;
 return (
 <button
 key={item.id}
 onClick={() => {
 onTabChange(item.id);
 if (onCloseMobile) onCloseMobile();
 }}
 className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all group focus:outline-none focus:ring-1 focus-visible:outline-focus-ring ${
 isActive
 ? 'relative bg-structure-active text-fg-on-structure font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-full before:bg-accent-on-structure'
 : 'text-fg-on-structure-muted hover:text-fg-on-structure hover:bg-structure-hover'
 }`}
 >
 <div className="flex items-center gap-3">
 <Icon className={`w-4 h-4 ${isActive ? 'text-fg-on-structure' : 'text-fg-on-structure-muted'}`} />
 <span>{item.label}</span>
 </div>
 <div className="flex items-center gap-1.5">
 {item.badge !== null && (
 <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${'badgeColor' in item && item.badgeColor ? item.badgeColor : 'bg-graphite-800 text-graphite-300'}`}>
 {item.badge}
 </span>
 )}
 {isActive && <ChevronRight className="w-3 h-3 text-fg-on-structure-muted" />}
 </div>
 </button>
 );
 })}
 </div>
 </div>
 ))}
 </nav>

 <div className="shrink-0 p-4 border-t border-structure-border bg-structure text-[11px] text-fg-on-structure-muted">
 <div className="flex items-center justify-between font-mono">
 <span>Ambiente:</span>
 <span className="text-success-text font-semibold">V2 Operacional</span>
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
 className="fixed inset-0 bg-scrim"
 onClick={onCloseMobile}
 aria-hidden="true"
 />
 <div className="relative z-50 h-full max-h-full min-h-0 overflow-hidden">{sidebarContent}</div>
 </div>
 )}
 </>
 );
};
