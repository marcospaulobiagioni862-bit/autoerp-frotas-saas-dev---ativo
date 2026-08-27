import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  VehicleRepository,
  ContractRepository,
  MaintenanceRepository,
  VehicleDocumentRepository,
  DriverDocumentRepository,
  TrafficTicketRepository,
  DriverRepository,
  InsuranceRepository,
  TrackerRepository,
} from '../../persistence/repositories/serverReadModelRepositories';
import { generateManagementReport, ManagementReportData } from '../../domain/reports/ManagementReportsService';
import type { ReportAiSuggestedField, ReportAiSuggestionRecord } from '../../api/reportAiClient';
import { VehicleStatus, DocumentStatus } from '../../types/enums';
import { 
  BarChart3, 
  Car, 
  FileText, 
  Wrench, 
  FileCheck, 
  ShieldAlert, 
  Users, 
  ShieldCheck, 
  Radio, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  Lock,
  Download
} from 'lucide-react';
import { Card, Button, Badge, Skeleton } from '../ui';
import { LazyModuleErrorBoundary } from '../common/LazyModuleErrorBoundary';

interface ManagementReportsViewProps {
  companyId?: string;
  onNavigate: (tab: any) => void;
}

type ReportTab = 
  | 'overview' 
  | 'fleet' 
  | 'contracts' 
  | 'maintenance' 
  | 'documents' 
  | 'tickets' 
  | 'pendings' 
  | 'vehicles' 
  | 'drivers';

const ManagementReportsFleetTab = lazy(() =>
  import('./ManagementReportsFleetTab').then((module) => ({ default: module.ManagementReportsFleetTab })),
);

const loadReportAiClient = () =>
  import('../../api/reportAiClient').then(({ ReportAiClient }) => ReportAiClient);

