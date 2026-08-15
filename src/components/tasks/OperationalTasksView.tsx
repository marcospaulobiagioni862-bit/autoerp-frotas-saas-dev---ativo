import React, { useState, useMemo } from 'react';
import { 
  CheckSquare, ShieldAlert, Clock, Search, Filter, Plus, 
  User, Calendar, Car, FileText, ArrowRight, RefreshCw, XCircle, Check, AlertCircle, MessageSquare, Paperclip, Lock, Play
} from 'lucide-react';
import { Card, Button, Badge, Input, Select } from '../ui';
import { 
  generateOperationalTaskSummary, 
  OperationalTask, 
  TaskPriority, 
  TaskStatus, 
  TaskType,
  validateTaskStateTransition 
} from '../../domain/tasks/OperationalTaskService';

interface OperationalTasksViewProps {
  companyId?: string;
  onNavigate?: (tab: string) => void;
  incidents?: any[];
  pendings?: any[];
}

export const OperationalTasksView: React.FC<OperationalTasksViewProps> = ({
  companyId = 'company-main-uuid',
  onNavigate,
  incidents = [],
  pendings = [],
}) => {
  const [tasksList, setTasksList] = useState<OperationalTask[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [selectedTask, setSelectedTask] = useState<OperationalTask | null>(null);

  // Modal new task states
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('P1');
  const [newType, setNewType] = useState<TaskType>('ADMINISTRATIVE');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newVehiclePlate, setNewVehiclePlate] = useState('');

  // Execution states
  const [followUpNote, setFollowUpNote] = useState('');
  const [resolutionText, setResolutionText] = useState('');
  const [evidenceName, setEvidenceName] = useState('');
  const [activeModalTab, setActiveModalTab] = useState<'details' | 'followups' | 'evidences' | 'resolve'>('details');

  const summary = useMemo(() => {
    return generateOperationalTaskSummary({
      companyId,
      tasks: tasksList,
      incidents,
      pendings,
    });
  }, [companyId, tasksList, incidents, pendings]);

  const filteredTasks = useMemo(() => {
    return summary.tasks.filter(t => {
      const matchesSearch = 
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.vehiclePlate && t.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.contractNumber && t.contractNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.assignedTo && t.assignedTo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchesType = typeFilter === 'ALL' || t.type === typeFilter;

      return matchesSearch && matchesPriority && matchesStatus && matchesType;
    });
  }, [summary.tasks, searchTerm, priorityFilter, statusFilter, typeFilter]);

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDueDate) {
      alert('Preencha o título e a data de vencimento da tarefa.');
      return;
    }

    const newTask: OperationalTask = {
      id: `task-${Date.now()}`,
      companyId,
      title: newTitle.trim(),
      description: newDescription.trim(),
      type: newType,
      priority: newPriority,
      status: 'PENDING',
      sourceType: 'MANUAL',
      assignedTo: newAssignee.trim() || 'Não atribuído',
      createdBy: 'Gestor Operacional',
      createdAt: new Date().toISOString().split('T')[0],
      dueDate: newDueDate,
      vehiclePlate: newVehiclePlate.trim() || undefined,
      evidences: [],
      followUps: [],
      deadlineStatus: 'NO_PRAZO',
      correlationId: `corr-manual-${Date.now()}`,
      updatedAt: new Date().toISOString().split('T')[0],
    };

    setTasksList(prev => [...prev, newTask]);
    setNewTitle('');
    setNewDescription('');
    setNewDueDate('');
    setNewVehiclePlate('');
    setNewAssignee('');
    setShowNewTaskModal(false);
  };

  const handleUpdateStatus = (taskId: string, newStatus: TaskStatus) => {
    setTasksList(prev => {
      const existing = prev.find(t => t.id === taskId);
      const target = summary.tasks.find(t => t.id === taskId);
      const base = existing || target;
      if (!base) return prev;

      if (!validateTaskStateTransition(base.status, newStatus)) {
        alert(`Transição de status inválida de ${base.status} para ${newStatus}`);
        return prev;
      }

      const updated: OperationalTask = {
        ...base,
        status: newStatus,
        startedAt: newStatus === 'IN_PROGRESS' && !base.startedAt ? new Date().toISOString() : base.startedAt,
        updatedAt: new Date().toISOString().split('T')[0],
      };

      const rest = prev.filter(t => t.id !== taskId);
      return [...rest, updated];
    });

    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const handleAddFollowUp = (taskId: string) => {
    if (!followUpNote.trim()) return;
    const newFu = {
      id: `fu-${Date.now()}`,
      taskId,
      companyId,
      note: followUpNote.trim(),
      performedBy: 'Gestor Operacional',
      createdAt: new Date().toISOString(),
    };

    setTasksList(prev => {
      const existing = prev.find(t => t.id === taskId);
      const target = summary.tasks.find(t => t.id === taskId);
      const base = existing || target;
      if (!base) return prev;

      const updated: OperationalTask = {
        ...base,
        followUps: [...base.followUps, newFu],
        updatedAt: new Date().toISOString().split('T')[0],
      };

      const rest = prev.filter(t => t.id !== taskId);
      return [...rest, updated];
    });

    setFollowUpNote('');
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask(prev => prev ? { ...prev, followUps: [...prev.followUps, newFu] } : null);
    }
  };

  const handleAddEvidence = (taskId: string) => {
    if (!evidenceName.trim()) return;
    const newEv = {
      id: `ev-${Date.now()}`,
      taskId,
      companyId,
      name: evidenceName.trim(),
      fileType: 'DOCUMENTO',
      uploadedBy: 'Gestor Operacional',
      createdAt: new Date().toISOString(),
    };

    setTasksList(prev => {
      const existing = prev.find(t => t.id === taskId);
      const target = summary.tasks.find(t => t.id === taskId);
      const base = existing || target;
      if (!base) return prev;

      const updated: OperationalTask = {
        ...base,
        evidences: [...base.evidences, newEv],
        updatedAt: new Date().toISOString().split('T')[0],
      };

      const rest = prev.filter(t => t.id !== taskId);
      return [...rest, updated];
    });

    setEvidenceName('');
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask(prev => prev ? { ...prev, evidences: [...prev.evidences, newEv] } : null);
    }
  };

  const handleCompleteTask = (taskId: string) => {
    if (!resolutionText.trim()) {
      alert('Informe a resolução da tarefa.');
      return;
    }

    setTasksList(prev => {
      const existing = prev.find(t => t.id === taskId);
      const target = summary.tasks.find(t => t.id === taskId);
      const base = existing || target;
      if (!base) return prev;

      const updated: OperationalTask = {
        ...base,
        status: 'COMPLETED',
        resolution: resolutionText.trim(),
        completedAt: new Date().toISOString(),
        completedBy: 'Gestor Operacional',
        updatedAt: new Date().toISOString().split('T')[0],
      };

      const rest = prev.filter(t => t.id !== taskId);
      return [...rest, updated];
    });

    setResolutionText('');
    setSelectedTask(null);
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'P0':
        return <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 font-bold border border-rose-300">P0 • Crítico</Badge>;
      case 'P1':
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-semibold">P1 • Alto</Badge>;
      case 'P2':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">P2 • Médio</Badge>;
      case 'P3':
        return <Badge className="bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">P3 • Baixo</Badge>;
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'PENDING':
        return <Badge className="bg-amber-50 text-amber-700 border border-amber-200">Pendente</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-blue-50 text-blue-700 border border-blue-200">Em Andamento</Badge>;
      case 'BLOCKED':
        return <Badge className="bg-rose-50 text-rose-700 border border-rose-200">Bloqueada</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">Concluída</Badge>;
      case 'CANCELled':
        return <Badge className="bg-slate-100 text-slate-500 border border-slate-200">Cancelada</Badge>;
      case 'ON_HOLD':
        return <Badge className="bg-purple-50 text-purple-700 border border-purple-200">Em Espera</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm mb-1">
            <CheckSquare className="w-5 h-5" />
            <span>FASE 3.41 — GESTÃO DE TAREFAS E EXECUÇÃO OPERACIONAL</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Central de Tarefas & Follow-ups</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Atribuir, acompanhar, executar e comprovar tarefas operacionais originadas de pendências, ocorrências e rotinas.
          </p>
        </div>
        <div>
          <Button onClick={() => setShowNewTaskModal(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nova Tarefa
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4 border-l-4 border-l-rose-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">P0 • Críticas</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{summary.counts.p0}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">P1 • Altas</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{summary.counts.p1}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-blue-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Em Andamento</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{summary.counts.inProgress}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-red-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Atrasadas</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{summary.counts.overdue}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Concluídas</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{summary.counts.completed}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-slate-400 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Tarefas</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.counts.total}</p>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="p-4 bg-white dark:bg-slate-900">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por título, placa, responsável..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div>
            <Select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'Todas as Prioridades' },
                { value: 'P0', label: 'P0 - Crítico' },
                { value: 'P1', label: 'P1 - Alto' },
                { value: 'P2', label: 'P2 - Médio' },
                { value: 'P3', label: 'P3 - Baixo' },
              ]}
            />
          </div>
          <div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'Todos os Status' },
                { value: 'PENDING', label: 'Pendente' },
                { value: 'IN_PROGRESS', label: 'Em Andamento' },
                { value: 'BLOCKED', label: 'Bloqueada' },
                { value: 'COMPLETED', label: 'Concluída' },
                { value: 'CANCELled', label: 'Cancelada' },
              ]}
            />
          </div>
          <div>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'Todos os Tipos' },
                { value: 'INCIDENT', label: 'Ocorrência' },
                { value: 'PENDING', label: 'Pendência' },
                { value: 'MAINTENANCE', label: 'Manutenção' },
                { value: 'DOCUMENT', label: 'Documento' },
                { value: 'ADMINISTRATIVE', label: 'Administrativo' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Tasks Table */}
      <Card className="overflow-hidden bg-white dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                <th className="p-4">Prioridade</th>
                <th className="p-4">Status</th>
                <th className="p-4">Tarefa / Descrição</th>
                <th className="p-4">Responsável</th>
                <th className="p-4">Prazo / Vencimento</th>
                <th className="p-4">Evidências / Follow-ups</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    Nenhuma tarefa operacional encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredTasks.map(task => (
                  <tr key={task.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-4">{getPriorityBadge(task.priority)}</td>
                    <td className="p-4">{getStatusBadge(task.status)}</td>
                    <td className="p-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{task.title}</p>
                      <p className="text-xs text-slate-500 truncate max-w-xs">{task.description}</p>
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        {task.assignedTo || 'Não atribuído'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{task.dueDate}</span>
                        <span className={`text-[10px] font-bold ${
                          task.deadlineStatus === 'ATRASADA' ? 'text-red-600' :
                          task.deadlineStatus === 'VENCENDO' ? 'text-amber-600' :
                          task.deadlineStatus === 'CONCLUÍDA' ? 'text-emerald-600' : 'text-slate-500'
                        }`}>
                          {task.deadlineStatus}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Paperclip className="w-3.5 h-3.5" /> {task.evidences.length}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" /> {task.followUps.length}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTask(task)}
                      >
                        Gerenciar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
            <div className="flex items-center justify-between border-b pb-4 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Criar Nova Tarefa Operacional</h2>
              <button onClick={() => setShowNewTaskModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Título da Tarefa *</label>
                <Input
                  placeholder="Ex: Substituir pneu dianteiro veículo ABC-1234"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Descrição Detalhada</label>
                <textarea
                  className="w-full h-24 p-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Instruções para a execução da tarefa..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Prioridade</label>
                  <Select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    options={[
                      { value: 'P0', label: 'P0 - Crítico' },
                      { value: 'P1', label: 'P1 - Alto' },
                      { value: 'P2', label: 'P2 - Médio' },
                      { value: 'P3', label: 'P3 - Baixo' },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Tipo</label>
                  <Select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as TaskType)}
                    options={[
                      { value: 'ADMINISTRATIVE', label: 'Administrativo' },
                      { value: 'MAINTENANCE', label: 'Manutenção' },
                      { value: 'DOCUMENT', label: 'Documento' },
                      { value: 'INSPECTION', label: 'Inspeção' },
                      { value: 'OTHER', label: 'Outro' },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Responsável</label>
                  <Input
                    placeholder="Nome do responsável..."
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Data de Vencimento *</label>
                  <Input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Placa do Veículo (Opcional)</label>
                <Input
                  placeholder="Ex: ABC1D23"
                  value={newVehiclePlate}
                  onChange={(e) => setNewVehiclePlate(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => setShowNewTaskModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  Criar Tarefa
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
            <div className="flex items-center justify-between border-b pb-4 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {getPriorityBadge(selectedTask.priority)}
                  {getStatusBadge(selectedTask.status)}
                  <span className="text-xs text-slate-400 font-mono">ID: {selectedTask.id}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedTask.title}</h2>
              </div>
              <button onClick={() => setSelectedTask(null)} className="text-slate-400 hover:text-slate-600 p-2">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b dark:border-slate-800 space-x-6 text-sm font-semibold">
              <button
                onClick={() => setActiveModalTab('details')}
                className={`pb-2 border-b-2 transition-colors ${activeModalTab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
              >
                Detalhes & Status
              </button>
              <button
                onClick={() => setActiveModalTab('followups')}
                className={`pb-2 border-b-2 transition-colors ${activeModalTab === 'followups' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
              >
                Follow-ups ({selectedTask.followUps.length})
              </button>
              <button
                onClick={() => setActiveModalTab('evidences')}
                className={`pb-2 border-b-2 transition-colors ${activeModalTab === 'evidences' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
              >
                Evidências ({selectedTask.evidences.length})
              </button>
              <button
                onClick={() => setActiveModalTab('resolve')}
                className={`pb-2 border-b-2 transition-colors ${activeModalTab === 'resolve' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
              >
                Conclusão & Resolução
              </button>
            </div>

            {activeModalTab === 'details' && (
              <div className="space-y-4 text-sm">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Descrição:</p>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{selectedTask.description || 'Sem descrição detalhada.'}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-xl dark:border-slate-800">
                    <span className="text-xs text-slate-500">Responsável Atual</span>
                    <p className="font-medium text-slate-900 dark:text-white mt-0.5">{selectedTask.assignedTo || 'Não atribuído'}</p>
                  </div>
                  <div className="p-3 border rounded-xl dark:border-slate-800">
                    <span className="text-xs text-slate-500">Prazo de Vencimento</span>
                    <p className="font-medium text-slate-900 dark:text-white mt-0.5">{selectedTask.dueDate} ({selectedTask.deadlineStatus})</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Alterar Status:</span>
                  {selectedTask.status !== 'IN_PROGRESS' && (
                    <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(selectedTask.id, 'IN_PROGRESS')}>
                      Iniciar Andamento
                    </Button>
                  )}
                  {selectedTask.status !== 'BLOCKED' && (
                    <Button size="sm" variant="outline" className="text-rose-600 border-rose-200" onClick={() => handleUpdateStatus(selectedTask.id, 'BLOCKED')}>
                      Bloquear
                    </Button>
                  )}
                  {selectedTask.status !== 'CANCELled' && (
                    <Button size="sm" variant="outline" className="text-slate-500" onClick={() => handleUpdateStatus(selectedTask.id, 'CANCELled')}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            )}

            {activeModalTab === 'followups' && (
              <div className="space-y-4">
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {selectedTask.followUps.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-4">Nenhum follow-up registrado.</p>
                  ) : (
                    selectedTask.followUps.map(fu => (
                      <div key={fu.id} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-sm">
                        <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{fu.performedBy}</span>
                          <span>{new Date(fu.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">{fu.note}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t dark:border-slate-800 space-y-2">
                  <label className="text-xs font-medium text-slate-500">Adicionar Follow-up / Nota</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Descreva a atualização ou follow-up..."
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                    />
                    <Button onClick={() => handleAddFollowUp(selectedTask.id)}>
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeModalTab === 'evidences' && (
              <div className="space-y-4">
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {selectedTask.evidences.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-4">Nenhuma evidência anexada.</p>
                  ) : (
                    selectedTask.evidences.map(ev => (
                      <div key={ev.id} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-sm flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{ev.name}</p>
                          <p className="text-xs text-slate-400">Enviado por {ev.uploadedBy} em {new Date(ev.createdAt).toLocaleDateString()}</p>
                        </div>
                        <Badge className="bg-indigo-50 text-indigo-700">Comprovado</Badge>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t dark:border-slate-800 space-y-2">
                  <label className="text-xs font-medium text-slate-500">Anexar Evidência (Nome do Arquivo / Comprovante)</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: laudo_vistoria_assinado.pdf"
                      value={evidenceName}
                      onChange={(e) => setEvidenceName(e.target.value)}
                    />
                    <Button onClick={() => handleAddEvidence(selectedTask.id)}>
                      Anexar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeModalTab === 'resolve' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Resolução e Conclusão da Tarefa</label>
                  <textarea
                    className="w-full h-32 p-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Descreva o resultado da execução da tarefa..."
                    value={resolutionText}
                    onChange={(e) => setResolutionText(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    onClick={() => handleCompleteTask(selectedTask.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Confirmar Conclusão
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t dark:border-slate-800">
              <Button variant="outline" onClick={() => setSelectedTask(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
