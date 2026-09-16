import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, AlertTriangle, ShieldAlert, Activity, RefreshCw, 
  Search, Filter, Lock, ArrowRight, CheckCircle2, XCircle, FileText, 
  Zap, AlertCircle, Eye, Database, Cpu
} from 'lucide-react';
import { Card, Button, Badge, Input, Select, ModalContainer } from '../ui';
import { GovernanceAuditService, GovernanceAnalysisReport, GovernanceEventProcessed } from '../../domain/governance/GovernanceAuditService';

interface GovernanceCenterViewProps {
  companyId?: string;
  auditLogs?: any[];
  tasks?: any[];
  incidents?: any[];
  pendings?: any[];
  userRole?: string;
}

export const GovernanceCenterView: React.FC<GovernanceCenterViewProps> = ({
  companyId = 'company-main-uuid',
  auditLogs = [],
  tasks = [],
  incidents = [],
  pendings = [],
  userRole = 'ADMIN',
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30d');
  const [activeTab, setActiveTab] = useState<'overview' | 'audit' | 'security' | 'anomalies'>('overview');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<GovernanceEventProcessed | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;

  const report: GovernanceAnalysisReport = useMemo(() => {
    return GovernanceAuditService.analyzeGovernance({
      companyId,
      auditLogs,
      tasks,
      incidents,
      pendings,
      userRole,
    });
  }, [companyId, auditLogs, tasks, incidents, pendings, userRole]);

  const filteredEvents = useMemo(() => {
    return report.processedEvents.filter(evt => {
      const matchesSearch = 
        evt.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.entityType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.entityId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (evt.userId && evt.userId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (evt.correlationId && evt.correlationId.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesSeverity = severityFilter === 'ALL' || evt.severity === severityFilter;
      const matchesModule = moduleFilter === 'ALL' || evt.module === moduleFilter;

      return matchesSearch && matchesSeverity && matchesModule;
    });
  }, [report.processedEvents, searchQuery, severityFilter, moduleFilter]);

  const totalPages = Math.ceil(filteredEvents.length / pageSize) || 1;
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, currentPage]);

  const healthColor = 
    report.healthScore.classification === 'EXCELLENT' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200' :
    report.healthScore.classification === 'GOOD' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200' :
    report.healthScore.classification === 'WARNING' ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200' :
    'text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm mb-1">
            <ShieldCheck className="w-5 h-5" />
            <span>FASE 3.45 — GOVERNANÇA, AUDITORIA & CONFIABILIDADE</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Central de Governança Operacional</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Auditoria avançada, rastreabilidade determinística, isolamento multi-tenant e verificação de integridade somente leitura.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant={selectedPeriod === '7d' ? 'primary' : 'outline'} 
            size="sm"
            onClick={() => setSelectedPeriod('7d')}
          >
            7 Dias
          </Button>
          <Button 
            variant={selectedPeriod === '30d' ? 'primary' : 'outline'} 
            size="sm"
            onClick={() => setSelectedPeriod('30d')}
          >
            30 Dias
          </Button>
          <Button 
            variant={selectedPeriod === '90d' ? 'primary' : 'outline'} 
            size="sm"
            onClick={() => setSelectedPeriod('90d')}
          >
            90 Dias
          </Button>
        </div>
      </div>

      {/* Row 1: KPIs (6 KPIs requested) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* KPI 1: Governance Health Score */}
        <Card className={`p-4 border-2 flex flex-col justify-between ${healthColor}`}>
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Health Score</span>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-1 my-1">
              <span className="text-3xl font-black">{report.healthScore.score}</span>
              <span className="text-xs font-semibold opacity-80">/100</span>
            </div>
            <p className="text-[10px] font-semibold uppercase">{report.healthScore.classification}</p>
          </div>
        </Card>

        {/* KPI 2: Critical Events */}
        <Card className="p-4 bg-white dark:bg-slate-900 flex flex-col justify-between border border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex justify-between items-center mb-1 text-slate-500">
              <span className="text-[11px] font-medium uppercase tracking-wider">Eventos Críticos</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{report.indicators.audit.criticalEvents}</p>
            <p className="text-[11px] text-slate-500 mt-1">P0: {report.indicators.audit.p0} | P1: {report.indicators.audit.p1}</p>
          </div>
        </Card>

        {/* KPI 3: Security Events */}
        <Card className="p-4 bg-white dark:bg-slate-900 flex flex-col justify-between border border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex justify-between items-center mb-1 text-slate-500">
              <span className="text-[11px] font-medium uppercase tracking-wider">Segurança</span>
              <ShieldAlert className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{report.indicators.security.crossTenantAttempts + report.indicators.security.rbacViolations}</p>
            <p className="text-[11px] text-slate-500 mt-1">Cross-tenant: {report.indicators.security.crossTenantAttempts}</p>
          </div>
        </Card>

        {/* KPI 4: Operational Failures */}
        <Card className="p-4 bg-white dark:bg-slate-900 flex flex-col justify-between border border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex justify-between items-center mb-1 text-slate-500">
              <span className="text-[11px] font-medium uppercase tracking-wider">Falhas Op.</span>
              <XCircle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{report.indicators.operation.operationalFailures}</p>
            <p className="text-[11px] text-slate-500 mt-1">Bloqueadas: {report.indicators.operation.blockedOperations}</p>
          </div>
        </Card>

        {/* KPI 5: Missing Traceability */}
        <Card className="p-4 bg-white dark:bg-slate-900 flex flex-col justify-between border border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex justify-between items-center mb-1 text-slate-500">
              <span className="text-[11px] font-medium uppercase tracking-wider">Sem CorrelationId</span>
              <FileText className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{report.indicators.audit.withoutCorrelationId}</p>
            <p className="text-[11px] text-slate-500 mt-1">Total: {report.indicators.audit.totalEvents}</p>
          </div>
        </Card>

        {/* KPI 6: Anomalies Detected */}
        <Card className="p-4 bg-white dark:bg-slate-900 flex flex-col justify-between border border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex justify-between items-center mb-1 text-slate-500">
              <span className="text-[11px] font-medium uppercase tracking-wider">Anomalias</span>
              <Activity className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{report.anomalies.length}</p>
            <p className="text-[11px] text-slate-500 mt-1">Requer análise</p>
          </div>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'overview' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Visão Geral & Indicadores
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'audit' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Timeline & Eventos ({report.processedEvents.length})
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2.5 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'security' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Segurança & Multi-Tenancy
        </button>
        <button
          onClick={() => setActiveTab('anomalies')}
          className={`px-4 py-2.5 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'anomalies' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Anomalias & Recomendações ({report.anomalies.length})
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 bg-white dark:bg-slate-900 lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600" />
              <span>Componentes do Governance Health Score</span>
            </h2>
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700 dark:text-slate-300">Integridade de Auditoria (25%)</span>
                  <span className="text-indigo-600">{report.healthScore.components.auditIntegrity}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${report.healthScore.components.auditIntegrity}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700 dark:text-slate-300">Conformidade RBAC (20%)</span>
                  <span className="text-indigo-600">{report.healthScore.components.rbacCompliance}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${report.healthScore.components.rbacCompliance}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700 dark:text-slate-300">Isolamento Multi-Tenant (20%)</span>
                  <span className="text-indigo-600">{report.healthScore.components.multiTenantIsolation}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${report.healthScore.components.multiTenantIsolation}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700 dark:text-slate-300">Rastreabilidade / CorrelationId (15%)</span>
                  <span className="text-indigo-600">{report.healthScore.components.traceability}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${report.healthScore.components.traceability}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700 dark:text-slate-300">Integridade Operacional (10%)</span>
                  <span className="text-indigo-600">{report.healthScore.components.operationalIntegrity}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${report.healthScore.components.operationalIntegrity}%` }} />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <span>Recomendações Governança</span>
            </h2>
            <div className="space-y-3">
              {report.recommendations.map((rec) => (
                <div key={rec.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">{rec.title}</span>
                    <Badge className={rec.priority === 'P0' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}>
                      {rec.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{rec.rationale}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Audit Timeline & Search */}
      {activeTab === 'audit' && (
        <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input
                placeholder="Buscar por ação, entidade, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
              >
                <option value="ALL">Todas Severidades</option>
                <option value="P0">P0 — Crítico</option>
                <option value="P1">P1 — Alto</option>
                <option value="P2">P2 — Médio</option>
                <option value="P3">P3 — Baixo</option>
              </select>

              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
              >
                <option value="ALL">Todos Módulos</option>
                <option value="AUDIT">Audit</option>
                <option value="TASKS">Tasks</option>
                <option value="INCIDENTS">Incidents</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {paginatedEvents.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-500">Nenhum evento encontrado com os filtros aplicados.</p>
            ) : (
              paginatedEvents.map((evt) => (
                <div 
                  key={evt.id} 
                  onClick={() => setSelectedEvent(evt)}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={
                        evt.severity === 'P0' ? 'bg-rose-600 text-white' :
                        evt.severity === 'P1' ? 'bg-amber-500 text-white' :
                        evt.severity === 'P2' ? 'bg-indigo-600 text-white' : 'bg-slate-500 text-white'
                      }>
                        {evt.severity}
                      </Badge>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{evt.action}</span>
                      <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono">{evt.entityType}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">ID: {evt.entityId} — User: {evt.userId || 'system'}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-slate-400">{new Date(evt.timestamp).toLocaleString()}</span>
                    <Button variant="outline" size="sm" className="text-xs">
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Detalhes
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                Mostrando página {currentPage} de {totalPages} ({filteredEvents.length} eventos no total)
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="text-xs"
                >
                  Anterior
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="text-xs"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tab 3: Security & Multi-Tenancy */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-rose-600" />
              <span>Isolamento Multi-Tenant</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Verificação rigorosa de isolamento por `companyId`. Tentativas de acesso cruzado ou contaminação de tenant são bloqueadas e registradas como P0.
            </p>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Tentativas Cross-Tenant detectadas</span>
                <span className="font-bold text-rose-600">{report.indicators.security.crossTenantAttempts}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Status do Tenant Atual</span>
                <span className="font-bold text-emerald-600">Isolado e Seguro</span>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <span>Conformidade RBAC</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Monitoramento de privilégios e tentativas de acesso não autorizado a áreas restritas.
            </p>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Violações RBAC registradas</span>
                <span className="font-bold text-amber-600">{report.indicators.security.rbacViolations}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Ações Administrativas</span>
                <span className="font-bold text-indigo-600">{report.indicators.security.administrativeActions}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Anomalies */}
      {activeTab === 'anomalies' && (
        <Card className="p-6 bg-white dark:bg-slate-900 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-500" />
            <span>Detecção de Anomalias Operacionais</span>
          </h2>
          <div className="space-y-3">
            {report.anomalies.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-500">Nenhuma anomalia operacional detectada no período.</p>
            ) : (
              report.anomalies.map((anom) => (
                <div key={anom.id} className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/40 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-600 text-white">{anom.severity}</Badge>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{anom.type}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{anom.description}</p>
                    <span className="text-[10px] text-slate-400 block">{new Date(anom.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Financial Protection Notice */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <Lock className="w-5 h-5 text-emerald-600 shrink-0" />
        <p className="text-xs text-slate-600 dark:text-slate-400">
          <strong>Proteção Financeira Absoluta:</strong> O subsistema de Governança e Auditoria opera estritamente em modo somente leitura (Read-Only) e o Núcleo Financeiro permanece 100% congelado e intocado.
        </p>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <ModalContainer isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} title="Detalhes do Evento de Auditoria">
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <div>
                <span className="text-slate-400 block">ID do Evento</span>
                <span className="font-mono font-bold">{selectedEvent.id}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Timestamp</span>
                <span className="font-bold">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Ação</span>
                <span className="font-bold text-indigo-600">{selectedEvent.action}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Severidade</span>
                <span className="font-bold">{selectedEvent.severity}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Entidade / ID</span>
                <span className="font-mono">{selectedEvent.entityType} ({selectedEvent.entityId})</span>
              </div>
              <div>
                <span className="text-slate-400 block">CorrelationId</span>
                <span className="font-mono">{selectedEvent.correlationId || 'N/A'}</span>
              </div>
            </div>
            {selectedEvent.reason && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200">
                <span className="font-bold block text-amber-800 dark:text-amber-300 mb-1">Motivo / Razão</span>
                <p className="text-slate-700 dark:text-slate-300">{selectedEvent.reason}</p>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="primary" size="sm" onClick={() => setSelectedEvent(null)}>Fechar</Button>
            </div>
          </div>
        </ModalContainer>
      )}
    </div>
  );
};
