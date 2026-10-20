import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  VehicleTaxCalendarClient,
  VEHICLE_TAX_TYPE_LABELS,
  type VehicleTaxSchedule,
} from '../../api/vehicleTaxCalendarClient';

interface Props {
  plate: string;
  uf: string;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR');
}

/**
 * PH-074. Vencimentos de IPVA e licenciamento do veículo, pelo último dígito da placa.
 *
 * O painel só mostra o que foi CADASTRADO no calendário do ano. Quando não há
 * calendário, ele diz isso em vez de inventar data — vencimento de imposto errado
 * vira multa, e um campo vazio é honesto enquanto uma data chutada não é.
 */
export function VehicleTaxCalendarPanel({ plate, uf }: Props): React.ReactElement {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [schedule, setSchedule] = useState<VehicleTaxSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    VehicleTaxCalendarClient.forVehicle(plate, uf, year)
      .then((result) => { if (!cancelled) setSchedule(result); })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar o calendário agora.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [plate, uf, year]);

  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (loading) return <p className="text-xs text-graphite-500">Carregando calendário...</p>;
  if (error) return <p className="text-xs text-error-text">{error}</p>;

  if (!uf) {
    return (
      <p className="text-xs text-graphite-500">
        Informe a <strong>UF de emplacamento</strong> no cadastro do veículo para ver os vencimentos.
      </p>
    );
  }

  if (schedule && schedule.plateLastDigit === null) {
    return (
      <p className="text-xs text-graphite-500">
        A placa <strong>{plate}</strong> não tem dígito numérico, então não dá para classificá-la no calendário.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-graphite-600 dark:text-graphite-300">
          <CalendarClock className="w-4 h-4" />
          <span>
            Final de placa <strong>{schedule?.plateLastDigit}</strong> • {uf}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {[currentYear - 1, currentYear, currentYear + 1].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setYear(option)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium ${option === year ? 'bg-action-primary text-on-action-primary' : 'border border-graphite-200 text-graphite-600 dark:border-graphite-800'}`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {schedule && schedule.entries.length === 0 ? (
        <div className="rounded-lg border border-warning-border bg-warning-bg p-3 text-xs text-warning-text">
          Nenhum calendário cadastrado para {uf} em {year}. Cadastre as datas oficiais da Sefaz em
          <strong> Administração → Calendário de IPVA e Licenciamento</strong> e os vencimentos aparecem aqui
          automaticamente para todos os veículos.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {schedule?.entries.map((entry) => {
            const vencido = entry.dueDate < hoje;
            return (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-graphite-200 dark:border-graphite-800 p-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-graphite-800 dark:text-graphite-200">
                    {VEHICLE_TAX_TYPE_LABELS[entry.taxType]}
                    {entry.taxType === 'IPVA_PARCELADO' ? ` — ${entry.installment}ª parcela` : ''}
                  </p>
                  {entry.notes && <p className="text-[11px] text-graphite-500 truncate">{entry.notes}</p>}
                </div>
                <span
                  className={`flex items-center gap-1 text-[11px] font-mono whitespace-nowrap ${vencido ? 'text-error-text' : 'text-success-icon'}`}
                >
                  {vencido ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {formatDate(entry.dueDate)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
