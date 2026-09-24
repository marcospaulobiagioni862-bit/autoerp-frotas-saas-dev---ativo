import React, { useState, useEffect, useRef } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { formatCurrencyBRL, normalizeCurrencyDraft, parseCurrencyDraft } from '../../shared/utils/currency';
import { AccountPayable } from '../../types/entities';
import { X, CreditCard, AlertCircle } from 'lucide-react';
import {
  FinanceSettlementClient,
  SettlementAccountOption,
  SettlementPaymentMethodOption,
  createSettlementIdempotencyKey,
} from '../../api/financeSettlementClient';
import { requestGuardedClose } from '../../app/unsavedChangesAuthority';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payable: AccountPayable | null;
  onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, payable, onSuccess }) => {
  const [accounts, setAccounts] = useState<SettlementAccountOption[]>([]);
  const [methods, setMethods] = useState<SettlementPaymentMethodOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => createSettlementIdempotencyKey());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submittingRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (payable) {
      setAmount(payable.balanceAmount.toFixed(2).replace('.', ','));
      setIdempotencyKey(createSettlementIdempotencyKey());
      setError(null);
      loadOptions();
    }
  }, [payable]);

  const rotateCommandKey = () => setIdempotencyKey(createSettlementIdempotencyKey());

  const loadOptions = async () => {
    try {
      const options = await FinanceSettlementClient.getOptions();
      setAccounts(options.accounts);
      setMethods(options.paymentMethods);
      if (options.accounts.length > 0) setSelectedAccountId(options.accounts[0].id);
      if (options.paymentMethods.length > 0) setSelectedMethodId(options.paymentMethods[0].id);
    } catch (err) {
      setAccounts([]);
      setMethods([]);
      setError(err instanceof Error ? err.message : 'Erro ao carregar opções financeiras.');
    }
  };

  if (!isOpen || !payable) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const paymentAmount = parseCurrencyDraft(amount);
    if (submittingRef.current || confirmOpen) return;
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setError('O valor a pagar deve ser maior que zero.');
      return;
    }
    if (paymentAmount > payable.balanceAmount) {
      setError(`O valor inserido (${formatCurrencyBRL(paymentAmount)}) é maior que o saldo restante (${formatCurrencyBRL(payable.balanceAmount)}).`);
      return;
    }

    if (!accounts.some(account => account.id === selectedAccountId && account.status === 'ACTIVE') ||
        !methods.some(method => method.id === selectedMethodId && method.active)) {
      setError('Selecione uma conta financeira e um meio de pagamento ativos.');
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const confirmSettlement = async () => {
    if (submittingRef.current || !confirmOpen) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    const paymentAmount = parseCurrencyDraft(amount);
    try {
      setError(null);

      await FinanceSettlementClient.registerPayment(payable.id, {
        financialAccountId: selectedAccountId,
        paymentAmount,
        paymentDate,
        paymentMethodId: selectedMethodId,
        description: notes || 'Pagamento efetuado via portal operacional',
        idempotencyKey,
      });

    } catch (err: any) {
      submittingRef.current = false;
      setConfirmOpen(false);
      // Keep the key after an ambiguous failure so an unchanged retry cannot
      // debit the financial account twice.
      setError(err.message || 'Erro ao registrar o pagamento.');
      return;
    } finally {
      setIsSubmitting(false);
    }
    // A read-model refresh failure must never turn a committed settlement into a retry.
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              Operação de Pagamento (Payment)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Liquidação de Conta a Pagar • {payable.description}
            </p>
          </div>
          <button
            disabled={isSubmitting || confirmOpen}
            onClick={(event)=>{ if (!submittingRef.current) requestGuardedClose(event,onClose); }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <fieldset disabled={isSubmitting || confirmOpen} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 p-3 rounded-lg flex justify-between items-center text-xs">
            <div>
              <span className="text-slate-500 block">Valor Original / Saldo Devedor:</span>
              <span className="font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-300">
                R$ {payable.originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /{' '}
                <strong className="text-indigo-700 dark:text-indigo-400 font-mono tabular-nums">
                  R$ {payable.balanceAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </strong>
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block">Vencimento:</span>
              <span className="font-medium font-mono tabular-nums text-slate-700 dark:text-slate-300">{payable.dueDate}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Valor a Pagar (R$) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Valor a Pagar (R$)"
              value={amount}
              onChange={(e) => {
                const draft = normalizeCurrencyDraft(e.target.value);
                if (draft !== null && draft !== amount) { setAmount(draft); rotateCommandKey(); }
              }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Conta Financeira de Origem *
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => { setSelectedAccountId(e.target.value); rotateCommandKey(); }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                onChange={(e) => { setSelectedMethodId(e.target.value); rotateCommandKey(); }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
              Data Efetiva de Pagamento *
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => { setPaymentDate(e.target.value); rotateCommandKey(); }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observações / Comprovante
            </label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); rotateCommandKey(); }}
              placeholder="Ex: Pagamento autorizado pelo gerência..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none h-16"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={(event)=>{ if (!submittingRef.current) requestGuardedClose(event,onClose); }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? 'Processando...' : 'Confirmar Pagamento'}
            </button>
          </div>
          </fieldset>
        </form>
        <ConfirmDialog
          isOpen={confirmOpen}
          title="Confirmar Pagamento"
          variant="primary"
          confirmText={isSubmitting ? 'Processando...' : 'Confirmar Pagamento'}
          isLoading={isSubmitting}
          onCancel={() => { if (!submittingRef.current) setConfirmOpen(false); }}
          onConfirm={confirmSettlement}
        >
          <dl className="space-y-2">
            <div><dt>Título / origem</dt><dd>{payable.description} • {payable.originType}</dd></div>
            <div><dt>Valor</dt><dd>{formatCurrencyBRL(parseCurrencyDraft(amount))}</dd></div>
            <div><dt>Conta financeira de origem</dt><dd>{accounts.find(account => account.id === selectedAccountId)?.name}</dd></div>
            <div><dt>Meio de pagamento</dt><dd>{methods.find(method => method.id === selectedMethodId)?.name}</dd></div>
          </dl>
        </ConfirmDialog>
      </div>
    </div>
  );
};
