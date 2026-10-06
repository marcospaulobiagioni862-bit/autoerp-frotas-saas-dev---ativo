import React, { useState } from 'react';
import { Vehicle } from '../../types/entities';
import { VehicleClient } from '../../api/vehicleClient';
import { ModalContainer } from '../ui/ModalContainer';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Gauge, AlertCircle } from 'lucide-react';
import { requestGuardedClose } from '../../app/unsavedChangesAuthority';

interface RecordKmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vehicle: Vehicle | null;
}

export const RecordKmModal: React.FC<RecordKmModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  vehicle,
}) => {
  if (!vehicle) return null;

  const [newKm, setNewKm] = useState<number>(vehicle.currentKm);
  const [readingType, setReadingType] = useState<'CHECK_IN' | 'CHECK_OUT' | 'PERIODIC' | 'MAINTENANCE'>('PERIODIC');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const kmValue = Number(newKm);
    if (!Number.isInteger(kmValue) || kmValue < vehicle.currentKm) {
      setError(`A nova quilometragem não pode ser menor que a atual (${vehicle.currentKm.toLocaleString('pt-BR')} KM).`);
      return;
    }

    setLoading(true);
    try {
      await VehicleClient.recordKm(vehicle.id, {
        kmValue,
        readingType,
        notes,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar odômetro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={`Atualizar Odômetro — Placa ${vehicle.plate}`}
      subtitle={`KM Atual Registrado: ${vehicle.currentKm.toLocaleString('pt-BR')} KM`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Input
          label="Nova Quilometragem (KM) *"
          type="number"
          required
          min={vehicle.currentKm}
          value={newKm}
          onChange={(e) => setNewKm(Number(e.target.value))}
          helperText={`Igual a ${vehicle.currentKm.toLocaleString('pt-BR')} KM registra conferência; menor é bloqueado.`}
          icon={<Gauge className="w-4 h-4 text-slate-400" />}
        />

        <Select
          label="Tipo de Leitura *"
          value={readingType}
          onChange={(e) => setReadingType(e.target.value as any)}
          options={[
            { value: 'PERIODIC', label: 'Vistoria / Leitura Periódica' },
            { value: 'CHECK_IN', label: 'Check-in (Retorno da Locação)' },
            { value: 'CHECK_OUT', label: 'Check-out (Entrega ao Motorista)' },
            { value: 'MAINTENANCE', label: 'Saída/Entrada de Oficina' },
          ]}
        />

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Observações / Ponto de Atenção
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Leitura realizada no pátio central..."
            className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={(event)=>requestGuardedClose(event,onClose)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            Salvar Leitura
          </Button>
        </div>
      </form>
    </ModalContainer>
  );
};