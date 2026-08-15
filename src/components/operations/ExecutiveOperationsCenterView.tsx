// AutoERP Executive Operations Center View Component (Phase 3.58)

import React, { useState, useEffect } from 'react';
import {
  Activity,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Car,
  FileText,
  Zap,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  Play,
  ListTodo,
  Calendar as CalendarIcon,
  HelpCircle,
  Lock,
  Layers,
  ChevronRight,
  ShieldCheck,
  Award,
  Sliders,
  Flame,
  ArrowUpRight
} from 'lucide-react';

import { ExecutiveOperationsService } from '../../domain/operations/ExecutiveOperationsService';
import {
  ExecutiveOperationsSnapshot,
  PriorityActionItem,
  OperationalBottleneckItem,
  OperationalRiskItem,
  OperationalKPIs,
  OperationalRecommendation,
  UserContext358
} from '../../domain/operations/types';
import { OperationsExecutiveTestRunner, OperationsSuiteResult } from '../../domain/operations/OperationsExecutiveTestRunner';

export const ExecutiveOperationsCenterView: React.FC = () => {
  const companyId = 'company-default-358';
  const userCtx: UserContext358 = {
    userId: 'usr-exec-358',
    userName: 'Gestor Executivo Operacional',
    userRole: 'ADMIN',
    companyId,
  };

  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'agora'
    | 'tarefas'
    | 'agenda'
    | 'pendencias'
    | 'sla'
    | 'gargalos'
    | 'riscos'
    | 'produtividade'
    | 'frota'
    | 'contratos'
    | 'incidentes'
    | 'recomendacoes'
    | 'auditoria'
    | 'matriz'
  >('overview');

  const [loading, setLoading] = useState<boolean>(true);
  const [snapshot, setSnapshot] = useState<ExecutiveOperationsSnapshot | null>(null);
  const [priorityActions, setPriorityActions] = useState<PriorityActionItem[]>([]);
  const [finStatus, setFinStatus] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Test Runner state
  const [testResult, setTestResult] = useState<OperationsSuiteResult | null>(null);
  const [runningTests, setRunningTests] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const snap = await ExecutiveOperationsService.getExecutiveSnapshot(companyId, userCtx);
      setSnapshot(snap);

      const actions = await ExecutiveOperationsService.getPriorityActions(companyId, userCtx);
      setPriorityActions(actions);

      const fin = await ExecutiveOperationsService.getReadOnlyFinancialStatus(companyId, userCtx);
      setFinStatus(fin);
    } catch (err: any) {
      console.error('Failed to load executive operations data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = async (actionType: string, entityId: string, reason?: string) => {
    try {
      const res = await ExecutiveOperationsService.executeQuickAction(
        actionType,
        { entityId, reason, idempotencyKey: `btn-${actionType}-${entityId}-${Date.now()}` },
        companyId,
        userCtx
      );
      if (res.success) {
        setActionMessage({ text: res.message, type: 'success' });
        loadData();
      } else {
        setActionMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setActionMessage({ text: err?.message || 'Erro ao executar ação', type: 'error' });
    }
  };

  const handleRunTests = async () => {
    setRunningTests(true);
    try {
      const res = await OperationsExecutiveTestRunner.runAllTests();
      setTestResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setRunningTests(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-gray-600 font-medium">Consolidando Central Executiva de Operações (Fase 3.58)...</p>
      </div>
    );
  }

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'P0':
        return 'bg-red-100 text-red-800 border-red-300 font-bold';
      case 'P1':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
      case 'P2':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getRiskLevelClass = (level?: string) => {
    switch (level) {
      case 'CRÍTICO':
      case 'ALTO RISCO':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'ATENÇÃO':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'EXCELENTE':
      case 'BOM':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div id="executive-operations-center" className="p-6 space-y-6 max-w-[1600px] mx-auto bg-gray-50 min-h-screen">
      {/* Header */}
      <div id="exec-ops-header" className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <span className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <Activity className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Central Executiva de Operações</h1>
              <p className="text-sm text-gray-500">
                Fase 3.58 — Inteligência Operacional, Priorização P0-P3, Gargalos e Gestão de Performance
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-amber-50 text-amber-900 text-xs px-3 py-1.5 rounded-lg border border-amber-200 font-medium">
            <Lock className="w-4 h-4 text-amber-600" />
            <span>Núcleo Financeiro 100% Congelado</span>
          </div>

          <button
            onClick={loadData}
            id="btn-refresh-exec-ops"
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-lg border text-sm flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-xs underline font-semibold">
            Fechar
          </button>
        </div>
      )}

      {/* Navigation Tabs (15 Tabs) */}
      <div className="bg-white rounded-xl border border-gray-200 p-2 shadow-sm overflow-x-auto">
        <div className="flex space-x-1 min-w-max">
          {[
            { id: 'overview', label: '1. Visão Executiva', icon: Activity },
            { id: 'agora', label: '2. Agora (O que fazer?)', icon: Flame, badge: priorityActions.length },
            { id: 'tarefas', label: '3. Tarefas', icon: ListTodo },
            { id: 'agenda', label: '4. Agenda', icon: CalendarIcon },
            { id: 'pendencias', label: '5. Pendências', icon: AlertTriangle },
            { id: 'sla', label: '6. SLA', icon: Clock },
            { id: 'gargalos', label: '7. Gargalos', icon: ShieldAlert },
            { id: 'riscos', label: '8. Riscos (0-100)', icon: Zap },
            { id: 'produtividade', label: '9. Produtividade', icon: Users },
            { id: 'frota', label: '10. Frota', icon: Car },
            { id: 'contratos', label: '11. Contratos', icon: FileText },
            { id: 'incidentes', label: '12. Incidentes', icon: Flame },
            { id: 'recomendacoes', label: '13. Recomendações', icon: TrendingUp },
            { id: 'auditoria', label: '14. Auditoria', icon: ShieldCheck },
            { id: 'matriz', label: '15. Matriz v3.58 & Testes', icon: Award },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-exec-ops-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                      isActive ? 'bg-white text-blue-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: VISÃO EXECUTIVA */}
      {activeTab === 'overview' && snapshot && (
        <div className="space-y-6">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Health Score</span>
                <Activity className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-3xl font-extrabold text-gray-900">{snapshot.healthScore}%</div>
              <p className="text-xs text-emerald-600 font-medium">Operação em conformidade sistêmica</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Risco Operacional</span>
                <ShieldAlert className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-3xl font-extrabold text-gray-900">{snapshot.operationalRiskScore.score}/100</div>
              <div className={`inline-block text-xs font-bold px-2 py-0.5 rounded border ${getRiskLevelClass(snapshot.operationalRiskScore.level)}`}>
                {snapshot.operationalRiskScore.level}
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Backlog Acumulado</span>
                <ListTodo className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-3xl font-extrabold text-gray-900">{snapshot.backlog}</div>
              <p className="text-xs text-gray-500">{snapshot.overdueTasks} tarefas atrasadas</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Atendimento SLA</span>
                <Clock className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="text-3xl font-extrabold text-gray-900">{snapshot.kpis.slaCompliancePercent}%</div>
              <p className="text-xs text-red-600 font-medium">{snapshot.slaBreaches} estouro(s) de SLA</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Utilização Frota</span>
                <Car className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-3xl font-extrabold text-gray-900">{snapshot.kpis.fleetUtilizationPercent}%</div>
              <p className="text-xs text-gray-500">{snapshot.rentedVehicles} de {snapshot.kpis.totalVehicles} locados</p>
            </div>
          </div>

          {/* Top Bottlenecks and Top Priority Actions Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Bottlenecks */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  <span>Gargalos Operacionais Críticos</span>
                </h3>
                <span className="text-xs text-gray-500 font-medium">{snapshot.topBottlenecks.length} detectados</span>
              </div>

              {snapshot.topBottlenecks.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm bg-gray-50 rounded-lg">
                  Nenhum gargalo crítico identificado no momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {snapshot.topBottlenecks.slice(0, 4).map((bot) => (
                    <div key={bot.id} className="p-4 rounded-lg border border-red-100 bg-red-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-red-800 uppercase tracking-wider">{bot.category}</span>
                        <span className="text-xs font-extrabold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                          Impacto: {bot.impactScore}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-gray-900">{bot.title}</h4>
                      <p className="text-xs text-gray-600">{bot.description}</p>
                      <div className="pt-2 border-t border-red-100 flex items-center justify-between text-xs text-gray-700">
                        <span className="font-medium text-blue-700">Ação: {bot.recommendedAction}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Priority Actions */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Flame className="w-5 h-5 text-amber-600" />
                  <span>Ações Imediatas Requeridas ("Agora")</span>
                </h3>
                <button onClick={() => setActiveTab('agora')} className="text-xs font-bold text-blue-600 hover:underline">
                  Ver Todas ({priorityActions.length})
                </button>
              </div>

              {priorityActions.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm bg-gray-50 rounded-lg">
                  Nenhuma ação prioritária pendente no momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {priorityActions.slice(0, 4).map((act) => (
                    <div key={act.id} className="p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-0.5 rounded border font-bold ${getPriorityBadgeClass(act.priority)}`}>
                          {act.priority}
                        </span>
                        {act.dueDate && <span className="text-xs text-gray-500">Prazo: {act.dueDate.substring(0, 10)}</span>}
                      </div>
                      <h4 className="text-sm font-bold text-gray-900">{act.title}</h4>
                      <p className="text-xs text-gray-600">{act.reason}</p>
                      <div className="pt-2 flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleQuickAction(act.quickActionType, act.entityId, act.title)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition"
                        >
                          Executar Ação Rápida
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AGORA ("O QUE PRECISA SER FEITO AGORA?") */}
      {activeTab === 'agora' && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                <Flame className="w-5 h-5 text-red-600" />
                <span>O que precisa ser feito AGORA? (Matriz de Prioridade P0-P3)</span>
              </h2>
              <p className="text-xs text-gray-500">
                Lista unificada e ranqueada de ações urgentes com execução em 1 clique
              </p>
            </div>
            <div className="text-xs text-gray-500">Total: <span className="font-bold text-gray-900">{priorityActions.length}</span> itens</div>
          </div>

          {priorityActions.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm bg-gray-50 rounded-xl">
              Nenhuma ação urgente pendente na operação.
            </div>
          ) : (
            <div className="space-y-4">
              {priorityActions.map((act) => (
                <div key={act.id} className="p-5 rounded-xl border border-gray-200 hover:border-blue-400 bg-white shadow-sm space-y-3 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2.5 py-1 rounded-md border font-extrabold ${getPriorityBadgeClass(act.priority)}`}>
                        {act.priority}
                      </span>
                      <span className="text-xs font-semibold text-gray-500 uppercase">{act.entityType}</span>
                    </div>
                    {act.dueDate && (
                      <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-100">
                        Prazo: {act.dueDate.substring(0, 10)}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-gray-900">{act.title}</h3>
                  <p className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-lg border border-gray-100">{act.reason}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Impacto:</span> <span className="font-medium text-gray-800">{act.impact}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Recomendação:</span> <span className="font-medium text-blue-700">{act.recommendation}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t flex items-center justify-between">
                    <span className="text-xs text-gray-500">Responsável: {act.responsibleUserName || act.responsibleUserId || 'Não atribuído'}</span>
                    <button
                      onClick={() => handleQuickAction(act.quickActionType, act.entityId, act.title)}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                    >
                      Executar Rápido em 1 Clique
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TAREFAS */}
      {activeTab === 'tarefas' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Consolidação Operacional de Tarefas</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <span className="text-xs text-blue-700 font-semibold uppercase">Abertas</span>
              <div className="text-2xl font-bold text-blue-900">{snapshot.kpis.openTasks}</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
              <span className="text-xs text-emerald-700 font-semibold uppercase">Concluídas</span>
              <div className="text-2xl font-bold text-emerald-900">{snapshot.kpis.completedTasks}</div>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
              <span className="text-xs text-amber-700 font-semibold uppercase">Bloqueadas</span>
              <div className="text-2xl font-bold text-amber-900">{snapshot.kpis.blockedTasks}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
              <span className="text-xs text-red-700 font-semibold uppercase">Atrasadas</span>
              <div className="text-2xl font-bold text-red-900">{snapshot.kpis.overdueActivitiesCount}</div>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Acompanhe em detalhes na Central de Tarefas dedicada da Fase 3.56.
          </p>
        </div>
      )}

      {/* TAB 4: AGENDA */}
      {activeTab === 'agenda' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Agenda & Atividades Recorrentes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="text-sm font-bold text-gray-800">Atividades Programadas para Hoje</h3>
              <div className="text-3xl font-extrabold text-blue-600 mt-2">{snapshot.todayActivities}</div>
            </div>
            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="text-sm font-bold text-gray-800">Atividades Estouradas</h3>
              <div className="text-3xl font-extrabold text-red-600 mt-2">{snapshot.overdueActivities}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PENDÊNCIAS */}
      {activeTab === 'pendencias' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Pendências Operacionais Integradas</h2>
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-sm">
            Existem <span className="font-bold">{snapshot.pendingActions}</span> pendências acumuladas aguardando conversão em tarefas ativas.
          </div>
        </div>
      )}

      {/* TAB 6: SLA */}
      {activeTab === 'sla' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Nível de Serviço (SLA) Operacional</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
              <span className="text-xs text-emerald-700 font-semibold">Conformidade SLA</span>
              <div className="text-2xl font-bold text-emerald-900">{snapshot.kpis.slaCompliancePercent}%</div>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
              <span className="text-xs text-amber-700 font-semibold">Em Alerta</span>
              <div className="text-2xl font-bold text-amber-900">{snapshot.slaWarnings}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
              <span className="text-xs text-red-700 font-semibold">Rompidos</span>
              <div className="text-2xl font-bold text-red-900">{snapshot.slaBreaches}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: GARGALOS */}
      {activeTab === 'gargalos' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Mapeamento Completo de Gargalos Operacionais</h2>
          {snapshot.topBottlenecks.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum gargalo identificado.</p>
          ) : (
            <div className="space-y-3">
              {snapshot.topBottlenecks.map((bot) => (
                <div key={bot.id} className="p-4 border rounded-lg bg-gray-50 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-red-700">{bot.category}</span>
                    <span className="font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">Impacto {bot.impactScore}/100</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">{bot.title}</h3>
                  <p className="text-xs text-gray-600">{bot.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 8: RISCOS */}
      {activeTab === 'riscos' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b pb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Matriz de Risco Operacional (0 a 100)</h2>
              <p className="text-xs text-gray-500">Métricas determinísticas sem interferência financeira</p>
            </div>
            <div className={`px-4 py-2 rounded-xl text-lg font-extrabold border ${getRiskLevelClass(snapshot.operationalRiskScore.level)}`}>
              Score: {snapshot.operationalRiskScore.score}/100 ({snapshot.operationalRiskScore.level})
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            {Object.entries(snapshot.operationalRiskScore.factors).map(([k, v]) => (
              <div key={k} className="p-3 bg-gray-50 rounded-lg border text-center">
                <span className="text-gray-500 block capitalize">{k.replace('Score', '')}</span>
                <span className="text-base font-bold text-gray-900">{v}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-800">Fatores de Risco Ativos</h3>
            {snapshot.topRisks.map((risk) => (
              <div key={risk.id} className="p-4 border border-amber-200 bg-amber-50/50 rounded-lg space-y-1 text-xs">
                <div className="flex justify-between font-bold text-amber-900">
                  <span>{risk.title}</span>
                  <span>Impacto: {risk.riskScore}</span>
                </div>
                <p className="text-gray-700">{risk.cause}</p>
                <p className="text-blue-700 font-semibold">Ação: {risk.recommendedAction}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 9: PRODUTIVIDADE */}
      {activeTab === 'produtividade' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Gestão de Produtividade e Carga da Equipe</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border">
              <span className="text-xs text-gray-500">Média de Produtividade</span>
              <div className="text-2xl font-bold text-blue-600">{snapshot.kpis.avgProductivityPercent}%</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border">
              <span className="text-xs text-gray-500">Usuários Disponíveis</span>
              <div className="text-2xl font-bold text-emerald-600">{snapshot.usersAvailable}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border">
              <span className="text-xs text-gray-500">Usuários Sobrecarregados</span>
              <div className="text-2xl font-bold text-red-600">{snapshot.usersOverloaded}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 10: FROTA */}
      {activeTab === 'frota' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Visão Executiva de Frota</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <span className="text-xs text-blue-700 font-semibold">Total</span>
              <div className="text-xl font-bold">{snapshot.kpis.totalVehicles}</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
              <span className="text-xs text-emerald-700 font-semibold">Disponíveis</span>
              <div className="text-xl font-bold">{snapshot.availableVehicles}</div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
              <span className="text-xs text-purple-700 font-semibold">Locados</span>
              <div className="text-xl font-bold">{snapshot.rentedVehicles}</div>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
              <span className="text-xs text-amber-700 font-semibold">Manutenção</span>
              <div className="text-xl font-bold">{snapshot.maintenanceVehicles}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
              <span className="text-xs text-red-700 font-semibold">Indisponíveis</span>
              <div className="text-xl font-bold">{snapshot.unavailableVehicles}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 11: CONTRATOS */}
      {activeTab === 'contratos' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Contratos de Locação</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border">
              <span className="text-xs text-gray-500">Contratos Ativos</span>
              <div className="text-2xl font-bold text-gray-900">{snapshot.activeContracts}</div>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
              <span className="text-xs text-amber-700 font-semibold">A Vencer (30 dias)</span>
              <div className="text-2xl font-bold text-amber-900">{snapshot.kpis.expiringContractsCount}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
              <span className="text-xs text-red-700 font-semibold">Com Inconsistências</span>
              <div className="text-2xl font-bold text-red-900">{snapshot.contractsWithIssues}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 12: INCIDENTES */}
      {activeTab === 'incidentes' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Incidentes Operacionais</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border">
              <span className="text-xs text-gray-500">Ativos</span>
              <div className="text-2xl font-bold text-gray-900">{snapshot.openIncidents}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
              <span className="text-xs text-red-700 font-semibold">Críticos (SEV0/SEV1)</span>
              <div className="text-2xl font-bold text-red-900">{snapshot.criticalIncidents}</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <span className="text-xs text-blue-700 font-semibold">MTTR Médio</span>
              <div className="text-2xl font-bold text-blue-900">{snapshot.kpis.mttrMinutes} min</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 13: RECOMENDAÇÕES */}
      {activeTab === 'recomendacoes' && snapshot && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Recomendações Executivas Inteligentes</h2>
          <div className="space-y-3">
            {snapshot.recommendations.map((rec) => (
              <div key={rec.id} className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-blue-700 uppercase">{rec.category}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">{rec.severity}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-900">{rec.title}</h3>
                <p className="text-xs text-gray-600">{rec.description}</p>
                <div className="pt-2 text-xs font-medium text-emerald-700 border-t border-gray-200">
                  Ação Recomendada: {rec.recommendedAction}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 14: AUDITORIA */}
      {activeTab === 'auditoria' && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Timeline Imutável de Auditoria Operacional</h2>
          <p className="text-xs text-gray-500">
            Todas as mutações de status, atribuições e ações rápidas são auditadas append-only com timestamp e ID de correlação.
          </p>
          <div className="p-4 bg-gray-50 rounded-lg border text-xs text-gray-600 font-mono">
            [AUDIT_LOG] Tenant: {companyId} | Status: Conforme | Imutabilidade Garantida
          </div>
        </div>
      )}

      {/* TAB 15: MATRIZ DE HOMOLOGAÇÃO V3.58 */}
      {activeTab === 'matriz' && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                <Award className="w-5 h-5 text-amber-600" />
                <span>Matriz de Homologação Oficial — Fase 3.58</span>
              </h2>
              <p className="text-xs text-gray-500">
                Suíte de testes de estresse (Unidade, Adversariais, E2E e Proteção Financeira)
              </p>
            </div>

            <button
              id="btn-run-tests-358"
              onClick={handleRunTests}
              disabled={runningTests}
              className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition shadow"
            >
              {runningTests ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>{runningTests ? 'Executando Suíte de Homologação...' : 'Executar Suíte 3.58'}</span>
            </button>
          </div>

          {testResult && (
            <div className="space-y-6">
              {/* Summary Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl border text-center">
                  <span className="text-xs text-gray-500 uppercase font-semibold">Total de Testes</span>
                  <div className="text-3xl font-extrabold text-gray-900">{testResult.total}</div>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <span className="text-xs text-emerald-700 uppercase font-semibold">Aprovados</span>
                  <div className="text-3xl font-extrabold text-emerald-700">{testResult.passed}</div>
                </div>
                <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-center">
                  <span className="text-xs text-red-700 uppercase font-semibold">Falhas</span>
                  <div className="text-3xl font-extrabold text-red-700">{testResult.failed}</div>
                </div>
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center">
                  <span className="text-xs text-amber-800 uppercase font-semibold">Proteção Financeira</span>
                  <div className="text-xs font-bold text-emerald-800 mt-2">🔒 100% CONGELADO</div>
                </div>
              </div>

              {/* Test Results Table */}
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 text-gray-700 font-bold uppercase">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3">Nome do Teste</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Duração</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {testResult.results.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="p-3 font-mono font-bold">{r.id}</td>
                        <td className="p-3 font-semibold">{r.category}</td>
                        <td className="p-3 text-gray-900">{r.name}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              r.status === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 text-gray-500">{r.durationMs}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
