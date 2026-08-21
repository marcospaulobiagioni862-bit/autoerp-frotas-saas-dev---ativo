import React, { useEffect, useState } from 'react';
import {
  VehicleRepository,
  ContractRepository,
  MaintenanceRepository,
  VehicleDocumentRepository,
  DriverDocumentRepository,
  DriverRepository,
  TrafficTicketRepository,
  InsuranceRepository,
  TrackerRepository,
} from '../../persistence/repositories/serverReadModelRepositories';
import { generateRentalControlSummary, RentalControlSummary, RentalControlItem, RentalControlOperationalStatus } from '../../domain/operations/RentalControlCenterService';
import { 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Car, 
  Users, 
  FileText, 
  Search, 
  ArrowRight, 
  Lock, 
  RefreshCw,
  Zap,
  Filter,
  CheckSquare,
  FileCheck2,
  XCircle,
  Activity,
  Layers
} from 'lucide-react';
import { Card, Button, Badge, Skeleton } from '../ui';

interface RentalControlCenterViewProps {
  companyId?: string;
  onNavigate: (tab: any) => void;
}

type FilterTab = 'ALL' | 'P0' | 'P1' | 'READY' | 'PREPARING' | 'BLOCKED' | 'ACTIVE' | 'RETURN_LATE';

