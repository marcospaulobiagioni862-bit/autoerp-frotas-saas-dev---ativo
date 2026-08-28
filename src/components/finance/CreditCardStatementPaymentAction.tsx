import React, { useState } from 'react';
import { Banknote, X } from 'lucide-react';
import {
  CreditCardStatementClient,
  createCreditCardPaymentIdempotencyKey,
  type CreditCardProfileSummary,
  type CreditCardStatementSummary,
} from '../../api/creditCardStatementClient';
import { FinanceTransactionClient } from '../../api/financeTransactionClient';
import type { FinancialTransaction } from '../../types/entities';
import { Button } from '../ui';
import { eligibleStatementPaymentTransfers, isCreditCardStatementPayable } from './creditCardPaymentEligibility';

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface CreditCardStatementPaymentActionProps {
  statement: CreditCardStatementSummary;
  profile: CreditCardProfileSummary | undefined;
  onSuccess: () => Promise<void> | void;
}

export const CreditCardStatementPaymentAction: React.FC<CreditCardStatementPaymentActionProps> = ({ statement, profile, onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [transfers, setTransfers] = useState<FinancialTransaction[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (!isCreditCardStatementPayable(statement)) return null;

  const openSelector = async () => {
    setOpen(true);
    setLoading(true);
    setMessage(null);
    setSelectedTransactionId('');
    setIdempotencyKey(createCreditCardPaymentIdempotencyKey());
    try {
      const transactions = await FinanceTransactionClient.listTransactions();
      const eligible = eligibleStatementPaymentTransfers(statement, profile, transactions);
      setTransfers(eligible);
      if (eligible.length === 1) setSelectedTransactionId(eligible[0].id);
      if (eligible.length === 0) setMessage('Nenhuma transferência autoritativa elegível foi encontrada para liquidar exatamente este saldo.');
    } catch (error) {
      setTransfers([]);
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar transferências autoritativas.');
    } finally {
      setLoading(false);
    }
  };

  const pay = async () => {
    if (!selectedTransactionId || !idempotencyKey) return;
    const selected = transfers.find((transfer) => transfer.id === selectedTransactionId);
    if (!selected) return;
    if (!window.confirm(`Pagar a fatura ${statement.cycleRef} usando a transferência ${selected.id} no valor de ${currency(selected.amount)}?`)) return;

    setPaying(true);
    setMessage(null);
    try {
      await CreditCardStatementClient.payStatement(statement.id, selected.id, idempotencyKey);
      setOpen(false);
      setTransfers([]);
      setSelectedTransactionId('');
      setIdempotencyKey('');
      await onSuccess();
    } catch (error) {
      // Preserve the same idempotency key on uncertain retry.
      setMessage(error instanceof Error ? error.message : 'Não foi possível registrar o pagamento pela autoridade financeira.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <Button size="sm" variant="primary" onClick={() => void openSelector()} disabled={paying} icon={<Banknote className="h-4 w-4" />}>
        Pagar fatura
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-96 max-w-[90vw] rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Pagamento autoritativo</div>
              <div className="mt-1 text-[11px] text-slate-500">Somente transferências já existentes, não estornadas, com destino à conta do cartão e valor exatamente igual ao saldo.</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} icon={<X className="h-4 w-4" />}>Fechar</Button>
          </div>

          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
            <div className="flex justify-between gap-3"><span>Ciclo</span><strong>{statement.cycleRef}</strong></div>
            <div className="mt-1 flex justify-between gap-3"><span>Saldo autoritativo</span><strong className="font-mono">{currency(statement.balanceAmount)}</strong></div>
          </div>

          {loading ? (
            <div className="mt-3 text-xs text-slate-500">Carregando transferências elegíveis...</div>
          ) : transfers.length > 0 ? (
            <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Transferência elegível
              <select
                value={selectedTransactionId}
                onChange={(event) => setSelectedTransactionId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Selecione...</option>
                {transfers.map((transfer) => (
                  <option key={transfer.id} value={transfer.id}>
                    {transfer.transactionDate} • {currency(transfer.amount)} • {transfer.description}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {message && <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">{message}</div>}

          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" variant="primary" disabled={!selectedTransactionId || loading || paying} onClick={() => void pay()}>
              {paying ? 'Registrando...' : 'Confirmar pagamento'}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">O navegador não envia valor, saldo, status, tenant ou ator. Em falha incerta, a mesma chave idempotente é preservada para retry.</p>
        </div>
      )}
    </div>
  );
};
