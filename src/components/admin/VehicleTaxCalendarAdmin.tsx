import React, { useEffect, useState } from 'react';
import { CalendarClock, Zap } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  VehicleTaxCalendarClient,
  VEHICLE_TAX_TYPE_LABELS,
  type VehicleTaxCalendarEntry,
  type VehicleTaxType,
} from '../../api/vehicleTaxCalendarClient';

/**
 * PH-074. Cadastro do calendário de IPVA e licenciamento.
 *
 * As datas são digitadas a partir do calendário oficial da Sefaz. Nenhuma data
 * vem embutida no sistema: o calendário muda todo ano e chutar vencimento de
 * imposto gera multa para o cliente.
 */
export function VehicleTaxCalendarAdmin(): React.ReactElement {
  const currentYear = new Date().getFullYear();
  const [uf, setUf] = useState('SP');
  const [year, setYear] = useState(currentYear);
  const [entries, setEntries] = useState<VehicleTaxCalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [digit, setDigit] = useState('0');
  const [taxType, setTaxType] = useState<VehicleTaxType>('IPVA_COTA_UNICA');
  const [installment, setInstallment] = useState('1');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await VehicleTaxCalendarClient.list({ uf, referenceYear: year }));
    } catch {
      setMessage('Não foi possível carregar o calendário.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uf, year]);

  const aplicarPresetSp = async () => {
    setMessage(null);
    setApplyingPreset(true);
    try {
      const res = await VehicleTaxCalendarClient.applyOfficialSpPreset(year, 'SP');
      setMessage(`Calendário oficial de SP para ${year} aplicado com sucesso! (${res.appliedCount} vencimentos configurados para todos os dígitos)`);
      if (uf !== 'SP') setUf('SP');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível aplicar o calendário oficial de SP.');
    } finally {
      setApplyingPreset(false);
    }
  };

  const salvar = async () => {
    setMessage(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { setMessage('Informe a data de vencimento.'); return; }
    try {
      await VehicleTaxCalendarClient.upsert({
        uf: uf.toUpperCase(),
        referenceYear: year,
        plateLastDigit: Number(digit),
        taxType,
        installment: taxType === 'IPVA_PARCELADO' ? Number(installment) : 1,
        dueDate,
        notes: notes.trim() ? notes.trim() : null,
      });
      setDueDate('');
      setNotes('');
      setMessage('Vencimento salvo.');
      await load();
    } catch {
      setMessage('Não foi possível salvar. Confira os dados e tente de novo.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-action-primary" />
          <div>
            <h3 className="text-sm font-bold">Calendário de IPVA e Licenciamento</h3>
            <p className="text-[11px] text-graphite-500">
              Digite as datas do calendário oficial da Sefaz ou aplique a tabela oficial de SP por final de placa.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => { void aplicarPresetSp(); }}
          disabled={applyingPreset || loading}
          className="flex items-center gap-1.5"
        >
          <Zap className="w-3.5 h-3.5 text-warning-text" />
          {applyingPreset ? 'Aplicando Tabela SP...' : `Aplicar Tabela Oficial SP (${year})`}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <Input label="UF" value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} />
        <Input label="Ano" type="number" value={String(year)} onChange={(e) => setYear(Number(e.target.value) || currentYear)} />
        <Select label="Final da placa" value={digit} onChange={(e) => setDigit(e.target.value)}
          options={Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: String(i) }))} />
        <Select label="Tipo" value={taxType} onChange={(e) => setTaxType(e.target.value as VehicleTaxType)}
          options={(Object.keys(VEHICLE_TAX_TYPE_LABELS) as VehicleTaxType[]).map((key) => ({ value: key, label: VEHICLE_TAX_TYPE_LABELS[key] }))} />
        <Input label="Parcela" type="number" value={installment} disabled={taxType !== 'IPVA_PARCELADO'}
          onChange={(e) => setInstallment(e.target.value)} />
        <Input label="Vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <Input label="Observação (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button type="button" variant="primary" onClick={() => { void salvar(); }}>Salvar vencimento</Button>
      </div>
      {message && <p className="text-xs text-graphite-600 dark:text-graphite-300">{message}</p>}

      <div className="border rounded-xl p-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-graphite-600 dark:text-graphite-300 mb-2">
          {uf} • {year} — {entries.length} vencimento(s)
        </h4>
        {loading ? (
          <p className="text-xs text-graphite-500">Carregando...</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-graphite-500">Nada cadastrado ainda para {uf} em {year}.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 text-xs border-b border-graphite-100 dark:border-graphite-800 pb-1">
                <span>
                  Final <strong>{entry.plateLastDigit}</strong> • {VEHICLE_TAX_TYPE_LABELS[entry.taxType]}
                  {entry.taxType === 'IPVA_PARCELADO' ? ` (${entry.installment}ª)` : ''}
                </span>
                <span className="font-mono">{new Date(`${entry.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
