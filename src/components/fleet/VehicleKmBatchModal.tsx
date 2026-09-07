import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Camera, CheckCircle2, Gauge, Radio, RefreshCw } from 'lucide-react';
import type { Vehicle } from '../../types/entities';
import {
  VehicleKmReadingClient,
  type KmReadingSchedule,
  type KmReadingSourceType,
  type TrackerKmCandidate,
} from '../../api/vehicleKmReadingClient';
import { Button, Input, ModalContainer, Select } from '../ui';
import { FileUpload } from '../documents/FileUpload';

interface VehicleKmBatchModalProps {
  isOpen: boolean;
  vehicles: Vehicle[];
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

interface RowDraft {
  selected: boolean;
  sourceType: KmReadingSourceType;
  kmValue: string;
  sourceAttachmentId?: string;
  tracker?: TrackerKmCandidate;
  trackerLoading?: boolean;
  scheduleFrequency: 'WEEKLY' | 'MONTHLY';
  scheduleWeekday: number;
  scheduleDayOfMonth: number;
  scheduleSaved: boolean;
  nextDueDate?: string;
  scheduleSaving?: boolean;
  message?: string;
  error?: string;
}

const WEEKDAYS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

function formatDateOnly(value?: string): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function rowFromSchedule(schedule?: KmReadingSchedule): RowDraft {
  return {
    selected: false,
    sourceType: 'MANUAL',
    kmValue: '',
    scheduleFrequency: schedule?.frequency || 'WEEKLY',
    scheduleWeekday: schedule?.weekday || 1,
    scheduleDayOfMonth: schedule?.dayOfMonth || 1,
    scheduleSaved: Boolean(schedule),
    nextDueDate: schedule?.nextDueDate,
  };
}

export const VehicleKmBatchModal: React.FC<VehicleKmBatchModalProps> = ({
  isOpen,
  vehicles,
  onClose,
  onSuccess,
}) => {
  const [rows, setRows] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);

