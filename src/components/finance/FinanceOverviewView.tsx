import React, { useEffect, useState } from 'react';
import { Card, Button } from '../ui';
import { TrendingUp, CreditCard, ArrowRightLeft, PieChart, ShieldAlert, ArrowRight, Wallet } from 'lucide-react';
import { AccountReceivableRepository, AccountPayableRepository, FinancialAccountRepository, FinancialTransactionRepository } from '../../persistence/repositories/localRepositories';
import { formatCurrencyBRL } from '../../shared/utils/currency';

interface FinanceOverviewViewProps {
  onSelectSubTab: (tab: 'overview' | 'receivables' | 'payables' | 'transactions' | 'dre') => void;
}

export const FinanceOverviewView: React.FC<FinanceOverviewViewProps> = ({ onSelectSubTab }) => {
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [totalPayable, setTotalPayable] = useState(0);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      const recRepo = new AccountReceivableRepository();
      const payRepo = new AccountPayableRepository();
      const accRepo = new FinancialAccountRepository();

      const [recs, pays, accs] = await Promise.all([
        recRepo.findAll(),
        payRepo.findAll(),
        accRepo.findAll(),
      ]);

      const recSum = recs
        .filter(r => r.status === 'PENDING' || r.status === 'PARTIALLY_PAID')
        .reduce((sum, r) => sum + r.balanceAmount, 0);

      const paySum = pays
        .filter(p => p.status === 'PENDING' || p.status === 'PARTIALLY_PAID')
        .reduce((sum, p) => sum + p.balanceAmount, 0);

      const balSum = accs.reduce((sum, a) => sum + a.currentBalance, 0);

      setTotalReceivable(recSum);
      setTotalPayable(paySum);
      setTotalBalance(balSum);
    } catch (err) {
      console.error('Erro ao carregar resumo financeiro:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="md" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Saldo Consolidado Bancário</span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 font-mono">
                {formatCurrencyBRL(totalBalance)}
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">Contas Correntes & Caixas</span>
            <button
              onClick={() => onSelectSubTab('transactions')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Ver Movimentações <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>

        <Card padding="md" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Contas a Receber (Pendente)</span>
              <h3 className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1 font-mono">
                {formatCurrencyBRL(totalReceivable)}
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">Aluguéis & Taxas a liquidar</span>
            <button
              onClick={() => onSelectSubTab('receivables')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              Gerenciar Recebíveis <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>

        <Card padding="md" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Contas a Pagar (Pendente)</span>
              <h3 className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1 font-mono">
                {formatCurrencyBRL(totalPayable)}
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
              <CreditCard className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">Fornecedores, Manutenção & Despesas</span>
            <button
              onClick={() => onSelectSubTab('payables')}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              Gerenciar Pagáveis <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>
      </div>

      {/* Quick Navigation Cards */}
      <Card padding="md" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Módulos de Gestão Financeira</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            onClick={() => onSelectSubTab('receivables')}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-all cursor-pointer group bg-slate-50/50 dark:bg-slate-950/50"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-blue-600">Contas a Receber</h4>
            </div>
            <p className="text-xs text-slate-500">Controle de recebimentos de faturas, baixas parciais e inadimplência.</p>
          </div>

          <div
            onClick={() => onSelectSubTab('payables')}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-all cursor-pointer group bg-slate-50/50 dark:bg-slate-950/50"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600">
                <CreditCard className="w-5 h-5" />
              </div>
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-blue-600">Contas a Pagar</h4>
            </div>
            <p className="text-xs text-slate-500">Gestão de obrigações, pagamentos a fornecedores e centros de custo.</p>
          </div>

          <div
            onClick={() => onSelectSubTab('transactions')}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-all cursor-pointer group bg-slate-50/50 dark:bg-slate-950/50"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-blue-600">Movimentações & Caixa</h4>
            </div>
            <p className="text-xs text-slate-500">Fluxo de caixa, transferências entre contas e extrato consolidado.</p>
          </div>

          <div
            onClick={() => onSelectSubTab('dre')}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-all cursor-pointer group bg-slate-50/50 dark:bg-slate-950/50"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600">
                <PieChart className="w-5 h-5" />
              </div>
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-blue-600">DRE / Relatórios</h4>
            </div>
            <p className="text-xs text-slate-500">Demonstrativo do resultado do exercício e relatórios gerenciais.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
