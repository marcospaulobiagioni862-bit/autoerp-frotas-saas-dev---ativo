import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange } from 'lucide-react';
import { FinanceOverdueClient, type AgingObligationType, type AgingReportView, type DelinquentReceivableView } from '../../api/financeOverdueClient';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import { Card, Skeleton } from '../ui';

function localToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const emptyAging: AgingReportView = {
  aVencer: 0, oneToSeven: 0, eightToFifteen: 0, sixteenToThirty: 0,
  thirtyOneToSixty: 0, sixtyOneToNinety: 0, overNinety: 0,
};

export const DelinquencyView: React.FC = () => {
  const [processingDate, setProcessingDate] = useState(localToday());
  const [agingType, setAgingType] = useState<AgingObligationType>('RECEIVABLE');
  const [items, setItems] = useState<DelinquentReceivableView[]>([]);
  const [aging, setAging] = useState<AgingReportView>(emptyAging);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const [delinquency, agingReport] = await Promise.all([
          FinanceOverdueClient.getDelinquency(processingDate),
          FinanceOverdueClient.getAging(agingType, processingDate),
        ]);
        if (active) { setItems(delinquency); setAging(agingReport); }
      } catch (err) {
        if (active) {
          setItems([]); setAging(emptyAging);
          setError(err instanceof Error ? err.message : 'Não foi possível carregar a inadimplência autoritativa.');
        }
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [processingDate, agingType]);

  const totals = useMemo(() => items.reduce((acc, item) => ({
    outstanding: acc.outstanding + item.updatedOutstandingAmount,
    original: acc.original + item.originalAmount,
    received: acc.received + item.receivedAmount,
    charges: acc.charges + item.lateFee + item.interest,
  }), { outstanding: 0, original: 0, received: 0, charges: 0 }), [items]);

  const buckets = [
    ['A vencer', aging.aVencer], ['1–7 dias', aging.oneToSeven], ['8–15 dias', aging.eightToFifteen],
    ['16–30 dias', aging.sixteenToThirty], ['31–60 dias', aging.thirtyOneToSixty],
    ['61–90 dias', aging.sixtyOneToNinety], ['90+ dias', aging.overNinety],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
            <AlertTriangle className="h-5 w-5 text-red-600" /> Inadimplência
          </h2>
          <p className="mt-1 text-xs text-slate-500">Visão somente leitura baseada nos read-models financeiros autoritativos do PostgreSQL.</p>
        </div>
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <CalendarRange className="h-4 w-4 text-slate-400" />
            <label className="text-slate-500">Data de referência</label>
            <input type="date" value={processingDate} onChange={(e) => setProcessingDate(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-900" />
            <select value={agingType} onChange={(e) => setAgingType(e.target.value as AgingObligationType)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
              <option value="RECEIVABLE">Aging — Contas a Receber</option>
              <option value="PAYABLE">Aging — Contas a Pagar</option>
            </select>
          </div>
        </Card>
      </div>

      {error && <Card padding="md" className="border border-red-200 dark:border-red-900/60"><p className="text-sm text-red-600 dark:text-red-400">{error}</p></Card>}

      {loading ? <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></div> : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card padding="md"><span className="text-[11px] font-semibold uppercase text-slate-500">Recebíveis vencidos</span><strong className="mt-1 block text-xl font-mono">{items.length}</strong></Card>
            <Card padding="md"><span className="text-[11px] font-semibold uppercase text-red-600">Saldo inadimplente</span><strong className="mt-1 block text-xl font-mono text-red-700 dark:text-red-400">{formatCurrencyBRL(totals.outstanding)}</strong></Card>
            <Card padding="md"><span className="text-[11px] font-semibold uppercase text-slate-500">Já recebido</span><strong className="mt-1 block text-xl font-mono">{formatCurrencyBRL(totals.received)}</strong></Card>
            <Card padding="md"><span className="text-[11px] font-semibold uppercase text-amber-600">Multa + juros</span><strong className="mt-1 block text-xl font-mono text-amber-700 dark:text-amber-400">{formatCurrencyBRL(totals.charges)}</strong></Card>
          </div>

          <Card padding="md">
            <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Aging autoritativo — {agingType === 'RECEIVABLE' ? 'Contas a Receber' : 'Contas a Pagar'}</h3><span className="text-xs font-mono text-slate-500">{processingDate}</span></div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{buckets.map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><span className="block text-[10px] font-bold uppercase text-slate-500">{label}</span><strong className="mt-1 block font-mono text-sm">{formatCurrencyBRL(value)}</strong></div>)}</div>
          </Card>

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/60"><tr><th className="p-3 text-left">Vencimento</th><th className="p-3 text-left">Origem / vínculos</th><th className="p-3 text-right">Original</th><th className="p-3 text-right">Recebido</th><th className="p-3 text-right">Multa</th><th className="p-3 text-right">Juros</th><th className="p-3 text-right">Saldo</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{items.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">Nenhum recebível inadimplente na data selecionada.</td></tr> : items.map((item) => <tr key={item.receivableId}><td className="p-3 font-mono">{item.dueDate}<span className="ml-2 font-bold text-red-600">{item.daysOverdue}d</span></td><td className="p-3"><div className="font-semibold">{item.originType} · {item.originId}</div><div className="text-[10px] text-slate-400">Motorista: {item.driverId || '—'} · Veículo: {item.vehicleId || '—'} · Contrato: {item.contractId || '—'}</div></td><td className="p-3 text-right font-mono">{formatCurrencyBRL(item.originalAmount)}</td><td className="p-3 text-right font-mono">{formatCurrencyBRL(item.receivedAmount)}</td><td className="p-3 text-right font-mono">{formatCurrencyBRL(item.lateFee)}</td><td className="p-3 text-right font-mono">{formatCurrencyBRL(item.interest)}</td><td className="p-3 text-right font-mono font-bold text-red-700 dark:text-red-400">{formatCurrencyBRL(item.updatedOutstandingAmount)}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
