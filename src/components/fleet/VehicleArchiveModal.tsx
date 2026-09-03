import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { Vehicle } from '../../types/entities';
import { VehicleClient } from '../../api/vehicleClient';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ModalContainer } from '../ui/ModalContainer';

interface VehicleArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  vehicle: Vehicle | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export const VehicleArchiveModal: React.FC<VehicleArchiveModalProps> = ({ isOpen, onClose, onSuccess, vehicle }) => {
  if (!vehicle) return null;

  const [archiveDate, setArchiveDate] = useState(today());
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await VehicleClient.archive(vehicle.id, { archiveDate, reason: reason.trim() });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Não foi possível arquivar o veículo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={`Arquivar veículo — ${vehicle.plate}`}
      subtitle="O veículo sairá da frota ativa, mas todo o histórico permanecerá disponível em modo somente leitura."
      maxWidth="md"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Input label="Data do arquivamento *" type="date" required value={archiveDate} onChange={(e) => setArchiveDate(e.target.value)} />

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Motivo do arquivamento *</label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Informe por que o veículo está sendo arquivado."
            className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-600 dark:text-slate-300">
          O histórico não será apagado. KM, contratos, manutenções, multas, documentos e dados financeiros vinculados continuarão consultáveis.
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button type="submit" variant="primary" isLoading={loading}>Confirmar arquivamento</Button>
        </div>
      </form>
    </ModalContainer>
  );
};
