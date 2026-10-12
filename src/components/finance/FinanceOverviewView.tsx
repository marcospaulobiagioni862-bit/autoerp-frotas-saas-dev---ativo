import React, { useEffect, useState } from 'react';
import { Card } from '../ui';
import { TrendingUp, CreditCard, ArrowRight, Wallet, AlertTriangle, CircleDollarSign } from 'lucide-react';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import { FinanceOverviewClient } from '../../api/financeOverviewClient';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import { FinanceTransactionClient } from '../../api/financeTransactionClient';
import { ObligationStatus, TransactionType } from '../../types/enums';

interface FinanceOverviewViewProps {
 onSelectSubTab: (tab: 'overview' | 'receivables' | 'payables' | 'transactions' | 'dre') => void;
}

export const FinanceOverviewView: React.FC<FinanceOverviewViewProps> = ({ onSelectSubTab }) => {
 const [totalReceivable, setTotalReceivable] = useState(0);
 const [totalPayable, setTotalPayable] = useState(0);
 const [totalBalance, setTotalBalance] = useState(0);
 const [receivableCount, setReceivableCount] = useState(0);
 const [payableCount, setPayableCount] = useState(0);
 const [overdueReceivable, setOverdueReceivable] = useState(0);
 const [overduePayable, setOverduePayable] = useState(0);
 const [receivedInPeriod, setReceivedInPeriod] = useState(0);
 const [paidInPeriod, setPaidInPeriod] = useState(0);

 useEffect(() => {
 void loadSummary();
 }, []);

 const loadSummary = async () => {
 try {
 const [summary, receivables, payables, transactions] = await Promise.all([
 FinanceOverviewClient.getOverview(),
 FinanceObligationClient.listReceivables(),
 FinanceObligationClient.listPayables(),
 FinanceTransactionClient.listTransactions(),
 ]);
 const today = new Date().toISOString().slice(0, 10);
 const currentMonth = today.slice(0, 7);
 const openStatuses = new Set([ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID, ObligationStatus.OVERDUE]);
 const openReceivables = receivables.filter((item) => openStatuses.has(item.status) && item.balanceAmount > 0);
 const openPayables = payables.filter((item) => openStatuses.has(item.status) && item.balanceAmount > 0);

 setTotalReceivable(summary.totalReceivable);
 setTotalPayable(summary.totalPayable);
 setTotalBalance(summary.totalBalance);
 setReceivableCount(openReceivables.length);
 setPayableCount(openPayables.length);
 setOverdueReceivable(openReceivables.filter((item) => item.dueDate < today).reduce((sum, item) => sum + item.balanceAmount, 0));
 setOverduePayable(openPayables.filter((item) => item.dueDate < today).reduce((sum, item) => sum + item.balanceAmount, 0));
 setReceivedInPeriod(transactions
 .filter((item) => !item.isReversed && item.type === TransactionType.INCOME && item.transactionDate.startsWith(currentMonth))
 .reduce((sum, item) => sum + item.amount, 0));
 setPaidInPeriod(transactions
 .filter((item) => !item.isReversed && item.type === TransactionType.EXPENSE && item.transactionDate.startsWith(currentMonth))
 .reduce((sum, item) => sum + item.amount, 0));
 } catch (err) {
 console.error('Erro ao carregar resumo financeiro:', err);
 setTotalReceivable(0);
 setTotalPayable(0);
 setTotalBalance(0);
 setReceivableCount(0);
 setPayableCount(0);
 setOverdueReceivable(0);
 setOverduePayable(0);
 setReceivedInPeriod(0);
 setPaidInPeriod(0);
 }
 };

 return (
 <div className="space-y-6">
 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
 <Card padding="md" className="bg-white dark:bg-graphite-900 border border-graphite-200 dark:border-graphite-800">
 <div className="flex items-center justify-between">
 <div>
 <span className="text-xs font-semibold text-graphite-500 uppercase tracking-wider block">Saldo disponível</span>
 <h3 className="text-2xl font-black text-graphite-900 dark:text-graphite-100 mt-1 font-mono">{formatCurrencyBRL(totalBalance)}</h3>
 </div>
 <div className="p-3 rounded-xl bg-info-bg text-info-icon "><Wallet className="w-6 h-6" /></div>
 </div>
 <div className="mt-4 pt-3 border-t border-graphite-100 dark:border-graphite-800 flex items-center justify-between">
 <span className="text-xs text-graphite-500">Contas e caixas cadastrados</span>
 <button onClick={() => onSelectSubTab('transactions')} className="text-xs font-semibold text-info-icon hover:text-info-text flex items-center gap-1">Movimentações <ArrowRight className="w-3.5 h-3.5" /></button>
 </div>
 </Card>

 <Card padding="md" className="bg-white dark:bg-graphite-900 border border-graphite-200 dark:border-graphite-800">
 <div className="flex items-center justify-between">
 <div>
 <span className="text-xs font-semibold text-success-icon uppercase tracking-wider block">CR em aberto</span>
 <h3 className="text-2xl font-black text-success-text mt-1 font-mono">{formatCurrencyBRL(totalReceivable)}</h3>
 <span className="mt-1 block text-[11px] text-graphite-500">{receivableCount} título(s) em aberto</span>
 </div>
 <div className="p-3 rounded-xl bg-success-bg text-success-icon "><TrendingUp className="w-6 h-6" /></div>
 </div>
 <button onClick={() => onSelectSubTab('receivables')} className="mt-4 pt-3 border-t border-graphite-100 dark:border-graphite-800 w-full text-xs font-semibold text-success-icon hover:text-success-text flex items-center justify-between">CR → Recebimento <ArrowRight className="w-3.5 h-3.5" /></button>
 </Card>

 <Card padding="md" className="bg-white dark:bg-graphite-900 border border-graphite-200 dark:border-graphite-800">
 <div className="flex items-center justify-between">
 <div>
 <span className="text-xs font-semibold text-warning-icon uppercase tracking-wider block">CP em aberto</span>
 <h3 className="text-2xl font-black text-warning-text mt-1 font-mono">{formatCurrencyBRL(totalPayable)}</h3>
 <span className="mt-1 block text-[11px] text-graphite-500">{payableCount} título(s) em aberto</span>
 </div>
 <div className="p-3 rounded-xl bg-warning-bg text-warning-icon "><CreditCard className="w-6 h-6" /></div>
 </div>
 <button onClick={() => onSelectSubTab('payables')} className="mt-4 pt-3 border-t border-graphite-100 dark:border-graphite-800 w-full text-xs font-semibold text-warning-icon hover:text-warning-text flex items-center justify-between">Despesa → CP → Pagamento <ArrowRight className="w-3.5 h-3.5" /></button>
 </Card>

 <Card padding="md" className="bg-white dark:bg-graphite-900 border border-error-border ">
 <div className="flex items-start justify-between gap-3">
 <div className="space-y-3">
 <div><span className="text-[11px] font-semibold uppercase text-graphite-500">CR vencido</span><p className="font-mono font-black text-error-icon">{formatCurrencyBRL(overdueReceivable)}</p></div>
 <div><span className="text-[11px] font-semibold uppercase text-graphite-500">CP vencido</span><p className="font-mono font-black text-error-icon">{formatCurrencyBRL(overduePayable)}</p></div>
 </div>
 <div className="p-3 rounded-xl bg-error-bg text-error-icon "><AlertTriangle className="w-6 h-6" /></div>
 </div>
 </Card>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <Card padding="sm">
 <div className="flex items-center justify-between"><div><span className="text-[11px] font-semibold uppercase text-graphite-500">Recebido no mês</span><p className="mt-1 font-mono text-lg font-black text-success-text ">{formatCurrencyBRL(receivedInPeriod)}</p></div><CircleDollarSign className="w-5 h-5 text-success-icon" /></div>
 </Card>
 <Card padding="sm">
 <div className="flex items-center justify-between"><div><span className="text-[11px] font-semibold uppercase text-graphite-500">Pago no mês</span><p className="mt-1 font-mono text-lg font-black text-warning-text ">{formatCurrencyBRL(paidInPeriod)}</p></div><CircleDollarSign className="w-5 h-5 text-warning-icon" /></div>
 </Card>
 </div>
 </div>
 );
};
