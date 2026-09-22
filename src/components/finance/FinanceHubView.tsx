import React, { lazy, Suspense, useState } from 'react';
import { PageHeader } from '../ui/PageHeader';
import { LazyModuleErrorBoundary } from '../common/LazyModuleErrorBoundary';
import { LayoutDashboard, TrendingUp, CreditCard, ArrowRightLeft, Banknote, PieChart } from 'lucide-react';
import { AccountReceivable, AccountPayable } from '../../types/entities';

const FinanceOverviewView=lazy(()=>import('./FinanceOverviewView').then(module=>({default:module.FinanceOverviewView})));
const ReceivablesView=lazy(()=>import('./ReceivablesView').then(module=>({default:module.ReceivablesView})));
const PayablesView=lazy(()=>import('./PayablesView').then(module=>({default:module.PayablesView})));
const TransactionsView=lazy(()=>import('./TransactionsView').then(module=>({default:module.TransactionsView})));
const CashFlowView=lazy(()=>import('./CashFlowView').then(module=>({default:module.CashFlowView})));
const DelinquencyView=lazy(()=>import('./DelinquencyView').then(module=>({default:module.DelinquencyView})));
const BankReconciliationView=lazy(()=>import('./BankReconciliationView').then(module=>({default:module.BankReconciliationView})));
const CreditCardStatementsView=lazy(()=>import('./CreditCardStatementsView').then(module=>({default:module.CreditCardStatementsView})));
const FinancialPeriodsView=lazy(()=>import('./FinancialPeriodsView').then(module=>({default:module.FinancialPeriodsView})));
const DREReportView=lazy(()=>import('./DREReportView').then(module=>({default:module.DREReportView})));
const FinancialMasterDataView=lazy(()=>import('./FinancialMasterDataView').then(module=>({default:module.FinancialMasterDataView})));

type FinanceSubTab = 'overview' | 'receivables' | 'payables' | 'transactions' | 'cashflow' | 'delinquency' | 'reconciliation' | 'cards' | 'periods' | 'dre' | 'settings';

interface FinanceHubViewProps {
  initialSubTab?: FinanceSubTab;
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
  const [activeSubTab, setActiveSubTab] = useState<FinanceSubTab>(initialSubTab);

  const subTabs = [
    { id: 'overview' as const, label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'receivables' as const, label: 'Contas a Receber', icon: TrendingUp },
    { id: 'payables' as const, label: 'Contas a Pagar', icon: CreditCard },
    { id: 'transactions' as const, label: 'Movimentações', icon: ArrowRightLeft },
    { id: 'cashflow' as const, label: 'Fluxo de Caixa', icon: Banknote },
    { id: 'dre' as const, label: 'Relatórios / Rentabilidade', icon: PieChart },
  ];

  return (
    <div className="min-w-0 p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Financeiro"
        description="Contas a receber e pagar, movimentações, fluxo de caixa e relatórios"
        breadcrumb="Financeiro"
      />

      <div className="min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto md:flex-wrap md:overflow-x-visible shadow-xs">
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

      <LazyModuleErrorBoundary resetKey={activeSubTab} onRetry={()=>window.location.reload()}>
        <Suspense fallback={<div className="mt-6 text-sm text-slate-500">Carregando área financeira...</div>}>
          <div className="mt-6 min-w-0">
        {activeSubTab === 'overview' && (
          <FinanceOverviewView onSelectSubTab={(tab) => setActiveSubTab(tab)} />
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
        {activeSubTab === 'cashflow' && <CashFlowView />}
        {activeSubTab === 'delinquency' && <DelinquencyView />}
        {activeSubTab === 'reconciliation' && <BankReconciliationView />}
        {activeSubTab === 'cards' && <CreditCardStatementsView />}
        {activeSubTab === 'periods' && <FinancialPeriodsView />}
        {activeSubTab === 'dre' && <DREReportView />}
        {activeSubTab === 'settings' && <FinancialMasterDataView />}
          </div>
        </Suspense>
      </LazyModuleErrorBoundary>
    </div>
  );
};
