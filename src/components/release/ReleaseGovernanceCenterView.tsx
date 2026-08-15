// src/components/release/ReleaseGovernanceCenterView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  GitBranch, 
  Layers, 
  Sliders, 
  Flag, 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  Plus, 
  FileText, 
  Activity, 
  Lock, 
  Search, 
  Filter, 
  RefreshCw,
  Terminal,
  Server
} from 'lucide-react';

import { ReleaseManagementService } from '../../domain/release/ReleaseManagementService';
import { ChangeManagementService } from '../../domain/release/ChangeManagementService';
import { ConfigurationGovernanceService } from '../../domain/release/ConfigurationGovernanceService';
import { FeatureFlagService } from '../../domain/release/FeatureFlagService';
import { 
  Release, 
  ChangeRequest, 
  ConfigurationChangeRecord, 
  ConfigurationSnapshot, 
  FeatureFlag, 
  ReleaseGovernanceSummary,
  ChangeCategory,
  ChangeRisk,
  FeatureFlagEnvironment
} from '../../domain/release/types';
export const ReleaseGovernanceCenterView: React.FC = () => {
  const user = { id: 'usr-admin-default', companyId: 'company-default', role: 'ADMIN' };
  const companyId = user?.companyId || 'company-default';
  const userRole = user?.role || 'ADMIN';
  const userId = user?.id || 'usr-admin-default';

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'RELEASES' | 'CHANGES' | 'CONFIG' | 'FLAGS' | 'CHECKLIST'>('OVERVIEW');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');

  // Domain State
  const [summary, setSummary] = useState<ReleaseGovernanceSummary | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [changes, setChanges] = useState<ChangeRequest[]>([]);
  const [configRecords, setConfigRecords] = useState<ConfigurationChangeRecord[]>([]);
  const [snapshots, setSnapshots] = useState<ConfigurationSnapshot[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);

  // Modals & Action States
  const [isCreatingRelease, setIsCreatingRelease] = useState(false);
  const [newReleaseVersion, setNewReleaseVersion] = useState('');
  const [newReleaseName, setNewReleaseName] = useState('');

  const [isCreatingChange, setIsCreatingChange] = useState(false);
  const [newChangeTitle, setNewChangeTitle] = useState('');
  const [newChangeCategory, setNewChangeCategory] = useState<ChangeCategory>('CONFIGURATION');
  const [newChangeRisk, setNewChangeRisk] = useState<ChangeRisk>('LOW');
  const [touchesFinancial, setTouchesFinancial] = useState(false);

  const [isCreatingFlag, setIsCreatingFlag] = useState(false);
  const [newFlagKey, setNewFlagKey] = useState('');
  const [newFlagEnv, setNewFlagEnv] = useState<FeatureFlagEnvironment>('PRODUCTION');

  const [rollbackModalTarget, setRollbackModalTarget] = useState<{ id: string; version: string } | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');

  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const loadData = () => {
    const sum = ReleaseManagementService.getGovernanceSummary(companyId);
    const rels = ReleaseManagementService.listReleases(companyId);
    const chgs = ChangeManagementService.listChanges(companyId);
    const cfgs = ConfigurationGovernanceService.listConfigurationChanges(companyId);
    const snaps = ConfigurationGovernanceService.listSnapshots(companyId);
    const flags = FeatureFlagService.listFlags(companyId);

    setSummary(sum);
    setReleases(rels);
    setChanges(chgs);
    setConfigRecords(cfgs);
    setSnapshots(snaps);
    setFeatureFlags(flags);
  };

  useEffect(() => {
    loadData();
  }, [companyId]);

  const showNotification = (type: 'success' | 'error' | 'warning', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  // Release Actions
  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await ReleaseManagementService.createRelease(
      { version: newReleaseVersion, name: newReleaseName },
      userId,
      userRole
    );
    if (res.success) {
      showNotification('success', res.message);
      setIsCreatingRelease(false);
      setNewReleaseVersion('');
      setNewReleaseName('');
      loadData();
    } else {
      showNotification('error', res.message);
    }
  };

  const handleApproveRelease = async (releaseId: string) => {
    const res = await ReleaseManagementService.approveRelease(releaseId, companyId, userId, userRole);
    if (res.success) {
      showNotification('success', res.message);
      loadData();
    } else {
      if (res.p0Found) {
        showNotification('error', `CRÍTICO P0: ${res.message}`);
      } else {
        showNotification('error', res.message);
      }
    }
  };

  const handleExecuteRelease = async (releaseId: string) => {
    const res = await ReleaseManagementService.executeRelease(releaseId, companyId, userId, userRole);
    if (res.success) {
      showNotification('success', res.message);
      loadData();
    } else {
      showNotification('error', res.message);
    }
  };

  const handleConfirmRollback = async () => {
    if (!rollbackModalTarget || !rollbackReason.trim()) return;
    const res = await ReleaseManagementService.rollbackRelease(
      rollbackModalTarget.id,
      companyId,
      userId,
      rollbackReason,
      userRole
    );
    if (res.success) {
      showNotification('success', res.message);
      setRollbackModalTarget(null);
      setRollbackReason('');
      loadData();
    } else {
      showNotification('error', res.message);
    }
  };

  // Change Actions
  const handleCreateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await ChangeManagementService.createChange(
      {
        title: newChangeTitle,
        category: newChangeCategory,
        risk: newChangeRisk,
        impactAssessment: {
          affectedModules: [newChangeCategory],
          affectedEntities: ['GOVERNANCE_CONFIG'],
          touchesFinancialCore: touchesFinancial,
          requiresBackup: newChangeRisk === 'HIGH' || newChangeRisk === 'CRITICAL',
          requiresRollbackPlan: true,
          estimatedDowntimeMinutes: 0,
        },
      },
      userId,
      userRole
    );

    if (res.success) {
      showNotification('success', res.message);
      setIsCreatingChange(false);
      setNewChangeTitle('');
      setTouchesFinancial(false);
      loadData();
    } else {
      showNotification('error', res.message);
    }
  };

  const handleEvaluateChange = async (changeId: string, approve: boolean) => {
    const res = await ChangeManagementService.evaluateChange(
      changeId,
      companyId,
      approve,
      userId,
      userRole,
      approve ? 'Aprovado via centro de governança' : 'Rejeitado por análise de risco'
    );
    if (res.success) {
      showNotification('success', res.message);
      loadData();
    } else {
      showNotification('error', res.message);
    }
  };

  // Flag Actions
  const handleToggleFlag = async (flagId: string, currentEnabled: boolean) => {
    const res = await FeatureFlagService.toggleFeatureFlag(companyId, flagId, !currentEnabled, userId, userRole);
    if (res.success) {
      showNotification('success', res.message);
      loadData();
    } else {
      showNotification('error', res.message);
    }
  };

  const handleCreateFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await FeatureFlagService.createFeatureFlag(
      { key: newFlagKey, environment: newFlagEnv, enabled: true },
      userId,
      userRole
    );
    if (res.success) {
      showNotification('success', res.message);
      setIsCreatingFlag(false);
      setNewFlagKey('');
      loadData();
    } else {
      showNotification('error', res.message);
    }
  };

  // Config Snapshot Action
  const handleTakeSnapshot = () => {
    const snap = ConfigurationGovernanceService.takeSnapshot(companyId, userId, `MANUAL_SNAP_${Date.now()}`);
    showNotification('success', `Snapshot de configuração ${snap.configurationVersion} criado com sucesso.`);
    loadData();
  };

  // Filtered lists
  const filteredReleases = useMemo(() => {
    return releases.filter(r => 
      r.version.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [releases, searchTerm]);

  const filteredChanges = useMemo(() => {
    return changes.filter(c => {
      const matchSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase()) || c.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchRisk = riskFilter === 'ALL' || c.risk === riskFilter;
      return matchSearch && matchRisk;
    });
  }, [changes, searchTerm, riskFilter]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen text-slate-800">
      {/* Top Banner / Header */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <GitBranch className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Governança de Releases & Controle de Mudanças
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Fase 3.52
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Gestão auditável, determinística e multi-tenant de releases, baselines, snapshots e feature flags.
          </p>
        </div>

        {/* Financial Core Freeze Badge */}
        <div className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-lg text-xs font-medium border border-slate-800">
          <Lock className="w-4 h-4 text-emerald-400" />
          <div>
            <span className="block font-bold text-slate-200">Núcleo Financeiro Congelado</span>
            <span className="text-emerald-400 font-mono text-[10px]">FINANCIAL_FILES_MODIFIED = 0</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {feedbackMessage && (
        <div className={`p-4 rounded-lg border text-sm flex items-center justify-between ${
          feedbackMessage.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
          feedbackMessage.type === 'error' ? 'bg-red-50 text-red-900 border-red-200' : 'bg-amber-50 text-amber-900 border-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            {feedbackMessage.type === 'error' && <XCircle className="w-5 h-5 text-red-600" />}
            {feedbackMessage.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
            <span>{feedbackMessage.text}</span>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-2 rounded-t-xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'OVERVIEW' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity className="w-4 h-4" />
          Visão Geral & KPIs
        </button>

        <button
          onClick={() => setActiveTab('RELEASES')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'RELEASES' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Releases & Versões ({releases.length})
        </button>

        <button
          onClick={() => setActiveTab('CHANGES')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'CHANGES' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          Controle de Mudanças ({changes.length})
        </button>

        <button
          onClick={() => setActiveTab('CONFIG')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'CONFIG' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Snapshots & Configurações
        </button>

        <button
          onClick={() => setActiveTab('FLAGS')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'FLAGS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Flag className="w-4 h-4" />
          Feature Flags ({featureFlags.length})
        </button>

        <button
          onClick={() => setActiveTab('CHECKLIST')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'CHECKLIST' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Checklist & Baseline
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'OVERVIEW' && summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Baseline do Sistema</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{summary.baseline.version}</div>
              <span className="text-xs text-slate-500 block mt-1">ID: {summary.baseline.baselineId}</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Releases Implantadas</span>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{summary.deployedReleases}</div>
              <span className="text-xs text-slate-500 block mt-1">De {summary.totalReleases} registradas</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mudanças Críticas</span>
              <div className="text-2xl font-bold text-amber-600 mt-1">{summary.criticalChanges}</div>
              <span className="text-xs text-slate-500 block mt-1">Total: {summary.totalChanges} mudanças</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">System Health Score</span>
              <div className="text-2xl font-bold text-indigo-600 mt-1">{summary.healthScore}/100</div>
              <span className="text-xs text-emerald-600 font-semibold block mt-1">P0 = {summary.p0Count} | P1 = {summary.p1Count}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-600" />
              Arquitetura de Governança de Releases e Mapeamento do Ambiente
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-indigo-600 uppercase">1. Baseline & Versionamento</span>
                <p className="text-xs text-slate-600 mt-2">
                  Toda release é vinculada deterministicamente a uma baseline auditada.
                </p>
                <div className="mt-3 text-[11px] font-mono text-slate-500 bg-white p-2 rounded border border-slate-200">
                  {summary.baseline.financialCoreHash}
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-emerald-600 uppercase">2. Change Management</span>
                <p className="text-xs text-slate-600 mt-2">
                  Solicitações de mudança com avaliação de risco, plano de rollback e validação.
                </p>
                <div className="mt-3 text-[11px] font-mono text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                  IMPACT_ASSESSMENT_OK
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-purple-600 uppercase">3. Protection & Rollback</span>
                <p className="text-xs text-slate-600 mt-2">
                  Garantia de rollback sem perda de histórico, append-only AuditLog e Correlation IDs.
                </p>
                <div className="mt-3 text-[11px] font-mono text-purple-700 bg-purple-50 p-2 rounded border border-purple-200">
                  IDEMPOTENCY_LOCKED
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RELEASES */}
      {activeTab === 'RELEASES' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar por versão ou nome..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={() => setIsCreatingRelease(true)}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Release
            </button>
          </div>

          {/* Create Release Modal */}
          {isCreatingRelease && (
            <div className="p-5 bg-white rounded-xl border border-indigo-200 shadow-md">
              <h3 className="text-base font-bold text-slate-900 mb-3">Criar Nova Release</h3>
              <form onSubmit={handleCreateRelease} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Versão (ex: 3.52.1)</label>
                    <input
                      type="text"
                      required
                      placeholder="3.52.1"
                      value={newReleaseVersion}
                      onChange={e => setNewReleaseVersion(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nome da Release</label>
                    <input
                      type="text"
                      required
                      placeholder="Release Minor de Atualização"
                      value={newReleaseName}
                      onChange={e => setNewReleaseName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingRelease(false)}
                    className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium"
                  >
                    Criar Release
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Releases List */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Versão</th>
                  <th className="p-3">Nome / Descrição</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Tipo / Risco</th>
                  <th className="p-3">Correlation ID</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredReleases.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{r.version}</td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{r.name}</div>
                      <div className="text-xs text-slate-500">{r.description}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        r.status === 'DEPLOYED' || r.status === 'VALIDATED' ? 'bg-emerald-100 text-emerald-800' :
                        r.status === 'APPROVED' ? 'bg-indigo-100 text-indigo-800' :
                        r.status === 'ROLLED_BACK' ? 'bg-amber-100 text-amber-800' :
                        r.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      <span className="font-semibold text-slate-700">{r.releaseType}</span>
                      <span className={`block font-bold mt-0.5 ${
                        r.riskLevel === 'CRITICAL' ? 'text-red-600' :
                        r.riskLevel === 'HIGH' ? 'text-amber-600' : 'text-slate-500'
                      }`}>{r.riskLevel}</span>
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-500">{r.correlationId}</td>
                    <td className="p-3 text-right space-x-2">
                      {r.status === 'DRAFT' || r.status === 'PLANNED' ? (
                        <button
                          onClick={() => handleApproveRelease(r.id)}
                          className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded font-semibold text-xs"
                        >
                          Aprovar
                        </button>
                      ) : null}

                      {r.status === 'APPROVED' ? (
                        <button
                          onClick={() => handleExecuteRelease(r.id)}
                          className="px-2.5 py-1 bg-emerald-600 text-white hover:bg-emerald-700 rounded font-semibold text-xs"
                        >
                          Deploy
                        </button>
                      ) : null}

                      {(r.status === 'DEPLOYED' || r.status === 'VALIDATED') && (
                        <button
                          onClick={() => setRollbackModalTarget({ id: r.id, version: r.version })}
                          className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded font-semibold text-xs flex items-center gap-1 inline-flex"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Rollback
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CHANGES */}
      {activeTab === 'CHANGES' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Buscar solicitações de mudança..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <select
                value={riskFilter}
                onChange={e => setRiskFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="ALL">Todos os Riscos</option>
                <option value="LOW">Risco Baixo (LOW)</option>
                <option value="MEDIUM">Risco Médio (MEDIUM)</option>
                <option value="HIGH">Risco Alto (HIGH)</option>
                <option value="CRITICAL">Risco Crítico (CRITICAL)</option>
              </select>
            </div>

            <button
              onClick={() => setIsCreatingChange(true)}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Solicitar Mudança
            </button>
          </div>

          {/* Create Change Modal */}
          {isCreatingChange && (
            <div className="p-5 bg-white rounded-xl border border-indigo-200 shadow-md">
              <h3 className="text-base font-bold text-slate-900 mb-3">Solicitar Nova Mudança (ChangeRequest)</h3>
              <form onSubmit={handleCreateChange} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Título da Mudança</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Alteração de política de retenção de auditoria"
                    value={newChangeTitle}
                    onChange={e => setNewChangeTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Categoria</label>
                    <select
                      value={newChangeCategory}
                      onChange={e => setNewChangeCategory(e.target.value as ChangeCategory)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="CONFIGURATION">CONFIGURATION</option>
                      <option value="BUGFIX">BUGFIX</option>
                      <option value="FEATURE">FEATURE</option>
                      <option value="SECURITY">SECURITY</option>
                      <option value="PERFORMANCE">PERFORMANCE</option>
                      <option value="INFRASTRUCTURE">INFRASTRUCTURE</option>
                      <option value="EMERGENCY">EMERGENCY</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nível de Risco</label>
                    <select
                      value={newChangeRisk}
                      onChange={e => setNewChangeRisk(e.target.value as ChangeRisk)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="touchesFin"
                    checked={touchesFinancial}
                    onChange={e => setTouchesFinancial(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <label htmlFor="touchesFin" className="text-xs font-medium text-amber-900 cursor-pointer">
                    Impacta o Núcleo Financeiro (Atenção: Ação gerará Bloqueio P0 imediato)
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingChange(false)}
                    className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium"
                  >
                    Submeter Change Request
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Changes List */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">ID / Título</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Risco</th>
                  <th className="p-3">Solicitado por</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredChanges.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3">
                      <div className="font-mono text-xs font-bold text-slate-500">{c.id}</div>
                      <div className="font-semibold text-slate-900">{c.title}</div>
                    </td>
                    <td className="p-3 text-xs font-semibold text-slate-700">{c.category}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        c.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                        c.status === 'APPROVED' ? 'bg-indigo-100 text-indigo-800' :
                        c.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-bold">
                      <span className={c.risk === 'CRITICAL' ? 'text-red-600' : c.risk === 'HIGH' ? 'text-amber-600' : 'text-slate-600'}>
                        {c.risk}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-slate-500">{c.requestedBy}</td>
                    <td className="p-3 text-right space-x-2">
                      {c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW' ? (
                        <>
                          <button
                            onClick={() => handleEvaluateChange(c.id, true)}
                            className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-semibold text-xs"
                          >
                            Aprovar
                          </button>
                          <button
                            onClick={() => handleEvaluateChange(c.id, false)}
                            className="px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded font-semibold text-xs"
                          >
                            Rejeitar
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CONFIG */}
      {activeTab === 'CONFIG' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Snapshots de Configuração & Histórico de Alterações</h3>
              <p className="text-xs text-slate-500 mt-0.5">Controle de versão de parâmetros globais do tenant sem deleção de histórico.</p>
            </div>
            <button
              onClick={handleTakeSnapshot}
              className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Criar Snapshot Manual
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Snapshots Column */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h4 className="font-bold text-slate-900 text-sm mb-3">Snapshots Registrados ({snapshots.length})</h4>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {snapshots.map(s => (
                  <div key={s.snapshotId} className="p-3 border border-slate-200 rounded-lg hover:border-indigo-200 transition-colors bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-indigo-600">{s.configurationVersion}</span>
                      <span className="text-[10px] text-slate-400">{new Date(s.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-xs font-mono text-slate-500 mt-1 truncate">
                      Checksum: {s.checksum}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Criado por: {s.createdBy}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Config Changes Records Column */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h4 className="font-bold text-slate-900 text-sm mb-3">Histórico de Alterações de Configuração ({configRecords.length})</h4>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {configRecords.map(c => (
                  <div key={c.id} className="p-3 border border-slate-200 rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">{c.configurationKey}</span>
                      <span className="text-[10px] text-slate-400">{new Date(c.changedAt).toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      <span className="text-slate-400 line-through mr-2">{String(c.oldValue)}</span>
                      <span className="font-bold text-emerald-600">{String(c.newValue)}</span>
                    </div>
                    <div className="text-xs text-slate-500 italic mt-1">{c.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: FLAGS */}
      {activeTab === 'FLAGS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Feature Flags Isoladas por Tenant</h3>
              <p className="text-xs text-slate-500 mt-0.5">Ativação e desativação segura de funcionalidades por ambiente.</p>
            </div>
            <button
              onClick={() => setIsCreatingFlag(true)}
              className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nova Feature Flag
            </button>
          </div>

          {isCreatingFlag && (
            <div className="p-5 bg-white rounded-xl border border-indigo-200 shadow-md">
              <h3 className="text-base font-bold text-slate-900 mb-3">Criar Nova Feature Flag</h3>
              <form onSubmit={handleCreateFlag} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Chave da Flag (ex: FF_NEW_FEATURE)</label>
                    <input
                      type="text"
                      required
                      placeholder="FF_EXAMPLE_KEY"
                      value={newFlagKey}
                      onChange={e => setNewFlagKey(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Ambiente</label>
                    <select
                      value={newFlagEnv}
                      onChange={e => setNewFlagEnv(e.target.value as FeatureFlagEnvironment)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="PRODUCTION">PRODUCTION</option>
                      <option value="STAGING">STAGING</option>
                      <option value="TEST">TEST</option>
                      <option value="DEVELOPMENT">DEVELOPMENT</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingFlag(false)}
                    className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium"
                  >
                    Criar Flag
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Chave da Flag</th>
                  <th className="p-3">Descrição</th>
                  <th className="p-3">Ambiente</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {featureFlags.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{f.key}</td>
                    <td className="p-3 text-xs text-slate-600">{f.description}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {f.environment}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        f.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {f.enabled ? 'ATIVADA' : 'DESATIVADA'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleToggleFlag(f.id, f.enabled)}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                          f.enabled 
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' 
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {f.enabled ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: CHECKLIST & BASELINE */}
      {activeTab === 'CHECKLIST' && summary && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              Checklist Obrigatório de Release & Verificação de Baseline
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(ReleaseManagementService.getDefaultChecklist()).map(([itemKey, status]) => (
                <div key={itemKey} className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-slate-700">{itemKey}</span>
                  {status ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Rollback Modal */}
      {rollbackModalTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-slate-900 text-lg">Confirmar Rollback da Release</h3>
            </div>
            <p className="text-sm text-slate-600">
              Você está solicitando o rollback da release <span className="font-bold font-mono text-slate-900">{rollbackModalTarget.version}</span>.
              Esta ação será auditada e preservará todo o histórico do sistema.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Motivo do Rollback (Obrigatório)</label>
              <textarea
                required
                rows={3}
                placeholder="Descreva a razão técnica/operacional..."
                value={rollbackReason}
                onChange={e => setRollbackReason(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRollbackModalTarget(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRollback}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium"
              >
                Confirmar Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
