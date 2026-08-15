import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, TrendingUp, BarChart3, 
  AlertCircle, Award, Activity, RefreshCw, Car, FileText, Wrench, 
  BellRing, ArrowRight, Zap, Target
} from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import { ExecutiveManagementService } from '../../domain/executive/ExecutiveManagementService';

interface ExecutiveDashboardViewProps {
  companyId?: string;
  tasks?: any[];
  incidents?: any[];
  pendings?: any[];
  onNavigate?: (tab: string) => void;
}

export const ExecutiveDashboardView: React.FC<ExecutiveDashboardViewProps> = ({
  companyId = 'company-main-uuid',
  tasks = [],
  incidents = [],
  pendings = [],
  onNavigate = (_tab: string) => {},
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30d');

  const report = useMemo(() => {
    return ExecutiveManagementService.generateExecutiveReport({
      companyId,
      tasks,
      incidents,
      pendings,
    });
  }, [companyId, tasks, incidents, pendings]);

  const healthScoreColor = 
    report.healthScore.classification === 'EXCELLENT' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200' :
    report.healthScore.classification === 'GOOD' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200' :
    report.healthScore.classification === 'WARNING' ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200' :
    'text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm mb-1">
            <Zap className="w-5 h-5" />
            <span>FASE 3.44 — CENTRO EXECUTIVO DE GESTÃO E DECISÃO</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard Executivo</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Visão consolidada da saúde operacional, riscos críticos e decisões recomendadas em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant={selectedPeriod === '7d' ? 'primary' : 'outline'} 
            size="sm"
            onClick={() => setSelectedPeriod('7d')}
          >
            7 Dias
          </Button>
          <Button 
            variant={selectedPeriod === '30d' ? 'primary' : 'outline'} 
            size="sm"
            onClick={() => setSelectedPeriod('30d')}
          >
            30 Dias
          </Button>
          <Button 
            variant={selectedPeriod === '90d' ? 'primary' : 'outline'} 
            size="sm"
            onClick={() => setSelectedPeriod('90d')}
          >
            90 Dias
          </Button>
        </div>
      </div>

      {/* Row 1: Operational Health Score & Top KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Health Score Card */}
        <Card className={`p-6 border-2 flex flex-col justify-between ${healthScoreColor}`}>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Operational Health Score</span>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="flex items-baseline gap-2 my-2">
              <span className="text-5xl font-black">{report.healthScore.score}</span>
              <span className="text-sm font-semibold opacity-80">/ 100</span>
            </div>
            <p className="text-xs font-medium uppercase tracking-wide">Classificação: {report.healthScore.classification}</p>
          </div>
          <div className="mt-4 pt-4 border-t border-current/10 space-y-1 text-xs">
            <p className="font-semibold">Fatores positivos:</p>
            {report.healthScore.positiveFactors.slice(0, 2).map((fac, idx) => (
              <p key={idx} className="flex items-center gap-1.5 opacity-90">✓ {fac}</p>
            ))}
          </div>
        </Card>

        {/* Fleet KPI Card */}
        <Card className="p-6 bg-white dark:bg-slate-900 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">Frota & Utilização</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{report.kpis.fleet.totalVehicles}</p>
            </div>
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/80 rounded-xl text-indigo-600">
              <Car className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-slate-400 block">Disponíveis</span>
              <span className="font-bold text-emerald-600">{report.kpis.fleet.available} ({report.kpis.fleet.availabilityRate}%)</span>
            </div>
            <div>
              <span className="text-slate-400 block">Alugados</span>
              <span className="font-bold text-indigo-600">{report.kpis.fleet.rented} ({report.kpis.fleet.utilizationRate}%)</span>
            </div>
          </div>
        </Card>

        {/* Productivity & SLA KPI Card */}
        <Card className="p-6 bg-white dark:bg-slate-900 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">Produtividade & SLA</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{report.kpis.productivity.completionRate}%</p>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/80 rounded-xl text-emerald-600">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-slate-400 block">SLA Cumprido</span>
              <span className="font-bold text-emerald-600">{report.kpis.productivity.slaComplianceRate}%</span>
            </div>
            <div>
              <span className="text-slate-400 block">Tarefas Atrasadas</span>
              <span className="font-bold text-rose-600">{report.kpis.operations.overdueTasks}</span>
            </div>
          </div>
        </Card>

        {/* Goals & Alerts KPI Card */}
        <Card className="p-6 bg-white dark:bg-slate-900 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-500">Metas Gerenciais</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{report.kpis.goals.achieved} / {report.kpis.goals.total}</p>
            </div>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/80 rounded-xl text-amber-600">
              <Target className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-slate-400 block">Em Alerta</span>
              <span className="font-bold text-amber-600">{report.kpis.goals.warning}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Críticas</span>
              <span className="font-bold text-rose-600">{report.kpis.goals.critical}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Row 2: Decision Center (Recommended Actions) */}
      <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Centro de Decisão & Ações Recomendadas</h2>
          </div>
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
            {report.recommendations.length} Ações Prioritárias
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {report.recommendations.map((rec) => (
            <div key={rec.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{rec.title}</span>
                  <Badge className={rec.priority === 'P0' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}>
                    {rec.priority}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{rec.rationale}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-between text-xs"
                onClick={() => onNavigate(rec.targetView)}
              >
                <span>{rec.actionText}</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Row 3: Risk Matrix */}
      <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Matriz Executiva de Riscos</h2>
          </div>
          <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
            {report.risks.length} Riscos Mapeados
          </Badge>
        </div>

        <div className="space-y-3">
          {report.risks.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">Nenhum risco crítico mapeado na operação atual.</p>
          ) : (
            report.risks.map((risk) => (
              <div key={risk.id} className="p-4 rounded-xl border border-rose-100 bg-rose-50/40 dark:bg-rose-950/20 dark:border-rose-900/40 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-rose-600 text-white">{risk.priority}</Badge>
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{risk.title}</span>
                    <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px]">{risk.category}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{risk.description} — <em>{risk.impact}</em></p>
                </div>
                <Button 
                  variant="primary" 
                  size="sm" 
                  className="shrink-0 text-xs"
                  onClick={() => onNavigate(risk.navigationTarget)}
                >
                  <span>Resolver</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Financial Protection Notice */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <Activity className="w-5 h-5 text-indigo-600 shrink-0" />
        <p className="text-xs text-slate-600 dark:text-slate-400">
          <strong>Isolamento e Integridade Financeira:</strong> O Centro Executivo de Gestão opera estritamente como camada analítica somente leitura, preservando 100% o núcleo financeiro congelado do AutoERP.
        </p>
      </div>
    </div>
  );
};
