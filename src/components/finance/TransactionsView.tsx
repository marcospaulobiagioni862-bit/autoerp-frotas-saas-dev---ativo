import React, { useEffect, useState } from 'react';
import type { FinancialTransaction } from '../../types/entities';
import { formatDateBR } from '../../shared/utils/date';
import { TransactionType } from '../../types/enums';
import {
  FinanceTransactionClient,
  createReversalIdempotencyKey,
} from '../../api/financeTransactionClient';
import type { SettlementAccountOption, SettlementPaymentMethodOption } from '../../api/financeSettlementClient';
import {
  ArrowRightLeft,
  Wallet,
  CreditCard,
  Search,
  X,
} from 'lucide-react';
import { Card, Button, Badge, Input, ConfirmDialog, Skeleton } from '../ui';
import {
  filterFinancialTransactions,
  hasActiveTransactionFilters,
  hasInvalidTransactionPeriod,
  type TransactionLinkFilter,
} from './transactionFilters';

interface TransactionsViewProps {
  onOpenTransferModal: () => void;
}

function transactionTypeLabel(type: TransactionType): string {
  switch (type) {
    case TransactionType.INCOME: return 'Entrada';
    case TransactionType.EXPENSE: return 'Saída';
    case TransactionType.TRANSFER: return 'Transferência';
    case TransactionType.REVERSAL: return 'Estorno';
    default: return String(type);
  }
}

