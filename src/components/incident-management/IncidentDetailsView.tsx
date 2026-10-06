import { requestGuardedClose } from '../../app/unsavedChangesAuthority';
import React, { useEffect, useState } from 'react';
import {
  ProductionIncident,
  IncidentStatus,
  PostMortemRecord,
  CorrectiveActionItem,
} from '../../domain/incident-management/types';
import { IncidentManagementService } from '../../domain/incident-management/IncidentManagementService';
import {
  X,
  Clock,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  ShieldCheck,
  Zap,
  Tag,
  Share2,
} from 'lucide-react';

interface IncidentDetailsViewProps {
  incident: ProductionIncident;
  companyId: string;
  userId: string;
  userRole: string;
  onClose: () => void;
  onUpdate: () => void;
}

export const IncidentDetailsView: React.FC<IncidentDetailsViewProps> = ({
  incident,
  companyId,
  userId,
  userRole,
  onClose,
  onUpdate,
}) => {
  useEffect(() => {
    const appMain = document.querySelector('main') as HTMLElement | null;
    const previousMainOverflow = appMain?.style.overflow || '';
    const previousBodyOverflow = document.body.style.overflow;
    if (appMain) appMain.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      if (appMain) appMain.style.overflow = previousMainOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const [activeSubTab, setActiveSubTab] = useState<'timeline' | 'commander' | 'postmortem'>('timeline');
  const [rootCauseInput, setRootCauseInput] = useState(incident.rootCause || '');
  const [resolutionInput, setResolutionInput] = useState(incident.resolutionSummary || '');
  const [reopenReason, setReopenReason] = useState('');
  const [commanderIdInput, setCommanderIdInput] = useState(incident.commanderId || '');
  const [techLeadInput, setTechLeadInput] = useState(incident.technicalLeadId || '');

  const [postMortem, setPostMortem] = useState<PostMortemRecord | null>(null);
  const [loadingPm, setLoadingPm] = useState(false);
  const [pmSummary, setPmSummary] = useState('');
  const [pmImpact, setPmImpact] = useState('');
  const [pmDetection, setPmDetection] = useState('');
  const [pmRootCause, setPmRootCause] = useState(incident.rootCause || '');
  const [pmCorrectiveAction, setPmCorrectiveAction] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  React.useEffect(() => {
    loadPostMortem();
  }, [incident.id]);

  const loadPostMortem = async () => {
    setLoadingPm(true);
    const pm = await IncidentManagementService.getPostMortemByIncident(incident.id, companyId);
    if (pm) {
      setPostMortem(pm);
      setPmSummary(pm.summary);
      setPmImpact(pm.impact);
      setPmDetection(pm.detection);
      setPmRootCause(pm.rootCause);
    }
    setLoadingPm(false);
  };

  const handleStatusTransition = async (targetStatus: IncidentStatus) => {
    setIsSubmitting(true);
    setActionMsg(null);
    try {
      let res;
      if (targetStatus === 'RESOLVED') {
        if (!rootCauseInput.trim()) {
          setActionMsg('A declaração da Causa Raiz é obrigatória para resolver o incidente.');
          setIsSubmitting(false);
          return;
        }
        res = await IncidentManagementService.resolveIncident({
          incidentId: incident.id,
          companyId,
          userId,
          rootCause: rootCauseInput,
          resolutionSummary: resolutionInput || 'Resolvido com sucesso.',
        });
      } else if (targetStatus === 'CLOSED') {
        res = await IncidentManagementService.closeIncident({
          incidentId: incident.id,
          companyId,
          userId,
        });
      } else if (targetStatus === 'REOPENED') {
        if (!reopenReason.trim()) {
          setActionMsg('O motivo de reabertura é obrigatório.');
          setIsSubmitting(false);
          return;
        }
        res = await IncidentManagementService.reopenIncident({
          incidentId: incident.id,
          companyId,
          userId,
          reason: reopenReason,
        });
      } else {
        res = await IncidentManagementService.transitionStatus({
          incidentId: incident.id,
          companyId,
          targetStatus,
          userId,
        });
      }

      if (res.success) {
        setActionMsg(`Status atualizado com sucesso para ${targetStatus}`);
        onUpdate();
      } else {
        setActionMsg(`Erro: ${res.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveCommander = async () => {
    if (!commanderIdInput) return;
    setIsSubmitting(true);
    const res = await IncidentManagementService.assignCommander({
      incidentId: incident.id,
      companyId,
      commanderId: commanderIdInput,
      technicalLeadId: techLeadInput,
      userId,
    });
    if (res.success) {
      setActionMsg('Liderança operacional e Commander atribuídos!');
      onUpdate();
    } else {
      setActionMsg(`Erro: ${res.message}`);
    }
    setIsSubmitting(false);
  };

  const handleCreatePostMortem = async () => {
    setIsSubmitting(true);
    const res = await IncidentManagementService.createPostMortem({
      incidentId: incident.id,
      companyId,
      userId,
      summary: pmSummary || `Análise de Causa Raiz - ${incident.title}`,
      impact: pmImpact || incident.impactDescription,
      timeline: [
        { timestamp: incident.detectedAt, event: 'Detecção inicial do incidente' },
        ...(incident.acknowledgedAt ? [{ timestamp: incident.acknowledgedAt, event: 'Triagem e Reconhecimento (ACK)' }] : []),
        ...(incident.resolvedAt ? [{ timestamp: incident.resolvedAt, event: 'Resolução aplicada' }] : []),
      ],
      detection: pmDetection || 'Sistema de Alertas da Observabilidade',
      response: 'Acionamento do Incident Commander On-Call',
      containment: 'Isolamento de rota com falha e failover',
      resolution: incident.resolutionSummary || 'Ajustes no serviço e reativação',
      rootCause: pmRootCause || incident.rootCause || 'Análise técnica em andamento',
      contributingFactors: ['Aumento repentino de tráfego concorrente'],
      whatWentWell: ['Detecção rápida dentro do SLA', 'Resposta coordenada pelo Commander'],
      whatWentWrong: ['Comunicação aos clientes com atraso'],
      correctiveActions: pmCorrectiveAction
        ? [{ id: `act-${Date.now()}`, description: pmCorrectiveAction, targetType: 'TASK', status: 'PENDING' }]
        : [],
      preventiveActions: ['Criação de testes automatizados de estresse'],
    });

    if (res.success) {
      setActionMsg('Rascunho de Post-Mortem registrado com sucesso!');
      await loadPostMortem();
    } else {
      setActionMsg(`Erro ao criar Post-Mortem: ${res.message}`);
    }
    setIsSubmitting(false);
  };

  const handleApprovePostMortem = async () => {
    if (!postMortem) return;
    setIsSubmitting(true);
    const res = await IncidentManagementService.approvePostMortem({
      postMortemId: postMortem.id,
      companyId,
      userId,
    });
    if (res.success) {
      setActionMsg('Post-Mortem APROVADO e tornado imutável!');
      await loadPostMortem();
    } else {
      setActionMsg(`Erro: ${res.message}`);
    }
    setIsSubmitting(false);
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'SEV0': return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300';
      case 'SEV1': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300';
      case 'SEV2': return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50 dark:bg-slate-900/50">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-md border ${getSeverityBadge(incident.severity)}`}>
                {incident.severity}
              </span>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                {incident.priority}
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded">
                {incident.id}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Correlation: {incident.correlationId}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {incident.title}
            </h2>
          </div>
          <button
            onClick={(event)=>requestGuardedClose(event,onClose)}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {actionMsg && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300 flex items-center justify-between">
              <span>{actionMsg}</span>
              <button onClick={() => setActionMsg(null)} className="text-xs font-semibold underline">
                Fechar
              </button>
            </div>
          )}

          {/* Incident Meta Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 block mb-1 font-medium">Status Atual</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {incident.status}
              </span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 block mb-1 font-medium">SLA Status</span>
              <span className={`text-sm font-bold ${
                incident.slaStatus === 'BREACHED'
                  ? 'text-red-600 dark:text-red-400'
                  : incident.slaStatus === 'WARNING'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {incident.slaStatus}
              </span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 block mb-1 font-medium">Incident Commander</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {incident.commanderId || 'Não Atribuído'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 block mb-1 font-medium">Origem & Módulo</span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
                {incident.source} / {incident.affectedModule || 'Sistemas'}
              </span>
            </div>
          </div>

          {/* Description & Impact */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Descrição Detalhada</h4>
              <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">{incident.description}</p>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Impacto Operacional</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{incident.impactDescription}</p>
            </div>
          </div>

          {/* Actions & State Transitions */}
          <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-lg space-y-3">
            <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Ações de Resposta e Transição de Estado
            </h3>

            <div className="flex flex-wrap gap-2">
              {incident.status === 'DETECTED' && (
                <button
                  onClick={() => handleStatusTransition('TRIAGED')}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  Confirmar Triagem (TRIAGED)
                </button>
              )}
              {(incident.status === 'DETECTED' || incident.status === 'TRIAGED') && (
                <button
                  onClick={() => handleStatusTransition('ACKNOWLEDGED')}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
                >
                  Reconhecer Incidente (ACK)
                </button>
              )}
              {incident.status !== 'CLOSED' && incident.status !== 'CANCELLED' && incident.status !== 'RESOLVED' && (
                <button
                  onClick={() => handleStatusTransition('INVESTIGATING')}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors"
                >
                  Iniciar Investigação
                </button>
              )}
              {incident.status !== 'CLOSED' && incident.status !== 'CANCELLED' && incident.status !== 'RESOLVED' && (
                <button
                  onClick={() => handleStatusTransition('CONTAINING')}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
                >
                  Aplicar Contenção
                </button>
              )}
            </div>

            {/* Resolve Form */}
            {incident.status !== 'RESOLVED' && incident.status !== 'CLOSED' && incident.status !== 'CANCELLED' && (
              <div className="pt-3 border-t border-indigo-200 dark:border-indigo-900/50 space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Resolução de Incidente (Exige Causa Raiz)
                </h4>
                <input
                  type="text"
                  placeholder="Causa raiz identificada (obrigatório)..."
                  value={rootCauseInput}
                  onChange={(e) => setRootCauseInput(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Resumo da solução/mitigação aplicada..."
                  value={resolutionInput}
                  onChange={(e) => setResolutionInput(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <button
                  onClick={() => handleStatusTransition('RESOLVED')}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors"
                >
                  Marcar Incidente como RESOLVED
                </button>
              </div>
            )}

            {/* Close Form */}
            {incident.status === 'RESOLVED' && (
              <div className="pt-3 border-t border-indigo-200 dark:border-indigo-900/50">
                <button
                  onClick={() => handleStatusTransition('CLOSED')}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md transition-colors"
                >
                  Fechar Incidente (CLOSED)
                </button>
              </div>
            )}

            {/* Reopen Form */}
            {incident.status === 'CLOSED' && (
              <div className="pt-3 border-t border-indigo-200 dark:border-indigo-900/50 space-y-2">
                <input
                  type="text"
                  placeholder="Motivo para reabertura do incidente..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <button
                  onClick={() => handleStatusTransition('REOPENED')}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                >
                  Reabrir Incidente (REOPEN)
                </button>
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4">
            <button
              onClick={() => setActiveSubTab('timeline')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                activeSubTab === 'timeline'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Timeline & Histórico
            </button>
            <button
              onClick={() => setActiveSubTab('commander')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                activeSubTab === 'commander'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Atribuição de Liderança
            </button>
            <button
              onClick={() => setActiveSubTab('postmortem')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                activeSubTab === 'postmortem'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Post-Mortem
            </button>
          </div>

          {/* SubTab Content */}
          {activeSubTab === 'timeline' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cronograma de Eventos</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2 p-2 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-800">
                  <Clock className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Detecção Registrada
                    </span>
                    <p className="text-slate-500">{new Date(incident.detectedAt).toLocaleString()}</p>
                  </div>
                </div>
                {incident.acknowledgedAt && (
                  <div className="flex items-start gap-2 p-2 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-800">
                    <UserCheck className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        Triado / Reconhecido (ACK)
                      </span>
                      <p className="text-slate-500">{new Date(incident.acknowledgedAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
                {incident.resolvedAt && (
                  <div className="flex items-start gap-2 p-2 bg-emerald-50 dark:bg-emerald-950/20 rounded border border-emerald-200 dark:border-emerald-900/50">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                        Incidente Resolvido
                      </span>
                      <p className="text-emerald-700 dark:text-emerald-400">
                        {new Date(incident.resolvedAt).toLocaleString()}
                      </p>
                      {incident.rootCause && (
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1">
                          Causa Raiz: {incident.rootCause}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSubTab === 'commander' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Definição de Responsáveis (Incident Command System)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                    Incident Commander (ID / Nome)
                  </label>
                  <input
                    type="text"
                    value={commanderIdInput}
                    onChange={(e) => setCommanderIdInput(e.target.value)}
                    placeholder="ex: usr-commander-sre"
                    className="w-full text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                    Technical Lead (ID / Nome)
                  </label>
                  <input
                    type="text"
                    value={techLeadInput}
                    onChange={(e) => setTechLeadInput(e.target.value)}
                    placeholder="ex: usr-tech-lead"
                    className="w-full text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveCommander}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
              >
                Salvar Atribuições
              </button>
            </div>
          )}

          {activeSubTab === 'postmortem' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Análise Estruturada Post-Mortem
                </h4>
                {postMortem && (
                  <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                    postMortem.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800'
                  }`}>
                    Status: {postMortem.status} (v{postMortem.version})
                  </span>
                )}
              </div>

              {postMortem && postMortem.status === 'APPROVED' ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    Post-Mortem Homologado e Imutável
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    <strong>Resumo:</strong> {postMortem.summary}
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    <strong>Causa Raiz:</strong> {postMortem.rootCause}
                  </p>
                  <p className="text-xs text-slate-500">
                    Revisado por: {postMortem.reviewedBy || 'Admin'} em {new Date(postMortem.completedAt || '').toLocaleString()}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                      Resumo do Evento
                    </label>
                    <input
                      type="text"
                      value={pmSummary}
                      onChange={(e) => setPmSummary(e.target.value)}
                      placeholder="Resumo sumário do Post-Mortem..."
                      className="w-full text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                      Causa Raiz Definitiva
                    </label>
                    <textarea
                      value={pmRootCause}
                      onChange={(e) => setPmRootCause(e.target.value)}
                      rows={2}
                      className="w-full text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                      Ação Corretiva / Preventiva Principal
                    </label>
                    <input
                      type="text"
                      value={pmCorrectiveAction}
                      onChange={(e) => setPmCorrectiveAction(e.target.value)}
                      placeholder="ex: Adicionar validação de limite de requisições..."
                      className="w-full text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreatePostMortem}
                      disabled={isSubmitting}
                      className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
                    >
                      Salvar Rascunho do Post-Mortem
                    </button>
                    {postMortem && postMortem.status === 'DRAFT' && (
                      <button
                        onClick={handleApprovePostMortem}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors"
                      >
                        Aprovar e Homologar Post-Mortem
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
