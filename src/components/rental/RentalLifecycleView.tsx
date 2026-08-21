import React, { useEffect, useState } from 'react';
import {
  VehicleRepository,
  ContractRepository,
  MaintenanceRepository,
  VehicleDocumentRepository,
  DriverDocumentRepository,
  DriverRepository,
  InsuranceRepository,
  TrackerRepository,
} from '../../persistence/repositories/serverReadModelRepositories';
import { generateRentalLifecycleSummary, RentalLifecycleSummary, RentalLifecycleItem, RentalLifecycleStage } from '../../domain/rental/RentalLifecycleService';
import { 
  Layers, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Car, 
  Users, 
  FileText, 
  ShieldCheck, 
  Search, 
  ArrowRight, 
  Lock, 
  RefreshCw,
  Zap,
  Filter,
  CheckSquare,
  FileCheck2,
  XCircle
} from 'lucide-react';
import { Card, Button, Badge, Skeleton } from '../ui';

interface RentalLifecycleViewProps {
  companyId?: string;
  onNavigate: (tab: any) => void;
}

type StageFilter = 'ALL' | RentalLifecycleStage;

export const RentalLifecycleView: React.FC<RentalLifecycleViewProps> = ({
  companyId = 'company-main-uuid',
  onNavigate,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<RentalLifecycleSummary | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<RentalLifecycleItem | null>(null);

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const vehRepo = new VehicleRepository();
      const contractRepo = new ContractRepository();
      const maintRepo = new MaintenanceRepository();
      const vehDocRepo = new VehicleDocumentRepository();
      const drvDocRepo = new DriverDocumentRepository();
      const drvRepo = new DriverRepository();
      const insRepo = new InsuranceRepository();
      const trackRepo = new TrackerRepository();

      const [vehicles, contracts, maintenances, vehicleDocuments, driverDocuments, drivers, insurances, trackers] = await Promise.all([
        vehRepo.findAll({ companyId }),
        contractRepo.findAll({ companyId }),
        maintRepo.findAll({ companyId }),
        vehDocRepo.findAll({ companyId }),
        drvDocRepo.findAll({ companyId }),
        drvRepo.findAll({ companyId }),
        insRepo.findAll({ companyId }),
        trackRepo.findAll({ companyId }),
      ]);

      const data = generateRentalLifecycleSummary({
        companyId,
        vehicles,
        contracts,
        drivers,
        maintenances,
        vehicleDocuments,
        driverDocuments,
        insurances,
        trackers,
      });

      setSummary(data);
      if (data.items.length > 0 && !selectedItem) {
        setSelectedItem(data.items[0]);
      }
    } catch (err) {
      console.error('Failed to load rental lifecycle data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !summary) {
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

  const { counts, items } = summary;

  const filteredItems = items.filter(item => {
    if (stageFilter !== 'ALL' && item.currentStage !== stageFilter) {
      return false;
    }
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchesNum = item.contractNumber.toLowerCase().includes(term);
      const matchesPlate = item.vehiclePlate && item.vehiclePlate.toLowerCase().includes(term);
      const matchesModel = item.vehicleModel && item.vehicleModel.toLowerCase().includes(term);
      const matchesDriver = item.driverName && item.driverName.toLowerCase().includes(term);
      if (!matchesNum && !matchesPlate && !matchesModel && !matchesDriver) {
        return false;
      }
    }
    return true;
  });

  const getStageBadgeVariant = (stage: RentalLifecycleStage) => {
    switch (stage) {
      case 'ACTIVE': return 'success';
      case 'RESERVED':
      case 'READY_FOR_DELIVERY': return 'info';
      case 'PREPARING': return 'warning';
      case 'SUSPENDED':
      case 'RETURN_PENDING': return 'warning';
      case 'CLOSED': return 'secondary';
      case 'CANCELLED': return 'danger';
      default: return 'info';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-indigo-900/40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              FASE 3.38 • Ciclo Completo de Vida da Locação
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <Lock className="w-3 h-3 text-emerald-400" /> Núcleo Financeiro Congelado
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Gestão Ponta a Ponta de Locações</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl">
            Acompanhe o ciclo operacional desde a reserva, preparação e entrega até o check-out, ocorrências e encerramento definitivo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={loadData}
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Atualizar Ciclo
          </Button>
          <Button
            onClick={() => onNavigate('contracts')}
            variant="primary"
            size="sm"
            icon={<Zap className="w-4 h-4" />}
          >
            Gerenciar Contratos
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card padding="sm" className="border-l-4 border-l-blue-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Reservas / Pré</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-blue-600 font-mono">{counts.reserved}</h3>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-amber-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Em Preparação</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-amber-600 font-mono">{counts.preparing}</h3>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-teal-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Pronto p/ Entrega</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-teal-600 font-mono">{counts.readyForDelivery}</h3>
            <CheckSquare className="w-4 h-4 text-teal-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-emerald-600 bg-emerald-50/20">
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Locações Ativas</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-emerald-600 font-mono">{counts.active}</h3>
            <Car className="w-4 h-4 text-emerald-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-indigo-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Devolução Pendente</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-indigo-600 font-mono">{counts.returnPending}</h3>
            <FileCheck2 className="w-4 h-4 text-indigo-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-slate-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Encerradas / Total</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-slate-700 dark:text-slate-300 font-mono">{counts.closed} / {counts.total}</h3>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Estágio:
          </span>
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'RESERVED', label: 'Reservas' },
            { id: 'READY_FOR_DELIVERY', label: 'Prontos' },
            { id: 'ACTIVE', label: 'Ativos' },
            { id: 'SUSPENDED', label: 'Suspensos' },
            { id: 'CLOSED', label: 'Fechados' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStageFilter(f.id as StageFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                stageFilter === f.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por contrato, placa ou motorista..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Main Grid: List & Timeline / Inspection */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Contract List */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" /> Contratos no Ciclo Operacional ({filteredItems.length})
          </h3>

          {filteredItems.length === 0 ? (
            <Card className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">Nenhum contrato encontrado</h4>
              <p className="text-xs text-slate-500 mt-1">Ajuste os filtros ou crie um novo contrato no módulo de Contratos.</p>
            </Card>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.contractId}
                onClick={() => setSelectedItem(item)}
                className={`p-4 rounded-xl border bg-white dark:bg-slate-900 cursor-pointer transition-all hover:shadow-md ${
                  selectedItem?.contractId === item.contractId
                    ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/10'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={getStageBadgeVariant(item.currentStage)}>
                        {item.currentStage}
                      </Badge>
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {item.contractNumber}
                      </span>
                      {item.vehiclePlate && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {item.vehiclePlate} ({item.vehicleModel})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-400" /> Motorista: <strong className="text-slate-900 dark:text-slate-100">{item.driverName || 'Não atribuído'}</strong>
                    </div>
                  </div>

                  <div className="text-right flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Início / Fim</span>
                    <span className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300">{item.startDate} {item.endDate ? `→ ${item.endDate}` : ''}</span>
                  </div>
                </div>

                {item.readinessBlockers.length > 0 && item.currentStage === 'RESERVED' && (
                  <div className="mt-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Bloqueio de prontidão: {item.readinessBlockers[0]}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Right Col: Timeline & Detail Inspection */}
        <div>
          <Card className="sticky top-6 space-y-4">
            <div className="border-b pb-3 border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Inspeção do Ciclo</span>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 mt-0.5">
                {selectedItem ? selectedItem.contractNumber : 'Selecione um Contrato'}
              </h3>
            </div>

            {selectedItem ? (
              <div className="space-y-4">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Estágio Atual:</span>
                    <Badge variant={getStageBadgeVariant(selectedItem.currentStage)}>{selectedItem.currentStage}</Badge>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Veículo:</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-mono">{selectedItem.vehiclePlate || 'N/A'}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Motorista:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{selectedItem.driverName || 'N/A'}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Prontidão entrega:</span>
                    <span className={selectedItem.isReadyForDelivery ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                      {selectedItem.isReadyForDelivery ? 'Pronto (OK)' : 'Com Pendências'}
                    </span>
                  </div>
                </div>

                {/* Timeline History */}
                <div>
                  <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">Linha do Tempo Operacional</h4>
                  <div className="space-y-3 pl-3 border-l-2 border-indigo-500/30">
                    {selectedItem.timeline.map((ev, idx) => (
                      <div key={ev.id || idx} className="relative text-xs">
                        <div className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-white dark:ring-slate-900" />
                        <span className="text-[10px] font-mono text-slate-400">{ev.timestamp.split('T')[0]}</span>
                        <h5 className="font-bold text-slate-900 dark:text-slate-100">{ev.title}</h5>
                        <p className="text-slate-600 dark:text-slate-400">{ev.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={() => onNavigate('contracts')}
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Abrir Contrato Oficial
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-8">Clique em um contrato à esquerda para inspecionar o ciclo de vida e linha do tempo.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
