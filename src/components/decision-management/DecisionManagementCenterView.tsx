// AutoERP Decision Management Center View (Phase 3.59)

import React, { useState, useEffect, useMemo } from 'react';
import {
  ExecutiveDecision,
  DecisionMetrics,
  DecisionSnapshot,
  UserContext359,
  DecisionStatus,
  DecisionPriority,
  DecisionCategory,
  DecisionSourceType
} from '../../domain/decision-management/types';
import { DecisionManagementService } from '../../domain/decision-management/DecisionManagementService';
import { DecisionActionService } from '../../domain/decision-management/DecisionActionService';
import { DecisionEscalationService } from '../../domain/decision-management/DecisionEscalationService';
import { DecisionEffectivenessService } from '../../domain/decision-management/DecisionEffectivenessService';
import { DecisionMetricsService } from '../../domain/decision-management/DecisionMetricsService';
import { DecisionSnapshotService } from '../../domain/decision-management/DecisionSnapshotService';
import { ExecutiveOperationsService } from '../../domain/operations/ExecutiveOperationsService';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  UserCheck,
  ShieldAlert,
  FileText,
  Layers,
  Search,
  Plus,
  RotateCcw,
  Zap,
  BarChart3,
  Lock,
  Check,
  X,
  History,
  Award,
  Activity,
  ArrowUpRight,
  ChevronRight,
  Filter
} from 'lucide-react';

interface Props {
  companyId?: string;
  userContext?: UserContext359;
}

