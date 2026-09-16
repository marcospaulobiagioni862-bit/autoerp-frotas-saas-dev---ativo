import React, { useState, useMemo } from 'react';
import { 
  Target, ShieldCheck, AlertTriangle, CheckCircle2, TrendingUp, Filter, 
  BarChart3, AlertCircle, Award, Activity, RefreshCw 
} from 'lucide-react';
import { Card, Button, Badge, Input, Select } from '../ui';
import { ManagementGoalsService } from '../../domain/goals/ManagementGoalsService';

interface ManagementGoalsViewProps {
  companyId?: string;
  tasks?: any[];
  incidents?: any[];
  pendings?: any[];
}

export const ManagementGoalsView: React.FC<ManagementGoalsViewProps> = ({
  companyId = 'company-main-uuid',
  tasks = [],
  incidents = [],
  pendings = [],
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const evaluation = useMemo(() => {
    return ManagementGoalsService.evaluateGoals({
      companyId,
      tasks,
      incidents,
      pendings,
    });
  }, [companyId, tasks, incidents, pendings]);

  const filteredGoals = useMemo(() => {
    if (filterStatus === 'ALL') return evaluation.goals;
    return evaluation.goals.filter(g => g.status === filterStatus);
  }, [evaluation.goals, filterStatus]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm mb-1">
            <Target className="w-5 h-5" />
            <span>FASE 3.43 — METAS, INDICADORES E ALERTAS GERENCIAIS</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Central de Metas & Alertas Gerenciais</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Acompanhamento em tempo real de metas operacionais, desvios, tendências e alertas preventivos P0-P3.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={filterStatus}
            onChange={(e: any) => setFilterStatus(e.target.value)}
            options={[
              { value: 'ALL', label: 'Todas as Metas' },
              { value: 'ACHIEVED', label: 'Atingidas' },
              { value: 'WARNING', label: 'Em Alerta (Warning)' },
              { value: 'CRITICAL', label: 'Críticas' },
            ]}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-l-4 border-l-indigo-500 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total de Metas</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{evaluation.goalsSummary.total}</p>
            </div>
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/80 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Target className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            <span>Monitoramento operacional ativo</span>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-emerald-500 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Metas Atingidas</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">{evaluation.goalsSummary.achieved}</p>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/80 rounded-xl text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            <span>Desempenho dentro do esperado</span>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-amber-500 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Metas em Alerta</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">{evaluation.goalsSummary.warning}</p>
            </div>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/80 rounded-xl text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            <span>Requer atenção preventiva</span>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-rose-500 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Metas Críticas</p>
              <p className="text-3xl font-bold text-rose-600 mt-1">{evaluation.goalsSummary.critical}</p>
            </div>
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/80 rounded-xl text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            <span>Violando limites críticos (P0)</span>
          </div>
        </Card>
      </div>

      {/* Main Content Grid: Goals List & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Goals List (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" /> Acompanhamento de Metas
              </h2>
              <span className="text-xs text-slate-500">{filteredGoals.length} metas exibidas</span>
            </div>
            <div className="space-y-3">
              {filteredGoals.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Nenhuma meta encontrada para o filtro selecionado.</p>
              ) : (
                filteredGoals.map((g) => (
                  <div key={g.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 transition-all space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm">{g.name}</span>
                          <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px]">{g.category}</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{g.description}</p>
                      </div>
                      <Badge className={
                        g.status === 'ACHIEVED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' :
                        g.status === 'WARNING' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300' :
                        'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                      }>
                        {g.status === 'ACHIEVED' ? 'Atingida' : g.status === 'WARNING' ? 'Atenção' : 'Crítica'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                      <div>
                        <span className="text-slate-400 block">Meta Alvo</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{g.targetValue}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Realizado</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{g.realizedValue}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Atingimento</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{g.achievementPercentage}%</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Managerial Alerts (1 Col) */}
        <div className="space-y-4">
          <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" /> Alertas Gerenciais
              </h2>
              <Badge className="bg-rose-50 text-rose-700">{evaluation.alerts.length} Ativos</Badge>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {evaluation.alerts.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Nenhum alerta gerencial ativo no momento.</p>
              ) : (
                evaluation.alerts.map((alert) => (
                  <div key={alert.id} className="p-3 rounded-xl border border-rose-100 bg-rose-50/40 dark:bg-rose-950/20 dark:border-rose-900/40 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-900 dark:text-rose-200 text-xs">{alert.title}</span>
                      <Badge className={alert.severity === 'P0' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-rose-700 dark:text-rose-300">{alert.message}</p>
                    <p className="text-[10px] text-slate-500 italic mt-1">Ação: {alert.recommendedAction}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Financial Boundary Notice */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <Activity className="w-5 h-5 text-indigo-600 shrink-0" />
        <p className="text-xs text-slate-600 dark:text-slate-400">
          <strong>Segurança e Isolamento Financeiro:</strong> A Central de Metas e Alertas opera estritamente em modo de leitura sobre os indicadores operacionais, preservando 100% o núcleo financeiro congelado do AutoERP.
        </p>
      </div>
    </div>
  );
};