export const RentalControlCenterView: React.FC<RentalControlCenterViewProps> = ({
  companyId = 'company-main-uuid',
  onNavigate,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<RentalControlSummary | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<RentalControlItem | null>(null);

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
      const ticketRepo = new TrafficTicketRepository();
      const insRepo = new InsuranceRepository();
      const trackRepo = new TrackerRepository();

      const [vehicles, contracts, maintenances, vehicleDocuments, driverDocuments, drivers, tickets, insurances, trackers] = await Promise.all([
        vehRepo.findAll({ companyId }),
        contractRepo.findAll({ companyId }),
        maintRepo.findAll({ companyId }),
        vehDocRepo.findAll({ companyId }),
        drvDocRepo.findAll({ companyId }),
        drvRepo.findAll({ companyId }),
        ticketRepo.findAll({ companyId }),
        insRepo.findAll({ companyId }),
        trackRepo.findAll({ companyId }),
      ]);

      const data = generateRentalControlSummary({
        companyId,
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

      setSummary(data);
      if (data.items.length > 0 && !selectedItem) {
        setSelectedItem(data.items[0]);
      }
    } catch (err) {
      console.error('Failed to load rental control center data:', err);
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
    if (activeFilter === 'P0' && item.priority !== 'P0') return false;
    if (activeFilter === 'P1' && item.priority !== 'P1') return false;
    if (activeFilter === 'READY' && item.operationalStatus !== 'READY') return false;
    if (activeFilter === 'PREPARING' && item.operationalStatus !== 'PREPARING') return false;
    if (activeFilter === 'BLOCKED' && item.operationalStatus !== 'BLOCKED') return false;
    if (activeFilter === 'ACTIVE' && item.operationalStatus !== 'ACTIVE') return false;
    if (activeFilter === 'RETURN_LATE' && item.operationalStatus !== 'RETURN_LATE') return false;

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchesNum = item.contractNumber.toLowerCase().includes(term);
      const matchesPlate = item.vehiclePlate && item.vehiclePlate.toLowerCase().includes(term);
      const matchesDriver = item.driverName && item.driverName.toLowerCase().includes(term);
      if (!matchesNum && !matchesPlate && !matchesDriver) {
        return false;
      }
    }
    return true;
  });

  const getPriorityBadge = (priority: 'P0' | 'P1' | 'P2' | 'P3') => {
    switch (priority) {
      case 'P0': return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-300">P0 • BLOQUEADOR</span>;
      case 'P1': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300">P1 • CRÍTICO</span>;
      case 'P2': return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">P2 • IMPORTANTE</span>;
      case 'P3': return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">P3 • NORMAL</span>;
    }
  };

  const getOperationalStatusVariant = (status: RentalControlOperationalStatus) => {
    switch (status) {
      case 'READY': return 'success';
      case 'ACTIVE': return 'success';
      case 'PREPARING': return 'info';
      case 'BLOCKED': return 'danger';
      case 'RETURN_LATE': return 'danger';
      case 'RETURN_PENDING': return 'warning';
      case 'CLOSED': return 'secondary';
      default: return 'info';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-rose-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-rose-900/40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
              FASE 3.39 • Central de Controle da Locação
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <Lock className="w-3 h-3 text-emerald-400" /> Núcleo Financeiro Congelado
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Centro de Comando Operacional & Exceções</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl">
            Responda instantaneamente: "Existe alguma locação que exige intervenção?" com severidades P0 a P3, bloqueios e ações recomendadas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={loadData}
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Atualizar Central
          </Button>
          <Button
            onClick={() => onNavigate('ciclo-locacao')}
            variant="primary"
            size="sm"
            icon={<Activity className="w-4 h-4" />}
          >
            Ciclo de Vida
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card padding="sm" className="border-l-4 border-l-red-600 bg-red-50/20">
          <span className="text-[11px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider block">Prioridade P0</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-red-600 font-mono">{counts.p0}</h3>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-amber-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Prioridade P1</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-amber-600 font-mono">{counts.p1}</h3>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-red-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Bloqueadas</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-red-600 font-mono">{counts.blocked}</h3>
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-indigo-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Atrasadas</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-indigo-600 font-mono">{counts.returnLate}</h3>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-teal-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Prontas p/ Entrega</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-teal-600 font-mono">{counts.ready}</h3>
            <CheckSquare className="w-4 h-4 text-teal-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-emerald-600">
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Ativas / Total</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-emerald-600 font-mono">{counts.active} / {counts.total}</h3>
            <Car className="w-4 h-4 text-emerald-500" />
          </div>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filtro:
          </span>
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'P0', label: 'P0 (Bloqueador)' },
            { id: 'P1', label: 'P1 (Crítico)' },
            { id: 'BLOCKED', label: 'Bloqueados' },
            { id: 'RETURN_LATE', label: 'Atrasados' },
            { id: 'READY', label: 'Prontos' },
            { id: 'ACTIVE', label: 'Ativos' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id as FilterTab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === f.id
                  ? 'bg-rose-600 text-white shadow-sm'
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
            placeholder="Buscar por placa, motorista ou contrato..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Item List */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" /> Locações sob Controle e Exceções ({filteredItems.length})
          </h3>

          {filteredItems.length === 0 ? (
            <Card className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">Nenhuma exceção ou locação encontrada</h4>
              <p className="text-xs text-slate-500 mt-1">Todos os veículos e contratos operam dentro da normalidade para os filtros selecionados.</p>
            </Card>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={`p-4 rounded-xl border bg-white dark:bg-slate-900 cursor-pointer transition-all hover:shadow-md ${
                  selectedItem?.id === item.id
                    ? 'border-rose-600 ring-2 ring-rose-500/20 bg-rose-50/10'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getPriorityBadge(item.priority)}
                      <Badge variant={getOperationalStatusVariant(item.operationalStatus)}>
                        {item.operationalStatus}
                      </Badge>
                      <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                        {item.contractNumber}
                      </span>
                      {item.vehiclePlate && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {item.vehiclePlate}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-400" /> Motorista: <strong className="text-slate-900 dark:text-slate-100">{item.driverName || 'Não atribuído'}</strong>
                    </div>
                  </div>

                  <div className="text-right flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Estágio Ciclo</span>
                    <span className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300">{item.lifecycleStage}</span>
                  </div>
                </div>

                {item.blockers.length > 0 && (
                  <div className="mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <div>
                      <strong>Bloqueio Operacional:</strong> {item.blockers[0]}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Right Col: Detail Inspection */}
        <div>
          <Card className="sticky top-6 space-y-4">
            <div className="border-b pb-3 border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400 tracking-wider">Inspeção da Exceção</span>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 mt-0.5">
                {selectedItem ? selectedItem.contractNumber : 'Selecione uma Locação'}
              </h3>
            </div>

            {selectedItem ? (
              <div className="space-y-4">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Prioridade:</span>
                    <div>{getPriorityBadge(selectedItem.priority)}</div>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Status Operacional:</span>
                    <Badge variant={getOperationalStatusVariant(selectedItem.operationalStatus)}>{selectedItem.operationalStatus}</Badge>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Veículo / Placa:</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-mono">{selectedItem.vehiclePlate || 'N/A'}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Motorista:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{selectedItem.driverName || 'N/A'}</strong>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase text-slate-500">Ação Recomendada</h4>
                  <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-200 font-medium">
                    {selectedItem.recommendedAction}
                  </div>
                </div>

                {selectedItem.blockers.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-red-600">Impedimentos Ativos ({selectedItem.blockers.length})</h4>
                    <ul className="space-y-1 text-xs text-red-700 dark:text-red-300 list-disc list-inside">
                      {selectedItem.blockers.map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={() => onNavigate('ciclo-locacao')}
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Ver Ciclo de Vida do Contrato
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => onNavigate('pendencias')}
                    icon={<Activity className="w-4 h-4" />}
                  >
                    Abrir Central de Pendências
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-8">Selecione um item à esquerda para inspecionar os bloqueios, prioridade e ações recomendadas.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
