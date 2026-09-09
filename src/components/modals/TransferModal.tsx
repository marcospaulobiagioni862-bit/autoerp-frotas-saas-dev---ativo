import React, { useState, useEffect } from 'react';
import { FinanceTransactionClient, createTransferIdempotencyKey } from '../../api/financeTransactionClient';
import type {
import { requestGuardedClose } from '../../app/unsavedChangesAuthority';
  SettlementAccountOption,
  SettlementPaymentMethodOption,
} from '../../api/financeSettlementClient';
import { X, ArrowRightLeft, AlertCircle } from 'lucide-react';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [accounts, setAccounts] = useState<SettlementAccountOption[]>([]);
  const [methods, setMethods] = useState<SettlementPaymentMethodOption[]>([]);
  const [sourceAccountId, setSourceAccountId] = useState<string>('');
  const [destinationAccountId, setDestinationAccountId] = useState<string>('');
  const [methodId, setMethodId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>('Pagamento de Fatura de Cartão / Transferência Interna');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transferCommandKey, setTransferCommandKey] = useState<string>(() => createTransferIdempotencyKey());

  useEffect(() => {
    if (isOpen) {
      loadOptions();
      setError(null);
    }
  }, [isOpen]);

  // A changed command gets a fresh key. A failed/retried submit with unchanged
  // fields keeps the same key and therefore converges server-side.
  useEffect(() => {
    if (isOpen) {
      setTransferCommandKey(createTransferIdempotencyKey());
    }
  }, [isOpen, sourceAccountId, destinationAccountId, methodId, amount, transferDate, description]);

  const loadOptions = async () => {
    try {
      const options = await FinanceTransactionClient.getOptions();
      setAccounts(options.accounts);
      setMethods(options.paymentMethods);

      if (options.accounts.length >= 2) {
        setSourceAccountId(options.accounts[0].id);
        setDestinationAccountId(options.accounts[1].id);
      } else if (options.accounts.length === 1) {
        setSourceAccountId(options.accounts[0].id);
        setDestinationAccountId('');
      } else {
        setSourceAccountId('');
        setDestinationAccountId('');
      }

      setMethodId(options.paymentMethods[0]?.id || '');
    } catch (err) {
      setAccounts([]);
      setMethods([]);
      setSourceAccountId('');
      setDestinationAccountId('');
      setMethodId('');
      setError(err instanceof Error ? err.message : 'Erro ao carregar opções financeiras.');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setError('O valor da transferência deve ser maior que zero.');
      return;
    }
    if (!sourceAccountId || !destinationAccountId || !methodId || !transferDate) {
      setError('Conta de origem, conta de destino, forma de pagamento e data são obrigatórias.');
      return;
    }
    if (sourceAccountId === destinationAccountId) {
      setError('A conta de origem e de destino devem ser diferentes.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await FinanceTransactionClient.transfer({
        sourceAccountId,
        destinationAccountId,
        amount,
        transferDate,
        paymentMethodId: methodId,
        description: description || 'Transferência entre contas financeiras',
        idempotencyKey: transferCommandKey,
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao realizar transferência.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              Transferência Entre Contas (TRANSFER)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Movimentação interna de saldo • Não gera receita ou despesa no DRE
            </p>
          </div>
          <button
            onClick={(event)=>requestGuardedClose(event,onClose)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-lg text-xs text-blue-800 dark:text-blue-300">
            <strong>Aviso de Integridade:</strong> Transferências operacionais ajustam a variação dos saldos (-origem, +destino) sem duplicar despesas nem inflar DRE.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Conta de Origem (-) *
              </label>
              <select
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              >
                <option value="" disabled>Selecione</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (R$ {acc.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Conta de Destino (+) *
              </label>
              <select
                value={destinationAccountId}
                onChange={(e) => setDestinationAccountId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              >
                <option value="" disabled>Selecione</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (R$ {acc.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Valor da Transferência (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Meio / Tipo *
              </label>
              <select
                value={methodId}
                onChange={(e) => setMethodId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              >
                <option value="" disabled>Selecione</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Data da Transferência *
            </label>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Descrição / Motivo
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Pagamento de Fatura de Cartão de Crédito"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={(event)=>requestGuardedClose(event,onClose)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? 'Transferindo...' : 'Executar Transferência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
