import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarRange, TrendingDown, TrendingUp } from 'lucide-react';
import { FinanceReportingClient } from '../../api/financeReportingClient';
import { CashFlowReport } from '../../types/reports';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import { formatDateBR } from '../../shared/utils/date';
import { Card, Skeleton } from '../ui';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: isoDate(start), end: isoDate(end) };
}

function rollingRange(days: number): { start: string; end: string } {
  const start = new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Math.max(0, days - 1));
  return { start: isoDate(start), end: isoDate(end) };
}

export const CashFlowView: React.FC = () => {
  const defaults = useMemo(currentMonthRange, []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const applyPreset = (preset: 'MONTH' | 30 | 60 | 90) => {
    const next = preset === 'MONTH' ? currentMonthRange() : rollingRange(preset);
    setStartDate(next.start);
    setEndDate(next.end);
  };

  const projectedReceivable = report?.dailyFlows.reduce((sum, item) => sum + item.predictedIncomes, 0) ?? 0;
  const projectedPayable = report?.dailyFlows.reduce((sum, item) => sum + item.predictedExpenses, 0) ?? 0;
  const projectedClosing = report?.dailyFlows.length
    ? report.dailyFlows[report.dailyFlows.length - 1].predictedClosingBalance
    : report?.finalRealizedCashBalance ?? 0;

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!startDate || !endDate || startDate > endDate) {
        setReport(null);
        setError('Informe um período válido.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const next = await FinanceReportingClient.getCashFlow(startDate, endDate);
        if (active) setReport(next);
      } catch (err) {
        if (active) {
          console.error('Erro ao carregar Fluxo de Caixa:', err);
          setReport(null);
          setError('Não foi possível carregar o Fluxo de Caixa autoritativo.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Banknote className="w-6 h-6 text-blue-600" />
            Fluxo de Caixa
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Caixa realizado e projeções de Contas a Receber/Pagar com dados autoritativos do PostgreSQL.
          </p>
        </div>

        <Card padding="sm">
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => applyPreset('MONTH')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Mês atual</button>
            <button type="button" onClick={() => applyPreset(30)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">30 dias</button>
            <button type="button" onClick={() => applyPreset(60)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">60 dias</button>
            <button type="button" onClick={() => applyPreset(90)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">90 dias</button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-slate-500">Personalizado</span>
            <CalendarRange className="w-4 h-4 text-slate-400" />
            <label className="text-slate-500">De</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="text-slate-500">até</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : error ? (
        <Card padding="md" className="border border-red-200 dark:border-red-900/60">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      ) : report ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card padding="md">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Saldo inicial</span>
              <strong className="block mt-1 text-xl font-mono text-slate-900 dark:text-slate-100">
                {formatCurrencyBRL(report.initialCashBalance)}
              </strong>
            </Card>
            <Card padding="md">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-600">Entradas realizadas</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <strong className={`block mt-1 text-xl font-mono ${report.totalRealizedIncomes === 0 ? 'text-slate-700 dark:text-slate-300' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {formatCurrencyBRL(report.totalRealizedIncomes)}
              </strong>
            </Card>
            <Card padding="md">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-red-600">Saídas realizadas</span>
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
              <strong className={`block mt-1 text-xl font-mono ${report.totalRealizedExpenses === 0 ? 'text-slate-700 dark:text-slate-300' : 'text-red-700 dark:text-red-400'}`}>
                {formatCurrencyBRL(report.totalRealizedExpenses)}
              </strong>
            </Card>
            <Card padding="md">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-blue-600">Saldo realizado final</span>
              <strong className="block mt-1 text-xl font-mono text-blue-700 dark:text-blue-300">
                {formatCurrencyBRL(report.finalRealizedCashBalance)}
              </strong>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card padding="sm">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">A receber no período</span>
              <strong className={`mt-1 block font-mono text-lg ${projectedReceivable === 0 ? 'text-slate-700 dark:text-slate-300' : 'text-emerald-700 dark:text-emerald-400'}`}>{formatCurrencyBRL(projectedReceivable)}</strong>
            </Card>
            <Card padding="sm">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">A pagar no período</span>
              <strong className={`mt-1 block font-mono text-lg ${projectedPayable === 0 ? 'text-slate-700 dark:text-slate-300' : 'text-red-700 dark:text-red-400'}`}>{formatCurrencyBRL(projectedPayable)}</strong>
            </Card>
            <Card padding="sm">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-blue-600">Saldo projetado</span>
              <strong className="mt-1 block font-mono text-lg text-blue-700 dark:text-blue-300">{formatCurrencyBRL(projectedClosing)}</strong>
            </Card>
            <Card padding="sm">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Resultado projetado</span>
              <strong className="mt-1 block font-mono text-lg text-slate-900 dark:text-slate-100">{formatCurrencyBRL(projectedReceivable - projectedPayable)}</strong>
            </Card>
          </div>

          <Card padding="md" className="overflow-hidden">
            <div className="flex items-center justify-between mb-4 gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Movimento diário e projeção</h3>
                <p className="text-xs text-slate-500">Transferências internas não inflam entradas/saídas consolidadas.</p>
              </div>
              <span className="text-xs font-mono text-slate-500 shrink-0">{formatDateBR(report.periodStart)} a {formatDateBR(report.periodEnd)}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="text-left py-2 pr-3">Data</th>
                    <th className="text-right py-2 px-3">Abertura</th>
                    <th className="text-right py-2 px-3">Entradas</th>
                    <th className="text-right py-2 px-3">Saídas</th>
                    <th className="text-right py-2 px-3">Fechamento</th>
                    <th className="text-right py-2 px-3">A receber</th>
                    <th className="text-right py-2 px-3">A pagar</th>
                    <th className="text-right py-2 pl-3">Projetado</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dailyFlows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">Sem movimentos ou títulos previstos no período.</td>
                    </tr>
                  ) : report.dailyFlows.map((daily) => {
                    const overdueProjection = daily.date < new Date().toISOString().slice(0, 10) && (daily.predictedIncomes > 0 || daily.predictedExpenses > 0);
                    return (
                    <tr key={daily.date} className="border-b border-slate-100 dark:border-slate-800/70 last:border-0">
                      <td className="py-2.5 pr-3 font-mono text-slate-700 dark:text-slate-300">{formatDateBR(daily.date)}{overdueProjection && <span className="ml-2 text-[10px] font-semibold text-rose-600">Vencidos</span>}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatCurrencyBRL(daily.openingBalance)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${daily.realizedIncomes === 0 ? 'text-slate-500' : 'text-emerald-600'}`}>{formatCurrencyBRL(daily.realizedIncomes)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${daily.realizedExpenses === 0 ? 'text-slate-500' : 'text-red-600'}`}>{formatCurrencyBRL(daily.realizedExpenses)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">{formatCurrencyBRL(daily.closingBalance)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${daily.predictedIncomes === 0 ? 'text-slate-500' : 'text-emerald-600/80'}`}>{formatCurrencyBRL(daily.predictedIncomes)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${daily.predictedExpenses === 0 ? 'text-slate-500' : 'text-red-600/80'}`}>{formatCurrencyBRL(daily.predictedExpenses)}</td>
                      <td className="py-2.5 pl-3 text-right font-mono font-bold text-blue-700 dark:text-blue-300">{formatCurrencyBRL(daily.predictedClosingBalance)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
};