export const DecisionManagementCenterView: React.FC<Props> = ({
  companyId = 'comp-default',
  userContext = {
    userId: 'usr-admin-1',
    userName: 'Gestor Executivo',
    userRole: 'ADMIN',
    companyId: 'comp-default',
  },
}) => {
  const activeCompanyId = userContext?.companyId || companyId;
  const activeUserContext: UserContext359 = {
    userId: userContext?.userId || 'usr-admin-1',
    userName: userContext?.userName || 'Gestor Executivo',
    userRole: (userContext?.userRole || 'ADMIN') as 'ADMIN' | 'FINANCIAL' | 'OPERATIONAL_MANAGER' | 'ATTENDANT',
    companyId: activeCompanyId,
  };

  const [activeTab, setActiveTab] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [decisions, setDecisions] = useState<ExecutiveDecision[]>([]);
  const [snapshots, setSnapshots] = useState<DecisionSnapshot[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [selectedDecision, setSelectedDecision] = useState<ExecutiveDecision | null>(null);

  // Modal State for New Decision
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newPriority, setNewPriority] = useState<DecisionPriority>('P1');
  const [newCategory, setNewCategory] = useState<DecisionCategory>('OPERATIONAL');
  const [newSourceType, setNewSourceType] = useState<DecisionSourceType>('MANUAL');
  const [newResponsible, setNewResponsible] = useState<string>(activeUserContext.userId);
  const [newExpectedResult, setNewExpectedResult] = useState<string>('');
  const [newSuccessCriteria, setNewSuccessCriteria] = useState<string>('');

  // Reopen Modal State
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [decisionToReopen, setDecisionToReopen] = useState<ExecutiveDecision | null>(null);

  // Validation Result Modal
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
  const [actualResultInput, setActualResultInput] = useState<string>('');
  const [evidenceInput, setEvidenceInput] = useState<string>('evid-1, evid-2');
  const [decisionToValidate, setDecisionToValidate] = useState<ExecutiveDecision | null>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const decList = await DecisionManagementService.getDecisions(activeCompanyId, activeUserContext);
      const snapList = await DecisionSnapshotService.getSnapshots(activeCompanyId, activeUserContext);
      setDecisions(decList);
      setSnapshots(snapList);
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao carregar decisões: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeCompanyId]);

  // Calculated Metrics
  const metrics: DecisionMetrics = useMemo(() => {
    return DecisionMetricsService.calculateMetrics(decisions, activeCompanyId, activeUserContext);
  }, [decisions, activeCompanyId]);

  // Filtered decisions list
  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      const matchesSearch =
        d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.decisionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
      const matchesPriority = priorityFilter === 'ALL' || d.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [decisions, searchTerm, statusFilter, priorityFilter]);

  // Handlers
  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newDescription || !newExpectedResult) {
      setMessage({ type: 'error', text: 'Preencha os campos obrigatórios (Título, Descrição e Resultado Esperado)' });
      return;
    }

    try {
      await DecisionManagementService.createDecision(
        {
          companyId: activeCompanyId,
          title: newTitle,
          description: newDescription,
          priority: newPriority,
          category: newCategory,
          sourceType: newSourceType,
          responsibleUserId: newResponsible,
          expectedResult: newExpectedResult,
          successCriteria: newSuccessCriteria || 'Resultados atingidos dentro do prazo estipulado',
        },
        activeUserContext
      );

      setMessage({ type: 'success', text: 'Decisão executiva criada com sucesso!' });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewExpectedResult('');
      setNewSuccessCriteria('');
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleApprove = async (decisionId: string) => {
    try {
      await DecisionManagementService.approveDecision(decisionId, activeCompanyId, activeUserContext);
      setMessage({ type: 'success', text: 'Decisão aprovada formalmente com sucesso!' });
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleStartExecution = async (decisionId: string) => {
    try {
      await DecisionManagementService.startExecution(decisionId, activeCompanyId, activeUserContext, true);
      setMessage({ type: 'success', text: 'Execução iniciada e convertida em tarefa operacional!' });
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleEscalate = async (d: ExecutiveDecision) => {
    try {
      await DecisionEscalationService.escalateDecision(
        d,
        'usr-diretor-executivo',
        'Escalonamento manual por urgência operacional',
        activeUserContext
      );
      setMessage({ type: 'success', text: 'Decisão escalonada para o nível executivo superior!' });
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleValidateAndComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionToValidate || !actualResultInput) return;

    try {
      const evidences = evidenceInput.split(',').map((s) => s.trim()).filter(Boolean);
      await DecisionManagementService.submitResultForValidation(
        decisionToValidate.id,
        activeCompanyId,
        actualResultInput,
        evidences,
        activeUserContext
      );

      await DecisionManagementService.completeDecision(
        decisionToValidate.id,
        activeCompanyId,
        actualResultInput,
        activeUserContext
      );

      setMessage({ type: 'success', text: 'Resultado validado e decisão concluída com sucesso!' });
      setShowValidationModal(false);
      setDecisionToValidate(null);
      setActualResultInput('');
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleCloseDecision = async (decisionId: string) => {
    try {
      await DecisionManagementService.closeDecision(decisionId, activeCompanyId, activeUserContext);
      setMessage({ type: 'success', text: 'Decisão encerrada formalmente no sistema!' });
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleReopenDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionToReopen || !reopenReason) return;

    try {
      await DecisionManagementService.reopenDecision(
        decisionToReopen.id,
        activeCompanyId,
        reopenReason,
        activeUserContext
      );

      setMessage({ type: 'success', text: 'Decisão reaberta formalmente com registro de motivo auditável!' });
      setShowReopenModal(false);
      setDecisionToReopen(null);
      setReopenReason('');
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleTakeSnapshot = async () => {
    try {
      await DecisionSnapshotService.createSnapshot(decisions, activeCompanyId, activeUserContext);
      setMessage({ type: 'success', text: 'Snapshot executivo imutável gravado com sucesso!' });
      loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-6 h-6 text-indigo-400" />
            <h1 className="text-2xl font-bold tracking-tight">Central de Gestão de Decisões Executivas</h1>
            <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-1 rounded-full border border-indigo-500/30 font-mono">
              v3.59
            </span>
          </div>
          <p className="text-slate-400 text-sm">
            Governança de decisões, acompanhamento de resultados, escalonamento e efetividade operacional.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTakeSnapshot}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-700 transition"
          >
            <History className="w-4 h-4 text-indigo-400" />
            Gravar Snapshot
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow transition"
          >
            <Plus className="w-4 h-4" />
            Nova Decisão Executiva
          </button>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`p-4 rounded-lg text-sm flex justify-between items-center ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold text-xs uppercase hover:underline">
            Fechar
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="flex space-x-2 min-w-max">
          {[
            { id: 1, label: 'Visão Executiva', icon: BarChart3 },
            { id: 2, label: `Decisões Pendentes (${decisions.filter((d) => d.status === 'PROPOSED' || d.status === 'UNDER_ANALYSIS').length})`, icon: Clock },
            { id: 3, label: `P0 / P1 Críticas (${metrics.criticalP0P1Count})`, icon: AlertTriangle },
            { id: 4, label: `Em Execução (${metrics.inExecutionCount})`, icon: Zap },
            { id: 5, label: `Escalonadas (${metrics.escalatedCount})`, icon: ShieldAlert },
            { id: 6, label: 'Resultados & Sucesso', icon: CheckCircle2 },
            { id: 7, label: 'Efetividade Operacional', icon: TrendingUp },
            { id: 8, label: 'Carga por Responsável', icon: UserCheck },
            { id: 9, label: 'Histórico Completo', icon: Layers },
            { id: 10, label: 'Auditoria & Logs', icon: FileText },
            { id: 11, label: 'Matriz Oficial v3.59', icon: Lock },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab 1: Visão Executiva */}
      {activeTab === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold uppercase text-slate-500">Total Decisões</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.totalDecisions}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold uppercase text-slate-500">Decisões Abertas</span>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{metrics.openDecisions}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-rose-200 shadow-sm bg-rose-50/30">
              <span className="text-xs font-semibold uppercase text-rose-600">P0 / P1 Críticas</span>
              <p className="text-2xl font-bold text-rose-600 mt-1">{metrics.criticalP0P1Count}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm bg-amber-50/30">
              <span className="text-xs font-semibold uppercase text-amber-700">Atrasadas</span>
              <p className="text-2xl font-bold text-amber-600 mt-1">{metrics.overdueCount}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/30">
              <span className="text-xs font-semibold uppercase text-emerald-700">Taxa de Sucesso</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{metrics.successRate}%</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold uppercase text-slate-500">Score Efetividade</span>
              <p className="text-2xl font-bold text-indigo-700 mt-1">{metrics.effectivenessScore} / 100</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm md:col-span-2 space-y-4">
              <h3 className="text-base font-semibold text-slate-900">Lead Time & Tempos Médios Executivos</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <span className="text-xs text-slate-500">Lead Time (Proposta → Decisão)</span>
                  <p className="text-xl font-bold text-slate-800 mt-1">{metrics.avgLeadTimeHours}h</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <span className="text-xs text-slate-500">Tempo de Execução</span>
                  <p className="text-xl font-bold text-indigo-600 mt-1">{metrics.avgExecutionTimeHours}h</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <span className="text-xs text-slate-500">Tempo de Encerramento</span>
                  <p className="text-xl font-bold text-emerald-600 mt-1">{metrics.avgClosureTimeHours}h</p>
                </div>
              </div>

              <div className="pt-2">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Conversão e Resolução</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span>Taxa de Conversão em Ações Operacionais</span>
                      <span>{metrics.actionConversionRate}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${metrics.actionConversionRate}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span>Resolução de P0 / P1 Críticas</span>
                      <span>{metrics.p0P1ResolutionRate}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${metrics.p0P1ResolutionRate}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-base font-semibold text-slate-900">Decisões por Categoria</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {Object.entries(metrics.decisionsByCategory).map(([cat, count]) => (
                  <div key={cat} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg text-xs font-medium">
                    <span className="text-slate-700">{cat}</span>
                    <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">{count}</span>
                  </div>
                ))}
                {Object.keys(metrics.decisionsByCategory).length === 0 && (
                  <p className="text-xs text-slate-400 italic">Nenhuma categoria registrada ainda.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Decisões Pendentes */}
      {activeTab === 2 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-semibold text-slate-900">Decisões Propostas & Em Análise</h3>
            <span className="text-xs text-slate-500">
              Decisões aguardando aprovação formal antes de conversão em tarefas.
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {decisions
              .filter((d) => d.status === 'PROPOSED' || d.status === 'UNDER_ANALYSIS')
              .map((d) => (
                <div key={d.id} className="py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">{d.decisionNumber}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          d.priority === 'P0'
                            ? 'bg-rose-100 text-rose-700'
                            : d.priority === 'P1'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {d.priority}
                      </span>
                      <h4 className="font-semibold text-slate-900 text-sm">{d.title}</h4>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{d.description}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>Resultado Esperado: <strong className="text-slate-700">{d.expectedResult}</strong></span>
                      <span>Responsável: <strong className="text-slate-700">{d.responsibleUserId || 'Não atribuído'}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(d.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition"
                    >
                      Aprovar Decisão
                    </button>
                    <button
                      onClick={() => handleEscalate(d)}
                      className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                    >
                      Escalonar
                    </button>
                  </div>
                </div>
              ))}

            {decisions.filter((d) => d.status === 'PROPOSED' || d.status === 'UNDER_ANALYSIS').length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center italic">Nenhuma decisão pendente de aprovação.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: P0/P1 Críticas */}
      {activeTab === 3 && (
        <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-rose-100 pb-3">
            <h3 className="text-base font-semibold text-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              Decisões Críticas P0 / P1
            </h3>
            <span className="text-xs bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full font-bold">
              {metrics.criticalP0P1Count} Decisões Críticas
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {decisions
              .filter((d) => d.priority === 'P0' || d.priority === 'P1')
              .map((d) => (
                <div key={d.id} className="py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">{d.decisionNumber}</span>
                      <span className="bg-rose-100 text-rose-800 text-xs px-2 py-0.5 rounded-full font-bold">
                        {d.priority}
                      </span>
                      <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {d.status}
                      </span>
                      <h4 className="font-semibold text-slate-900 text-sm">{d.title}</h4>
                    </div>
                    <p className="text-xs text-slate-600">{d.description}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>Prazo Limite: <strong className="text-rose-700">{d.dueAt ? d.dueAt.substring(0, 10) : 'Sem prazo'}</strong></span>
                      <span>Responsável: <strong className="text-slate-700">{d.responsibleUserId || 'PENDENTE DE ATRIBUIÇÃO'}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {d.status === 'PROPOSED' || d.status === 'UNDER_ANALYSIS' ? (
                      <button
                        onClick={() => handleApprove(d.id)}
                        className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm hover:bg-emerald-500"
                      >
                        Aprovar P0/P1
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartExecution(d.id)}
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm hover:bg-indigo-500"
                      >
                        Iniciar Execução
                      </button>
                    )}
                  </div>
                </div>
              ))}

            {decisions.filter((d) => d.priority === 'P0' || d.priority === 'P1').length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center italic">Nenhuma decisão P0/P1 registrada.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Em Execução */}
      {activeTab === 4 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">Decisões em Execução Ativa</h3>

          <div className="divide-y divide-slate-100">
            {decisions
              .filter((d) => d.status === 'IN_EXECUTION' || d.status === 'WAITING_RESULT')
              .map((d) => (
                <div key={d.id} className="py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">{d.decisionNumber}</span>
                      <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full font-bold">
                        {d.status}
                      </span>
                      <h4 className="font-semibold text-slate-900 text-sm">{d.title}</h4>
                    </div>
                    <p className="text-xs text-slate-600">{d.description}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>Tarefas Operacionais: <strong className="text-indigo-600">{d.linkedTaskIds.join(', ') || 'Nenhuma'}</strong></span>
                      <span>Pendências Vinculadas: <strong className="text-amber-600">{d.linkedPendingActionIds.join(', ') || 'Nenhuma'}</strong></span>
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={() => {
                        setDecisionToValidate(d);
                        setShowValidationModal(true);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition"
                    >
                      Submeter & Validar Resultado
                    </button>
                  </div>
                </div>
              ))}

            {decisions.filter((d) => d.status === 'IN_EXECUTION' || d.status === 'WAITING_RESULT').length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center italic">Nenhuma decisão em execução no momento.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Escalonadas */}
      {activeTab === 5 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-semibold text-amber-900">Decisões Escalonadas por SLA ou Sobrecarga</h3>

          <div className="divide-y divide-slate-100">
            {decisions
              .filter((d) => d.status === 'ESCALATED' || d.escalationLevel !== 'LEVEL_0')
              .map((d) => (
                <div key={d.id} className="py-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">{d.decisionNumber}</span>
                      <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-bold">
                        {d.escalationLevel}
                      </span>
                      <h4 className="font-semibold text-slate-900 text-sm">{d.title}</h4>
                    </div>
                    <span className="text-xs text-slate-400">
                      Responsável Atual: <strong className="text-slate-800">{d.responsibleUserId}</strong>
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">{d.description}</p>

                  {d.escalationHistory && d.escalationHistory.length > 0 && (
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 space-y-1">
                      <span className="text-xs font-bold text-amber-900">Histórico de Escalonamento:</span>
                      {d.escalationHistory.map((h, idx) => (
                        <div key={idx} className="text-xs text-amber-800 flex justify-between">
                          <span>
                            Nível {h.level}: {h.reason}
                          </span>
                          <span className="text-amber-600">{h.escalatedAt.substring(0, 16)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

            {decisions.filter((d) => d.status === 'ESCALATED' || d.escalationLevel !== 'LEVEL_0').length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center italic">Nenhuma decisão em estado de escalonamento.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 6: Resultados & Sucesso */}
      {activeTab === 6 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">Central de Resultados e Critérios de Sucesso</h3>

          <div className="divide-y divide-slate-100">
            {decisions
              .filter((d) => d.status === 'COMPLETED' || d.status === 'CLOSED' || d.status === 'VALIDATING')
              .map((d) => (
                <div key={d.id} className="py-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">{d.decisionNumber}</span>
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-bold">
                        {d.status}
                      </span>
                      <h4 className="font-semibold text-slate-900 text-sm">{d.title}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                        Score: {d.effectivenessScore || 0} / 100 ({d.effectivenessClassification || 'PENDENTE'})
                      </span>
                      {d.status === 'COMPLETED' && (
                        <button
                          onClick={() => handleCloseDecision(d.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded text-xs font-medium"
                        >
                          Encerrar Decisão
                        </button>
                      )}
                      {(d.status === 'CLOSED' || d.status === 'COMPLETED') && (
                        <button
                          onClick={() => {
                            setDecisionToReopen(d);
                            setShowReopenModal(true);
                          }}
                          className="bg-rose-100 text-rose-800 hover:bg-rose-200 px-2.5 py-1 rounded text-xs font-medium"
                        >
                          Reabrir Decisão
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded-lg">
                    <div>
                      <span className="font-semibold text-slate-500 uppercase">Resultado Esperado:</span>
                      <p className="text-slate-800 font-medium mt-0.5">{d.expectedResult}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 uppercase">Resultado Alcançado:</span>
                      <p className="text-emerald-800 font-medium mt-0.5">{d.actualResult || 'Ainda não registrado'}</p>
                    </div>
                  </div>
                </div>
              ))}

            {decisions.filter((d) => d.status === 'COMPLETED' || d.status === 'CLOSED' || d.status === 'VALIDATING').length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center italic">Nenhuma decisão finalizada com resultados ainda.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 7: Efetividade Operacional */}
      {activeTab === 7 && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Score Global de Efetividade Executiva</h3>
            <div className="flex items-center gap-6">
              <div className="relative w-32 h-32 flex items-center justify-center bg-indigo-50 rounded-full border-4 border-indigo-500 text-3xl font-black text-indigo-700">
                {metrics.effectivenessScore}
              </div>
              <div className="space-y-1">
                <span className="text-sm font-bold text-slate-700 uppercase">Efetividade Média da Gestão</span>
                <p className="text-xs text-slate-500 max-w-md">
                  Medida ponderada atingida a partir dos critérios de resultado real, cumprimento de prazos SLA e fornecimento de evidências operacionais.
                </p>
                <div className="pt-2 flex gap-2">
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-bold">
                    Excelente (90+)
                  </span>
                  <span className="text-xs bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full font-bold">
                    Efetivo (75-89)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 8: Carga por Responsável */}
      {activeTab === 8 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">Distribuição de Carga de Decisões por Gestor/Usuário</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(metrics.decisionsByResponsible).map(([user, count]) => (
              <div key={user} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-900 text-sm">{user}</span>
                  <span className="bg-indigo-600 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {count} Decisões
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  Total atribuído sob gestão ou execução operacional.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 9: Histórico Completo */}
      {activeTab === 9 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h3 className="text-base font-semibold text-slate-900">Histórico de Decisões Executivas</h3>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por título ou número..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-1.5 w-full text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1.5 px-3 text-xs border border-slate-200 rounded-lg focus:outline-none"
              >
                <option value="ALL">Todos os Status</option>
                <option value="PROPOSED">PROPOSED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="IN_EXECUTION">IN_EXECUTION</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CLOSED">CLOSED</option>
                <option value="REOPENED">REOPENED</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="py-1.5 px-3 text-xs border border-slate-200 rounded-lg focus:outline-none"
              >
                <option value="ALL">Todas as Prioridades</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold uppercase border-b border-slate-200">
                  <th className="p-3">Número</th>
                  <th className="p-3">Título</th>
                  <th className="p-3">Prioridade</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Responsável</th>
                  <th className="p-3">Criação</th>
                  <th className="p-3">Prazo</th>
                  <th className="p-3">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDecisions.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-indigo-600">{d.decisionNumber}</td>
                    <td className="p-3 font-medium text-slate-900">{d.title}</td>
                    <td className="p-3 font-bold">{d.priority}</td>
                    <td className="p-3">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-medium">{d.status}</span>
                    </td>
                    <td className="p-3 text-slate-600">{d.responsibleUserId || '-'}</td>
                    <td className="p-3 text-slate-500">{d.createdAt.substring(0, 10)}</td>
                    <td className="p-3 text-slate-500">{d.dueAt ? d.dueAt.substring(0, 10) : '-'}</td>
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedDecision(d)}
                        className="text-indigo-600 hover:underline font-semibold"
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredDecisions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400 italic">
                      Nenhuma decisão encontrada com os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 10: Auditoria & Logs */}
      {activeTab === 10 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">Registro de Auditoria Imutável (Append-Only)</h3>
          <p className="text-xs text-slate-500">
            Todas as criações, aprovações, transições de estado, validações e reaberturas são gravadas com Correlation ID.
          </p>

          <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs space-y-2 max-h-96 overflow-y-auto">
            {decisions.map((d) => (
              <div key={d.id} className="border-b border-slate-800 pb-2">
                <span className="text-indigo-400">[{d.createdAt}]</span>{' '}
                <span className="text-emerald-400">CORR:{d.correlationId}</span> - DEC:{d.decisionNumber} - STATUS:{d.status} - PRIO:{d.priority} - RESP:{d.responsibleUserId}
              </div>
            ))}
            {decisions.length === 0 && <span className="text-slate-500">Nenhum log de auditoria gerado ainda.</span>}
          </div>
        </div>
      )}

      {/* Tab 11: Matriz Oficial v3.59 */}
      {activeTab === 11 && (
        <div className="bg-slate-900 text-slate-100 rounded-xl p-6 shadow-xl space-y-4 font-mono text-xs">
          <h3 className="text-lg font-bold text-indigo-400 border-b border-slate-800 pb-2">
            AUTOERP — GESTÃO DE DECISÕES — MATRIZ OFICIAL FASE 3.59
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>BASELINE 3.58</span>
              <span className="text-emerald-400">[VALIDADO]</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>DECISION MANAGEMENT</span>
              <span className="text-emerald-400">[APROVADO]</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>DECISION WORKFLOW</span>
              <span className="text-emerald-400">[APROVADO]</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>ACTION MANAGEMENT</span>
              <span className="text-emerald-400">[APROVADO]</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>RESPONSABILIDADES</span>
              <span className="text-emerald-400">[APROVADO]</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>ESCALONAMENTO</span>
              <span className="text-emerald-400">[APROVADO]</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>EFETIVIDADE</span>
              <span className="text-emerald-400">[APROVADO]</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>AUDITLOG & CORRELATION</span>
              <span className="text-emerald-400">[APROVADO]</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>FINANCEIRO</span>
              <span className="text-amber-400">[🔒 CONGELADO]</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 py-1">
              <span>FASE 3.59 STATUS</span>
              <span className="text-emerald-400 font-bold">[HOMOLOGADA]</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Decision */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Nova Decisão Executiva</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDecision} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título da Decisão *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Realocação da Frota para Região Sul"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição / Justificativa *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descreva o motivo e a necessidade estratégica..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prioridade</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as DecisionPriority)}
                    className="w-full p-2 border border-slate-200 rounded-lg"
                  >
                    <option value="P0">P0 (Emergencial)</option>
                    <option value="P1">P1 (Alta)</option>
                    <option value="P2">P2 (Média)</option>
                    <option value="P3">P3 (Baixa)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as DecisionCategory)}
                    className="w-full p-2 border border-slate-200 rounded-lg"
                  >
                    <option value="OPERATIONAL">Operacional</option>
                    <option value="FLEET">Frota</option>
                    <option value="DRIVER">Motoristas</option>
                    <option value="CONTRACT">Contratos</option>
                    <option value="MAINTENANCE">Manutenção</option>
                    <option value="SLA">SLA</option>
                    <option value="EXECUTIVE">Executivo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Resultado Esperado *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aumentar taxa de utilização em 15%"
                  value={newExpectedResult}
                  onChange={(e) => setNewExpectedResult(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Critério de Sucesso</label>
                <input
                  type="text"
                  placeholder="Ex: Sem veículos ociosos por mais de 48h"
                  value={newSuccessCriteria}
                  onChange={(e) => setNewSuccessCriteria(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-500"
                >
                  Criar Decisão Executiva
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Validation */}
      {showValidationModal && decisionToValidate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Validar Resultado & Concluir</h3>
              <button onClick={() => setShowValidationModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleValidateAndComplete} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Resultado Alcançado Na Prática *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descreva o que realmente foi alcançado após a execução..."
                  value={actualResultInput}
                  onChange={(e) => setActualResultInput(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">IDs de Evidências (separados por vírgula)</label>
                <input
                  type="text"
                  value={evidenceInput}
                  onChange={(e) => setEvidenceInput(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowValidationModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-500"
                >
                  Validar & Finalizar Decisão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reopen */}
      {showReopenModal && decisionToReopen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base text-rose-700">Reabrir Decisão Executiva</h3>
              <button onClick={() => setShowReopenModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReopenDecision} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Motivo Obrigatório da Reabertura (Mínimo 5 caracteres) *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explique por que o resultado foi insatisfatório ou reincidente..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full p-2 border border-rose-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 text-white font-medium rounded-lg hover:bg-rose-500"
                >
                  Confirmar Reabertura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
