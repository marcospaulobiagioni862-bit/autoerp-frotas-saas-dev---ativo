import React, { useMemo, useState } from 'react';
import { AlertCircle, Gauge } from 'lucide-react';
import type { Vehicle } from '../../types/entities';
import { VehicleClient } from '../../api/vehicleClient';
import { Button } from '../ui/Button';
import { ModalContainer } from '../ui/ModalContainer';
import { requestGuardedClose } from '../../app/unsavedChangesAuthority';

interface VehicleKmBatchModalProps {
  isOpen: boolean;
  vehicles: Vehicle[];
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

export const VehicleKmBatchModal: React.FC<VehicleKmBatchModalProps> = ({
  isOpen,
  vehicles,
  onClose,
  onSuccess,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editableVehicles = useMemo(
    () => [...vehicles].filter((vehicle) => !vehicle.isArchived).sort((a, b) => a.plate.localeCompare(b.plate, 'pt-BR')),
    [vehicles],
  );

  if (!isOpen) return null;

  const entries = editableVehicles.flatMap((vehicle) => {
    const raw = values[vehicle.id]?.trim();
    if (!raw) return [];
    const kmValue = Number(raw);
    return [{ vehicle, kmValue }];
  });

  const validationError = (): string | null => {
    if (entries.length === 0) return 'Informe a nova quilometragem de pelo menos um veículo.';
    for (const { vehicle, kmValue } of entries) {
      if (!Number.isInteger(kmValue) || kmValue < vehicle.currentKm) {
        return `A quilometragem de ${vehicle.plate} deve ser um número inteiro maior ou igual a ${vehicle.currentKm.toLocaleString('pt-BR')} km.`;
      }
    }
    return null;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const invalid = validationError();
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await VehicleClient.recordKmBatch({
        entries: entries.map(({ vehicle, kmValue }) => ({
          vehicleId: vehicle.id,
          kmValue,
          notes: notes.trim() || 'Atualização de KM em lote',
        })),
      });
      await onSuccess();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao atualizar quilometragens em lote.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title="Atualizar KM em lote"
      subtitle="Informe somente os veículos que deseja atualizar. A gravação é atômica: se uma leitura falhar, nenhuma é aplicada."
      maxWidth="3xl"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left">Veículo</th>
                <th className="px-3 py-2 text-right">KM atual</th>
                <th className="px-3 py-2 text-left">Nova KM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {editableVehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{vehicle.plate}</div>
                    <div className="text-[10px] text-slate-500">{vehicle.brand} {vehicle.model}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{vehicle.currentKm.toLocaleString('pt-BR')} km</td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Nova KM de ${vehicle.plate}`}
                      type="number"
                      min={vehicle.currentKm}
                      step="1"
                      value={values[vehicle.id] || ''}
                      onChange={(event) => setValues((current) => ({ ...current, [vehicle.id]: event.target.value }))}
                      placeholder="Deixe vazio para ignorar"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Observação comum
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ex.: leitura semanal da frota"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Gauge className="h-4 w-4" />
            {entries.length} veículo(s) selecionado(s)
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={(event)=>requestGuardedClose(event,onClose)} disabled={loading}>Cancelar</Button>
            <Button type="submit" variant="primary" isLoading={loading}>Salvar KM em lote</Button>
          </div>
        </div>
      </form>
    </ModalContainer>
  );
};