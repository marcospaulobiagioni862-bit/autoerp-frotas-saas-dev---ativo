import React, { useId, useState, useEffect } from 'react';
import { FinanceTransactionClient, createTransferIdempotencyKey } from '../../api/financeTransactionClient';
import type {
 SettlementAccountOption,
 SettlementPaymentMethodOption,
} from '../../api/financeSettlementClient';
import { X, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { markUnsavedChanges, requestGuardedClose } from '../../app/unsavedChangesAuthority';

interface TransferModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({ isOpen, onClose, onSuccess }) => {
 // AUTOERP-92. Este modal monta a propria shell, nao usa ModalContainer, e por isso
 // nao herda nada da guarda de alteracoes: nem o atributo que ancora o estado sujo
 // nem o markDirty por evento de input. O requestGuardedClose dos botoes daqui ja
 // existia, mas rodava com guardId vazio - a guarda nunca disparava e o formulario
 // meio preenchido era descartado em silencio. As duas linhas abaixo, mais o
 // data-unsaved-guard e o onInputCapture no painel, e o que faltava.
 const guardId = useId();
 const marcarSujo = (alvo: EventTarget | null) => {
  const elemento = alvo instanceof HTMLElement ? alvo : null;
  if (!elemento) return;
  const tag = elemento.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
  if (elemento instanceof HTMLInputElement && ['button','submit','reset'].includes(elemento.type)) return;
  if (elemento.hasAttribute('readonly') || elemento.hasAttribute('disabled')) return;
  markUnsavedChanges(guardId);
 };

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
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-900/60 backdrop-blur-xs p-4">
 <div className="bg-white dark:bg-graphite-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-graphite-200 dark:border-graphite-800"
  data-unsaved-guard={guardId}
  onInputCapture={(event) => marcarSujo(event.target)}
  onChangeCapture={(event) => marcarSujo(event.target)}
 >
 <div className="flex items-center justify-between px-6 py-4 border-b border-graphite-100 dark:border-graphite-800 bg-graphite-50/50 dark:bg-graphite-800/50">
 <div>
 <h3 className="text-lg font-bold text-graphite-900 dark:text-graphite-100 flex items-center gap-2">
 <ArrowRightLeft className="w-5 h-5 text-info-icon" />
 Transferência Entre Contas (TRANSFER)
 </h3>
 <p className="text-xs text-graphite-500 mt-0.5">
 Movimentação interna de saldo • Não gera receita ou despesa no DRE
 </p>
 </div>
 <button
 onClick={(event)=>requestGuardedClose(event,onClose)}
 className="p-1 rounded-lg text-graphite-400 hover:text-graphite-600 hover:bg-graphite-100 dark:hover:bg-graphite-800 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 <form onSubmit={handleSubmit} className="p-6 space-y-4">
 {error && (
 <div className="p-3 bg-error-bg border border-error-border rounded-lg text-xs text-error-text flex items-start gap-2">
 <AlertCircle className="w-4 h-4 text-error-icon shrink-0 mt-0.5" />
 <span>{error}</span>
 </div>
 )}

 <div className="p-3 bg-info-bg border border-info-border rounded-lg text-xs text-info-text ">
 <strong>Aviso de Integridade:</strong> Transferências operacionais ajustam a variação dos saldos (-origem, +destino) sem duplicar despesas nem inflar DRE.
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Conta de Origem (-) *
 </label>
 <select
 value={sourceAccountId}
 onChange={(e) => setSourceAccountId(e.target.value)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
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
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Conta de Destino (+) *
 </label>
 <select
 value={destinationAccountId}
 onChange={(e) => setDestinationAccountId(e.target.value)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
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
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Valor da Transferência (R$) *
 </label>
 <input
 type="number"
 step="0.01"
 value={amount}
 onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
 placeholder="0.00"
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
 required
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Meio / Tipo *
 </label>
 <select
 value={methodId}
 onChange={(e) => setMethodId(e.target.value)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
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
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Data da Transferência *
 </label>
 <input
 type="date"
 value={transferDate}
 onChange={(e) => setTransferDate(e.target.value)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
 required
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Descrição / Motivo
 </label>
 <input
 type="text"
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 placeholder="Ex: Pagamento de Fatura de Cartão de Crédito"
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
 />
 </div>

 <div className="flex justify-end gap-2 pt-2 border-t border-graphite-100 dark:border-graphite-800">
 <button
 type="button"
 onClick={(event)=>requestGuardedClose(event,onClose)}
 className="px-4 py-2 text-xs font-semibold text-graphite-600 dark:text-graphite-400 hover:bg-graphite-100 dark:hover:bg-graphite-800 rounded-lg transition-colors"
 >
 Cancelar
 </button>
 <button
 type="submit"
 disabled={isSubmitting}
 className="px-4 py-2 text-xs font-semibold text-white bg-action-primary hover:bg-action-primary-hover rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
 >
 {isSubmitting ? 'Transferindo...' : 'Executar Transferência'}
 </button>
 </div>
 </form>
 </div>
 </div>
 );
};
