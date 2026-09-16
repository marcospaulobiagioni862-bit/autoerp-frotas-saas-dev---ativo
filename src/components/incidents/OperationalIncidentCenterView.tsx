import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, ShieldAlert, CheckCircle2, Clock, Search, Filter, Plus, 
  User, Calendar, Car, FileText, ArrowRight, RefreshCw, XCircle, Check, Play, AlertCircle 
} from 'lucide-react';
import { Card, Button, Badge, Input, Select } from '../ui';
import { 
  generateOperationalIncidentSummary, 
  OperationalIncident, 
  IncidentPriority, 
  IncidentStatus, 
  IncidentCategory,
  validateIncidentStateTransition 
} from '../../domain/incidents/OperationalIncidentService';

interface OperationalIncidentCenterViewProps {
  companyId?: string;
  onNavigate?: (tab: string) => void;
  vehicles?: any[];
  contracts?: any[];
  drivers?: any[];
  maintenances?: any[];
  vehicleDocuments?: any[];
  driverDocuments?: any[];
  tickets?: any[];
  insurances?: any[];
  trackers?: any[];
}

export const OperationalIncidentCenterView: React.FC<OperationalIncidentCenterViewProps> = ({
  companyId = 'company-main-uuid',
  onNavigate,
  vehicles = [],
  contracts = [],
  drivers = [],
  maintenances = [],
  vehicleDocuments = [],
  driverDocuments = [],
  tickets = [],
  insurances = [],
  trackers = [],
}) => {
  const [incidentsList, setIncidentsList] = useState<OperationalIncident[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedIncident, setSelectedIncident] = useState<OperationalIncident | null>(null);
  const [actionDescription, setActionDescription] = useState('');
  const [resolutionText, setResolutionText] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [activeModalTab, setActiveModalTab] = useState<'details' | 'actions' | 'resolve'>('details');

  const summary = useMemo(() => {
    return generateOperationalIncidentSummary({
      companyId,
      incidents: incidentsList,
      vehicles,
      contracts,
      drivers,
      maintenances,
      vehicleDocuments,
      driverDocuments,
      tickets,
      insurances,
      trackers,
    });
  }, [companyId, incidentsList, vehicles, contracts, drivers, maintenances, vehicleDocuments, driverDocuments, tickets, insurances, trackers]);

  const filteredIncidents = useMemo(() => {
    return summary.incidents.filter(inc => {
      const matchesSearch = 
        inc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inc.vehiclePlate && inc.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (inc.contractNumber && inc.contractNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (inc.driverName && inc.driverName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        inc.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPriority = priorityFilter === 'ALL' || inc.priority === priorityFilter;
      const matchesStatus = statusFilter === 'ALL' || inc.status === statusFilter;
      const matchesCategory = categoryFilter === 'ALL' || inc.category === categoryFilter;

      return matchesSearch && matchesPriority && matchesStatus && matchesCategory;
    });
  }, [summary.incidents, searchTerm, priorityFilter, statusFilter, categoryFilter]);

  const handleUpdateStatus = (incidentId: string, newStatus: IncidentStatus) => {
    setIncidentsList(prev => {
      const existing = prev.find(i => i.id === incidentId);
      const target = summary.incidents.find(i => i.id === incidentId);
      const base = existing || target;
      if (!base) return prev;

      if (!validateIncidentStateTransition(base.status, newStatus)) {
        alert(`Transição de status inválida de ${base.status} para ${newStatus}`);
        return prev;
      }

      const updated: OperationalIncident = {
        ...base,
        status: newStatus,
        updatedAt: new Date().toISOString().split('T')[0],
        resolvedAt: newStatus === 'RESOLVED' ? new Date().toISOString() : base.resolvedAt,
        closedAt: newStatus === 'CLOSED' ? new Date().toISOString() : base.closedAt,
        actions: [
          ...base.actions,
          {
            id: `act-${Date.now()}`,
            incidentId,
            companyId,
            actionType: `STATUS_${newStatus}`,
            description: `Status alterado para ${newStatus}`,
            performedBy: 'Gestor Operacional',
            createdAt: new Date().toISOString(),
          }
        ]
      };

      const rest = prev.filter(i => i.id !== incidentId);
      return [...rest, updated];
    });

    if (selectedIncident && selectedIncident.id === incidentId) {
      setSelectedIncident(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const handleAddAction = (incidentId: string) => {
    if (!actionDescription.trim()) return;
    setIncidentsList(prev => {
      const existing = prev.find(i => i.id === incidentId);
      const target = summary.incidents.find(i => i.id === incidentId);
      const base = existing || target;
      if (!base) return prev;

      const newAction = {
        id: `act-${Date.now()}`,
        incidentId,
        companyId,
        actionType: 'NOTE',
        description: actionDescription.trim(),
        performedBy: 'Gestor Operacional',
        createdAt: new Date().toISOString(),
      };

      const updated: OperationalIncident = {
        ...base,
        updatedAt: new Date().toISOString().split('T')[0],
        lastActionAt: new Date().toISOString(),
        actions: [...base.actions, newAction],
      };

      const rest = prev.filter(i => i.id !== incidentId);
      return [...rest, updated];
    });

    setActionDescription('');
    if (selectedIncident && selectedIncident.id === incidentId) {
      setSelectedIncident(prev => prev ? { 
        ...prev, 
        actions: [...prev.actions, {
          id: `act-${Date.now()}`,
          incidentId,
          companyId,
          actionType: 'NOTE',
          description: actionDescription.trim(),
          performedBy: 'Gestor Operacional',
          createdAt: new Date().toISOString(),
        }] 
      } : null);
    }
  };

  const handleResolveIncident = (incidentId: string) => {
    if (!resolutionText.trim()) {
      alert('Informe a descrição da resolução.');
      return;
    }
    setIncidentsList(prev => {
      const existing = prev.find(i => i.id === incidentId);
      const target = summary.incidents.find(i => i.id === incidentId);
      const base = existing || target;
      if (!base) return prev;

      const updated: OperationalIncident = {
        ...base,
        status: 'RESOLVED',
        resolution: resolutionText.trim(),
        resolvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString().split('T')[0],
        actions: [
          ...base.actions,
          {
            id: `act-${Date.now()}`,
            incidentId,
            companyId,
            actionType: 'RESOLVED',
            description: `Resolvido: ${resolutionText.trim()}`,
            performedBy: 'Gestor Operacional',
            createdAt: new Date().toISOString(),
          }
        ]
      };

      const rest = prev.filter(i => i.id !== incidentId);
      return [...rest, updated];
    });

    setResolutionText('');
    setSelectedIncident(null);
  };

  const handleAssignIncident = (incidentId: string) => {
    if (!assigneeName.trim()) return;
    setIncidentsList(prev => {
      const existing = prev.find(i => i.id === incidentId);
      const target = summary.incidents.find(i => i.id === incidentId);
      const base = existing || target;
      if (!base) return prev;

      const updated: OperationalIncident = {
        ...base,
        assignedTo: assigneeName.trim(),
        status: base.status === 'OPEN' ? 'IN_PROGRESS' : base.status,
        updatedAt: new Date().toISOString().split('T')[0],
        actions: [
          ...base.actions,
          {
            id: `act-${Date.now()}`,
            incidentId,
            companyId,
            actionType: 'ASSIGN',
            description: `Atribuído para ${assigneeName.trim()}`,
            performedBy: 'Gestor Operacional',
            createdAt: new Date().toISOString(),
          }
        ]
      };

      const rest = prev.filter(i => i.id !== incidentId);
      return [...rest, updated];
    });

    setAssigneeName('');
    if (selectedIncident && selectedIncident.id === incidentId) {
      setSelectedIncident(prev => prev ? { ...prev, assignedTo: assigneeName.trim(), status: 'IN_PROGRESS' } : null);
    }
  };

  const getPriorityBadge = (priority: IncidentPriority) => {
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

  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case 'OPEN':
        return <Badge className="bg-rose-50 text-rose-700 border border-rose-200">Aberto</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-blue-50 text-blue-700 border border-blue-200">Em Atendimento</Badge>;
      case 'WAITING':
        return <Badge className="bg-amber-50 text-amber-700 border border-amber-200">Aguardando</Badge>;
      case 'RESOLVED':
        return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">Resolvido</Badge>;
      case 'CLOSED':
        return <Badge className="bg-slate-100 text-slate-700 border border-slate-200">Encerrado</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-zinc-100 text-zinc-500 border border-zinc-200">Cancelado</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-sm mb-1">
            <ShieldAlert className="w-5 h-5" />
            <span>FASE 3.40 — GESTÃO DE EXCEÇÕES E INCIDENTES</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Central de Incidentes Operacionais</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Detectar, classificar, atribuir, tratar e resolver ocorrências operacionais com trilha de auditoria completa.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4 border-l-4 border-l-rose-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">P0 • Críticos</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{summary.counts.p0}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">P1 • Altos</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{summary.counts.p1}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-blue-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Em Atendimento</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{summary.counts.inProgress}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-red-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Atrasados (SLA)</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{summary.counts.overdue}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Resolvidos</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{summary.counts.resolved}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-slate-400 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Geral</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.counts.total}</p>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="p-4 bg-white dark:bg-slate-900">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por ID, placa, motorista, título..."
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
                { value: 'OPEN', label: 'Aberto' },
                { value: 'IN_PROGRESS', label: 'Em Atendimento' },
                { value: 'WAITING', label: 'Aguardando' },
                { value: 'RESOLVED', label: 'Resolvido' },
                { value: 'CLOSED', label: 'Encerrado' },
              ]}
            />
          </div>
          <div>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'Todas as Categorias' },
                { value: 'RENTAL', label: 'Locação' },
                { value: 'MAINTENANCE', label: 'Manutenção' },
                { value: 'DOCUMENT', label: 'Documento' },
                { value: 'FINE', label: 'Multa / Infração' },
                { value: 'OPERATIONAL', label: 'Operacional' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Incidents Table / List */}
      <Card className="overflow-hidden bg-white dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                <th className="p-4">Prioridade</th>
                <th className="p-4">Status</th>
                <th className="p-4">Incidente / Título</th>
                <th className="p-4">Veículo / Contrato</th>
                <th className="p-4">Responsável</th>
                <th className="p-4">SLA / Prazo</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    Nenhum incidente operacional encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map(inc => (
                  <tr key={inc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-4">{getPriorityBadge(inc.priority)}</td>
                    <td className="p-4">{getStatusBadge(inc.status)}</td>
                    <td className="p-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{inc.title}</p>
                      <p className="text-xs text-slate-500 truncate max-w-xs">{inc.description}</p>
                    </td>
                    <td className="p-4">
                      {inc.vehiclePlate && (
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                          <Car className="w-4 h-4 text-slate-400" />
                          <span>{inc.vehiclePlate}</span>
                        </div>
                      )}
                      {inc.contractNumber && (
                        <span className="text-xs text-slate-500">Contrato: {inc.contractNumber}</span>
                      )}
                    </td>
                    <td className="p-4">
                      {inc.assignedTo ? (
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                          {inc.assignedTo}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium italic">Não atribuído</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        inc.slaStatus === 'OVERDUE' ? 'bg-red-100 text-red-700' :
                        inc.slaStatus === 'AT_RISK' ? 'bg-amber-100 text-amber-700' :
                        inc.slaStatus === 'RESOLVED' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {inc.slaStatus === 'OVERDUE' ? 'Atrasado' :
                         inc.slaStatus === 'AT_RISK' ? 'No Prazo (Risco)' :
                         inc.slaStatus === 'RESOLVED' ? 'Resolvido' : 'No Prazo'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedIncident(inc)}
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

      {/* Incident Detail Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
            <div className="flex items-center justify-between border-b pb-4 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {getPriorityBadge(selectedIncident.priority)}
                  {getStatusBadge(selectedIncident.status)}
                  <span className="text-xs text-slate-400 font-mono">ID: {selectedIncident.id}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedIncident.title}</h2>
              </div>
              <button 
                onClick={() => setSelectedIncident(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b dark:border-slate-800 space-x-6 text-sm font-semibold">
              <button
                onClick={() => setActiveModalTab('details')}
                className={`pb-2 border-b-2 transition-colors ${activeModalTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
              >
                Detalhes & Contexto
              </button>
              <button
                onClick={() => setActiveModalTab('actions')}
                className={`pb-2 border-b-2 transition-colors ${activeModalTab === 'actions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
              >
                Timeline & Ações ({selectedIncident.actions.length})
              </button>
              <button
                onClick={() => setActiveModalTab('resolve')}
                className={`pb-2 border-b-2 transition-colors ${activeModalTab === 'resolve' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
              >
                Tratamento & Resolução
              </button>
            </div>

            {activeModalTab === 'details' && (
              <div className="space-y-4 text-sm">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Descrição do Incidente:</p>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{selectedIncident.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-xl dark:border-slate-800">
                    <span className="text-xs text-slate-500">Veículo Vinculado</span>
                    <p className="font-medium text-slate-900 dark:text-white mt-0.5">{selectedIncident.vehiclePlate || 'Nenhum'}</p>
                  </div>
                  <div className="p-3 border rounded-xl dark:border-slate-800">
                    <span className="text-xs text-slate-500">Contrato Vinculado</span>
                    <p className="font-medium text-slate-900 dark:text-white mt-0.5">{selectedIncident.contractNumber || 'Nenhum'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-4 border-t dark:border-slate-800">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Atribuir Responsável</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nome do responsável..."
                        value={assigneeName}
                        onChange={(e) => setAssigneeName(e.target.value)}
                      />
                      <Button onClick={() => handleAssignIncident(selectedIncident.id)} size="sm">
                        Atribuir
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedIncident.status === 'OPEN' && (
                      <Button onClick={() => handleUpdateStatus(selectedIncident.id, 'IN_PROGRESS')} size="sm" variant="outline">
                        Iniciar Atendimento
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeModalTab === 'actions' && (
              <div className="space-y-4">
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {selectedIncident.actions.map(act => (
                    <div key={act.id} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-sm">
                      <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{act.performedBy} ({act.actionType})</span>
                        <span>{new Date(act.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">{act.description}</p>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t dark:border-slate-800 space-y-2">
                  <label className="text-xs font-medium text-slate-500">Registrar Nova Ação / Nota</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Descreva a ação realizada (ex: Contato telefônico com motorista)..."
                      value={actionDescription}
                      onChange={(e) => setActionDescription(e.target.value)}
                    />
                    <Button onClick={() => handleAddAction(selectedIncident.id)}>
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeModalTab === 'resolve' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Resolução do Incidente</label>
                  <textarea
                    className="w-full h-32 p-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Descreva detalhadamente como o incidente foi resolvido..."
                    value={resolutionText}
                    onChange={(e) => setResolutionText(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => handleUpdateStatus(selectedIncident.id, 'CANCELLED')}
                  >
                    Cancelar Incidente
                  </Button>
                  <Button
                    onClick={() => handleResolveIncident(selectedIncident.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Confirmar Resolução
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t dark:border-slate-800">
              <Button variant="outline" onClick={() => setSelectedIncident(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
