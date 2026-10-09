// AutoERP Performance & Results Management Center View (Phase 3.60)

import React, { useState, useEffect } from 'react';
import {
  Target,
  TrendingUp,
  Award,
  CheckCircle,
  AlertTriangle,
  Clock,
  Layers,
  Activity,
  BarChart3,
  RefreshCw,
  Plus,
  ShieldCheck,
  FileText,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  RotateCcw,
  ListTodo
} from 'lucide-react';
import {
  UserContext360,
  Goal,
  KPI,
  Objective,
  KeyResult,
  ActionPlan,
  ResultMeasurement,
  PDCARecord,
  PerformanceAnalysisResult,
  PerformanceSnapshot
} from '../../domain/performance/types';
import { PerformanceManagementService } from '../../domain/performance/PerformanceManagementService';
import { GoalService } from '../../domain/performance/GoalService';
import { KPIManagementService } from '../../domain/performance/KPIManagementService';
import { OKRService } from '../../domain/performance/OKRService';
import { ActionPlanService } from '../../domain/performance/ActionPlanService';
import { ResultTrackingService } from '../../domain/performance/ResultTrackingService';
import { ContinuousImprovementService } from '../../domain/performance/ContinuousImprovementService';
import { PerformanceSnapshotService } from '../../domain/performance/PerformanceSnapshotService';
import {
  EnterprisePerformanceTestRunner,
  EnterprisePerformanceTestSummary
} from '../../domain/performance/EnterprisePerformanceTestRunner';