  const sortedVehicles = useMemo(
    () => [...vehicles].sort((a, b) => a.plate.localeCompare(b.plate, 'pt-BR')),
    [vehicles],
  );

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setGlobalError(null);
    setGlobalMessage(null);
    void VehicleKmReadingClient.listSchedules()
      .then((schedules) => {
        if (!active) return;
        const byVehicle = new Map(schedules.map((item) => [item.vehicleId, item]));
        setRows(Object.fromEntries(sortedVehicles.map((vehicle) => [vehicle.id, rowFromSchedule(byVehicle.get(vehicle.id))])));
      })
      .catch((error) => {
        if (!active) return;
        setRows(Object.fromEntries(sortedVehicles.map((vehicle) => [vehicle.id, rowFromSchedule()])));
        setGlobalError(error instanceof Error ? error.message : 'Falha ao carregar a programação de KM.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isOpen, sortedVehicles]);

  const patchRow = (vehicleId: string, patch: Partial<RowDraft>) => {
    setRows((current) => ({
      ...current,
      [vehicleId]: { ...(current[vehicleId] || rowFromSchedule()), ...patch },
    }));
  };

  const selectedCount = sortedVehicles.filter((vehicle) => rows[vehicle.id]?.selected).length;

  const selectAll = (selected: boolean) => {
    setRows((current) => {
      const next = { ...current };
      for (const vehicle of sortedVehicles) {
        next[vehicle.id] = { ...(next[vehicle.id] || rowFromSchedule()), selected };
      }
      return next;
    });
  };

  const loadTracker = async (vehicle: Vehicle) => {
    patchRow(vehicle.id, { trackerLoading: true, tracker: undefined, error: undefined, message: undefined });
    try {
      const tracker = await VehicleKmReadingClient.trackerCandidate(vehicle.id);
      patchRow(vehicle.id, {
        tracker,
        trackerLoading: false,
        message: `Rastreador: ${tracker.kmValue.toLocaleString('pt-BR')} KM em ${new Date(tracker.observedAt).toLocaleString('pt-BR')}.`,
      });
    } catch (error) {
      patchRow(vehicle.id, {
        trackerLoading: false,
        error: error instanceof Error ? error.message : 'Não foi possível obter o KM do rastreador.',
      });
    }
  };

  const saveSchedule = async (vehicle: Vehicle) => {
    const row = rows[vehicle.id] || rowFromSchedule();
    patchRow(vehicle.id, { scheduleSaving: true, error: undefined, message: undefined });
    try {
      const schedule = await VehicleKmReadingClient.upsertSchedule(vehicle.id, row.scheduleFrequency === 'WEEKLY'
        ? { frequency: 'WEEKLY', weekday: row.scheduleWeekday, dayOfMonth: null }
        : { frequency: 'MONTHLY', weekday: null, dayOfMonth: row.scheduleDayOfMonth });
      patchRow(vehicle.id, {
        scheduleSaving: false,
        scheduleSaved: true,
        nextDueDate: schedule.nextDueDate,
        message: `Programação salva. Próxima leitura: ${formatDateOnly(schedule.nextDueDate)}.`,
      });
    } catch (error) {
      patchRow(vehicle.id, {
        scheduleSaving: false,
        error: error instanceof Error ? error.message : 'Falha ao salvar a programação de KM.',
      });
    }
  };

  const submitBatch = async () => {
    setGlobalError(null);
    setGlobalMessage(null);

    const entries = [];
    const localErrors: Record<string, string> = {};

    for (const vehicle of sortedVehicles) {
      const row = rows[vehicle.id];
      if (!row?.selected) continue;

      if (row.sourceType === 'TRACKER') {
        if (!row.tracker) {
          localErrors[vehicle.id] = 'Busque e confirme a leitura do rastreador antes de salvar.';
          continue;
        }
        entries.push({ vehicleId: vehicle.id, sourceType: 'TRACKER' as const });
        continue;
      }

      const kmValue = Number(row.kmValue);
      if (!Number.isInteger(kmValue) || kmValue < vehicle.currentKm) {
        localErrors[vehicle.id] = `Informe um KM inteiro igual ou maior que ${vehicle.currentKm.toLocaleString('pt-BR')}.`;
        continue;
      }

      if (row.sourceType === 'DRIVER_PHOTO') {
        if (!row.sourceAttachmentId) {
          localErrors[vehicle.id] = 'Anexe a foto do odômetro antes de salvar.';
          continue;
        }
        entries.push({
          vehicleId: vehicle.id,
          sourceType: 'DRIVER_PHOTO' as const,
          kmValue,
          sourceAttachmentId: row.sourceAttachmentId,
        });
      } else {
        entries.push({ vehicleId: vehicle.id, sourceType: 'MANUAL' as const, kmValue });
      }
    }

    if (entries.length === 0) {
      setGlobalError(selectedCount === 0 ? 'Selecione ao menos um veículo.' : 'Corrija os veículos selecionados antes de salvar.');
      if (Object.keys(localErrors).length) {
        setRows((current) => {
          const next: Record<string, RowDraft> = { ...current };
          for (const [id, error] of Object.entries(localErrors)) {
            if (next[id]) next[id] = { ...next[id], error };
          }
          return next;
        });
      }
      return;
    }

    if (Object.keys(localErrors).length) {
      setRows((current) => {
        const next: Record<string, RowDraft> = { ...current };
        for (const [id, error] of Object.entries(localErrors)) {
          if (next[id]) next[id] = { ...next[id], error };
        }
        return next;
      });
      setGlobalError('Há veículos selecionados com dados pendentes. O lote não foi enviado.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await VehicleKmReadingClient.recordBatch(entries);
      const created = result.filter((item) => item.created).length;
      setGlobalMessage(`Lote concluído: ${created} leitura(s) registrada(s) em ${result.length} veículo(s).`);
      setRows((current) => {
        const next = { ...current };
        for (const item of result) {
          const row = next[item.vehicleId] || rowFromSchedule();
          next[item.vehicleId] = {
            ...row,
            selected: false,
            kmValue: '',
            sourceAttachmentId: undefined,
            tracker: undefined,
            nextDueDate: item.nextDueDate || row.nextDueDate,
            error: undefined,
            message: item.created
              ? `KM atualizado para ${item.currentKm.toLocaleString('pt-BR')} (+${item.distanceKm.toLocaleString('pt-BR')} KM).`
              : 'Leitura idempotente já existente; nenhum lançamento duplicado foi criado.',
          };
        }
        return next;
      });
      await onSuccess();
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Falha ao registrar o lote de quilometragem.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="6xl"
      title="Quilometragem em lote"
      subtitle="Lance o KM de vários veículos, identifique a origem e programe a próxima leitura de cada veículo."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            <strong>{selectedCount}</strong> de <strong>{sortedVehicles.length}</strong> veículo(s) selecionado(s).
            O lote é validado pelo servidor antes de atualizar os odômetros.
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => selectAll(true)} disabled={loading || sortedVehicles.length === 0}>Selecionar todos</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => selectAll(false)} disabled={loading || selectedCount === 0}>Limpar seleção</Button>
          </div>
        </div>

        {globalError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{globalError}</div>}
        {globalMessage && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4"/>{globalMessage}</div>}

        {loading ? (
          <div role="status" className="rounded-xl border p-6 text-center text-sm text-slate-500">Carregando veículos e programações de KM...</div>
        ) : sortedVehicles.length === 0 ? (
          <div className="rounded-xl border p-6 text-center text-sm text-slate-500">Nenhum veículo operacional disponível para lançamento.</div>
        ) : (
          <div className="space-y-3">
            {sortedVehicles.map((vehicle) => {
              const row = rows[vehicle.id] || rowFromSchedule();
              return (
                <div key={vehicle.id} className={`rounded-xl border p-4 ${row.selected ? 'border-blue-300 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/10' : 'border-slate-200 dark:border-slate-800'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="flex min-w-0 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(event) => patchRow(vehicle.id, { selected: event.target.checked, error: undefined })}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-black">{vehicle.plate}</span>
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{vehicle.brand} {vehicle.model}</span>
                        </div>
                        <p className="text-xs text-slate-500">KM atual: <strong>{vehicle.currentKm.toLocaleString('pt-BR')} KM</strong> · próxima leitura: <strong>{formatDateOnly(row.nextDueDate)}</strong></p>
                      </div>
                    </label>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${row.scheduleSaved ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {row.scheduleSaved ? 'Programação ativa' : 'Sem programação salva'}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
                    <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"><Gauge className="h-4 w-4"/>Leitura</div>
                      <Select
                        label="Origem do KM"
                        value={row.sourceType}
                        onChange={(event) => patchRow(vehicle.id, {
                          sourceType: event.target.value as KmReadingSourceType,
                          tracker: undefined,
                          sourceAttachmentId: undefined,
                          error: undefined,
                          message: undefined,
                        })}
                        options={[
                          { value: 'MANUAL', label: 'Lançamento manual' },
                          { value: 'DRIVER_PHOTO', label: 'Foto enviada pelo motorista' },
                          { value: 'TRACKER', label: 'Rastreador / telemetria' },
                        ]}
                      />

                      {row.sourceType !== 'TRACKER' && (
                        <Input
                          label="Novo KM"
                          type="number"
                          min={vehicle.currentKm}
                          step="1"
                          value={row.kmValue}
                          onChange={(event) => patchRow(vehicle.id, { kmValue: event.target.value, error: undefined })}
                          placeholder={String(vehicle.currentKm)}
                        />
                      )}

                      {row.sourceType === 'DRIVER_PHOTO' && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><Camera className="h-4 w-4"/>Foto do odômetro</div>
                          <FileUpload
                            entityType="Vehicle"
                            entityId={vehicle.id}
                            documentType="KM_ODOMETER_PHOTO"
                            allowedTypes={['image/jpeg','image/jpg','image/png','image/webp']}
                            onUploadComplete={(attachment) => patchRow(vehicle.id, {
                              sourceAttachmentId: String(attachment.id),
                              error: undefined,
                              message: 'Foto do odômetro anexada e pronta para o lote.',
                            })}
                          />
                        </div>
                      )}

                      {row.sourceType === 'TRACKER' && (
                        <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void loadTracker(vehicle)}
                            disabled={row.trackerLoading}
                            icon={row.trackerLoading ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Radio className="h-4 w-4"/>}
                          >
                            {row.trackerLoading ? 'Consultando rastreador...' : 'Buscar KM do rastreador'}
                          </Button>
                          {row.tracker && <p className="text-xs text-slate-600 dark:text-slate-300">Leitura confirmada pelo servidor: <strong>{row.tracker.kmValue.toLocaleString('pt-BR')} KM</strong>.</p>}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"><CalendarClock className="h-4 w-4"/>Programação individual</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Select
                          label="Periodicidade"
                          value={row.scheduleFrequency}
                          onChange={(event) => patchRow(vehicle.id, {
                            scheduleFrequency: event.target.value as 'WEEKLY' | 'MONTHLY',
                            scheduleSaved: false,
                            error: undefined,
                          })}
                          options={[
                            { value: 'WEEKLY', label: 'Semanal' },
                            { value: 'MONTHLY', label: 'Mensal' },
                          ]}
                        />
                        {row.scheduleFrequency === 'WEEKLY' ? (
                          <Select
                            label="Dia da semana"
                            value={row.scheduleWeekday}
                            onChange={(event) => patchRow(vehicle.id, { scheduleWeekday: Number(event.target.value), scheduleSaved: false, error: undefined })}
                            options={WEEKDAYS}
                          />
                        ) : (
                          <Input
                            label="Dia do mês"
                            type="number"
                            min="1"
                            max="31"
                            step="1"
                            value={row.scheduleDayOfMonth}
                            onChange={(event) => patchRow(vehicle.id, { scheduleDayOfMonth: Number(event.target.value), scheduleSaved: false, error: undefined })}
                            helperText="Dias 29–31 usam o último dia válido quando necessário."
                          />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">Próxima leitura: <strong>{formatDateOnly(row.nextDueDate)}</strong></p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void saveSchedule(vehicle)}
                          disabled={row.scheduleSaving}
                        >
                          {row.scheduleSaving ? 'Salvando...' : 'Salvar programação'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {row.error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{row.error}</p>}
                  {row.message && !row.error && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/40 dark:text-slate-300">{row.message}</p>}
                </div>
              );
            })}
          </div>
        )}

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white pt-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">KM regressivo, foto incompatível ou rastreador sem odômetro aceito bloqueiam o lote inteiro.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Fechar</Button>
            <Button type="button" onClick={() => void submitBatch()} disabled={submitting || loading || selectedCount === 0}>
              {submitting ? 'Salvando lote...' : `Salvar lote (${selectedCount})`}
            </Button>
          </div>
        </div>
      </div>
    </ModalContainer>
  );
};
