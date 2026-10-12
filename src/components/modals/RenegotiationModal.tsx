import React, { useState } from 'react';
import { AccountReceivable } from '../../types/entities';
import { X, RefreshCw, AlertCircle } from 'lucide-react';
import { FinanceRenegotiationClient } from '../../api/financeRenegotiationClient';
import type { RenegotiationInstallmentFrequency } from '../../shared/utils/renegotiationSchedule';
import { requestGuardedClose } from '../../app/unsavedChangesAuthority';

interface RenegotiationModalProps {
 isOpen: boolean;
 onClose: () => void;
 receivables: AccountReceivable[];
 onSuccess: () => void;
}

export const RenegotiationModal: React.FC<RenegotiationModalProps> = ({ isOpen, onClose, receivables, onSuccess }) => {
 const [installments, setInstallments] = useState<number>(2);
 const [newDueDate, setNewDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
 const [installmentFrequency, setInstallmentFrequency] = useState<RenegotiationInstallmentFrequency>('WEEKLY');
 const [discountAmount, setDiscountAmount] = useState<number>(0);
 const [interestAmount, setInterestAmount] = useState<number>(0);
 const [notes, setNotes] = useState<string>('Acordo de renegociação firmado via portal operacional');
 const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
 const [error, setError] = useState<string | null>(null);

 if (!isOpen || receivables.length === 0) return null;

 const totalOriginalBalance = receivables.reduce((sum, r) => sum + r.balanceAmount, 0);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();

 try {
 setIsSubmitting(true);
 setError(null);

 const categoryId = receivables[0]?.categoryId?.trim();
 if (!categoryId) {
 throw new Error('A categoria financeira canônica do título é obrigatória para renegociar.');
 }

 await FinanceRenegotiationClient.renegotiateReceivables({
 obligationIds: receivables.map((r) => r.id),
 newTotalAmount: Math.max(0, totalOriginalBalance - discountAmount + interestAmount),
 installmentsCount: installments,
 firstDueDate: newDueDate,
 installmentFrequency,
 categoryId,
 description: notes || 'Renegociação de títulos em atraso',
 });

 onSuccess();
 onClose();
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Erro ao renegociar títulos.');
 } finally {
 setIsSubmitting(false);
 }
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-900/60 backdrop-blur-xs p-4">
 <div className="bg-white dark:bg-graphite-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-graphite-200 dark:border-graphite-800">
 <div className="flex items-center justify-between px-6 py-4 border-b border-graphite-100 dark:border-graphite-800 bg-graphite-50/50 dark:bg-graphite-800/50">
 <div>
 <h3 className="text-lg font-bold text-graphite-900 dark:text-graphite-100 flex items-center gap-2">
 <RefreshCw className="w-5 h-5 text-warning-icon" />
 Renegociação de Títulos ({receivables.length} Selecionado{receivables.length > 1 ? 's' : ''})
 </h3>
 <p className="text-xs text-graphite-500 mt-0.5">
 Refinanciamento de obrigações • Cancela os títulos originais e gera novo grupo parcelado
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

 <div className="bg-warning-bg border border-warning-border p-3 rounded-lg text-xs flex justify-between items-center">
 <div>
 <span className="text-graphite-500 block">Saldo Devedor Total:</span>
 <strong className="text-warning-text font-mono tabular-nums text-sm">
 R$ {totalOriginalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
 </strong>
 </div>
 <div className="text-right">
 <span className="text-graphite-500 block">Motorista / Contrato:</span>
 <span className="font-medium text-graphite-700 dark:text-graphite-300">
 {receivables[0]?.driverId || 'Geral'}
 </span>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Número de Parcelas *
 </label>
 <input
 type="number"
 min="1"
 max="24"
 value={installments}
 onChange={(e) => setInstallments(parseInt(e.target.value) || 1)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
 required
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Periodicidade das Parcelas *
 </label>
 <select
 value={installmentFrequency}
 onChange={(e) => setInstallmentFrequency(e.target.value as RenegotiationInstallmentFrequency)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
 >
 <option value="WEEKLY">Semanal (7 dias)</option>
 <option value="BIWEEKLY">Quinzenal (14 dias)</option>
 <option value="MONTHLY">Mensal (mês calendário)</option>
 </select>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Desconto Concedido (R$)
 </label>
 <input
 type="number"
 step="0.01"
 value={discountAmount}
 onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Juros / Acréscimo (R$)
 </label>
 <input
 type="number"
 step="0.01"
 value={interestAmount}
 onChange={(e) => setInterestAmount(parseFloat(e.target.value) || 0)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
 />
 </div>
 </div>

 <div>
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Data da Primeira Parcela *
 </label>
 <input
 type="date"
 value={newDueDate}
 onChange={(e) => setNewDueDate(e.target.value)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none"
 required
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-graphite-700 dark:text-graphite-300 mb-1">
 Observações do Acordo
 </label>
 <textarea
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 className="w-full px-3 py-2 text-sm bg-white dark:bg-graphite-800 border border-graphite-300 dark:border-graphite-700 rounded-lg focus:ring-2 focus-visible:outline-focus-ring focus:outline-none resize-none h-16"
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
 className="px-4 py-2 text-xs font-semibold text-white bg-warning-bg hover:bg-warning-bg rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
 >
 {isSubmitting ? 'Processando...' : 'Confirmar Renegociação'}
 </button>
 </div>
 </form>
 </div>
 </div>
 );
};
