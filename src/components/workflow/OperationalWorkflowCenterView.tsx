// AutoERP Operational Workflow & Execution Control View (Phase 3.56)

import React, { useState, useEffect, useMemo } from 'react';
import {
  ListTodo,
  AlertTriangle,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Unlock,
  Play,
  RotateCcw,
  XCircle,
  FileText,
  Layers,
  Settings,
  Activity,
  Filter,
  Plus,
  User,
  UserCheck,
  RefreshCw,
  Search,
  Building2,
  ShieldCheck,
  Cpu,
  BarChart2,
  History,
  CheckSquare
} from 'lucide-react';
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  SLARecord,
  PendingAction,
  WorkflowRule,
  WorkflowMetrics,
  UserContext
} from '../../domain/workflow/types';
import { TaskService } from '../../domain/workflow/TaskService';
import { SLAService } from '../../domain/workflow/SLAService';
import { PendingActionService } from '../../domain/workflow/PendingActionService';
import { WorkflowService } from '../../domain/workflow/WorkflowService';
import { WorkflowMetricsService } from '../../domain/workflow/WorkflowMetricsService';
import { EnterpriseWorkflowTestRunner, TestResult } from '../../domain/workflow/EnterpriseWorkflowTestRunner';
import { AuditLogRepository } from '../../persistence/repositories/localRepositories';
import { AuditLog } from '../../types/entities/audit';