export const ManagementReportsView: React.FC<ManagementReportsViewProps> = ({
  companyId = 'company-main-uuid',
  onNavigate,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<ManagementReportData | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<ReportTab>('overview');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [assistantLoadingTargetId, setAssistantLoadingTargetId] = useState<string | null>(null);
  const [assistantSuggestion, setAssistantSuggestion] = useState<ReportAiSuggestionRecord | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantReviewing, setAssistantReviewing] = useState<boolean>(false);

  useEffect(() => {
    loadReportData();
  }, [companyId]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      const vehRepo = new VehicleRepository();
      const contractRepo = new ContractRepository();
      const maintRepo = new MaintenanceRepository();
      const vehDocRepo = new VehicleDocumentRepository();
      const drvDocRepo = new DriverDocumentRepository();
      const ticketRepo = new TrafficTicketRepository();
      const drvRepo = new DriverRepository();
      const insRepo = new InsuranceRepository();
      const trackRepo = new TrackerRepository();

      const [vehicles, contracts, maintenances, vehicleDocuments, driverDocuments, tickets, drivers, insurances, trackers] = await Promise.all([
        vehRepo.findAll({ companyId }),
        contractRepo.findAll({ companyId }),
        maintRepo.findAll({ companyId }),
        vehDocRepo.findAll({ companyId }),
        drvDocRepo.findAll({ companyId }),
        ticketRepo.findAll({ companyId }),
        drvRepo.findAll({ companyId }),
        insRepo.findAll({ companyId }),
        trackRepo.findAll({ companyId }),
      ]);

      const data = generateManagementReport({
        companyId,
        vehicles,
        contracts,
        maintenances,
        vehicleDocuments,
        driverDocuments,
        tickets,
        drivers,
        insurances,
        trackers,
      });

      setReportData(data);
    } catch (err) {
      console.error('Failed to generate management report:', err);
    } finally {
      setLoading(false);
    }
  };

  const prepareVehicleSummary = async (vehicleId: string) => {
    setAssistantLoadingTargetId(vehicleId);
    setAssistantError(null);
    try {
      const ReportAiClient = await loadReportAiClient();
      const result = await ReportAiClient.createVehicleSummary(vehicleId);
      setAssistantSuggestion(result.item);
    } catch (error) {
      setAssistantSuggestion(null);
      setAssistantError(error instanceof Error ? error.message : 'O preenchimento assistido falhou de forma segura.');
    } finally {
      setAssistantLoadingTargetId(null);
    }
  };

  const prepareDriverSummary = async (driverId: string) => {
    setAssistantLoadingTargetId(driverId);
    setAssistantError(null);
    try {
      const ReportAiClient = await loadReportAiClient();
      const result = await ReportAiClient.createDriverSummary(driverId);
      setAssistantSuggestion(result.item);
    } catch (error) {
      setAssistantSuggestion(null);
      setAssistantError(error instanceof Error ? error.message : 'O preenchimento assistido falhou de forma segura.');
    } finally {
      setAssistantLoadingTargetId(null);
    }
  };

  const reviewDriverSummary = async (decision: 'CONFIRM' | 'REJECT') => {
    if (!assistantSuggestion || assistantSuggestion.status !== 'PENDING_REVIEW') return;
    setAssistantReviewing(true);
    setAssistantError(null);
    try {
      const ReportAiClient = await loadReportAiClient();
      const item = await ReportAiClient.review(assistantSuggestion.id, {
        decision,
        notes: decision === 'CONFIRM'
          ? 'Confirmado por humano na Central de Relatórios.'
          : 'Rejeitado por humano na Central de Relatórios.',
      });
      setAssistantSuggestion(item);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : 'A revisão falhou de forma segura.');
    } finally {
      setAssistantReviewing(false);
    }
  };

  const fieldLabel = (field: string): string => ({
    driverName: 'Motorista',
    cnhNumber: 'CNH',
    cnhCategory: 'Categoria',
    cnhExpiration: 'Validade da CNH',
    phone: 'Telefone',
    whatsapp: 'WhatsApp',
    email: 'E-mail',
    city: 'Cidade',
    state: 'UF',
    status: 'Status',
    currentVehicleId: 'Veículo atual',
    currentContractId: 'Contrato atual',
    plate: 'Placa',
    brand: 'Marca',
    model: 'Modelo',
    version: 'Versão',
    yearFabrication: 'Ano de fabricação',
    yearModel: 'Ano/modelo',
    color: 'Cor',
    renavam: 'RENAVAM',
    chassis: 'Chassi',
    currentKm: 'KM atual',
    nextMaintenanceKm: 'Próxima manutenção',
    fuelType: 'Combustível',
    category: 'Categoria',
  }[field] || field);

  const fieldValue = (field: ReportAiSuggestedField): string =>
    field.value === null ? 'Não informado' : String(field.value);

  if (loading || !reportData) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const { fleet, contracts, maintenance, documents, tickets, healthScore, pendings, vehicleDetails, driverDetails } = reportData;

  const filteredVehicles = vehicleDetails.filter(v =>
    v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.driverName && v.driverName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredDrivers = driverDetails.filter(d =>
    d.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.cnhNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-indigo-900/40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              FASE 3.36 • Relatórios e Indicadores Gerenciais
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <Lock className="w-3 h-3 text-emerald-400" /> Financeiro Congelado (Somente Leitura)
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Central de Inteligência Gerencial & Relatórios</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl">
            Indicadores consolidados de frota, contratos, manutenções, compliance, multas e saúde operacional em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={loadReportData}
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Atualizar Dados
          </Button>
          <Button
            onClick={() => window.print()}
            variant="primary"
            size="sm"
            icon={<Download className="w-4 h-4" />}
          >
            Exportar / Imprimir
          </Button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'overview', label: 'Visão Geral & Health Score', icon: BarChart3 },
          { id: 'fleet', label: 'Situação da Frota', icon: Car },
          { id: 'contracts', label: 'Contratos', icon: FileText },
          { id: 'maintenance', label: 'Manutenção', icon: Wrench },
          { id: 'documents', label: 'Documentação & Seguros', icon: FileCheck },
          { id: 'tickets', label: 'Multas', icon: ShieldAlert },
          { id: 'pendings', label: 'Pendências Operacionais', icon: AlertTriangle },
          { id: 'vehicles', label: 'Visão por Veículo', icon: Layers },
          { id: 'drivers', label: 'Visão por Motorista', icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as ReportTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & HEALTH SCORE */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Health Score Banner */}
          <Card className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white border border-indigo-900/50">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-bold uppercase tracking-wider">
                  Operational Health Score
                </span>
                <h3 className="text-2xl font-black">Saúde Operacional Geral: {healthScore.score}%</h3>
                <p className="text-xs text-slate-300 max-w-xl">
                  Indicador sintético ponderado calculando disponibilidade de frota, integridade de contratos, oficina, compliance documental e multas.
                </p>
              </div>

              <div className="flex items-center gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
                <div className="text-center px-4 border-r border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                  <span className={`text-sm font-black font-mono ${
                    healthScore.status === 'EXCELLENT' ? 'text-emerald-400' :
                    healthScore.status === 'GOOD' ? 'text-blue-400' :
                    healthScore.status === 'WARNING' ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {healthScore.status}
                  </span>
                </div>
                <div className="text-center px-4">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Pendências</span>
                  <span className="text-xl font-black text-white font-mono">{pendings.length}</span>
                </div>
              </div>
            </div>

            {/* Component Bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6 pt-6 border-t border-indigo-900/40">
              {[
                { label: 'Disponibilidade Frota', value: healthScore.components.fleetAvailability },
                { label: 'Saúde Contratos', value: healthScore.components.contractHealth },
                { label: 'Manutenção', value: healthScore.components.maintenanceHealth },
                { label: 'Documentação', value: healthScore.components.documentationHealth },
                { label: 'Compliance / Multas', value: healthScore.components.complianceHealth },
              ].map((c, idx) => (
                <div key={idx} className="space-y-1.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">{c.label}</span>
                    <span className="font-bold font-mono text-indigo-300">{c.value}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all"
                      style={{ width: `${c.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card padding="sm" className="border-l-4 border-l-blue-600">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Frota Total</span>
              <div className="flex items-baseline justify-between mt-1">
                <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">{fleet.totalVehicles}</h3>
                <span className="text-xs text-blue-600 font-semibold">{fleet.availabilityRate}% disponíveis</span>
              </div>
            </Card>

            <Card padding="sm" className="border-l-4 border-l-indigo-600">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Contratos Ativos</span>
              <div className="flex items-baseline justify-between mt-1">
                <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">{contracts.activeContracts}</h3>
                <span className="text-xs text-indigo-600 font-semibold">{contracts.expiringSoon} vencendo</span>
              </div>
            </Card>

            <Card padding="sm" className="border-l-4 border-l-amber-500">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Manutenções Abertas</span>
              <div className="flex items-baseline justify-between mt-1">
                <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">{maintenance.scheduled + maintenance.inProgress}</h3>
                <span className="text-xs text-amber-600 font-semibold">{maintenance.overdue} atrasadas</span>
              </div>
            </Card>

            <Card padding="sm" className="border-l-4 border-l-rose-600">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Pendências P0/P1</span>
              <div className="flex items-baseline justify-between mt-1">
                <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
                  {pendings.filter(p => p.priority === 'P0' || p.priority === 'P1').length}
                </h3>
                <span className="text-xs text-rose-600 font-semibold">Críticas</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: FLEET SITUATION */}
      {activeSubTab === 'fleet' && (
        <LazyModuleErrorBoundary resetKey={activeSubTab} onRetry={() => window.location.reload()}>
          <Suspense fallback={<div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">Carregando situação da frota...</div>}>
            <ManagementReportsFleetTab fleet={fleet} />
          </Suspense>
        </LazyModuleErrorBoundary>
      )}

      {/* TAB 3: CONTRACTS */}
      {activeSubTab === 'contracts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Contratos Ativos</span>
              <h3 className="text-2xl font-black text-indigo-600 mt-1 font-mono">{contracts.activeContracts}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Próximos do Vencimento</span>
              <h3 className="text-2xl font-black text-amber-600 mt-1 font-mono">{contracts.expiringSoon}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Vencidos</span>
              <h3 className="text-2xl font-black text-rose-600 mt-1 font-mono">{contracts.expired}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Encerrados</span>
              <h3 className="text-2xl font-black text-slate-600 mt-1 font-mono">{contracts.closedContracts}</h3>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 4: MAINTENANCE */}
      {activeSubTab === 'maintenance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Agendadas</span>
              <h3 className="text-2xl font-black text-blue-600 mt-1 font-mono">{maintenance.scheduled}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Em Andamento</span>
              <h3 className="text-2xl font-black text-indigo-600 mt-1 font-mono">{maintenance.inProgress}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Atrasadas</span>
              <h3 className="text-2xl font-black text-rose-600 mt-1 font-mono">{maintenance.overdue}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Concluídas</span>
              <h3 className="text-2xl font-black text-emerald-600 mt-1 font-mono">{maintenance.completed}</h3>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 5: DOCUMENTS & INSURANCES */}
      {activeSubTab === 'documents' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Documentos Válidos</span>
              <h3 className="text-2xl font-black text-emerald-600 mt-1 font-mono">{documents.valid}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Vencendo (15 dias)</span>
              <h3 className="text-2xl font-black text-amber-600 mt-1 font-mono">{documents.expiringSoon}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Documentos Vencidos</span>
              <h3 className="text-2xl font-black text-rose-600 mt-1 font-mono">{documents.expired}</h3>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card padding="sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">Seguros de Frota</h4>
              <div className="flex justify-between items-center text-sm">
                <span>Apólices Ativas: <strong className="font-mono text-emerald-600">{documents.insurancesActive}</strong></span>
                <span>Vencidas: <strong className="font-mono text-rose-600">{documents.insurancesExpired}</strong></span>
              </div>
            </Card>
            <Card padding="sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">Rastreadores / Telemetria</h4>
              <div className="flex justify-between items-center text-sm">
                <span>Rastreadores Ativos: <strong className="font-mono text-teal-600">{documents.trackersActive}</strong> / {documents.trackersTotal}</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 6: TICKETS (MULTAS) */}
      {activeSubTab === 'tickets' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total de Multas</span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 font-mono">{tickets.totalTickets}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Pend. Identificação</span>
              <h3 className="text-2xl font-black text-amber-600 mt-1 font-mono">{tickets.pendingIdentification}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Em Recurso</span>
              <h3 className="text-2xl font-black text-blue-600 mt-1 font-mono">{tickets.inAppeal}</h3>
            </Card>
            <Card padding="sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Resolvidas / Pagas</span>
              <h3 className="text-2xl font-black text-emerald-600 mt-1 font-mono">{tickets.paid + tickets.closed}</h3>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 7: PENDINGS */}
      {activeSubTab === 'pendings' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Central de Pendências Integrada ({pendings.length})
            </h3>
            <Button size="sm" variant="primary" onClick={() => onNavigate('pendencias')}>
              Abrir Central Completa
            </Button>
          </div>

          <div className="space-y-3">
            {pendings.slice(0, 10).map((p) => (
              <div key={p.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={p.priority === 'P0' || p.priority === 'P1' ? 'danger' : 'warning'}>
                      {p.priority}
                    </Badge>
                    <span className="text-xs font-semibold text-slate-500">{p.category}</span>
                    {p.vehiclePlate && <span className="text-xs font-mono font-bold text-blue-600">Placa: {p.vehiclePlate}</span>}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{p.title}</h4>
                  <p className="text-xs text-slate-500">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 8: VEHICLE DETAILS */}
      {activeSubTab === 'vehicles' && (
        <div className="space-y-6">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por placa, modelo ou motorista..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
            />
          </div>

          {assistantError && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>Falha segura:</strong> {assistantError} O relatório manual permanece disponível e nenhum cadastro foi alterado.
            </div>
          )}

          {assistantSuggestion && (
            <Card padding="sm" className="border-indigo-200 dark:border-indigo-800">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Resumo assistido — revisão humana</h3>
                      <Badge variant={assistantSuggestion.status === 'CONFIRMED' ? 'success' : assistantSuggestion.status === 'REJECTED' ? 'danger' : 'warning'}>
                        {assistantSuggestion.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Dados lidos somente do ERP. Não usa IA externa, não grava no cadastro e não executa alteração financeira ou contratual.
                    </p>
                  </div>
                  {assistantSuggestion.status === 'PENDING_REVIEW' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={assistantReviewing}
                        onClick={() => reviewDriverSummary('REJECT')}
                      >
                        {assistantReviewing ? 'Registrando...' : 'Rejeitar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={assistantReviewing}
                        onClick={() => reviewDriverSummary('CONFIRM')}
                        icon={<CheckCircle2 className="w-4 h-4" />}
                      >
                        {assistantReviewing ? 'Registrando...' : 'Confirmar revisão'}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {assistantSuggestion.suggestion.suggestedFields.map((field) => (
                    <div key={field.field} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{fieldLabel(field.field)}</span>
                        {field.requiresServerRevalidation && <Badge variant="warning">Revalidar</Badge>}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 break-words">{fieldValue(field)}</div>
                      <div className="text-[10px] text-slate-500 mt-2">
                        Fonte: {field.provenance[0]?.kind === 'POSTGRES' ? 'PostgreSQL do ERP' : 'Documento aprovado'}
                        {field.provenance[0]?.observedAt ? ` • ${new Date(field.provenance[0].observedAt).toLocaleString('pt-BR')}` : ''}
                      </div>
                    </div>
                  ))}
                </div>

                {(assistantSuggestion.suggestion.missingFields.length > 0 || assistantSuggestion.suggestion.warnings.length > 0) && (
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    {assistantSuggestion.suggestion.missingFields.length > 0 && (
                      <span>Campos ausentes: {assistantSuggestion.suggestion.missingFields.map(fieldLabel).join(', ')}. </span>
                    )}
                    {assistantSuggestion.suggestion.warnings.length > 0 && (
                      <span>Há fontes divergentes que exigem conferência manual.</span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="p-3 font-semibold">Placa / Veículo</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold">Contrato / Motorista</th>
                    <th className="p-3 font-semibold">KM Atual</th>
                    <th className="p-3 font-semibold">Manutenções</th>
                    <th className="p-3 font-semibold">Multas</th>
                    <th className="p-3 font-semibold">Pendências</th>
                    <th className="p-3 font-semibold">Saúde</th>
                    <th className="p-3 font-semibold">Preenchimento assistido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredVehicles.map((v) => (
                    <tr key={v.vehicleId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 block">{v.plate}</span>
                        <span className="text-[11px] text-slate-500">{v.brand} {v.model}</span>
                      </td>
                      <td className="p-3">
                        <Badge variant={v.status === VehicleStatus.AVAILABLE ? 'success' : v.status === VehicleStatus.RENTED ? 'info' : 'warning'}>
                          {v.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {v.activeContractNumber ? (
                          <div>
                            <span className="font-mono font-semibold text-indigo-600 block">{v.activeContractNumber}</span>
                            <span className="text-[11px] text-slate-500">{v.driverName || 'Motorista'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Disponível</span>
                        )}
                      </td>
                      <td className="p-3 font-mono">{v.currentKm.toLocaleString()} km</td>
                      <td className="p-3 font-mono">{v.maintenanceCount}</td>
                      <td className="p-3 font-mono">{v.ticketCount}</td>
                      <td className="p-3 font-mono">
                        {v.pendingCount > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 font-bold">{v.pendingCount}</span>
                        ) : (
                          <span className="text-emerald-600">0</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`font-bold font-mono ${
                          v.healthStatus === 'EXCELLENT' ? 'text-emerald-600' :
                          v.healthStatus === 'GOOD' ? 'text-blue-600' :
                          v.healthStatus === 'WARNING' ? 'text-amber-600' : 'text-rose-600'
                        }`}>
                          {v.healthStatus}
                        </span>
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={assistantLoadingTargetId !== null}
                          onClick={() => prepareVehicleSummary(v.vehicleId)}
                          icon={<FileCheck className="w-4 h-4" />}
                        >
                          {assistantLoadingTargetId === v.vehicleId ? 'Preparando...' : 'Preparar resumo'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 9: DRIVER DETAILS */}
      {activeSubTab === 'drivers' && (
        <div className="space-y-6">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar motorista por nome ou CNH..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
            />
          </div>

          {assistantError && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>Falha segura:</strong> {assistantError} O relatório manual permanece disponível e nenhum cadastro foi alterado.
            </div>
          )}

          {assistantSuggestion && (
            <Card padding="sm" className="border-indigo-200 dark:border-indigo-800">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Resumo assistido — revisão humana</h3>
                      <Badge variant={assistantSuggestion.status === 'CONFIRMED' ? 'success' : assistantSuggestion.status === 'REJECTED' ? 'danger' : 'warning'}>
                        {assistantSuggestion.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Dados lidos somente do ERP. Não usa IA externa, não grava no cadastro e não executa alteração financeira ou contratual.
                    </p>
                  </div>
                  {assistantSuggestion.status === 'PENDING_REVIEW' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={assistantReviewing}
                        onClick={() => reviewDriverSummary('REJECT')}
                      >
                        {assistantReviewing ? 'Registrando...' : 'Rejeitar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={assistantReviewing}
                        onClick={() => reviewDriverSummary('CONFIRM')}
                        icon={<CheckCircle2 className="w-4 h-4" />}
                      >
                        {assistantReviewing ? 'Registrando...' : 'Confirmar revisão'}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {assistantSuggestion.suggestion.suggestedFields.map((field) => (
                    <div key={field.field} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{fieldLabel(field.field)}</span>
                        {field.requiresServerRevalidation && <Badge variant="warning">Revalidar</Badge>}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 break-words">{fieldValue(field)}</div>
                      <div className="text-[10px] text-slate-500 mt-2">
                        Fonte: {field.provenance[0]?.kind === 'POSTGRES' ? 'PostgreSQL do ERP' : 'Documento aprovado'}
                        {field.provenance[0]?.observedAt ? ` • ${new Date(field.provenance[0].observedAt).toLocaleString('pt-BR')}` : ''}
                      </div>
                    </div>
                  ))}
                </div>

                {(assistantSuggestion.suggestion.missingFields.length > 0 || assistantSuggestion.suggestion.warnings.length > 0) && (
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    {assistantSuggestion.suggestion.missingFields.length > 0 && (
                      <span>Campos ausentes: {assistantSuggestion.suggestion.missingFields.map(fieldLabel).join(', ')}. </span>
                    )}
                    {assistantSuggestion.suggestion.warnings.length > 0 && (
                      <span>Há fontes divergentes que exigem conferência manual.</span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="p-3 font-semibold">Motorista</th>
                    <th className="p-3 font-semibold">CNH</th>
                    <th className="p-3 font-semibold">Status CNH</th>
                    <th className="p-3 font-semibold">Contrato Ativo</th>
                    <th className="p-3 font-semibold">Veículo</th>
                    <th className="p-3 font-semibold">Multas</th>
                    <th className="p-3 font-semibold">Preenchimento assistido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDrivers.map((d) => (
                    <tr key={d.driverId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{d.fullName}</td>
                      <td className="p-3 font-mono">{d.cnhNumber} (Val: {d.cnhExpiration})</td>
                      <td className="p-3">
                        <Badge variant={d.cnhStatus === DocumentStatus.EXPIRED ? 'danger' : 'success'}>
                          {d.cnhStatus}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-indigo-600">{d.activeContractNumber || 'Nenhum'}</td>
                      <td className="p-3 font-mono text-blue-600">{d.vehiclePlate || 'Nenhum'}</td>
                      <td className="p-3 font-mono">{d.ticketCount}</td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={assistantLoadingTargetId !== null}
                          onClick={() => prepareDriverSummary(d.driverId)}
                          icon={<FileCheck className="w-4 h-4" />}
                        >
                          {assistantLoadingTargetId === d.driverId ? 'Preparando...' : 'Preparar resumo'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
