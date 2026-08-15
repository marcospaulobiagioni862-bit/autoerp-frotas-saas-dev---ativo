import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, ShieldCheck, Clock, CheckCircle2, AlertTriangle, XCircle, 
  Users, BarChart3, Layers, Filter, RefreshCw, AlertCircle, Award, Activity
} from 'lucide-react';
import { Card, Button, Badge, Input, Select } from '../ui';
import { OperationalProductivityService } from '../../domain/productivity/OperationalProductivityService';

interface OperationalProductivityViewProps {
  companyId?: string;
  tasks?: any[];
  incidents?: any[];
  pendings?: any[];
}

export const OperationalProductivityView: React.FC<OperationalProductivityViewProps> = ({
  companyId = 'company-main-uuid',
  tasks = [],
  incidents = [],
  pendings = [],
}) => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

  const metrics = useMemo(() => {
    return OperationalProductivityService.calculateMetrics({
      companyId,
      tasks,
      incidents,
      pendings,
    });
  }, [companyId, tasks, incidents, pendings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm mb-1">
            <TrendingUp className="w-5 h-5" />
            <span>FASE 3.42 — PAINEL DE PRODUTIVIDADE, SLA E DESEMPENHO OPERACIONAL</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Produtividade & Conformidade de SLA</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Indicadores gerenciais de tempo de resolução, taxa de conclusão, gargalos operacionais e desempenho por responsável.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={timeRange}
            onChange={(e: any) => setTimeRange(e.target.value)}
            options={[
              { value: '7d', label: 'Últimos 7 dias' },
              { value: '30d', label: 'Últimos 30 dias' },
              { value: 'all', label: 'Todo o Período' },
            ]}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-l-4 border-l-indigo-500 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Taxa de Conclusão</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{metrics.tasks.completionRate}%</p>
            </div>
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/80 rounded-xl text-indigo-600 dark:text-indigo-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span>{metrics.tasks.completed} de {metrics.tasks.total} tarefas concluídas</span>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-emerald-500 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Conformidade de SLA</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">{metrics.sla.complianceRate}%</p>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/80 rounded-xl text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span>{metrics.sla.compliant} prazos cumpridos ({metrics.sla.violated} violados)</span>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-amber-500 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tempo Médio Resolução</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">{metrics.resolution.averageResolutionHours}h</p>
            </div>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/80 rounded-xl text-amber-600 dark:text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span>Mín: {metrics.resolution.minResolutionHours}h • Máx: {metrics.resolution.maxResolutionHours}h</span>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-rose-500 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tarefas Atrasadas / P0</p>
              <p className="text-3xl font-bold text-rose-600 mt-1">{metrics.tasks.overdue}</p>
            </div>
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/80 rounded-xl text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span>{metrics.sla.p0Violated} violações P0 críticas</span>
          </div>
        </Card>
      </div>

      {/* Bottlenecks & Assignees Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bottlenecks Panel */}
        <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
          <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-500" /> Gargalos & Alertas Operacionais
            </h2>
            <Badge className="bg-rose-50 text-rose-700">{metrics.bottlenecks.length} Identificados</Badge>
          </div>
          <div className="space-y-3">
            {metrics.bottlenecks.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Nenhum gargalo crítico identificado no momento.</p>
            ) : (
              metrics.bottlenecks.map((b, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-rose-100 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/40 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-rose-900 dark:text-rose-200 text-sm">{b.category}</span>
                    <Badge className={b.severity === 'HIGH' ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'}>
                      {b.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-rose-700 dark:text-rose-300">{b.description}</p>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Assignees Performance */}
        <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
          <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" /> Desempenho por Responsável
            </h2>
            <span className="text-xs text-slate-500">{metrics.assignees.length} responsáveis</span>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {metrics.assignees.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Nenhum responsável registrado.</p>
            ) : (
              metrics.assignees.map((a, idx) => (
                <div key={idx} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.completedCount} concluídas de {a.assignedCount} atribuídas</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono">{a.complianceRate}%</span>
                    <p className="text-[10px] text-rose-600">{a.overdueCount} atrasadas</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Financial Boundary Notice */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <Activity className="w-5 h-5 text-indigo-600 shrink-0" />
        <p className="text-xs text-slate-600 dark:text-slate-400">
          <strong>Segurança e Isolamento Financeiro:</strong> Este painel atua estritamente em modo de leitura sobre as entidades operacionais, preservando 100% o núcleo financeiro congelado do AutoERP.
        </p>
      </div>
    </div>
  );
};
