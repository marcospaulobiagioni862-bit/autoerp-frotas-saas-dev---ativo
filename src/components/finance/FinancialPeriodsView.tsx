import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, LockKeyhole, RefreshCw, UnlockKeyhole } from 'lucide-react';
import { FinancePeriodApiError, FinancePeriodClient } from '../../api/financePeriodClient';
import { FinancialPeriod } from '../../types/entities';
import { FinancialPeriodStatus } from '../../types/enums';
import { useAuth } from '../../hooks/useAuth';

function initialMonthRange(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthText = String(month + 1).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatTimestamp(value?: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR');
}

export const FinancialPeriodsView: React.FC = () => {
  const { user } = useAuth();
  const initialRange = useMemo(initialMonthRange, []);
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reopenPeriodId, setReopenPeriodId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const role = String(user?.role || '').toUpperCase();
  const canClose = role === 'ADMIN' || role === 'MANAGER' || role === 'FINANCIAL_MANAGER';
  const canReopen = role === 'ADMIN';

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPeriods(await FinancePeriodClient.list());
    } catch (err) {
      const text = err instanceof FinancePeriodApiError ? err.message : 'Não foi possível carregar os períodos financeiros.';
      setError(text);
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods, user?.companyId]);

  const closePeriod = async () => {
    setError('');
    setMessage('');
    if (!startDate || !endDate || startDate > endDate) {
      setError('Informe um intervalo de datas válido para o fechamento.');
      return;
    }

    setSubmitting(true);
    try {
      const period = await FinancePeriodClient.close(startDate, endDate);
      setMessage(`Período ${period.startDate} a ${period.endDate} fechado com sucesso.`);
      await loadPeriods();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao fechar o período financeiro.');
    } finally {
      setSubmitting(false);
    }
  };

  const reopenPeriod = async (periodId: string) => {
    const reason = reopenReason.trim();
    setError('');
    setMessage('');
    if (!reason) {
      setError('Informe o motivo da reabertura.');
      return;
    }

    setSubmitting(true);
    try {
      const period = await FinancePeriodClient.reopen(periodId, reason);
      setMessage(`Período ${period.startDate} a ${period.endDate} reaberto com sucesso.`);
      setReopenPeriodId(null);
      setReopenReason('');
      await loadPeriods();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao reabrir o período financeiro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
            <CalendarRange className="h-5 w-5 text-blue-600" />
            Períodos Financeiros
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            Feche competências para impedir movimentações retroativas. Reaberturas exigem autorização administrativa e motivo auditável.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPeriods()}
          disabled={loading || submitting}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {(error || message) && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium ${
            error
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <LockKeyhole className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Fechar período</h3>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Data inicial</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={!canClose || submitting}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Data final</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={!canClose || submitting}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={() => void closePeriod()}
            disabled={!canClose || submitting}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LockKeyhole className="h-4 w-4" />
            Fechar período
          </button>
        </div>

        {!canClose && (
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <AlertTriangle className="h-4 w-4" />
            Seu perfil possui acesso somente à consulta de períodos financeiros.
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Histórico de períodos</h3>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">Carregando períodos...</div>
        ) : periods.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">Nenhum período financeiro cadastrado.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {periods.map((period) => {
              const closed = period.status === FinancialPeriodStatus.CLOSED;
              const reopening = reopenPeriodId === period.id;
              return (
                <div key={period.id} className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                          {period.startDate} → {period.endDate}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                            closed
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          }`}
                        >
                          {closed ? 'Fechado' : 'Aberto'}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] text-slate-500 sm:grid-cols-2">
                        <span>Fechado em: {formatTimestamp(period.closedAt)}</span>
                        <span>Responsável: {period.closedBy || '—'}</span>
                        <span>Reaberto em: {formatTimestamp(period.reopenedAt)}</span>
                        <span>Motivo: {period.reopenReason || '—'}</span>
                      </div>
                    </div>

                    {closed && canReopen && !reopening && (
                      <button
                        type="button"
                        onClick={() => {
                          setReopenPeriodId(period.id);
                          setReopenReason('');
                          setError('');
                          setMessage('');
                        }}
                        disabled={submitting}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
                      >
                        <UnlockKeyhole className="h-4 w-4" />
                        Reabrir
                      </button>
                    )}
                  </div>

                  {reopening && (
                    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
                      <label className="block space-y-1">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Motivo obrigatório da reabertura</span>
                        <textarea
                          value={reopenReason}
                          onChange={(event) => setReopenReason(event.target.value)}
                          maxLength={1000}
                          rows={3}
                          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          placeholder="Descreva por que este período precisa ser reaberto..."
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReopenPeriodId(null);
                            setReopenReason('');
                          }}
                          disabled={submitting}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void reopenPeriod(period.id)}
                          disabled={submitting || !reopenReason.trim()}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <UnlockKeyhole className="h-4 w-4" />
                          Confirmar reabertura
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