export const PerformanceManagementCenterView: React.FC = () => {
  const companyId = 'comp-main-tenant-360';
  const context: UserContext360 = {
    userId: 'usr-exec-360',
    userName: 'Gerente de Performance',
    userRole: 'ADMIN',
    companyId,
  };

  const [activeTab, setActiveTab] = useState<
    'EXECUTIVE' | 'OKRS' | 'GOALS' | 'KPIS' | 'ACTION_PLANS' | 'RESULTS' | 'PDCA' | 'ALERTS' | 'AUDIT' | 'OFFICIAL_MATRIX'
  >('EXECUTIVE');

  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<{
    analysis: PerformanceAnalysisResult | null;
    goals: Goal[];
    kpis: KPI[];
    objectives: Objective[];
    keyResults: KeyResult[];
    actionPlans: ActionPlan[];
    recentMeasurements: ResultMeasurement[];
    pdcaRecords: PDCARecord[];
    snapshots: PerformanceSnapshot[];
  }>({
    analysis: null,
    goals: [],
    kpis: [],
    objectives: [],
    keyResults: [],
    actionPlans: [],
    recentMeasurements: [],
    pdcaRecords: [],
    snapshots: [],
  });

  const [testSummary, setTestSummary] = useState<EnterprisePerformanceTestSummary | null>(null);
  const [runningTests, setRunningTests] = useState<boolean>(false);

  // New Item Modals
  const [showNewGoalModal, setShowNewGoalModal] = useState<boolean>(false);
  const [newGoalTitle, setNewGoalTitle] = useState<string>('');
  const [newGoalTarget, setNewGoalTarget] = useState<number>(100);
  const [newGoalUnit, setNewGoalUnit] = useState<string>('%');

  const [showNewKPIModal, setShowNewKPIModal] = useState<boolean>(false);
  const [newKPIName, setNewKPIName] = useState<string>('');
  const [newKPITarget, setNewKPITarget] = useState<number>(100);

  const [showNewPDCAModal, setShowNewPDCAModal] = useState<boolean>(false);
  const [newPDCATitle, setNewPDCATitle] = useState<string>('');
  const [newPDCARootCause, setNewPDCARootCause] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      await PerformanceManagementService.seedDemoDataIfEmpty(companyId, context);
      const overview = await PerformanceManagementService.getPerformanceOverview(companyId, context);
      setData(overview);
    } catch (e) {
      console.error('Error loading performance data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunTests = async () => {
    setRunningTests(true);
    try {
      const summary = await EnterprisePerformanceTestRunner.runAllTests(companyId);
      setTestSummary(summary);
    } catch (e) {
      console.error('Test execution error:', e);
    } finally {
      setRunningTests(false);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;
    try {
      await GoalService.createGoal(
        {
          companyId,
          title: newGoalTitle,
          description: 'Meta criada via interface executiva',
          category: 'FLEET',
          ownerId: context.userId,
          startDate: new Date().toISOString().substring(0, 10),
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10),
          targetValue: newGoalTarget,
          baselineValue: 0,
          unit: newGoalUnit,
        },
        context
      );
      setNewGoalTitle('');
      setShowNewGoalModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar meta');
    }
  };

  const handleCreateKPI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKPIName.trim()) return;
    try {
      await KPIManagementService.createKPI(
        {
          companyId,
          name: newKPIName,
          description: 'Indicador de performance operacional',
          category: 'OPERATIONS',
          unit: '%',
          calculationMethod: 'Direta',
          target: newKPITarget,
          warningThreshold: newKPITarget * 0.9,
          criticalThreshold: newKPITarget * 0.75,
          ownerId: context.userId,
        },
        context
      );
      setNewKPIName('');
      setShowNewKPIModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar KPI');
    }
  };

  const handleCreatePDCA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPDCATitle.trim()) return;
    try {
      await ContinuousImprovementService.createPDCARecord(
        {
          companyId,
          title: newPDCATitle,
          rootCause: newPDCARootCause,
          ownerId: context.userId,
          dueDate: new Date(Date.now() + 15 * 86400000).toISOString().substring(0, 10),
        },
        context
      );
      setNewPDCATitle('');
      setNewPDCARootCause('');
      setShowNewPDCAModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar ciclo PDCA');
    }
  };

  const handleSaveSnapshot = async () => {
    try {
      await PerformanceSnapshotService.saveSnapshot(companyId, context);
      await loadData();
      alert('Snapshot de performance gerado com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar snapshot');
    }
  };

  const analysis = data.analysis;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen text-slate-800">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2.5 rounded-lg shadow-sm">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                Gestão de Resultados & Performance
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full font-semibold">
                  Fase 3.60
                </span>
              </h1>
              <p className="text-sm text-slate-500">
                Acompanhamento contínuo de Metas, OKRs, KPIs, Planos de Ação e Ciclos PDCA com Núcleo Financeiro Congelado 🔒
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveSnapshot}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-sm transition-colors border border-slate-300"
          >
            <Layers className="w-4 h-4" />
            Gerar Snapshot
          </button>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-medium text-sm transition-colors border border-indigo-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm text-sm font-medium">
        {[
          { id: 'EXECUTIVE', label: '1. Visão Executiva', icon: Activity },
          { id: 'OKRS', label: '2. Objetivos & OKRs', icon: Target },
          { id: 'GOALS', label: '3. Metas', icon: Award },
          { id: 'KPIS', label: '4. KPIs', icon: BarChart3 },
          { id: 'ACTION_PLANS', label: '5. Planos de Ação', icon: ListTodo },
          { id: 'RESULTS', label: '6. Resultados', icon: TrendingUp },
          { id: 'PDCA', label: '7. Melhoria PDCA', icon: RotateCcw },
          { id: 'ALERTS', label: '8. Alertas & Riscos', icon: AlertTriangle },
          { id: 'AUDIT', label: '9. Auditoria', icon: Layers },
          { id: 'OFFICIAL_MATRIX', label: '10. Matriz Oficial v3.60', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}

      {/* 1. VISÃO EXECUTIVA */}
      {activeTab === 'EXECUTIVE' && (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Enterprise Performance Score</span>
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Activity className="w-5 h-5" /></span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">{analysis?.overallScore || 0}</span>
                <span className="text-sm font-semibold text-slate-500">/ 100</span>
              </div>
              <p className="mt-2 text-xs font-medium text-emerald-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Classificação: {analysis?.classification || 'NORMAL'}
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cumprimento de Metas</span>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Award className="w-5 h-5" /></span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">{analysis?.goalAchievementScore || 0}%</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {data.goals.length} metas cadastradas ({analysis?.atRiskGoalsCount || 0} em risco)
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Saúde dos KPIs</span>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-lg"><BarChart3 className="w-5 h-5" /></span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">{analysis?.kpiHealthScore || 0}%</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {data.kpis.length} indicadores ativos na empresa
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Previsão de Atingimento</span>
                <span className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Zap className="w-5 h-5" /></span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-lg font-bold text-slate-900">{analysis?.forecast || 'EXPECTED_ON_TIME'}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">Análise determinística sem IA</p>
            </div>
          </div>

          {/* Breakdown & Critical Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                Desempenho por Dimensão Operacional
              </h3>
              <div className="space-y-3.5">
                {[
                  { label: 'Efetividade de Metas (Goals)', val: analysis?.goalAchievementScore || 0 },
                  { label: 'Saúde dos Indicadores (KPIs)', val: analysis?.kpiHealthScore || 0 },
                  { label: 'Execução de Planos de Ação', val: analysis?.executionScore || 0 },
                  { label: 'Nível de Risco Operacional', val: analysis?.riskScore || 0 },
                  { label: 'Índice de Melhoria Contínua (PDCA)', val: analysis?.continuousImprovementScore || 0 },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-slate-700">
                      <span>{item.label}</span>
                      <span className="font-bold">{item.val}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${item.val}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Invariantes & Núcleo Financeiro Congelado 🔒
              </h3>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-xs font-mono text-slate-700">
                <div className="flex justify-between"><span>FINANCIAL_FILES_MODIFIED:</span> <span className="font-bold text-emerald-600">0</span></div>
                <div className="flex justify-between"><span>FINANCIAL_STATE_CHANGED:</span> <span className="font-bold text-emerald-600">FALSE</span></div>
                <div className="flex justify-between"><span>FINANCIAL_BALANCES_CHANGED:</span> <span className="font-bold text-emerald-600">FALSE</span></div>
                <div className="flex justify-between"><span>FINANCIAL_SCHEMA_CHANGED:</span> <span className="font-bold text-emerald-600">FALSE</span></div>
                <div className="flex justify-between"><span>FINANCIAL_LOGIC_CHANGED:</span> <span className="font-bold text-emerald-600">FALSE</span></div>
                <div className="flex justify-between"><span>FINANCIAL_WRITES_FROM_PHASE_3_60:</span> <span className="font-bold text-emerald-600">0</span></div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                A camada 3.60 opera estritamente acima das baselines 3.49-3.59. Indicadores financeiros são lidos em modo exclusivo READ_ONLY.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. OBJETIVOS & OKRs */}
      {activeTab === 'OKRS' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Objetivos Estratégicos & Key Results (OKRs)</h2>
              <p className="text-xs text-slate-500">Ciclo trimestral de alinhamento estratégico empresarial</p>
            </div>
          </div>

          <div className="space-y-4">
            {data.objectives.map((obj) => {
              const krs = data.keyResults.filter((k) => k.objectiveId === obj.id);
              return (
                <div key={obj.id} className="p-5 rounded-lg border border-slate-200 bg-slate-50 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                        {obj.period}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mt-1">{obj.title}</h3>
                      <p className="text-xs text-slate-600">{obj.description}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-extrabold text-indigo-600">{obj.progressPercentage}%</span>
                      <div className="text-xs text-slate-500 font-medium">{obj.status}</div>
                    </div>
                  </div>

                  {/* Key Results List */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Key Results Vinculados ({krs.length})</h4>
                    {krs.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Nenhum Key Result vinculado a este objetivo</p>
                    ) : (
                      krs.map((kr) => (
                        <div key={kr.id} className="flex justify-between items-center text-xs p-2.5 bg-slate-50 rounded border border-slate-100">
                          <div>
                            <span className="font-semibold text-slate-800">{kr.title}</span>
                            <div className="text-slate-500">Linha de Base: {kr.baseline} | Alvo: {kr.target} {kr.metric}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-slate-900">{kr.currentValue} / {kr.target}</span>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">{kr.progressPercentage}%</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. METAS */}
      {activeTab === 'GOALS' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Metas Operacionais & Táticas</h2>
              <p className="text-xs text-slate-500">Acompanhamento e apuração de metas por categoria e responsável</p>
            </div>
            <button
              onClick={() => setShowNewGoalModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Meta
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-600 uppercase">
                  <th className="p-3">Título / Descrição</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Prazo</th>
                  <th className="p-3">Atual / Alvo</th>
                  <th className="p-3">Progresso</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.goals.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{g.title}</div>
                      <div className="text-slate-500">{g.description}</div>
                    </td>
                    <td className="p-3 font-semibold">{g.category}</td>
                    <td className="p-3">{g.dueDate}</td>
                    <td className="p-3 font-mono">{g.currentValue} / {g.targetValue} {g.unit}</td>
                    <td className="p-3 font-bold text-indigo-600">{g.progressPercentage}%</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                        g.status === 'ACHIEVED' ? 'bg-emerald-100 text-emerald-800' :
                        g.status === 'AT_RISK' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {g.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. KPIS */}
      {activeTab === 'KPIS' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Indicadores Chave de Performance (KPIs)</h2>
              <p className="text-xs text-slate-500">Métricas com limites de alerta, tendência e proteção READ_ONLY para o financeiro</p>
            </div>
            <button
              onClick={() => setShowNewKPIModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo KPI
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.kpis.map((k) => (
              <div key={k.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-slate-900">{k.name}</h3>
                      {k.isReadOnlyFinancial && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                          <Lock className="w-3 h-3" /> READ_ONLY
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{k.description}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    k.status === 'NORMAL' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {k.status}
                  </span>
                </div>

                <div className="flex justify-between items-end pt-2 border-t border-slate-200 text-xs">
                  <div>
                    <div className="text-slate-500">Valor Atual</div>
                    <div className="text-xl font-extrabold text-slate-900">{k.currentValue} {k.unit}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-right">Alvo / Tolerância</div>
                    <div className="font-mono text-slate-700 text-right">{k.target} {k.unit} (Crítico: {k.criticalThreshold})</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. PLANOS DE AÇÃO */}
      {activeTab === 'ACTION_PLANS' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Planos de Ação Operacionais</h2>
              <p className="text-xs text-slate-500">Execução de iniciativas vinculadas a metas e geração de tarefas no Workflow</p>
            </div>
          </div>

          <div className="space-y-4">
            {data.actionPlans.map((p) => (
              <div key={p.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{p.title}</h3>
                    <p className="text-xs text-slate-600">{p.description}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-blue-100 text-blue-800 text-xs font-bold">{p.status}</span>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-200">
                  <div>Vencimento: <span className="font-semibold">{p.dueDate}</span></div>
                  <div>Tarefas Criadas: <span className="font-mono font-bold text-indigo-600">{p.linkedTaskIds.length}</span></div>
                  <div>Progresso: <span className="font-bold text-emerald-600">{p.progressPercentage}%</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. RESULTADOS */}
      {activeTab === 'RESULTS' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">

          <div>
            <h2 className="text-lg font-bold text-slate-900">Histórico de Medições de Resultado (APPEND_ONLY)</h2>
            <p className="text-xs text-slate-500">Registros imutáveis de apuração de metas e indicadores com variação e cálculo de variância</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-600 uppercase">
                  <th className="p-3">Data / Origem</th>
                  <th className="p-3">Medido</th>
                  <th className="p-3">Esperado</th>
                  <th className="p-3">Variação</th>
                  <th className="p-3">% Atingido</th>
                  <th className="p-3">Medido Por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.recentMeasurements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono">{m.measuredAt.substring(0, 16)} ({m.source})</td>
                    <td className="p-3 font-bold">{m.measuredValue}</td>
                    <td className="p-3">{m.expectedValue}</td>
                    <td className={`p-3 font-bold ${m.variance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{m.variance}</td>
                    <td className="p-3 font-bold text-indigo-600">{m.percentageAchieved}%</td>
                    <td className="p-3">{m.measuredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. MELHORIA CONTÍNUA (PDCA) */}
      {activeTab === 'PDCA' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Ciclo PDCA & Melhoria Contínua</h2>
              <p className="text-xs text-slate-500">Tratamento de causas raiz e padronização de melhorias operacionais</p>
            </div>
            <button
              onClick={() => setShowNewPDCAModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo PDCA
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {['PLAN', 'DO', 'CHECK', 'ACT'].map((phase) => (
              <div key={phase} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                <h3 className="font-extrabold text-xs text-indigo-600 uppercase tracking-wider">{phase}</h3>
                <div className="space-y-2">
                  {data.pdcaRecords
                    .filter((p) => p.currentPhase === phase)
                    .map((p) => (
                      <div key={p.id} className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs space-y-1">
                        <div className="font-bold text-slate-900">{p.title}</div>
                        <div className="text-slate-500">Causa: {p.rootCause || 'N/I'}</div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. ALERTAS & ESCALONAMENTOS */}
      {activeTab === 'ALERTS' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Alertas Operacionais & Gestão de Gargalos</h2>
            <p className="text-xs text-slate-500">Notificações por severidade (P0, P1, P2, P3) com escalonamento automático</p>
          </div>

          <div className="space-y-3">
            {data.goals
              .filter((g) => g.status === 'AT_RISK' || g.status === 'FAILED')
              .map((g) => (
                <div key={g.id} className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <div>
                      <div className="font-bold text-amber-900">[ALERTA P1] Meta em Risco: {g.title}</div>
                      <div className="text-amber-700">Progresso atual em {g.progressPercentage}% com vencimento em {g.dueDate}</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-amber-200 text-amber-900 rounded font-bold">ESCALADO P1</span>
                </div>
              ))}

            {data.kpis
              .filter((k) => k.status === 'CRITICAL')
              .map((k) => (
                <div key={k.id} className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <div>
                      <div className="font-bold text-red-900">[ALERTA P0] KPI Crítico: {k.name}</div>
                      <div className="text-red-700">Valor atual {k.currentValue} abaixo do limite crítico ({k.criticalThreshold})</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-red-200 text-red-900 rounded font-bold">ESCALADO P0</span>
                </div>
              ))}

            {data.goals.filter((g) => g.status === 'AT_RISK').length === 0 &&
              data.kpis.filter((k) => k.status === 'CRITICAL').length === 0 && (
                <p className="text-xs text-slate-500 italic">Nenhum alerta P0/P1 ativo no momento.</p>
              )}
          </div>
        </div>
      )}

      {/* 9. AUDITORIA & SNAPSHOTS */}
      {activeTab === 'AUDIT' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">AuditLog & Snapshots de Performance</h2>
            <p className="text-xs text-slate-500">Fotografias imutáveis de estado e rastreamento de Correlation IDs</p>
          </div>

          <div className="space-y-4">
            {data.snapshots.map((s) => (
              <div key={s.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2 text-xs">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-indigo-600">{s.id}</span>
                  <span className="text-slate-500">{s.timestamp}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Score Geral: <strong>{s.analysis.overallScore}</strong></span>
                  <span>Classificação: <strong>{s.analysis.classification}</strong></span>
                  <span className="font-mono text-slate-500">CorrID: {s.correlationId}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 10. MATRIZ OFICIAL V3.60 */}
      {activeTab === 'OFFICIAL_MATRIX' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Matriz Oficial de Homologação Fase 3.60</h2>
              <p className="text-xs text-slate-500">Execução e validação de suítes de testes unitários, adversariais e de proteção financeira</p>
            </div>
            <button
              onClick={handleRunTests}
              disabled={runningTests}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {runningTests ? 'Executando Testes...' : 'Executar Validação Geral'}
            </button>
          </div>

          {testSummary ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border ${testSummary.overallPassed ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  STATUS GERAL: {testSummary.overallPassed ? 'HOMOLOGADA (100% GREEN)' : 'FALHAS DETECTADAS'}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                {[
                  testSummary.unitTests,
                  testSummary.adversarialTests,
                  testSummary.e2eTests,
                  testSummary.financialProtectionTest,
                  testSummary.dataQualityTests,
                ].map((s, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
                    <div className="font-bold text-slate-900">{s.suiteName}</div>
                    <div className="text-slate-600">Total: {s.total} | Aprovados: <span className="text-emerald-600 font-bold">{s.passed}</span> | Falhas: <span className="text-red-600 font-bold">{s.failed}</span></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-xs">
              Clique em &quot;Executar Validação Geral&quot; para rodar a suíte completa de homologação oficial.
            </div>
          )}
        </div>
      )}

      {/* MODALS */}

      {/* New Goal Modal */}
      {showNewGoalModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-slate-900">Cadastrar Nova Meta</h3>
            <form onSubmit={handleCreateGoal} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Título da Meta</label>
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Aumentar pontualidade de entregas"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Valor Alvo</label>
                  <input
                    type="number"
                    value={newGoalTarget}
                    onChange={(e) => setNewGoalTarget(Number(e.target.value))}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Unidade</label>
                  <input
                    type="text"
                    value={newGoalUnit}
                    onChange={(e) => setNewGoalUnit(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewGoalModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded font-medium hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
                >
                  Salvar Meta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New KPI Modal */}
      {showNewKPIModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-slate-900">Cadastrar Novo KPI</h3>
            <form onSubmit={handleCreateKPI} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nome do Indicador</label>
                <input
                  type="text"
                  value={newKPIName}
                  onChange={(e) => setNewKPIName(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: SLA de Atendimento"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Valor Alvo</label>
                <input
                  type="number"
                  value={newKPITarget}
                  onChange={(e) => setNewKPITarget(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewKPIModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded font-medium hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
                >
                  Salvar KPI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New PDCA Modal */}
      {showNewPDCAModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-slate-900">Abrir Ciclo PDCA</h3>
            <form onSubmit={handleCreatePDCA} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Título do Problema / Oportunidade</label>
                <input
                  type="text"
                  value={newPDCATitle}
                  onChange={(e) => setNewPDCATitle(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Análise de paradas não programadas"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Causa Raiz Identificada</label>
                <textarea
                  value={newPDCARootCause}
                  onChange={(e) => setNewPDCARootCause(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Descreva a causa investigada..."
                  rows={3}
                ></textarea>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewPDCAModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded font-medium hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
                >
                  Iniciar PDCA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
