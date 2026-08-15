import React, { useEffect, useState } from 'react';
import {
  FinancialAccountRepository,
  FinancialTransactionRepository,
} from '../../persistence/repositories/localRepositories';
import { FinancialAccount, FinancialTransaction } from '../../types/entities';
import { TransactionType } from '../../types/enums';
import { FinanceEngine } from '../../domain/finance/FinanceEngine';
import { useAuth } from '../../hooks/useAuth';
import {
  ArrowRightLeft,
  Wallet,
  CreditCard,
  Search,
  X,
} from 'lucide-react';
import { Card, Button, Badge, Input, ConfirmDialog, Skeleton } from '../ui';

interface TransactionsViewProps {
  onOpenTransferModal: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ onOpenTransferModal }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<string | null>(null);

  // Reversal confirm dialog state
  const [reversalTargetTx, setReversalTargetTx] = useState<FinancialTransaction | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const accRepo = new FinancialAccountRepository();
    const txRepo = new FinancialTransactionRepository();

    const [accList, txList] = await Promise.all([
      accRepo.findAll({ companyId: user.companyId }),
      txRepo.findAll({ companyId: user.companyId }),
    ]);

    setAccounts(accList);
    setTransactions(txList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setLoading(false);
  };

  const confirmReverse = async () => {
    if (!reversalTargetTx) return;

    try {
      if (reversalTargetTx.companyId !== user.companyId) {
        alert('Erro de tenant: A transação não pertence à empresa da sessão atual.');
        setReversalTargetTx(null);
        return;
      }

      await FinanceEngine.reverseTransaction(
        user.companyId,
        reversalTargetTx.id,
        reversalTargetTx.amount,
        'Estorno operacional solicitado via extrato',
        user.userId,
        user.name
      );

      setMessage('Transação estornada com sucesso!');
      setReversalTargetTx(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao realizar estorno');
      setReversalTargetTx(null);
    }
  };

  const filteredTxs = transactions.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'ALL' || tx.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-blue-600" />
            Extrato Unificado & Contas Financeiras
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Eventos financeiros efetivamente realizados (INCOME, EXPENSE, TRANSFER, REVERSAL).
          </p>
        </div>

        <Button
          onClick={onOpenTransferModal}
          variant="primary"
          size="sm"
          icon={<ArrowRightLeft className="w-4 h-4" />}
        >
          Transferência Entre Contas
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

      {/* Account Balances Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {accounts.map((acc) => {
          const isCard = acc.type === 'CREDIT_CARD';

          return (
            <Card key={acc.id} padding="sm">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    {acc.name} ({acc.type})
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

      {/* Filters Bar */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <Input
              type="text"
              placeholder="Buscar por descrição ou id..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
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
                {type === 'ALL'
                  ? 'Todos'
                  : type === TransactionType.INCOME
                  ? 'Receitas (INCOME)'
                  : type === TransactionType.EXPENSE
                  ? 'Despesas (EXPENSE)'
                  : type === TransactionType.TRANSFER
                  ? 'Transferências (TRANSFER)'
                  : 'Estornos (REVERSAL)'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Transactions Table */}
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
                  <th className="p-3.5">Data / ID</th>
                  <th className="p-3.5">Descrição / Regime</th>
                  <th className="p-3.5">Tipo</th>
                  <th className="p-3.5 text-right">Valor (R$)</th>
                  <th className="p-3.5 text-center">Estornado?</th>
                  <th className="p-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredTxs.map((tx) => {
                  const isIncome = tx.type === TransactionType.INCOME;
                  const isExpense = tx.type === TransactionType.EXPENSE;
                  const isTransfer = tx.type === TransactionType.TRANSFER;

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        tx.isReversed ? 'opacity-50 line-through' : ''
                      }`}
                    >
                      <td className="p-3.5">
                        <div className="font-mono tabular-nums font-semibold">{tx.transactionDate}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{tx.id}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{tx.description}</div>
                        <div className="text-[10px] text-slate-400">
                          Competência: {tx.competenceDate} • Conta: {tx.financialAccountId}
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
                          {tx.type}
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
                        {tx.isReversed ? (
                          <span className="text-red-600 dark:text-red-400 font-bold text-[10px]">SIM</span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">NÃO</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        {!tx.isReversed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setReversalTargetTx(tx)}
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
        message="Deseja realmente estornar esta transação? Esta operação gera um evento de REVERSAL no motor financeiro e atualiza os saldos de forma auditável."
        confirmText="Confirmar Estorno"
        confirmVariant="danger"
        onConfirm={confirmReverse}
        onCancel={() => setReversalTargetTx(null)}
      />
    </div>
  );
};

