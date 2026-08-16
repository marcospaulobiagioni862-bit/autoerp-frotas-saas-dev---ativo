import React, { useState, useEffect } from 'react';
import { AccountReceivable, FinancialAccount, PaymentMethod } from '../../types/entities';
import { FinanceEngine } from '../../domain/finance/FinanceEngine';
import { FinancialAccountRepository, PaymentMethodRepository } from '../../persistence/repositories/localRepositories';
import { useAuth } from '../../hooks/useAuth';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receivable: AccountReceivable | null;
  onSuccess: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ isOpen, onClose, receivable, onSuccess }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (receivable) {
      setAmount(receivable.balanceAmount || receivable.updatedAmount);
      setError(null);
      loadOptions();
    }
  }, [receivable]);

  const loadOptions = async () => {
    const accRepo = new FinancialAccountRepository();
    const pmRepo = new PaymentMethodRepository();
    const accList = await accRepo.findAllForCompany(user.companyId);
    const pmList = await pmRepo.findAllForCompany(user.companyId);
    setAccounts(accList);
    setMethods(pmList);

    if (accList.length > 0) setSelectedAccountId(accList[0].id);
    if (pmList.length > 0) setSelectedMethodId(pmList[0].id);
  };

  if (!isOpen || !receivable) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (receivable.companyId !== user.companyId) {
      setError('Erro de isolamento de tenant: O título a receber não pertence à sua empresa.');
      return;
    }
    if (amount <= 0) {
      setError('O valor a receber deve ser maior que zero.');
      return;
    }
    if (amount > receivable.balanceAmount) {
      setError(`O valor inserido (R$ ${amount.toFixed(2)}) é maior que o saldo restante da obrigação (R$ ${receivable.balanceAmount.toFixed(2)}).`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await FinanceEngine.registerReceipt({
        companyId: receivable.companyId,
        obligationId: receivable.id,
        financialAccountId: selectedAccountId,
        paymentAmount: amount,
        paymentDate,
        paymentMethodId: selectedMethodId,
        description: notes || 'Recebimento de título via portal operacional',
        userId: user.userId,
        userName: user.name,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar o recebimento.');
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
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              Operação de Recebimento (Receipt)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Liquidação de Conta a Receber • {receivable.description}
            </p>
          </div>
          <button
            onClick={onClose}
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

          <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-3 rounded-lg flex justify-between items-center text-xs">
            <div>
              <span className="text-slate-500 block">Valor Original / Restante:</span>
              <span className="font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-300">
                R$ {receivable.originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /{' '}
                <strong className="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                  R$ {receivable.balanceAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </strong>
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block">Vencimento:</span>
              <span className="font-medium font-mono tabular-nums text-slate-700 dark:text-slate-300">{receivable.dueDate}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Valor a Receber (R$) *
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              Permite liquidação parcial se o valor for menor que R${' '}
              {receivable.balanceAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Conta Financeira de Destino *
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Meio de Pagamento *
              </label>
              <select
                value={selectedMethodId}
                onChange={(e) => setSelectedMethodId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              >
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
              Data Efetiva de Recebimento *
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observações / Comprovante
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Recebido via Pix, comprovante anexado..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none h-16"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? 'Processando...' : 'Confirmar Recebimento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