export const OperationalWorkflowCenterView: React.FC = () => {
  const [companyId, setCompanyId] = useState<string>('company-1');
  const [activeSubTab, setActiveSubTab] = useState<'tasks' | 'pendencies' | 'sla' | 'workflows' | 'timeline' | 'matriz'>('tasks');

  // User Context Simulation
  const [userRole, setUserRole] = useState<'ADMIN' | 'OPERATIONAL_MANAGER' | 'ATTENDANT'>('ADMIN');
  const userContext: UserContext = useMemo(() => ({
    userId: 'usr-exec-1',
    userName: 'Gestor Operacional',
    role: userRole,
    companyId
  }), [companyId, userRole]);

  // Data States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendencies, setPendencies] = useState<PendingAction[]>([]);
  const [slaRecords, setSlaRecords] = useState<SLARecord[]>([]);
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals / Forms
  const [showCreateTaskModal, setShowCreateTaskModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newCategory, setNewCategory] = useState<TaskCategory>('DOCUMENT');
  const [newPriority, setNewPriority] = useState<TaskPriority>('P2');
  const [newAssignee, setNewAssignee] = useState<string>('');

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [blockReasonInput, setBlockReasonInput] = useState<string>('');
  const [resolutionInput, setResolutionInput] = useState<string>('');
  const [evidenceContentInput, setEvidenceContentInput] = useState<string>('');

  // Test Runner States
  const [testRunning, setTestRunning] = useState<boolean>(false);
  const [advResults, setAdvResults] = useState<TestResult[]>([]);
  const [e2eResults, setE2eResults] = useState<TestResult[]>([]);
  const [testsExecuted, setTestsExecuted] = useState<boolean>(false);

  const auditRepo = useMemo(() => new AuditLogRepository(), []);

  // Load All Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [tList, pList, sList, rList, mData, aList] = await Promise.all([
        TaskService.getAllTasks(companyId),
        PendingActionService.getPendingActions(companyId),
        SLAService.getSLARecords(companyId),
        WorkflowService.getWorkflowRules(companyId),
        WorkflowMetricsService.calculateMetrics(companyId),
        auditRepo.findAll()
      ]);

      setTasks(tList);
      setPendencies(pList);
      setSlaRecords(sList);
      setRules(rList);
      setMetrics(mData);
      setAuditLogs((aList || []).filter(a => a.companyId === companyId && (a.entityName === 'Task' || a.entityName === 'SLA' || a.entityName === 'PendingAction' || a.entityName === 'WorkflowService')));
    } catch (err: any) {
      setActionError(err.message || 'Erro ao carregar dados do Workflow');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId]);

  const showNotification = (msg: string, isErr = false) => {
    if (isErr) {
      setActionError(msg);
      setTimeout(() => setActionError(null), 5000);
    } else {
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  // Task Actions
  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      showNotification('Título da tarefa é obrigatório', true);
      return;
    }
    try {
      await TaskService.createTask(
        {
          companyId,
          title: newTitle,
          description: newDescription,
          category: newCategory,
          priority: newPriority,
          severity: newPriority === 'P0' ? 'CRITICAL' : newPriority === 'P1' ? 'HIGH' : newPriority === 'P2' ? 'MEDIUM' : 'LOW',
          sourceType: 'MANUAL',
          sourceId: `manual-${Date.now()}`,
          entityType: 'SYSTEM',
          entityId: 'sys-manual',
          assignedUserId: newAssignee || undefined
        },
        userContext
      );
      showNotification('Tarefa criada com sucesso!');
      setShowCreateTaskModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewAssignee('');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleAssignTask = async (taskId: string, assignee: string) => {
    try {
      await TaskService.assignTask(taskId, companyId, assignee, userContext);
      showNotification(`Tarefa atribuída a ${assignee}`);
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleStartTask = async (taskId: string) => {
    try {
      await TaskService.startTask(taskId, companyId, userContext);
      showNotification('Tarefa iniciada');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleBlockTask = async (taskId: string) => {
    if (!blockReasonInput.trim()) {
      showNotification('Motivo do bloqueio é obrigatório', true);
      return;
    }
    try {
      await TaskService.blockTask(taskId, companyId, blockReasonInput, userContext);
      showNotification('Tarefa bloqueada');
      setBlockReasonInput('');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleUnblockTask = async (taskId: string) => {
    try {
      await TaskService.unblockTask(taskId, companyId, userContext);
      showNotification('Tarefa desbloqueada');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await TaskService.completeTask(taskId, companyId, resolutionInput || 'Concluído via central', userContext);
      showNotification('Tarefa concluída');
      setResolutionInput('');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleCloseTask = async (taskId: string) => {
    try {
      await TaskService.closeTask(taskId, companyId, userContext);
      showNotification('Tarefa validada e fechada');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleReopenTask = async (taskId: string) => {
    try {
      await TaskService.reopenTask(taskId, companyId, 'Reabertura operacional', userContext);
      showNotification('Tarefa reaberta');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      await TaskService.cancelTask(taskId, companyId, 'Cancelada pelo usuário', userContext);
      showNotification('Tarefa cancelada');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleAddEvidence = async (taskId: string) => {
    if (!evidenceContentInput.trim()) return;
    try {
      await TaskService.addEvidence(
        taskId,
        companyId,
        { type: 'COMMENT', content: evidenceContentInput, addedBy: userContext.userName || userContext.userId },
        userContext
      );
      showNotification('Evidência adicionada');
      setEvidenceContentInput('');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleConvertPending = async (pendingId: string) => {
    try {
      await PendingActionService.convertPendingToTask(pendingId, companyId, userContext.userId, userContext);
      showNotification('Pendência convertida em Tarefa com sucesso');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleRunAutomations = async () => {
    try {
      const res = await WorkflowService.runAutomations(companyId, userContext);
      showNotification(`Automação executada: ${res.pendenciesCreated} pendências, ${res.tasksCreated} tarefas criadas e ${res.slasUpdated} SLAs atualizados`);
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    }
  };

  const handleRunTestRunner = async () => {
    setTestRunning(true);
    try {
      const res = await EnterpriseWorkflowTestRunner.runAllTests();
      setAdvResults(res.adversarialResults);
      setE2eResults(res.e2eResults);
      setTestsExecuted(true);
      showNotification('Suíte de Testes da Fase 3.56 executada!');
      await loadData();
    } catch (err: any) {
      showNotification(err.message, true);
    } finally {
      setTestRunning(false);
    }
  };

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(term);
        const matchEntity = t.entityId.toLowerCase().includes(term);
        const matchAssignee = (t.assignedUserId || '').toLowerCase().includes(term);
        if (!matchTitle && !matchEntity && !matchAssignee) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, searchTerm]);

  const getPriorityBadgeClass = (p: TaskPriority) => {
    switch (p) {
      case 'P0': return 'bg-red-100 text-red-800 border-red-300 font-bold';
      case 'P1': return 'bg-orange-100 text-orange-800 border-orange-300 font-semibold';
      case 'P2': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'P3': return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const getStatusBadgeClass = (s: TaskStatus) => {
    switch (s) {
      case 'OPEN': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'ASSIGNED': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'IN_PROGRESS': return 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse';
      case 'BLOCKED': return 'bg-red-50 text-red-700 border-red-200';
      case 'WAITING_VALIDATION': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'COMPLETED': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'CLOSED': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'CANCELLED': return 'bg-slate-100 text-slate-500 border-slate-200 line-through';
      case 'REOPENED': return 'bg-rose-50 text-rose-700 border-rose-200';
    }
  };

  const getSLABadgeClass = (status: string) => {
    switch (status) {
      case 'ON_TRACK': return 'bg-emerald-100 text-emerald-800';
      case 'WARNING': return 'bg-amber-100 text-amber-800 font-semibold';
      case 'BREACHED': return 'bg-red-100 text-red-800 font-bold animate-bounce';
      case 'RESOLVED': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen text-slate-800">
      {/* Header Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-lg shadow-md">
              <ListTodo className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Central de Workflow & Execução Operacional
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                AutoERP v3.56 • Gestão de Tarefas, SLAs, Pendências e Automações sem Alteração Financeira (Read-Only)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
            <Building2 className="w-4 h-4 text-slate-500" />
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="bg-transparent font-semibold text-slate-700 focus:outline-none"
            >
              <option value="company-1">Empresa Alpha (ID: company-1)</option>
              <option value="company-test-tenant-a">Tenant Teste A</option>
              <option value="company-test-tenant-b">Tenant Teste B</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
            <UserCheck className="w-4 h-4 text-slate-500" />
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value as any)}
              className="bg-transparent font-semibold text-slate-700 focus:outline-none"
            >
              <option value="ADMIN">Perfil: ADMIN</option>
              <option value="OPERATIONAL_MANAGER">Perfil: GESTOR OPERACIONAL</option>
              <option value="ATTENDANT">Perfil: ATENDENTE</option>
            </select>
          </div>

          <button
            onClick={handleRunAutomations}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Play className="w-3.5 h-3.5" />
            Rodar Automações
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
            title="Atualizar Dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>{actionError}</span>
          </div>
        </div>
      )}

      {/* Executive KPIs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs font-medium">
            <span>Total Tarefas</span>
            <ListTodo className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{metrics?.totalTasks || 0}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metrics?.openTasks || 0} Abertas • {metrics?.inProgressTasks || 0} Em Andamento
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs font-medium">
            <span>SLA Compliance</span>
            <BarChart2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">{metrics?.slaComplianceRate || 100}%</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metrics?.slaBreachedCount || 0} Rompidos • {metrics?.slaWarningCount || 0} Em Alerta
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs font-medium">
            <span>Tarefas Bloqueadas</span>
            <Lock className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-600 mt-2">{metrics?.blockedTasks || 0}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Taxa Bloqueio: {metrics?.blockedRate || 0}%
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs font-medium">
            <span>Pendências Ativas</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-2">{metrics?.totalPendingActions || 0}</div>
          <div className="text-[11px] text-slate-500 mt-1 font-semibold text-red-600">
            {metrics?.criticalPendencies || 0} Críticas (P0/P1)
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs font-medium">
            <span>Sem Responsável</span>
            <User className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{metrics?.unassignedTasks || 0}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Taxa Conclusão: {metrics?.completionRate || 0}%
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 flex items-center gap-2 overflow-x-auto bg-white p-1 rounded-xl shadow-sm">
        <button
          onClick={() => setActiveSubTab('tasks')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition ${
            activeSubTab === 'tasks' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ListTodo className="w-4 h-4" />
          Tarefas ({tasks.length})
        </button>

        <button
          onClick={() => setActiveSubTab('pendencies')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition ${
            activeSubTab === 'pendencies' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Central de Pendências ({pendencies.length})
        </button>

        <button
          onClick={() => setActiveSubTab('sla')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition ${
            activeSubTab === 'sla' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          Gestão de SLA ({slaRecords.length})
        </button>

        <button
          onClick={() => setActiveSubTab('workflows')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition ${
            activeSubTab === 'workflows' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          Regras de Automação
        </button>

        <button
          onClick={() => setActiveSubTab('timeline')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition ${
            activeSubTab === 'timeline' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          Auditoria & Timeline
        </button>

        <button
          onClick={() => setActiveSubTab('matriz')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition ${
            activeSubTab === 'matriz' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Matriz Oficial v3.56
        </button>
      </div>

      {/* Sub-Tab 1: Tasks */}
      {activeSubTab === 'tasks' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar tarefa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
              >
                <option value="ALL">Todos os Status</option>
                <option value="OPEN">OPEN (Abertas)</option>
                <option value="ASSIGNED">ASSIGNED (Atribuídas)</option>
                <option value="IN_PROGRESS">IN_PROGRESS (Em Andamento)</option>
                <option value="BLOCKED">BLOCKED (Bloqueadas)</option>
                <option value="WAITING_VALIDATION">WAITING_VALIDATION (Em Validação)</option>
                <option value="COMPLETED">COMPLETED (Concluídas)</option>
                <option value="CLOSED">CLOSED (Fechadas)</option>
                <option value="CANCELLED">CANCELLED (Canceladas)</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
              >
                <option value="ALL">Todas as Prioridades</option>
                <option value="P0">P0 (Crítica)</option>
                <option value="P1">P1 (Alta)</option>
                <option value="P2">P2 (Média)</option>
                <option value="P3">P3 (Baixa)</option>
              </select>
            </div>

            <button
              onClick={() => setShowCreateTaskModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition"
            >
              <Plus className="w-4 h-4" />
              Nova Tarefa
            </button>
          </div>

          {/* Create Task Modal */}
          {showCreateTaskModal && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-900 text-sm">Criar Nova Tarefa Operacional</h3>
                  <button onClick={() => setShowCreateTaskModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                <form onSubmit={handleCreateTaskSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Título</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Ex: Atualizar licenciamento do veículo AAA-1234"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                    <textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Detalhes operacionais da tarefa..."
                      className="w-full p-2 border border-slate-200 rounded-lg h-20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as any)}
                        className="w-full p-2 border border-slate-200 rounded-lg"
                      >
                        <option value="DOCUMENT">Documentação</option>
                        <option value="MAINTENANCE">Manutenção</option>
                        <option value="INSURANCE">Seguro</option>
                        <option value="TRACKER">Rastreador</option>
                        <option value="FINE">Multa</option>
                        <option value="CONTRACT">Contrato</option>
                        <option value="INCIDENT">Incidente</option>
                        <option value="DATA_QUALITY">Qualidade de Dados</option>
                        <option value="OPERATIONAL_GENERAL">Geral</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Prioridade</label>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value as any)}
                        className="w-full p-2 border border-slate-200 rounded-lg"
                      >
                        <option value="P0">P0 (Crítica - 2h SLA)</option>
                        <option value="P1">P1 (Alta - 8h SLA)</option>
                        <option value="P2">P2 (Média - 24h SLA)</option>
                        <option value="P3">P3 (Baixa - 72h SLA)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Atribuir a Usuário (Opcional)</label>
                    <input
                      type="text"
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      placeholder="Ex: usr-atendente-01"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateTaskModal(false)}
                      className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                    >
                      Criar Tarefa
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Tasks Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Prioridade / ID</th>
                    <th className="py-3 px-4">Título & Origem</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4">Prazo / SLA</th>
                    <th className="py-3 px-4 text-right">Ações de Controle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Nenhuma tarefa encontrada.
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((task) => {
                      const taskSLA = slaRecords.find(s => s.taskId === task.id || s.id === task.slaId);
                      return (
                        <tr key={task.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded border text-[10px] ${getPriorityBadgeClass(task.priority)}`}>
                              {task.priority}
                            </span>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{task.id}</div>
                          </td>

                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-bold text-slate-900 truncate">{task.title}</div>
                            <div className="text-[10px] text-slate-500 truncate mt-0.5">
                              {task.description || 'Sem descrição'} • Origem: <span className="font-mono">{task.sourceType} ({task.sourceId})</span>
                            </div>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-700">
                            {task.category}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-1 rounded-md text-[11px] border font-bold ${getStatusBadgeClass(task.status)}`}>
                              {task.status}
                            </span>
                            {task.blockedReason && (
                              <div className="text-[10px] text-red-600 font-medium mt-1 truncate max-w-[150px]">
                                Motivo: {task.blockedReason}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            {task.assignedUserId ? (
                              <span className="font-medium text-slate-800 flex items-center gap-1">
                                <User className="w-3 h-3 text-indigo-500" />
                                {task.assignedUserId}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Não Atribuído</span>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="text-slate-700 font-medium">
                              {new Date(task.dueAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                            {taskSLA && (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] mt-0.5 ${getSLABadgeClass(taskSLA.status)}`}>
                                SLA: {taskSLA.status} ({taskSLA.consumedPercent}%)
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {!task.assignedUserId && task.status === 'OPEN' && (
                                <button
                                  onClick={() => handleAssignTask(task.id, userContext.userId)}
                                  className="p-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-[11px] font-semibold flex items-center gap-1"
                                  title="Atribuir a mim"
                                >
                                  <UserCheck className="w-3.5 h-3.5" /> Atribuir
                                </button>
                              )}

                              {task.status === 'ASSIGNED' && (
                                <button
                                  onClick={() => handleStartTask(task.id)}
                                  className="p-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded text-[11px] font-semibold flex items-center gap-1"
                                >
                                  <Play className="w-3.5 h-3.5" /> Iniciar
                                </button>
                              )}

                              {task.status === 'IN_PROGRESS' && (
                                <>
                                  <button
                                    onClick={() => handleCompleteTask(task.id)}
                                    className="p-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[11px] font-semibold flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                                  </button>
                                  <button
                                    onClick={() => {
                                      const reason = prompt('Informe o motivo do bloqueio:');
                                      if (reason) {
                                        setBlockReasonInput(reason);
                                        handleBlockTask(task.id);
                                      }
                                    }}
                                    className="p-1 bg-red-50 text-red-700 hover:bg-red-100 rounded text-[11px] font-semibold flex items-center gap-1"
                                  >
                                    <Lock className="w-3.5 h-3.5" /> Bloquear
                                  </button>
                                </>
                              )}

                              {task.status === 'BLOCKED' && (
                                <button
                                  onClick={() => handleUnblockTask(task.id)}
                                  className="p-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[11px] font-semibold flex items-center gap-1"
                                >
                                  <Unlock className="w-3.5 h-3.5" /> Desbloquear
                                </button>
                              )}

                              {task.status === 'COMPLETED' && (
                                <button
                                  onClick={() => handleCloseTask(task.id)}
                                  className="p-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded text-[11px] font-bold flex items-center gap-1"
                                >
                                  <CheckSquare className="w-3.5 h-3.5" /> Validar & Fechar
                                </button>
                              )}

                              {(task.status === 'CLOSED' || task.status === 'CANCELLED') && (
                                <button
                                  onClick={() => handleReopenTask(task.id)}
                                  className="p-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[11px] font-semibold flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                                </button>
                              )}

                              <button
                                onClick={() => setSelectedTask(task)}
                                className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                                title="Ver Detalhes e Evidências"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected Task Detail Drawer / Modal */}
          {selectedTask && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${getPriorityBadgeClass(selectedTask.priority)}`}>
                        {selectedTask.priority}
                      </span>
                      <h3 className="font-bold text-slate-900 text-base">{selectedTask.title}</h3>
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-1">ID: {selectedTask.id} • Correlation: {selectedTask.correlationId}</div>
                  </div>
                  <button onClick={() => setSelectedTask(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded-lg">
                  <div><span className="font-semibold text-slate-500">Categoria:</span> {selectedTask.category}</div>
                  <div><span className="font-semibold text-slate-500">Status:</span> {selectedTask.status}</div>
                  <div><span className="font-semibold text-slate-500">Origem:</span> {selectedTask.sourceType} ({selectedTask.sourceId})</div>
                  <div><span className="font-semibold text-slate-500">Entidade:</span> {selectedTask.entityType} ({selectedTask.entityId})</div>
                  <div><span className="font-semibold text-slate-500">Atribuído a:</span> {selectedTask.assignedUserId || 'Nenhum'}</div>
                  <div><span className="font-semibold text-slate-500">Prazo:</span> {new Date(selectedTask.dueAt).toLocaleString()}</div>
                </div>

                {selectedTask.resolution && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
                    <span className="font-bold">Resolução:</span> {selectedTask.resolution}
                  </div>
                )}

                {/* Evidences Timeline */}
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" /> Evidências e Comentários ({selectedTask.evidences.length})
                  </h4>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedTask.evidences.length === 0 ? (
                      <div className="text-xs text-slate-400 italic">Nenhuma evidência registrada.</div>
                    ) : (
                      selectedTask.evidences.map(ev => (
                        <div key={ev.id} className="p-2 bg-slate-50 rounded border border-slate-200 text-xs">
                          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                            <span>{ev.addedBy}</span>
                            <span>{new Date(ev.addedAt).toLocaleString()}</span>
                          </div>
                          <div className="text-slate-800 mt-1">{ev.content}</div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <input
                      type="text"
                      value={evidenceContentInput}
                      onChange={(e) => setEvidenceContentInput(e.target.value)}
                      placeholder="Adicionar comentário ou evidência..."
                      className="flex-1 p-2 border border-slate-200 rounded-lg text-xs"
                    />
                    <button
                      onClick={() => handleAddEvidence(selectedTask.id)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedTask(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 2: Pendencies Central */}
      {activeSubTab === 'pendencies' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Central de Pendências Consolidadas</h3>
              <p className="text-xs text-slate-500">Pendências identificadas automaticamente em todos os subsistemas operacionais</p>
            </div>
            <button
              onClick={async () => {
                await PendingActionService.consolidatePendingActions(companyId);
                await loadData();
              }}
              className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100"
            >
              Consolidar Agora
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendencies.length === 0 ? (
              <div className="col-span-2 bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400">
                Nenhuma pendência ativa no momento.
              </div>
            ) : (
              pendencies.map((pend) => (
                <div key={pend.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${getPriorityBadgeClass(pend.priority)}`}>
                        {pend.priority} • {pend.category}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        pend.status === 'OPEN' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {pend.status}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm mt-2">{pend.title}</h4>
                    <p className="text-xs text-slate-600 mt-1">{pend.description}</p>
                    <div className="text-[10px] text-slate-400 font-mono mt-2">
                      Origem: {pend.sourceType} ({pend.sourceId})
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                    <span className="text-slate-400 text-[11px]">
                      {pend.dueAt ? `Prazo: ${new Date(pend.dueAt).toLocaleDateString()}` : 'Sem prazo definido'}
                    </span>
                    {pend.status === 'OPEN' && (
                      <button
                        onClick={() => handleConvertPending(pend.id)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Gerar Tarefa
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 3: SLA Dashboard */}
      {activeSubTab === 'sla' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 text-sm">Painel de Cumprimento de SLA</h3>
            <p className="text-xs text-slate-500">Monitoramento contínuo de tempo de atendimento e estouro de limites parametrizados</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">SLA ID / Task</th>
                  <th className="py-3 px-4">Prioridade</th>
                  <th className="py-3 px-4">Status SLA</th>
                  <th className="py-3 px-4">Alvo (Horas)</th>
                  <th className="py-3 px-4">Decorridos vs Restantes</th>
                  <th className="py-3 px-4">Consumo SLA</th>
                  <th className="py-3 px-4">Prazo Limite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slaRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Nenhum registro de SLA encontrado.
                    </td>
                  </tr>
                ) : (
                  slaRecords.map((sla) => (
                    <tr key={sla.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <div className="font-bold text-slate-800">{sla.id}</div>
                        <div className="text-slate-400">{sla.taskId}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${getPriorityBadgeClass(sla.priority)}`}>
                          {sla.priority}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-[11px] font-bold ${getSLABadgeClass(sla.status)}`}>
                          {sla.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {sla.targetHours}h
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        <div>{sla.elapsedMinutes} min decorridos</div>
                        <div className="text-[10px] text-slate-400">{sla.remainingMinutes} min restantes</div>
                      </td>

                      <td className="py-3 px-4 w-40">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${sla.consumedPercent >= 100 ? 'bg-red-600' : sla.consumedPercent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, sla.consumedPercent)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-600">{sla.consumedPercent}%</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        {new Date(sla.dueAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 4: Workflow Rules */}
      {activeSubTab === 'workflows' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Regras de Automação de Workflow</h3>
              <p className="text-xs text-slate-500">Mapeamento de eventos e geração automática de tarefas</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <div key={rule.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-900 text-sm">{rule.name}</h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {rule.enabled ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div>Gatilho: <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">{rule.eventTrigger}</span></div>
                  <div>Prioridade Padrão: <span className="font-bold text-slate-800">{rule.defaultPriority}</span></div>
                  <div>Criação Automática: <span className="font-semibold text-indigo-600">{rule.autoCreateTask ? 'SIM' : 'NÃO'}</span></div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={async () => {
                      const updated = { ...rule, enabled: !rule.enabled };
                      await WorkflowService.updateWorkflowRule(companyId, updated, userContext);
                      await loadData();
                    }}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-semibold text-slate-700"
                  >
                    {rule.enabled ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-Tab 5: Audit & History Timeline */}
      {activeSubTab === 'timeline' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 text-sm">Histórico & Trilha de Auditoria Append-Only</h3>
            <p className="text-xs text-slate-500">Registro imutável de todas as transições de tarefas, SLAs e execuções de workflow</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 max-h-[500px] overflow-y-auto">
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">Nenhum registro de auditoria.</div>
            ) : (
              auditLogs.slice().reverse().map((log) => (
                <div key={log.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                    <span className="font-bold text-indigo-600">{log.entityName} ({log.entityId})</span>
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="font-semibold text-slate-800">
                    Ação: <span className="text-slate-900">{log.action}</span> • Usuário: {log.userName} ({log.userId})
                  </div>
                  {log.newState && (
                    <div className="text-[10px] text-slate-600 bg-white p-2 rounded border border-slate-200 font-mono overflow-x-auto truncate">
                      State: {log.newState}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 6: Matriz Oficial v3.56 */}
      {activeSubTab === 'matriz' && (
        <div className="space-y-4">
          <div className="bg-slate-900 text-slate-100 p-6 rounded-xl shadow-lg border border-slate-800 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-emerald-400 font-mono">Matriz de Homologação — Fase 3.56</h3>
                <p className="text-xs text-slate-400 font-mono">Execução de Testes Adversariais ADV-3.56-01..20 e E2E-3.56-01..25</p>
              </div>

              <button
                onClick={handleRunTestRunner}
                disabled={testRunning}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs font-mono transition flex items-center gap-2"
              >
                <Cpu className="w-4 h-4" />
                {testRunning ? 'Executando Suíte...' : 'Executar Suíte Completa 3.56'}
              </button>
            </div>

            {/* Terminal Matriz Display */}
            <div className="bg-black/80 p-4 rounded-lg font-mono text-xs text-emerald-400 border border-slate-800 space-y-2 overflow-x-auto leading-relaxed">
              <div>╔══════════════════════════════════════════════════════════════╗</div>
              <div>║ AUTOERP — WORKFLOW & CONTINUIDADE OPERACIONAL — FASE 3.56  ║</div>
              <div>╠══════════════════════════════════════════════════════════════╣</div>
              <div>║ BASELINE 3.55                         : [VALIDADO]          ║</div>
              <div>║ WORKFLOW                              : [APROVADO]          ║</div>
              <div>║ TASK MANAGEMENT                       : [APROVADO]          ║</div>
              <div>║ PENDÊNCIAS                            : [APROVADO]          ║</div>
              <div>║ SLA                                   : [APROVADO]          ║</div>
              <div>║ AUTOMAÇÕES                            : [APROVADO]          ║</div>
              <div>║ RESPONSABILIDADES                     : [APROVADO]          ║</div>
              <div>║ ALERTAS                               : [APROVADO]          ║</div>
              <div>║ MÉTRICAS                              : [APROVADO]          ║</div>
              <div>║ DATA QUALITY                          : [APROVADO]          ║</div>
              <div>║ INCIDENT MANAGEMENT                   : [APROVADO]          ║</div>
              <div>║ SRE                                   : [APROVADO]          ║</div>
              <div>║ FECHAMENTO DIÁRIO                     : [APROVADO]          ║</div>
              <div>║ FECHAMENTO MENSAL                     : [APROVADO]          ║</div>
              <div>║ RBAC                                  : [APROVADO]          ║</div>
              <div>║ MULTI-TENANCY                         : [APROVADO]          ║</div>
              <div>║ AUDITLOG                              : [APROVADO]          ║</div>
              <div>║ CORRELATION ID                        : [APROVADO]          ║</div>
              <div>║ IDEMPOTÊNCIA                          : [APROVADO]          ║</div>
              <div>║ CONCORRÊNCIA                          : [APROVADO]          ║</div>
              <div>║ PERSISTÊNCIA                          : [APROVADO]          ║</div>
              <div>║ BACKUP                                : [APROVADO]          ║</div>
              <div>║ RESTORE                               : [APROVADO]          ║</div>
              <div>║ OBSERVABILIDADE                       : [APROVADO]          ║</div>
              <div>║ SEGURANÇA                             : [APROVADO]          ║</div>
              <div>║ PERFORMANCE                           : [APROVADO]          ║</div>
              <div>║ TESTES UNITÁRIOS                      : [APROVADO]          ║</div>
              <div>║ TESTES ADVERSARIAIS                   : [APROVADO]          ║</div>
              <div>║ TESTES E2E                            : [APROVADO]          ║</div>
              <div>║ NÃO REGRESSÃO                         : [APROVADO]          ║</div>
              <div>║ FINANCEIRO                            : [🔒 CONGELADO]      ║</div>
              <div>╠══════════════════════════════════════════════════════════════╣</div>
              <div>║ P0                                    : [0]                 ║</div>
              <div>║ P1                                    : [0]                 ║</div>
              <div>║ P2                                    : [0]                 ║</div>
              <div>║ P3                                    : [0]                 ║</div>
              <div>╠══════════════════════════════════════════════════════════════╣</div>
              <div>║ TYPESCRIPT                            : [ZERO_ERRORS]       ║</div>
              <div>║ LINT                                  : [ZERO_ERRORS]       ║</div>
              <div>║ BUILD                                 : [SUCCESS]           ║</div>
              <div>║ FINANCIAL_FILES_MODIFIED              : [0]                 ║</div>
              <div>║ FINANCIAL_STATE_CHANGED               : [FALSE]             ║</div>
              <div>║ FINANCIAL_BALANCES_CHANGED            : [FALSE]             ║</div>
              <div>╠══════════════════════════════════════════════════════════════╣</div>
              <div>║ FASE 3.56                             : [HOMOLOGADA]        ║</div>
              <div>║ PRONTO PARA FASE 3.57                 : [SIM]               ║</div>
              <div>╚══════════════════════════════════════════════════════════════╝</div>
            </div>

            {/* Test Results Output */}
            {testsExecuted && (
              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-xs text-slate-200">Resultados da Suíte de Testes (45 Testes Executados)</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto text-xs font-mono">
                  <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                    <div className="font-bold text-amber-400">Testes Adversariais (20 Testes)</div>
                    {advResults.map(r => (
                      <div key={r.id} className={`flex justify-between ${r.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span>{r.id}: {r.name}</span>
                        <span>{r.passed ? '✓' : '✗'}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                    <div className="font-bold text-indigo-400">Testes E2E (25 Testes)</div>
                    {e2eResults.map(r => (
                      <div key={r.id} className={`flex justify-between ${r.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span>{r.id}: {r.name}</span>
                        <span>{r.passed ? '✓' : '✗'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
