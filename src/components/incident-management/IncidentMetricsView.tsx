import React, { useState, useEffect } from 'react';
import { SREMetrics } from '../../domain/incident-management/types';
import { IncidentMetricsService } from '../../domain/incident-management/IncidentMetricsService';
import {
  BarChart3,
  Clock,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Zap,
} from 'lucide-react';

interface IncidentMetricsViewProps {
  companyId: string;
}

export const IncidentMetricsView: React.FC<IncidentMetricsViewProps> = ({ companyId }) => {
  const [metrics, setMetrics] = useState<SREMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, [companyId]);

  const loadMetrics = async () => {
    setLoading(true);
    const data = await IncidentMetricsService.calculateMetrics(companyId);
    setMetrics(data);
    setLoading(false);
  };

  if (loading || !metrics) {
    return <div className="p-8 text-center text-xs text-slate-500">Calculando métricas SRE...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Painel de Métricas SRE & Indicadores de Produção
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Tempo médio de resposta (MTTD, MTTA, MTTR, MTBF) e conformidade com SLA de incidentes.
          </p>
        </div>
        <button
          onClick={loadMetrics}
          className="p-2 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Primary SRE KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MTTD */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">MTTD (Detecção)</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {metrics.mttdMinutes}
            </span>
            <span className="text-xs text-slate-500 font-medium">minutos</span>
          </div>
          <p className="text-[11px] text-slate-400">Mean Time To Detect</p>
        </div>

        {/* MTTA */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">MTTA (Triagem)</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {metrics.mttaMinutes}
            </span>
            <span className="text-xs text-slate-500 font-medium">minutos</span>
          </div>
          <p className="text-[11px] text-slate-400">Mean Time To Acknowledge</p>
        </div>

        {/* MTTR */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">MTTR (Resolução)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {metrics.mttrMinutes}
            </span>
            <span className="text-xs text-slate-500 font-medium">minutos</span>
          </div>
          <p className="text-[11px] text-slate-400">Mean Time To Resolve</p>
        </div>

        {/* MTBF */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">MTBF (Confiabilidade)</span>
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {metrics.mtbfHours}
            </span>
            <span className="text-xs text-slate-500 font-medium">horas</span>
          </div>
          <p className="text-[11px] text-slate-400">Mean Time Between Failures</p>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SLA & Reliability */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            SLA & Qualidade de Atendimento
          </h3>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Conformidade com SLA de Incidentes</span>
                <span className="font-bold text-slate-900 dark:text-white">{metrics.slaComplianceRate}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    metrics.slaComplianceRate >= 95
                      ? 'bg-emerald-500'
                      : metrics.slaComplianceRate >= 80
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, metrics.slaComplianceRate)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 block">Taxa de Reabertura</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{metrics.reopenRate}%</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 block">Taxa de Escalonamento</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{metrics.escalationRate}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Priority Breakdown */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Distribuição por Prioridade</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-lg">
              <span className="text-xs text-purple-700 dark:text-purple-300 font-bold">P0 — Emergência</span>
              <span className="text-2xl font-black text-purple-900 dark:text-purple-100 block mt-1">{metrics.p0Count}</span>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg">
              <span className="text-xs text-red-700 dark:text-red-300 font-bold">P1 — Crítico</span>
              <span className="text-2xl font-black text-red-900 dark:text-red-100 block mt-1">{metrics.p1Count}</span>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg">
              <span className="text-xs text-amber-700 dark:text-amber-300 font-bold">P2 — Importante</span>
              <span className="text-2xl font-black text-amber-900 dark:text-amber-100 block mt-1">{metrics.p2Count}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg">
              <span className="text-xs text-slate-600 dark:text-slate-400 font-bold">P3 — Baixo</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white block mt-1">{metrics.p3Count}</span>
            </div>
          </div>
        </div>

        {/* Severity Breakdown */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Classificação SEV0–SEV4</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center p-2 rounded bg-slate-50 dark:bg-slate-800/40">
              <span className="font-bold text-purple-700 dark:text-purple-300">SEV0 — Catástrofe / Risco Sistêmico</span>
              <span className="font-bold">{metrics.sev0Count}</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-slate-50 dark:bg-slate-800/40">
              <span className="font-bold text-red-700 dark:text-red-300">SEV1 — Impacto Crítico</span>
              <span className="font-bold">{metrics.sev1Count}</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-slate-50 dark:bg-slate-800/40">
              <span className="font-bold text-amber-700 dark:text-amber-300">SEV2 — Impacto Significativo</span>
              <span className="font-bold">{metrics.sev2Count}</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-slate-50 dark:bg-slate-800/40">
              <span className="font-medium text-slate-700 dark:text-slate-300">SEV3 — Impacto Limitado</span>
              <span className="font-bold">{metrics.sev3Count}</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-slate-50 dark:bg-slate-800/40">
              <span className="font-medium text-slate-500">SEV4 — Baixo Impacto</span>
              <span className="font-bold">{metrics.sev4Count}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
