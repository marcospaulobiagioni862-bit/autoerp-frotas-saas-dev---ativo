import { SettlementLateInterest, settlementQuote, settlementLocalDate } from './SettlementLateInterest';
import React, { useState, useEffect, useRef } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { formatCurrencyBRL, normalizeCurrencyDraft, parseCurrencyDraft } from '../../shared/utils/currency';
import { AccountReceivable } from '../../types/entities';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import {
  FinanceSettlementClient,
  SettlementAccountOption,
  SettlementPaymentMethodOption,
  createSettlementIdempotencyKey,
} from '../../api/financeSettlementClient';
import { requestGuardedClose } from '../../app/unsavedChangesAuthority';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receivable: AccountReceivable | null;
  onSuccess: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ isOpen, onClose, receivable, onSuccess }) => {
  const [accounts, setAccounts] = useState<SettlementAccountOption[]>([]);
  const [methods, setMethods] = useState<SettlementPaymentMethodOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => settlementLocalDate());
  const [dailyInterest, setDailyInterest] = useState<number | null>(null);
  const amountEdited = useRef(false);
  const [notes, setNotes] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => createSettlementIdempotencyKey());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submittingRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (receivable) {
      amountEdited.current = false;
      setDailyInterest(null);
      setAmount(receivable.balanceAmount.toFixed(2).replace('.', ','));
      setIdempotencyKey(createSettlementIdempotencyKey());
      setError(null);
      loadOptions();
    }
  }, [receivable]);

  const rotateCommandKey = () => setIdempotencyKey(createSettlementIdempotencyKey());

  const loadOptions = async () => {
    try {
      const options = await FinanceSettlementClient.getOptions();
      setDailyInterest(options.fixedDailyInterest?.RECEIVABLE ?? null);
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

  const quote = settlementQuote(receivable, paymentDate, dailyInterest);
  const settlementTotal = quote?.totalAmount ?? receivable?.balanceAmount ?? 0;
  useEffect(() => {
    if (!amountEdited.current && receivable) setAmount(settlementTotal.toFixed(2).replace('.', ','));
  }, [settlementTotal, receivable]);

  if (!isOpen || !receivable) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const paymentAmount = parseCurrencyDraft(amount);
    if (submittingRef.current || confirmOpen) return;
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setError('O valor a receber deve ser maior que zero.');
      return;
    }
    if (paymentAmount > settlementTotal) {
      setError(`O valor inserido (${formatCurrencyBRL(paymentAmount)}) é maior que o saldo restante (${formatCurrencyBRL(settlementTotal)}).`);
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

      await FinanceSettlementClient.registerReceipt(receivable.id, {
        financialAccountId: selectedAccountId,
        paymentAmount,
        ...(quote ? { interestAmount: quote.additionalInterest } : {}),
        paymentDate,
        paymentMethodId: selectedMethodId,
        description: notes || 'Recebimento de título via portal operacional',
        idempotencyKey,
      });

    } catch (err: any) {
      submittingRef.current = false;
      setConfirmOpen(false);
      // Preserve the same command key on an ambiguous/network failure. A retry
      // with unchanged fields therefore converges to the first committed result.
      setError(err.message || 'Erro ao registrar o recebimento.');
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
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              Operação de Recebimento (Receipt)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Liquidação de Conta a Receber • {receivable.description}
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

          <SettlementLateInterest quote={quote} balanceAmount={receivable.balanceAmount} hasPreviousAdjustments={Boolean(receivable.interestAmount || receivable.fineAmount || receivable.discountAmount)} dueDate={receivable.dueDate} kind="receber" />
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Valor a Receber (R$) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Valor a Receber (R$)"
              value={amount}
              onChange={(e) => {
                const draft = normalizeCurrencyDraft(e.target.value);
                if (draft !== null && draft !== amount) { amountEdited.current = true; setAmount(draft); rotateCommandKey(); }
              }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              Permite liquidação parcial se o valor for menor que R${' '}
              {settlementTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {(accounts.length === 0 || methods.length === 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              Cadastre uma conta financeira e um meio de pagamento ativos em Financeiro → Configurações antes de registrar o recebimento.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Conta Financeira de Destino *
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => { setSelectedAccountId(e.target.value); rotateCommandKey(); }}
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
                onChange={(e) => { setSelectedMethodId(e.target.value); rotateCommandKey(); }}
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
              onChange={(e) => { setPaymentDate(e.target.value); rotateCommandKey(); }}
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
              onChange={(e) => { setNotes(e.target.value); rotateCommandKey(); }}
              placeholder="Ex: Recebido via Pix, comprovante anexado..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none h-16"
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
              disabled={isSubmitting || accounts.length === 0 || methods.length === 0 || !selectedAccountId || !selectedMethodId}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? 'Processando...' : 'Confirmar Recebimento'}
            </button>
          </div>
          </fieldset>
        </form>
        <ConfirmDialog
          isOpen={confirmOpen}
          title="Confirmar Recebimento"
          variant="primary"
          confirmText={isSubmitting ? 'Processando...' : 'Confirmar Recebimento'}
          isLoading={isSubmitting}
          onCancel={() => { if (!submittingRef.current) setConfirmOpen(false); }}
          onConfirm={confirmSettlement}
        >
          <dl className="space-y-2">
            <div><dt>Título / origem</dt><dd>{receivable.description} • {receivable.originType}</dd></div>
            <div><dt>Valor</dt><dd>{formatCurrencyBRL(parseCurrencyDraft(amount))}</dd></div>
            <div><dt>Conta financeira de destino</dt><dd>{accounts.find(account => account.id === selectedAccountId)?.name}</dd></div>
            <div><dt>Meio de pagamento</dt><dd>{methods.find(method => method.id === selectedMethodId)?.name}</dd></div>
          </dl>
        </ConfirmDialog>
      </div>
    </div>
  );
};
