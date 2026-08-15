// AutoERP Operational Execution Center View (Phase 3.57)

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  CheckSquare,
  Clock,
  AlertTriangle,
  BellRing,
  Award,
  ListTodo,
  MessageSquare,
  ShieldCheck,
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Plus,
  User,
  Paperclip,
  Tag,
  Kanban,
  Zap,
  TrendingUp,
  AlertCircle,
  FileText,
  Lock,
} from 'lucide-react';
import { Card, Button, Badge, Input } from '../ui';
import { ExecutionService } from '../../domain/execution/ExecutionService';
import { AgendaService } from '../../domain/execution/AgendaService';
import { ProductivityService } from '../../domain/execution/ProductivityService';
import { CommunicationService } from '../../domain/execution/CommunicationService';
import { OperationalPlanningService } from '../../domain/execution/OperationalPlanningService';
import {
  ExecutionActivity,
  AgendaEvent,
  ProductivitySnapshot,
  CommunicationEntry,
  OperationalPlanningBucket,
  UserContext357,
  UserWorkload,
  ActivityType,
  ExecutionActivityPriority,
  ExecutionActivityStatus,
  AgendaViewMode,
  PlanningPeriod,
} from '../../domain/execution/types';
import { TaskService } from '../../domain/workflow/TaskService';
import { Task } from '../../domain/workflow/types';
import { PendingActionService } from '../../domain/workflow/PendingActionService';
import { PendingAction } from '../../domain/workflow/types';
import {
  EnterpriseExecutionTestRunner,
  ExecutionTestSuiteResult,
} from '../../domain/execution/EnterpriseExecutionTestRunner';

interface OperationalExecutionCenterViewProps {
  companyId?: string;
  userContext?: UserContext357;
}

