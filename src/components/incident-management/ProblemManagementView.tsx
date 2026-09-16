import React, { useState, useEffect } from 'react';
import { ProblemRecord, ProblemStatus, IncidentPriority } from '../../domain/incident-management/types';
import { ProblemManagementService } from '../../domain/incident-management/ProblemManagementService';
import {
  AlertCircle,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  BookOpen,
  Filter,
  RefreshCw,
  FileText,
} from 'lucide-react';

interface ProblemManagementViewProps {
  companyId: string;
  userId: string;
}

export const ProblemManagementView: React.FC<ProblemManagementViewProps> = ({ companyId, userId }) => {
  const [problems, setProblems] = useState<ProblemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Create form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<IncidentPriority>('P1');
  const [newRelatedIncidents, setNewRelatedIncidents] = useState('');

  // Edit/Detail state
  const [selectedProblem, setSelectedProblem] = useState<ProblemRecord | null>(null);
  const [rootCauseInput, setRootCauseInput] = useState('');
  const [workaroundInput, setWorkaroundInput] = useState('');
  const [permanentSolutionInput, setPermanentSolutionInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    loadProblems();
  }, [companyId, statusFilter]);

  const loadProblems = async () => {
    setLoading(true);
    const filter = statusFilter !== 'ALL' ? { status: statusFilter as ProblemStatus } : undefined;
    const list = await ProblemManagementService.getProblems(companyId, filter);
    setProblems(list);
    setLoading(false);
  };

  const handleCreateProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const related = newRelatedIncidents
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const res = await ProblemManagementService.createProblem({
      companyId,
      title: newTitle,
      description: newDesc,
      priority: newPriority,
      relatedIncidentIds: related,
      ownerId: userId,
    });

    if (res.success) {
      setMsg('Registro de Problema criado com sucesso!');
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewRelatedIncidents('');
      await loadProblems();
    } else {
      setMsg(`Erro: ${res.message}`);
    }
  };

  const handleUpdateStatus = async (status: ProblemStatus) => {
    if (!selectedProblem) return;

    const res = await ProblemManagementService.updateProblemStatus({
      problemId: selectedProblem.id,
      companyId,
      status,
      userId,
      rootCause: rootCauseInput || selectedProblem.rootCause,
      workaround: workaroundInput || selectedProblem.workaround,
      permanentSolution: permanentSolutionInput || selectedProblem.permanentSolution,
      knownError: status === 'ROOT_CAUSE_IDENTIFIED' ? true : selectedProblem.knownError,
    });

    if (res.success && res.problem) {
      setMsg(`Status do problema atualizado para ${status}`);
      setSelectedProblem(res.problem);
      await loadProblems();
    } else {
      setMsg(`Erro: ${res.message}`);
    }
  };

  const filteredProblems = problems.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Central de Gestão de Problemas (Problem Management)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Mapeamento de Causa Raiz, Erros Conhecidos (Known Errors) e Soluções Definitivas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadProblems}
            className="p-2 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Novo Registro de Problema
          </button>
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

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por título, ID ou causa raiz..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          >
            <option value="ALL">Todos os Status</option>
            <option value="OPEN">Abertos (OPEN)</option>
            <option value="INVESTIGATING">Em Investigação</option>
            <option value="ROOT_CAUSE_IDENTIFIED">Causa Raiz Identificada</option>
            <option value="RESOLVED">Resolvidos</option>
            <option value="CLOSED">Fechados</option>
          </select>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Problem List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Registros de Problemas ({filteredProblems.length})
          </h3>
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Carregando problemas...</div>
          ) : filteredProblems.length === 0 ? (
            <div className="p-8 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-center text-xs text-slate-500">
              Nenhum problema encontrado com os filtros selecionados.
            </div>
          ) : (
            filteredProblems.map((prob) => (
              <div
                key={prob.id}
                onClick={() => {
                  setSelectedProblem(prob);
                  setRootCauseInput(prob.rootCause || '');
                  setWorkaroundInput(prob.workaround || '');
                  setPermanentSolutionInput(prob.permanentSolution || '');
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedProblem?.id === prob.id
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 dark:border-indigo-500 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold text-slate-500">{prob.id}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    prob.knownError ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {prob.knownError ? 'Known Error' : prob.status}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">{prob.title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{prob.description}</p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800/60 pt-2">
                  <span>Incidentes Vinculados: {prob.relatedIncidentIds.length}</span>
                  <span>{new Date(prob.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Problem Detail / Investigation Form */}
        <div className="lg:col-span-2">
          {selectedProblem ? (
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-6">
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 rounded">
                      {selectedProblem.id}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded">
                      Prioridade: {selectedProblem.priority}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedProblem.title}</h3>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  Criado em: {new Date(selectedProblem.createdAt).toLocaleString()}
                </span>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Descrição do Problema</h4>
                <p className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  {selectedProblem.description}
                </p>
              </div>

              {/* Status Actions */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Transição de Estado do Problema</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleUpdateStatus('INVESTIGATING')}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors"
                  >
                    Iniciar Investigação
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('ROOT_CAUSE_IDENTIFIED')}
                    className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
                  >
                    Marcar Causa Raiz Identificada
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('RESOLVED')}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors"
                  >
                    Resolver Problema
                  </button>
                </div>
              </div>

              {/* Analysis Fields */}
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Análise da Causa Raiz (Root Cause)
                  </label>
                  <textarea
                    rows={3}
                    value={rootCauseInput}
                    onChange={(e) => setRootCauseInput(e.target.value)}
                    placeholder="Descreva detalhadamente a causa raiz comprovada..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Solução de Contorno (Workaround)
                  </label>
                  <textarea
                    rows={2}
                    value={workaroundInput}
                    onChange={(e) => setWorkaroundInput(e.target.value)}
                    placeholder="Contorno paliativo para mitigar incidentes em produção..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Solução Definitiva (Permanent Fix)
                  </label>
                  <textarea
                    rows={2}
                    value={permanentSolutionInput}
                    onChange={(e) => setPermanentSolutionInput(e.target.value)}
                    placeholder="Ação definitiva a ser implementada via Change Request / Release..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <button
                  onClick={() => handleUpdateStatus(selectedProblem.status)}
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  Salvar Atualizações de Causa Raiz / Contorno
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-center text-slate-500 dark:text-slate-400 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm font-medium">Selecione um registro de problema à esquerda para visualizar e gerenciar.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal create problem */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Criar Registro de Problema</h3>
            <form onSubmit={handleCreateProblem} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Título do Problema</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="ex: Falha intermitente na lib de mensageria"
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Detalhes dos comportamentos anômalos reportados..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Prioridade</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as IncidentPriority)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="P0">P0 - Emergência Crítica</option>
                  <option value="P1">P1 - Crítico</option>
                  <option value="P2">P2 - Importante</option>
                  <option value="P3">P3 - Baixo Impacto</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">IDs dos Incidentes Vinculados (separados por vírgula)</label>
                <input
                  type="text"
                  value={newRelatedIncidents}
                  onChange={(e) => setNewRelatedIncidents(e.target.value)}
                  placeholder="ex: inc-101, inc-102"
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
                  Criar Problema
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