function accountTypeLabel(type: string): string {
  switch (type) {
    case 'CASH': return 'Caixa';
    case 'BANK': return 'Banco';
    case 'DIGITAL_ACCOUNT': return 'Conta digital';
    case 'CREDIT_CARD': return 'Cartão';
    case 'INVESTMENT': return 'Investimento';
    default: return 'Conta';
  }
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ onOpenTransferModal }) => {
  const [accounts, setAccounts] = useState<SettlementAccountOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<SettlementPaymentMethodOption[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [linkFilter, setLinkFilter] = useState<TransactionLinkFilter>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<string | null>(null);
  const [reversalTargetTx, setReversalTargetTx] = useState<FinancialTransaction | null>(null);
  const [reversalCommandKey, setReversalCommandKey] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [options, txList] = await Promise.all([
        FinanceTransactionClient.getOptions(),
        FinanceTransactionClient.listTransactions(),
      ]);
      setAccounts(options.accounts);
      setPaymentMethods(options.paymentMethods);
      setTransactions(txList.sort((a, b) => b.transactionDate.slice(0, 10).localeCompare(a.transactionDate.slice(0, 10)) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      setAccounts([]);
      setPaymentMethods([]);
      setTransactions([]);
      setMessage(err instanceof Error ? err.message : 'Erro ao carregar extrato financeiro.');
    } finally {
      setLoading(false);
    }
  };

  const openReversal = (transaction: FinancialTransaction) => {
    setReversalTargetTx(transaction);
    setReversalCommandKey(createReversalIdempotencyKey());
  };

  const closeReversal = () => {
    setReversalTargetTx(null);
    setReversalCommandKey(null);
  };

  const confirmReverse = async () => {
    if (!reversalTargetTx || !reversalCommandKey) return;

    try {
      await FinanceTransactionClient.reverse(reversalTargetTx.id, {
        reversalAmount: Number(reversalTargetTx.amount),
        reason: 'Estorno operacional solicitado via extrato',
        idempotencyKey: reversalCommandKey,
      });

      setMessage('Transação estornada com sucesso!');
      closeReversal();
      await loadData();
    } catch (err) {
      // Keep target + command key intact so an uncertain network retry converges
      // to the same authoritative reversal instead of creating a new command.
      alert(err instanceof Error ? err.message : 'Erro ao realizar estorno');
    }
  };

  const filters = { searchTerm, type: typeFilter, accountId: accountFilter, link: linkFilter, startDate, endDate };
  const filteredTxs = filterFinancialTransactions(transactions, filters);
  const invalidPeriod = hasInvalidTransactionPeriod(startDate, endDate);
  const filtersActive = hasActiveTransactionFilters(filters);

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('ALL');
    setAccountFilter('ALL');
    setLinkFilter('ALL');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-blue-600" />
            Movimentações
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Entradas, saídas, transferências e estornos efetivamente realizados.
          </p>
        </div>

        <Button
          onClick={onOpenTransferModal}
          variant="secondary"
          size="sm"
          icon={<ArrowRightLeft className="w-4 h-4" />}
        >
          Transferência entre contas
        </Button>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="p-1 font-bold">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {accounts.map((acc) => {
          const isCard = acc.type === 'CREDIT_CARD';

          return (
            <Card key={acc.id} padding="sm">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    {acc.name} • {accountTypeLabel(acc.type)}
                  </span>
                  <h3
                    className={`text-xl font-black mt-1 font-mono tabular-nums ${
                      isCard && acc.currentBalance < 0
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    R$ {acc.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </h3>
                </div>
                <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300">
                  {isCard ? <CreditCard className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card padding="sm">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Input
                type="text"
                placeholder="Buscar descrição ou origem..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search className="w-4 h-4 text-slate-400" />}
              />
            </div>
            <select
              aria-label="Filtrar por conta"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="ALL">Todas as contas</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <select
              aria-label="Filtrar por vínculo"
              value={linkFilter}
              onChange={(e) => setLinkFilter(e.target.value as TransactionLinkFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="ALL">Todos os vínculos financeiros</option>
              <option value="RECEIVABLE">Contas a receber</option>
              <option value="PAYABLE">Contas a pagar</option>
              <option value="UNLINKED">Sem título vinculado</option>
            </select>
            <div className="flex gap-2">
              <Input aria-label="Data inicial" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Input aria-label="Data final" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['ALL', TransactionType.INCOME, TransactionType.EXPENSE, TransactionType.TRANSFER, TransactionType.REVERSAL].map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    typeFilter === type
                      ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {type === 'ALL' ? 'Todos' : transactionTypeLabel(type as TransactionType)}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-500">{filteredTxs.length} de {transactions.length} movimentações</span>
              <Button size="sm" variant="outline" onClick={clearFilters} disabled={!filtersActive}>Limpar filtros</Button>
            </div>
          </div>

          {invalidPeriod && (
            <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
              A data inicial não pode ser posterior à data final.
            </p>
          )}
        </div>
      </Card>

      <Card padding="none">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">Data</th>
                  <th className="p-3.5">Descrição / Origem</th>
                  <th className="p-3.5">Tipo</th>
                  <th className="p-3.5 text-right">Valor (R$)</th>
                  <th className="p-3.5 text-center">Situação</th>
                  <th className="p-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredTxs.map((tx) => {
                  const isIncome = tx.type === TransactionType.INCOME;
                  const isExpense = tx.type === TransactionType.EXPENSE;
                  const isTransfer = tx.type === TransactionType.TRANSFER;
                  const isReversal = tx.type === TransactionType.REVERSAL;

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        tx.isReversed ? 'opacity-50 line-through' : ''
                      }`}
                    >
                      <td className="p-3.5">
                        <div className="font-mono tabular-nums font-semibold">{formatDateBR(tx.transactionDate)}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{tx.description}</div>
                        <div className="text-[10px] text-slate-400">
                          Competência: {formatDateBR(tx.competenceDate)} • Conta: {accounts.find((account) => account.id === tx.financialAccountId)?.name || 'Conta não identificada'}
                          {isTransfer && tx.destinationAccountId ? ` → ${accounts.find((account) => account.id === tx.destinationAccountId)?.name || 'Conta destino'}` : ''}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {tx.receivableId ? 'Origem: Conta a receber' : tx.payableId ? 'Origem: Conta a pagar' : isTransfer ? 'Origem: Transferência interna' : isReversal ? 'Origem: Estorno' : 'Origem: Movimento avulso'}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <Badge
                          variant={
                            isIncome
                              ? 'success'
                              : isExpense
                              ? 'info'
                              : isTransfer
                              ? 'neutral'
                              : 'warning'
                          }
                        >
                          {transactionTypeLabel(tx.type)}
                        </Badge>
                      </td>
                      <td
                        className={`p-3.5 text-right font-mono tabular-nums font-bold ${
                          isIncome
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isExpense
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {isIncome ? '+' : isExpense ? '-' : ''} R${' '}
                        {tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center">
                        <Badge variant={tx.isReversed ? 'danger' : 'success'}>{tx.isReversed ? 'Estornada' : 'Efetivada'}</Badge>
                      </td>
                      <td className="p-3.5 text-right">
                        {!tx.isReversed && !isReversal && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openReversal(tx)}
                            className="text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            Estornar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!reversalTargetTx}
        title="Estornar Transação Financeira"
        message="Confira os dados antes de confirmar. O estorno gera um evento de REVERSAL e recompõe os saldos de forma auditável."
        confirmText="Confirmar Estorno"
        confirmVariant="danger"
        onConfirm={confirmReverse}
        onCancel={closeReversal}
      >
        {reversalTargetTx && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/60">
            <div className="grid gap-2 sm:grid-cols-2">
              <div><span className="text-slate-500">Tipo</span><strong className="block text-slate-800 dark:text-slate-100">{transactionTypeLabel(reversalTargetTx.type)}</strong></div>
              <div><span className="text-slate-500">Valor</span><strong className="block font-mono text-slate-800 dark:text-slate-100">R$ {Number(reversalTargetTx.amount).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
              <div><span className="text-slate-500">Data</span><strong className="block text-slate-800 dark:text-slate-100">{formatDateBR(reversalTargetTx.transactionDate)}</strong></div>
              <div><span className="text-slate-500">Conta</span><strong className="block text-slate-800 dark:text-slate-100">{accounts.find(account=>account.id===reversalTargetTx.financialAccountId)?.name||'Conta não identificada'}</strong></div>
              <div><span className="text-slate-500">Meio de pagamento</span><strong className="block text-slate-800 dark:text-slate-100">{paymentMethods.find(method=>method.id===reversalTargetTx.paymentMethodId)?.name||'Não identificado'}</strong></div>
              <div><span className="text-slate-500">Vínculo</span><strong className="block text-slate-800 dark:text-slate-100">{reversalTargetTx.receivableId?'Conta a receber':reversalTargetTx.payableId?'Conta a pagar':reversalTargetTx.type===TransactionType.TRANSFER?'Transferência':'Movimento avulso'}</strong></div>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700"><span className="text-slate-500">Descrição / origem</span><strong className="block text-slate-800 dark:text-slate-100">{reversalTargetTx.description}</strong></div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
};
