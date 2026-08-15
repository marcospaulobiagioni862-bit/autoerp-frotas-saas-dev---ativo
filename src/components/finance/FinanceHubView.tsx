import React, { useState } from 'react';
import { PageHeader } from '../ui/PageHeader';
import { FinanceOverviewView } from './FinanceOverviewView';
import { ReceivablesView } from './ReceivablesView';
import { PayablesView } from './PayablesView';
import { TransactionsView } from './TransactionsView';
import { DREReportView } from './DREReportView';
import { LayoutDashboard, TrendingUp, CreditCard, ArrowRightLeft, PieChart } from 'lucide-react';
import { AccountReceivable, AccountPayable } from '../../types/entities';

interface FinanceHubViewProps {
  initialSubTab?: 'overview' | 'receivables' | 'payables' | 'transactions' | 'dre';
  onOpenReceiptModal: (rec: AccountReceivable) => void;
  onOpenPaymentModal: (pay: AccountPayable) => void;
  onOpenTransferModal: () => void;
  onOpenRenegotiationModal: (recs: AccountReceivable[]) => void;
}

export const FinanceHubView: React.FC<FinanceHubViewProps> = ({
  initialSubTab = 'overview',
  onOpenReceiptModal,
  onOpenPaymentModal,
  onOpenTransferModal,
  onOpenRenegotiationModal,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'receivables' | 'payables' | 'transactions' | 'dre'>(initialSubTab);

  const subTabs = [
    { id: 'overview' as const, label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'receivables' as const, label: 'Contas a Receber', icon: TrendingUp },
    { id: 'payables' as const, label: 'Contas a Pagar', icon: CreditCard },
    { id: 'transactions' as const, label: 'Movimentações', icon: ArrowRightLeft },
    { id: 'dre' as const, label: 'DRE / Relatórios', icon: PieChart },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Financeiro"
        description="Contas, movimentações, fluxo de caixa e visão financeira consolidada"
        breadcrumb="Gestão Financeira & Motor de Pagamentos"
      />

      {/* Subnavigation Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto shadow-xs">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subtab Content */}
      <div className="mt-6">
        {activeSubTab === 'overview' && (
          <FinanceOverviewView onSelectSubTab={setActiveSubTab} />
        )}
        {activeSubTab === 'receivables' && (
          <ReceivablesView
            onOpenReceiptModal={onOpenReceiptModal}
            onOpenRenegotiationModal={onOpenRenegotiationModal}
          />
        )}
        {activeSubTab === 'payables' && (
          <PayablesView onOpenPaymentModal={onOpenPaymentModal} />
        )}
        {activeSubTab === 'transactions' && (
          <TransactionsView onOpenTransferModal={onOpenTransferModal} />
        )}
        {activeSubTab === 'dre' && (
          <DREReportView />
        )}
      </div>
    </div>
  );
};
