import React, { useState } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import type { Vehicle } from '../../types/entities';
import { VehicleClient } from '../../api/vehicleClient';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ModalContainer } from '../ui/ModalContainer';
import { requestGuardedClose } from '../../app/unsavedChangesAuthority';

interface VehicleRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  vehicle: Vehicle | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export const VehicleRestoreModal: React.FC<VehicleRestoreModalProps> = ({ isOpen, onClose, onSuccess, vehicle }) => {
  if (!vehicle) return null;

  const [restoreDate, setRestoreDate] = useState(today());
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await VehicleClient.restore(vehicle.id, { restoreDate, reason: reason.trim() });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Não foi possível retornar o veículo ao estoque.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={`Retornar ao estoque — ${vehicle.plate}`}
      subtitle="A reentrada reutiliza o mesmo cadastro do veículo e preserva integralmente a venda e o histórico anteriores."
      maxWidth="md"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Input label="Data da reentrada *" type="date" required value={restoreDate} onChange={(event) => setRestoreDate(event.target.value)} />

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Motivo da reentrada / recompra *</label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: veículo recomprado e retornando à operação."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <div className="mb-1 flex items-center gap-2 font-semibold"><RotateCcw className="h-4 w-4" />Reentrada auditável</div>
          O mesmo ID, documentos, multas, manutenções, contratos históricos e lançamentos financeiros permanecem preservados. Esta ação não cria nem altera contrato ou título financeiro automaticamente.
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={(event) => requestGuardedClose(event, onClose)} disabled={loading}>Cancelar</Button>
          <Button type="submit" variant="primary" isLoading={loading}>Confirmar retorno ao estoque</Button>
        </div>
      </form>
    </ModalContainer>
  );
};