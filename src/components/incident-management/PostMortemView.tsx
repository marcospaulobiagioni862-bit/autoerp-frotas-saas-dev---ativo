import React, { useState, useEffect } from 'react';
import { PostMortemRecord, ProductionIncident } from '../../domain/incident-management/types';
import { IncidentManagementService } from '../../domain/incident-management/IncidentManagementService';
import {
  FileText,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Search,
  BookOpen,
} from 'lucide-react';

interface PostMortemViewProps {
  companyId: string;
  userId: string;
}

export const PostMortemView: React.FC<PostMortemViewProps> = ({ companyId, userId }) => {
  const [incidents, setIncidents] = useState<ProductionIncident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');
  const [postMortem, setPostMortem] = useState<PostMortemRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Post-Mortem Form state
  const [summary, setSummary] = useState('');
  const [impact, setImpact] = useState('');
  const [detection, setDetection] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [preventiveAction, setPreventiveAction] = useState('');

  useEffect(() => {
    loadResolvedIncidents();
  }, [companyId]);

  const loadResolvedIncidents = async () => {
    setLoading(true);
    const list = await IncidentManagementService.getIncidents(companyId);
    // Include resolved and closed incidents
    const resolvedOrClosed = list.filter((i) => i.status === 'RESOLVED' || i.status === 'CLOSED');
    setIncidents(resolvedOrClosed);
    if (resolvedOrClosed.length > 0) {
      setSelectedIncidentId(resolvedOrClosed[0].id);
      await loadPostMortemForIncident(resolvedOrClosed[0].id);
    }
    setLoading(false);
  };

  const loadPostMortemForIncident = async (incId: string) => {
    const pm = await IncidentManagementService.getPostMortemByIncident(incId, companyId);
    setPostMortem(pm);
    if (pm) {
      setSummary(pm.summary);
      setImpact(pm.impact);
      setDetection(pm.detection);
      setRootCause(pm.rootCause);
    } else {
      const inc = incidents.find((i) => i.id === incId);
      setSummary(inc ? `Análise de Causa Raiz — ${inc.title}` : '');
      setImpact(inc?.impactDescription || '');
      setDetection('Sistema de Alertas da Observabilidade');
      setRootCause(inc?.rootCause || '');
    }
  };

  const handleSelectIncident = async (incId: string) => {
    setSelectedIncidentId(incId);
    await loadPostMortemForIncident(incId);
  };

  const handleSaveDraft = async () => {
    if (!selectedIncidentId) return;
    const res = await IncidentManagementService.createPostMortem({
      incidentId: selectedIncidentId,
      companyId,
      userId,
      summary: summary || 'Rascunho de Post-Mortem',
      impact,
      timeline: [{ timestamp: new Date().toISOString(), event: 'Análise de Causa Raiz registrada' }],
      detection,
      response: 'Acionamento de resposta rápida On-Call',
      containment: 'Contenção aplicada via rollback/isolamento',
      resolution: 'Resolução aplicada e validada em produção',
      rootCause,
      contributingFactors: ['Aumento imprevisível no volume de concorrência'],
      whatWentWell: ['Tempo de detecção do alerta dentro da meta SLA'],
      whatWentWrong: ['Atraso na comunicação de status aos clientes'],
      correctiveActions: correctiveAction
        ? [{ id: `act-${Date.now()}`, description: correctiveAction, targetType: 'TASK', status: 'PENDING' }]
        : [],
      preventiveActions: preventiveAction ? [preventiveAction] : ['Refatoração de circuit breaker'],
    });

    if (res.success && res.postMortem) {
      setMsg('Rascunho de Post-Mortem salvo com sucesso!');
      setPostMortem(res.postMortem);
    } else {
      setMsg(`Erro: ${res.message}`);
    }
  };

  const handleApprove = async () => {
    if (!postMortem) return;
    const res = await IncidentManagementService.approvePostMortem({
      postMortemId: postMortem.id,
      companyId,
      userId,
    });
    if (res.success && res.postMortem) {
      setMsg('Post-Mortem APROVADO! O registro foi homologado e tornado imutável.');
      setPostMortem(res.postMortem);
    } else {
      setMsg(`Erro: ${res.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Central de Análises Post-Mortem & Lições Aprendidas
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Relatórios formais de causa raiz, timeline de resposta e planos de ações preventivas.
          </p>
        </div>
        <button
          onClick={loadResolvedIncidents}
          className="p-2 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {msg && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 text-xs rounded-lg flex justify-between items-center">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="font-semibold underline">
            Fechar
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resolved Incident List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Incidentes Elegíveis ({incidents.length})
          </h3>
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Carregando incidentes...</div>
          ) : incidents.length === 0 ? (
            <div className="p-8 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-center text-xs text-slate-500">
              Nenhum incidente resolvido ou fechado disponível para Post-Mortem.
            </div>
          ) : (
            incidents.map((inc) => (
              <div
                key={inc.id}
                onClick={() => handleSelectIncident(inc.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedIncidentId === inc.id
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 dark:border-indigo-500 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold text-slate-500">{inc.id}</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded">
                    {inc.status}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">{inc.title}</h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  Causa Raiz: {inc.rootCause || 'Análise pendente'}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Post-Mortem Form / Details */}
        <div className="lg:col-span-2">
          {selectedIncidentId ? (
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Análise de Post-Mortem — {selectedIncidentId}
                </h3>
                {postMortem && (
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${
                    postMortem.status === 'APPROVED'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    Status: {postMortem.status} (v{postMortem.version})
                  </span>
                )}
              </div>

              {postMortem?.status === 'APPROVED' ? (
                <div className="p-5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-300 font-bold text-sm">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    Post-Mortem Homologado e Aprovado
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 space-y-2">
                    <p><strong>Resumo Executivo:</strong> {postMortem.summary}</p>
                    <p><strong>Causa Raiz:</strong> {postMortem.rootCause}</p>
                    <p><strong>Detecção:</strong> {postMortem.detection}</p>
                    <p><strong>Impacto:</strong> {postMortem.impact}</p>
                  </div>
                  <div className="pt-2 text-[11px] text-slate-500 border-t border-emerald-200 dark:border-emerald-900/50">
                    Aprovado por {postMortem.reviewedBy || 'Admin'} em {new Date(postMortem.completedAt || '').toLocaleString()}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Resumo Executivo do Incidente
                    </label>
                    <input
                      type="text"
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder="Síntese sumária do incidente e resolução..."
                      className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Análise de Causa Raiz (Root Cause Analysis)
                    </label>
                    <textarea
                      rows={3}
                      value={rootCause}
                      onChange={(e) => setRootCause(e.target.value)}
                      placeholder="Explicação detalhada dos fatores que desencadearam a falha..."
                      className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Impacto Operacional
                      </label>
                      <input
                        type="text"
                        value={impact}
                        onChange={(e) => setImpact(e.target.value)}
                        placeholder="Usuários ou serviços afetados..."
                        className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Mecanismo de Detecção
                      </label>
                      <input
                        type="text"
                        value={detection}
                        onChange={(e) => setDetection(e.target.value)}
                        placeholder="Métrica de observabilidade ou alerta..."
                        className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Ação Corretiva Imediata (Gera Task)
                    </label>
                    <input
                      type="text"
                      value={correctiveAction}
                      onChange={(e) => setCorrectiveAction(e.target.value)}
                      placeholder="ex: Ajuste no timeout das conexões..."
                      className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Ação Preventiva de Longo Prazo
                    </label>
                    <input
                      type="text"
                      value={preventiveAction}
                      onChange={(e) => setPreventiveAction(e.target.value)}
                      placeholder="ex: Refatoração da biblioteca de integração..."
                      className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveDraft}
                      className="px-4 py-2 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                    >
                      Salvar Rascunho
                    </button>
                    {postMortem && postMortem.status === 'DRAFT' && (
                      <button
                        onClick={handleApprove}
                        className="px-4 py-2 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                      >
                        Aprovar e Homologar Post-Mortem
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-center text-slate-500">
              Selecione um incidente resolvido à esquerda para iniciar o Post-Mortem.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
