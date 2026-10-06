import React, { useState, useEffect } from 'react';
import {
  ProductionIncident,
  IncidentStatus,
  IncidentPriority,
  IncidentSeverity,
  IncidentSource,
  IncidentCategory,
} from '../../domain/incident-management/types';
import { IncidentManagementService } from '../../domain/incident-management/IncidentManagementService';
import { IncidentDetailsView } from './IncidentDetailsView';
import { ProblemManagementView } from './ProblemManagementView';
import { IncidentMetricsView } from './IncidentMetricsView';
import { PostMortemView } from './PostMortemView';
import {
  AlertCircle,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Layers,
  BarChart3,
  BookOpen,
  LifeBuoy,
  X,
  UserCheck,
} from 'lucide-react';

export const IncidentManagementCenterView: React.FC = () => {
  const user = { id: 'usr-sre-admin', companyId: 'company-default', role: 'ADMIN' };
  const companyId = user.companyId;
  const userId = user.id;
  const userRole = user.role;

  const [activeTab, setActiveTab] = useState<'incidents' | 'problems' | 'metrics' | 'postmortem'>('incidents');
  const [incidents, setIncidents] = useState<ProductionIncident[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected incident for detail modal
  const [selectedIncident, setSelectedIncident] = useState<ProductionIncident | null>(null);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>('SEV1');
  const [newPriority, setNewPriority] = useState<IncidentPriority>('P1');
  const [newSource, setNewSource] = useState<IncidentSource>('OBSERVABILITY');
  const [newCategory, setNewCategory] = useState<IncidentCategory>('PERFORMANCE_DEGRADATION');
  const [newModule, setNewModule] = useState('SISTEMA');
  const [impactDesc, setImpactDesc] = useState('');

  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'incidents') {
      loadIncidents();
    }
  }, [companyId, activeTab, statusFilter, severityFilter]);

  const loadIncidents = async () => {
    setLoading(true);
    const filters: any = {};
    if (statusFilter !== 'ALL') filters.status = statusFilter;
    if (severityFilter !== 'ALL') filters.severity = severityFilter;
    if (searchQuery) filters.search = searchQuery;

    const list = await IncidentManagementService.getIncidents(companyId, filters);
    setIncidents(list);
    setLoading(false);
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const res = await IncidentManagementService.createIncident(
      {
        companyId,
        title: newTitle,
        description: newDesc,
        severity: newSeverity,
        priority: newPriority,
        source: newSource,
        category: newCategory,
        reportedBy: userId,
        affectedModule: newModule,
        impactDescription: impactDesc,
      },
      userId,
      userRole
    );

    if (res.success) {
      setMsg(res.isDuplicate ? 'Incidente duplicado reutilizado por fingerprint' : 'Incidente de produção criado com sucesso!');
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setImpactDesc('');
      await loadIncidents();
    } else {
      setMsg(`Erro: ${res.message}`);
    }
  };

  const getSeverityBadge = (sev: IncidentSeverity) => {
    switch (sev) {
      case 'SEV0': return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300';
      case 'SEV1': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300';
      case 'SEV2': return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300';
      case 'SEV3': return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const p0Count = incidents.filter((i) => i.priority === 'P0' && i.status !== 'CLOSED' && i.status !== 'CANCELLED').length;
  const p1Count = incidents.filter((i) => i.priority === 'P1' && i.status !== 'CLOSED' && i.status !== 'CANCELLED').length;
  const activeIncidentsCount = incidents.filter((i) => i.status !== 'CLOSED' && i.status !== 'CANCELLED').length;
  const breachedCount = incidents.filter((i) => i.slaStatus === 'BREACHED').length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 rounded-md border border-purple-200 dark:border-purple-800">
              Fase 3.53
            </span>
            <span className="text-xs font-semibold text-slate-500">SRE & Incident Command</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Gestão de Incidentes, Problemas e SRE
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Plataforma de detecção, contenção, resolução, análise de causa raiz e resposta a falhas em produção.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Reportar Incidente (SEV)
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Incidentes Ativos</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{activeIncidentsCount}</span>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-xl">
          <span className="text-xs text-purple-700 dark:text-purple-300 font-bold uppercase tracking-wider block">Emergências P0</span>
          <span className="text-2xl font-black text-purple-900 dark:text-purple-100 mt-1 block">{p0Count}</span>
        </div>
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl">
          <span className="text-xs text-red-700 dark:text-red-300 font-bold uppercase tracking-wider block">Críticos P1</span>
          <span className="text-2xl font-black text-red-900 dark:text-red-100 mt-1 block">{p1Count}</span>
        </div>
        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl">
          <span className="text-xs text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wider block">SLA Estourado</span>
          <span className="text-2xl font-black text-amber-900 dark:text-amber-100 mt-1 block">{breachedCount}</span>
        </div>
      </div>

      {msg && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 text-xs rounded-lg flex justify-between items-center">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="font-semibold underline">
            Fechar
          </button>
        </div>
      )}

      {/* Main Tab Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6">
        <button
          onClick={() => setActiveTab('incidents')}
          className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'incidents'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <LifeBuoy className="w-4 h-4" />
          Central de Incidentes
        </button>
        <button
          onClick={() => setActiveTab('problems')}
          className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'problems'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Problem Management
        </button>
        <button
          onClick={() => setActiveTab('metrics')}
          className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'metrics'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Métricas SRE & SLA
        </button>
        <button
          onClick={() => setActiveTab('postmortem')}
          className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'postmortem'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Post-Mortem & Lições
        </button>
      </div>

      {/* Tab 1: Incident List */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar incidentes por título, correlationId, ID ou descrição..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadIncidents()}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              >
                <option value="ALL">Todos os Status</option>
                <option value="DETECTED">DETECTED</option>
                <option value="TRIAGED">TRIAGED</option>
                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                <option value="INVESTIGATING">INVESTIGATING</option>
                <option value="CONTAINING">CONTAINING</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              >
                <option value="ALL">Todas Severidades</option>
                <option value="SEV0">SEV0 (Catástrofe)</option>
                <option value="SEV1">SEV1 (Crítico)</option>
                <option value="SEV2">SEV2 (Significativo)</option>
                <option value="SEV3">SEV3 (Limitado)</option>
              </select>

              <button
                onClick={loadIncidents}
                className="p-2 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-500">Carregando incidentes de produção...</div>
            ) : incidents.length === 0 ? (
              <div className="p-12 border border-dashed border-slate-300 dark:border-slate-800 m-6 rounded-xl text-center text-slate-500 text-xs">
                Nenhum incidente encontrado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">ID / Severidade</th>
                      <th className="p-3.5">Título & Origem</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Commander</th>
                      <th className="p-3.5">SLA</th>
                      <th className="p-3.5">Causa Raiz</th>
                      <th className="p-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {incidents.map((inc) => (
                      <tr key={inc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${getSeverityBadge(inc.severity)}`}>
                              {inc.severity}
                            </span>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">{inc.id}</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900 dark:text-white line-clamp-1">{inc.title}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>{inc.source}</span>
                            <span>•</span>
                            <span className="font-mono">{inc.correlationId}</span>
                          </div>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 uppercase">
                            {inc.status}
                          </span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {inc.commanderId || <span className="text-slate-400 italic">Pendente</span>}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            inc.slaStatus === 'BREACHED'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              : inc.slaStatus === 'WARNING'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}>
                            {inc.slaStatus}
                          </span>
                        </td>
                        <td className="p-3.5 max-w-xs truncate text-slate-600 dark:text-slate-400">
                          {inc.rootCause || <span className="text-slate-400 italic">—</span>}
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => setSelectedIncident(inc)}
                            className="px-3 py-1.5 font-semibold text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 dark:text-indigo-300 rounded-md transition-colors"
                          >
                            Gerenciar / Timeline
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Problem Management */}
      {activeTab === 'problems' && <ProblemManagementView companyId={companyId} userId={userId} />}

      {/* Tab 3: SRE Metrics */}
      {activeTab === 'metrics' && <IncidentMetricsView companyId={companyId} />}

      {/* Tab 4: Post-Mortem */}
      {activeTab === 'postmortem' && <PostMortemView companyId={companyId} userId={userId} />}

      {/* Incident Details Modal */}
      {selectedIncident && (
        <IncidentDetailsView
          incident={selectedIncident}
          companyId={companyId}
          userId={userId}
          userRole={userRole}
          onClose={() => setSelectedIncident(null)}
          onUpdate={async () => {
            await loadIncidents();
            if (selectedIncident) {
              const updated = await IncidentManagementService.getIncidentById(selectedIncident.id, companyId);
              if (updated) setSelectedIncident(updated);
            }
          }}
        />
      )}

      {/* Modal create incident */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Abertura Formal de Incidente (SEV)</h3>
            <form onSubmit={handleCreateIncident} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Título do Incidente</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="ex: Queda de performance na API de ordens de serviço"
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Descrição Técnica</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Detalhes dos sintomas observados..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Severidade (SEV)</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="SEV0">SEV0 — Catástrofe / Risco Sistêmico</option>
                    <option value="SEV1">SEV1 — Impacto Crítico</option>
                    <option value="SEV2">SEV2 — Impacto Significativo</option>
                    <option value="SEV3">SEV3 — Impacto Limitado</option>
                    <option value="SEV4">SEV4 — Baixo Impacto</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Prioridade</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as IncidentPriority)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="P0">P0 - Emergência</option>
                    <option value="P1">P1 - Crítico</option>
                    <option value="P2">P2 - Importante</option>
                    <option value="P3">P3 - Baixo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Módulo Afetado</label>
                <input
                  type="text"
                  value={newModule}
                  onChange={(e) => setNewModule(e.target.value)}
                  placeholder="ex: SISTEMA, INTEGRACAO"
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Descrição do Impacto Operacional</label>
                <input
                  type="text"
                  value={impactDesc}
                  onChange={(e) => setImpactDesc(e.target.value)}
                  placeholder="ex: 5% das requisições sofrendo timeout"
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                >
                  Criar Incidente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
