import React from 'react';
import { Input } from '../ui';
import { installmentCompetences, type InstallmentCompetenceMode } from '../../shared/utils/installmentCompetence';

interface Props {
  count: number; baseDate: string; mode: InstallmentCompetenceMode;
  dates: string[]; onMode: (mode: InstallmentCompetenceMode) => void; onDates: (dates: string[]) => void;
}
export function InstallmentCompetenceFields({ count, baseDate, mode, dates, onMode, onDates }: Props) {
  let proposed: string[] = [];
  if (baseDate && count > 0 && count <= 120) {
    try { proposed = installmentCompetences({ competenceDate: baseDate, competenceMode: mode }, Array(count).fill(baseDate)); } catch { /* parent validates dates */ }
  }
  const effective = proposed.map((date, index) => dates[index] || date);
  return <fieldset className="space-y-2">
    <label className="block text-sm">Competência da operação
      <select className="mt-1 w-full rounded-lg border p-2 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100" value={mode} onChange={event => { onMode(event.target.value as InstallmentCompetenceMode); onDates([]); }}>
        <option value="SINGLE_EVENT">Operação única parcelada — mesma competência</option>
        <option value="PER_INSTALLMENT">Competência por parcela — informar cada período</option>
      </select>
    </label>
    <p className="text-xs text-slate-500">Parcelamento divide o valor total. Recorrência mensal gera uma nova obrigação pelo serviço de recorrências existente.</p>
    {mode === 'PER_INSTALLMENT' && effective.map((date, index) => <Input key={index} label={`Competência da parcela ${index + 1}/${count}`} type="date" required value={date} onChange={event => { const next = [...effective]; next[index] = event.target.value; onDates(next); }} />)}
  </fieldset>;
}