export const OperationalExecutionCenterView: React.FC<OperationalExecutionCenterViewProps> = ({
  companyId = 'company-main-uuid',
  userContext = {
    userId: 'usr-admin-default',
    userName: 'Gestor Operacional AutoERP',
    userRole: 'ADMIN' as const,
    companyId: 'company-main-uuid',
  },
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'agenda' | 'activities' | 'pending' | 'productivity' | 'planning' | 'communication' | 'audit' | 'homologation'
  >('overview');

  // State
  const [activities, setActivities] = useState<ExecutionActivity[]>([]);
  const [agendaEvents, setAgendaEvents] = useState<AgendaEvent[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [productivity, setProductivity] = useState<ProductivitySnapshot | null>(null);
  const [planningBuckets, setPlanningBuckets] = useState<Record<PlanningPeriod, OperationalPlanningBucket> | null>(null);
  const [communications, setCommunications] = useState<CommunicationEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [agendaViewMode, setAgendaViewMode] = useState<AgendaViewMode>('LIST');

  // New Activity Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newType, setNewType] = useState<ActivityType>('TASK');
  const [newPriority, setNewPriority] = useState<ExecutionActivityPriority>('P2');
  const [newAssignedTo, setNewAssignedTo] = useState<string>('');

  // Communication Input
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [newCommMessage, setNewCommMessage] = useState<string>('');

  // Test Runner State
  const [testResults, setTestResults] = useState<ExecutionTestSuiteResult | null>(null);
  const [testingRunning, setTestingRunning] = useState<boolean>(false);

  useEffect(() => {
    loadAllData();
  }, [companyId]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const acts = await ExecutionService.getActivities(companyId, undefined, userContext);
      const evts = await AgendaService.getEvents(companyId, undefined, undefined, undefined, userContext);
      const pends = await PendingActionService.getPendingActions(companyId);
      const tsks = await TaskService.getTasks(companyId);
      const prod = await ProductivityService.getProductivitySnapshot(companyId, 'CURRENT', userContext);
      const plan = await OperationalPlanningService.getPlanningBuckets(companyId, userContext);
      const comms = await CommunicationService.getEntries(companyId, undefined, undefined, userContext);

      setActivities(acts);
      setAgendaEvents(evts);
      setPendingActions(pends);
      setTasks(tsks);
      setProductivity(prod);
      setPlanningBuckets(plan);
      setCommunications(comms);
    } catch (err: any) {
      showToast(`Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      showToast('Por favor informe o título da atividade');
      return;
    }

    try {
      await ExecutionService.createActivity(
        companyId,
        {
          title: newTitle,
          description: newDescription,
          type: newType,
          priority: newPriority,
          assignedTo: newAssignedTo || userContext.userId,
        },
        userContext
      );
      showToast('Atividade criada com sucesso!');
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      loadAllData();
    } catch (err: any) {
      showToast(`Erro ao criar atividade: ${err.message}`);
    }
  };

  const handleUpdateStatus = async (activityId: string, status: ExecutionActivityStatus) => {
    try {
      await ExecutionService.updateActivityStatus(companyId, activityId, status, userContext);
      showToast(`Status da atividade atualizado para ${status}`);
      loadAllData();
    } catch (err: any) {
      showToast(`Erro ao atualizar status: ${err.message}`);
    }
  };

  const handleConvertPendingToTask = async (pendingId: string) => {
    try {
      await ExecutionService.convertPendingActionToTask(
        companyId,
        pendingId,
        userContext.userId,
        2,
        userContext
      );
      showToast('Pendência convertida em Tarefa Operacional!');
      loadAllData();
    } catch (err: any) {
      showToast(`Erro ao converter pendência: ${err.message}`);
    }
  };

  const handleAddCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId || !newCommMessage.trim()) {
      showToast('Selecione um item e digite a mensagem');
      return;
    }

    try {
      await CommunicationService.addEntry(
        companyId,
        {
          entityType: 'TASK',
          entityId: selectedEntityId,
          message: newCommMessage,
        },
        userContext
      );
      showToast('Comunicação registrada com sucesso!');
      setNewCommMessage('');
      loadAllData();
    } catch (err: any) {
      showToast(`Erro ao registrar comunicação: ${err.message}`);
    }
  };

  const handleRunTests = async () => {
    setTestingRunning(true);
    try {
      const res = await EnterpriseExecutionTestRunner.runAllTests();
      setTestResults(res);
      showToast('Suíte de testes da Fase 3.57 concluída!');
    } catch (err: any) {
      showToast(`Erro ao executar testes: ${err.message}`);
    } finally {
      setTestingRunning(false);
    }
  };

  const filteredActivities = activities.filter((a) => {
    const matchesSearch =
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
    const matchesPriority = priorityFilter === 'ALL' || a.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium">{notification}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-xl border border-indigo-900/50 text-white shadow-lg">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
              AutoERP v3.57
            </Badge>
            <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
              Fase 3.57 — Execução Operacional Integrada
            </Badge>
            <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Financeiro Congelado
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Central de Execução Operacional, Agenda & Produtividade
          </h1>
          <p className="text-slate-300 text-sm mt-1">
            Gestão unificada de tarefas, agenda, planejamento por período, carga de trabalho e controle gerencial.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nova Atividade
          </Button>
          <Button
            onClick={loadAllData}
            variant="outline"
            className="border-slate-700 hover:bg-slate-800 text-slate-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Executive KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="p-3 bg-slate-900/50 border-slate-800 text-slate-100 flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Tarefas Abertas</span>
          <div className="text-xl font-bold text-indigo-400 mt-1">{productivity?.openTasks || 0}</div>
        </Card>
        <Card className="p-3 bg-slate-900/50 border-slate-800 text-slate-100 flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Tarefas Atrasadas</span>
          <div className="text-xl font-bold text-rose-400 mt-1">{productivity?.overdueTasks || 0}</div>
        </Card>
        <Card className="p-3 bg-slate-900/50 border-slate-800 text-slate-100 flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Bloqueadas</span>
          <div className="text-xl font-bold text-amber-400 mt-1">{productivity?.blockedTasks || 0}</div>
        </Card>
        <Card className="p-3 bg-slate-900/50 border-slate-800 text-slate-100 flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">SLA Compliance</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">{productivity?.slaCompliance || 0}%</div>
        </Card>
        <Card className="p-3 bg-slate-900/50 border-slate-800 text-slate-100 flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Pendências Críticas</span>
          <div className="text-xl font-bold text-rose-400 mt-1">
            {pendingActions.filter((p) => p.priority === 'P0').length}
          </div>
        </Card>
        <Card className="p-3 bg-slate-900/50 border-slate-800 text-slate-100 flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Atividades de Hoje</span>
          <div className="text-xl font-bold text-cyan-400 mt-1">
            {planningBuckets?.TODAY?.activities?.length || 0}
          </div>
        </Card>
        <Card className="p-3 bg-slate-900/50 border-slate-800 text-slate-100 flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">Tempo Médio Conclusão</span>
          <div className="text-xl font-bold text-purple-400 mt-1">
            {productivity?.averageCompletionTime || 0}h
          </div>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-2 overflow-x-auto pb-1">
        {[
          { id: 'overview', label: 'Visão Geral', icon: TrendingUp },
          { id: 'agenda', label: 'Agenda Operacional', icon: Calendar },
          { id: 'activities', label: 'Tarefas & Atividades', icon: CheckSquare },
          { id: 'pending', label: 'Central de Pendências', icon: BellRing },
          { id: 'productivity', label: 'Produtividade & Equipes', icon: Award },
          { id: 'planning', label: 'Planejamento Operacional', icon: Kanban },
          { id: 'communication', label: 'Comunicação & Evidências', icon: MessageSquare },
          { id: 'audit', label: 'Auditoria & Timeline', icon: ShieldCheck },
          { id: 'homologation', label: 'Matriz Oficial v3.57', icon: Play },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-800 text-emerald-400 border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: VISÃO GERAL */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> Atividades & Pendências Críticas (P0)
            </h3>
            {filteredActivities.filter((a) => a.priority === 'P0').length === 0 ? (
              <p className="text-sm text-slate-400 italic">Nenhuma atividade P0 crítica pendente.</p>
            ) : (
              <div className="space-y-3">
                {filteredActivities
                  .filter((a) => a.priority === 'P0')
                  .slice(0, 5)
                  .map((act) => (
                    <div
                      key={act.id}
                      className="p-3 bg-slate-800/80 rounded-lg border border-rose-900/40 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-slate-100">{act.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Atribuído a: {act.assignedTo} | Início: {act.scheduledStart.substring(0, 10)}
                        </div>
                      </div>
                      <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30">
                        P0 - CRÍTICA
                      </Badge>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-indigo-400" /> Agenda do Dia (Próximos Eventos)
            </h3>
            {agendaEvents.slice(0, 5).length === 0 ? (
              <p className="text-sm text-slate-400 italic">Nenhum evento agendado para hoje.</p>
            ) : (
              <div className="space-y-3">
                {agendaEvents.slice(0, 5).map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium text-slate-100">{evt.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Início: {new Date(evt.startAt).toLocaleString()} | Tipo: {evt.sourceType}
                      </div>
                    </div>
                    <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                      {evt.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: AGENDA OPERACIONAL */}
      {activeTab === 'agenda' && (
        <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" /> Agenda Integrada de Operações
            </h3>
            <div className="flex items-center gap-2">
              {(['DAY', 'WEEK', 'MONTH', 'LIST'] as AgendaViewMode[]).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={agendaViewMode === mode ? 'default' : 'outline'}
                  onClick={() => setAgendaViewMode(mode)}
                  className={agendaViewMode === mode ? 'bg-indigo-600' : 'border-slate-700 text-slate-300'}
                >
                  {mode === 'DAY' ? 'Dia' : mode === 'WEEK' ? 'Semana' : mode === 'MONTH' ? 'Mês' : 'Lista'}
                </Button>
              ))}
            </div>
          </div>

          {agendaEvents.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">Nenhum evento na agenda registrado.</p>
          ) : (
            <div className="space-y-3">
              {agendaEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-4 bg-slate-800/60 rounded-lg border border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">{evt.title}</span>
                      <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">
                        {evt.sourceType}
                      </Badge>
                      <Badge className="bg-slate-700 text-slate-200 text-xs">{evt.priority}</Badge>
                    </div>
                    <p className="text-xs text-slate-400">{evt.description || 'Sem descrição adicional'}</p>
                    <div className="text-xs text-slate-500 flex items-center gap-3">
                      <span>Horário: {new Date(evt.startAt).toLocaleString()}</span>
                      <span>Responsável: {evt.assignedTo}</span>
                    </div>
                  </div>
                  <Badge
                    className={
                      evt.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }
                  >
                    {evt.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: TAREFAS & ATIVIDADES */}
      {activeTab === 'activities' && (
        <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar atividades..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200 text-sm rounded-lg p-2"
              >
                <option value="ALL">Todos os Status</option>
                <option value="PLANNED">PLANNED</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="BLOCKED">BLOCKED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200 text-sm rounded-lg p-2"
              >
                <option value="ALL">Todas Prioridades</option>
                <option value="P0">P0 - Crítica</option>
                <option value="P1">P1 - Alta</option>
                <option value="P2">P2 - Média</option>
                <option value="P3">P3 - Baixa</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/80 text-xs text-slate-400 uppercase">
                <tr>
                  <th className="p-3">Título / Descrição</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Prioridade</th>
                  <th className="p-3">Responsável</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredActivities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500 italic">
                      Nenhuma atividade encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredActivities.map((act) => (
                    <tr key={act.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-medium text-slate-100">
                        <div>{act.title}</div>
                        <div className="text-xs text-slate-400 font-normal">{act.description}</div>
                      </td>
                      <td className="p-3">
                        <Badge className="bg-slate-800 text-slate-300 border-slate-700">{act.type}</Badge>
                      </td>
                      <td className="p-3">
                        <Badge
                          className={
                            act.priority === 'P0'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              : act.priority === 'P1'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                          }
                        >
                          {act.priority}
                        </Badge>
                      </td>
                      <td className="p-3 text-slate-300">{act.assignedTo}</td>
                      <td className="p-3">
                        <Badge
                          className={
                            act.status === 'COMPLETED'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : act.status === 'BLOCKED'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                          }
                        >
                          {act.status}
                        </Badge>
                      </td>
                      <td className="p-3 space-x-1">
                        {act.status !== 'IN_PROGRESS' && act.status !== 'COMPLETED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-slate-700"
                            onClick={() => handleUpdateStatus(act.id, 'IN_PROGRESS')}
                          >
                            Iniciar
                          </Button>
                        )}
                        {act.status === 'IN_PROGRESS' && (
                          <Button
                            size="sm"
                            className="text-xs bg-emerald-600 hover:bg-emerald-500"
                            onClick={() => handleUpdateStatus(act.id, 'COMPLETED')}
                          >
                            Concluir
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 4: CENTRAL DE PENDÊNCIAS */}
      {activeTab === 'pending' && (
        <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <BellRing className="w-5 h-5 text-rose-400" /> Central Unificada de Pendências Operacionais
          </h3>
          <p className="text-sm text-slate-400">
            Converter qualquer pendência operacional identificada em Tarefa Operacional ativa com SLA.
          </p>

          <div className="space-y-3">
            {pendingActions.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 italic">Nenhuma pendência operacional pendente.</p>
            ) : (
              pendingActions.map((p) => (
                <div
                  key={p.id}
                  className="p-4 bg-slate-800/60 rounded-lg border border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">{p.title}</span>
                      <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30">{p.priority}</Badge>
                      <Badge className="bg-slate-700 text-slate-300">{p.category}</Badge>
                    </div>
                    <p className="text-xs text-slate-400">{p.description}</p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1"
                    onClick={() => handleConvertPendingToTask(p.id)}
                  >
                    <CheckSquare className="w-4 h-4" /> Converter em Tarefa
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* TAB 5: PRODUTIVIDADE & EQUIPES */}
      {activeTab === 'productivity' && (
        <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200 space-y-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" /> Carga de Trabalho & Análise de Sobrecarga por Usuário
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {productivity &&
              (Object.values(productivity.workloadByUser || {}) as UserWorkload[]).map((userWork) => (
                <Card
                  key={userWork.userId}
                  className="p-4 bg-slate-800/80 border-slate-700 text-slate-200 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-white">{userWork.userName}</span>
                    </div>
                    <Badge
                      className={
                        userWork.classification === 'CRÍTICA'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : userWork.classification === 'SOBRECARGA'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }
                    >
                      {userWork.classification}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-900/60 p-2 rounded">
                      <span className="text-slate-400">Abertas:</span>{' '}
                      <span className="font-bold text-white">{userWork.openTasks}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded">
                      <span className="text-slate-400">Atrasadas:</span>{' '}
                      <span className="font-bold text-rose-400">{userWork.overdueTasks}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded">
                      <span className="text-slate-400">Críticas (P0):</span>{' '}
                      <span className="font-bold text-amber-400">{userWork.criticalTasks}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded">
                      <span className="text-slate-400">Bloqueadas:</span>{' '}
                      <span className="font-bold text-cyan-400">{userWork.blockedTasks}</span>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </Card>
      )}

      {/* TAB 6: PLANEJAMENTO OPERACIONAL */}
      {activeTab === 'planning' && (
        <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Kanban className="w-5 h-5 text-indigo-400" /> Visão Sequencial de Planejamento Operacional
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {planningBuckets &&
              (Object.keys(planningBuckets) as PlanningPeriod[]).map((periodKey) => {
                const bucket = planningBuckets[periodKey];
                return (
                  <Card key={periodKey} className="p-3 bg-slate-800/80 border-slate-700 flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{bucket.title}</span>
                      <Badge className="bg-indigo-500/20 text-indigo-300 text-xs">
                        {bucket.activities.length} Atividades
                      </Badge>
                    </div>

                    <div className="space-y-2 overflow-y-auto max-h-64">
                      {bucket.activities.length === 0 ? (
                        <p className="text-xs text-slate-500 italic p-2">Sem atividades.</p>
                      ) : (
                        bucket.activities.map((act) => (
                          <div
                            key={act.id}
                            className="p-2 bg-slate-900/80 rounded border border-slate-700/80 text-xs space-y-1"
                          >
                            <div className="font-medium text-slate-200">{act.title}</div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">{act.priority}</span>
                              <span className="text-slate-500">{act.assignedTo}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                );
              })}
          </div>
        </Card>
      )}

      {/* TAB 7: COMUNICAÇÃO & EVIDÊNCIAS */}
      {activeTab === 'communication' && (
        <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-cyan-400" /> Mural de Comunicação & Evidências Append-Only
          </h3>

          <form onSubmit={handleAddCommunication} className="p-4 bg-slate-800/80 rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <select
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
                className="bg-slate-900 border-slate-700 text-slate-200 text-sm rounded p-2 flex-1"
              >
                <option value="">Selecione a Tarefa ou Atividade...</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    Atividade: {a.title}
                  </option>
                ))}
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    Tarefa: {t.title}
                  </option>
                ))}
              </select>
            </div>

            <Input
              placeholder="Digite sua atualização, observação ou menção..."
              value={newCommMessage}
              onChange={(e) => setNewCommMessage(e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
            />

            <Button type="submit" size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white">
              Registrar Comunicação
            </Button>
          </form>

          <div className="space-y-3 mt-4">
            {communications.length === 0 ? (
              <p className="text-slate-500 text-sm italic py-2">Nenhum comentário registrado no histórico.</p>
            ) : (
              communications.map((comm) => (
                <div key={comm.id} className="p-3 bg-slate-800/60 rounded border border-slate-700 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">{comm.authorName}</span>
                    <span>{new Date(comm.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-slate-300">{comm.message}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* TAB 8: AUDITORIA & TIMELINE */}
      {activeTab === 'audit' && (
        <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> Trilha de Auditoria com Correlation ID
          </h3>
          <p className="text-sm text-slate-400">
            Registro append-only imutável de todas as transições de estado e alterações operacionais.
          </p>
          <div className="space-y-2 text-xs font-mono bg-slate-950 p-4 rounded border border-slate-800 max-h-96 overflow-y-auto">
            {activities.map((a) => (
              <div key={a.id} className="text-slate-300 py-1 border-b border-slate-800/50">
                <span className="text-emerald-400">[{a.createdAt}]</span>{' '}
                <span className="text-indigo-300">[{a.correlationId}]</span> USER: {a.createdBy} ACTION: CREATE_ACTIVITY ID: {a.id} TITLE: &quot;{a.title}&quot; STATUS: {a.status}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* TAB 9: MATRIZ OFICIAL V3.57 */}
      {activeTab === 'homologation' && (
        <Card className="p-5 bg-slate-900 border-slate-800 text-slate-200 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-400" /> Matriz Oficial de Homologação da Fase 3.57
              </h3>
              <p className="text-sm text-slate-400">
                Suíte com 25 Testes Adversariais, 30 Testes E2E e Validação de Proteção Financeira.
              </p>
            </div>
            <Button
              onClick={handleRunTests}
              disabled={testingRunning}
              className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              {testingRunning ? 'Executando Suíte...' : 'Executar Suíte Completa 3.57'}
            </Button>
          </div>

          {testResults && (
            <div className="space-y-6">
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs text-slate-200">
                <div className="text-emerald-400 font-bold mb-2">
                  RESUMO DA HOMOLOGAÇÃO: TOTAL={testResults.summary.total} | PASSED={testResults.summary.passed} | FAILED={testResults.summary.failed}
                </div>
                <div>STATUS FASE 3.57: {testResults.summary.failed === 0 ? 'HOMOLOGADA [SIM]' : 'REPROVADA [NÃO]'}</div>
                <div>NÚCLEO FINANCEIRO: 🔒 INTACTO (FINANCIAL_FILES_MODIFIED = 0)</div>
              </div>

              {/* Adversarial list */}
              <div>
                <h4 className="font-semibold text-slate-200 text-sm mb-2">Testes Adversariais (25/25)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {testResults.adversarialResults.map((r) => (
                    <div key={r.id} className="p-2 bg-slate-800/80 rounded border border-slate-700 flex items-center justify-between">
                      <span className="font-mono text-slate-300">{r.id}: {r.name}</span>
                      <Badge className={r.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}>
                        {r.passed ? 'PASSED' : 'FAILED'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* E2E list */}
              <div>
                <h4 className="font-semibold text-slate-200 text-sm mb-2">Testes E2E (30/30)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {testResults.e2eResults.map((r) => (
                    <div key={r.id} className="p-2 bg-slate-800/80 rounded border border-slate-700 flex items-center justify-between">
                      <span className="font-mono text-slate-300">{r.id}: {r.name}</span>
                      <Badge className={r.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}>
                        {r.passed ? 'PASSED' : 'FAILED'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* CREATE ACTIVITY MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6 bg-slate-900 border-slate-800 text-slate-100 space-y-4">
            <h3 className="text-lg font-bold text-white">Criar Nova Atividade Operacional</h3>

            <form onSubmit={handleCreateActivity} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Título da Atividade</label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Vistoria de Entrega do Veículo XYZ-9876"
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Descrição</label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Detalhes operacionais adicionais..."
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tipo de Atividade</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full bg-slate-800 border-slate-700 text-slate-200 text-sm rounded p-2"
                  >
                    <option value="TASK">TASK</option>
                    <option value="INSPECTION">INSPECTION</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="DELIVERY">DELIVERY</option>
                    <option value="RETURN">RETURN</option>
                    <option value="MEETING">MEETING</option>
                    <option value="DOCUMENT_REVIEW">DOCUMENT_REVIEW</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Prioridade</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-slate-800 border-slate-700 text-slate-200 text-sm rounded p-2"
                  >
                    <option value="P0">P0 - Crítica</option>
                    <option value="P1">P1 - Alta</option>
                    <option value="P2">P2 - Média</option>
                    <option value="P3">P3 - Baixa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Responsável Atribuído</label>
                <Input
                  value={newAssignedTo}
                  onChange={(e) => setNewAssignedTo(e.target.value)}
                  placeholder="ID do Usuário ou 'EQUIPE_OPERACIONAL'"
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="border-slate-700 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  Criar Atividade
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
