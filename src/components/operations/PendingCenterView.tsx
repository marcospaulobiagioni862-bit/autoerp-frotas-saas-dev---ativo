import React, { useEffect, useState } from 'react';
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
import { generateOperationalPendings, OperationalPendingItem } from '../../domain/operations/serverOperationalPendingProjection';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  Car, 
  FileText, 
  Wrench, 
  FileCheck, 
  Users, 
  ShieldCheck, 
  Radio, 
  Search, 
  ArrowRight, 
  CheckCircle2, 
  Filter,
  RefreshCw,
  Lock
} from 'lucide-react';
import { Card, Button, Badge, Skeleton } from '../ui';

interface PendingCenterViewProps {
  companyId?: string;
  onNavigate: (tab: any) => void;
}

type FilterCategory = 
  | 'ALL' 
  | 'CRITICAL' 
  | 'IMPORTANT' 
  | 'INFORMATIVE' 
  | 'OVERDUE' 
  | 'VEHICLE' 
  | 'CONTRACT' 
  | 'MAINTENANCE' 
  | 'DOCUMENT' 
  | 'FINE' 
  | 'DRIVER' 
  | 'INSURANCE' 
  | 'TRACKER';

export const PendingCenterView: React.FC<PendingCenterViewProps> = ({
  companyId = 'company-main-uuid',
  onNavigate,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [pendings, setPendings] = useState<OperationalPendingItem[]>([]);
  const [filter, setFilter] = useState<FilterCategory>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    loadPendings();
  }, [companyId]);

  const loadPendings = async () => {
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

      const results = generateOperationalPendings({
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

      setPendings(results);
    } catch (err) {
      console.error('Failed to load operational pendings:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter logic
  const filteredPendings = pendings.filter((item) => {
    // Search match
    const matchesSearch = 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.vehiclePlate && item.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.driverName && item.driverName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.contractNumber && item.contractNumber.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (filter === 'ALL') return true;
    if (filter === 'CRITICAL') return item.priority === 'P0' || item.priority === 'P1';
    if (filter === 'IMPORTANT') return item.priority === 'P2';
    if (filter === 'INFORMATIVE') return item.priority === 'P3';
    if (filter === 'OVERDUE') return item.overdueDays > 0;
    if (filter === 'VEHICLE') return item.type === 'VEHICLE';
    if (filter === 'CONTRACT') return item.type === 'CONTRACT';
    if (filter === 'MAINTENANCE') return item.type === 'MAINTENANCE';
    if (filter === 'DOCUMENT') return item.type === 'DOCUMENT';
    if (filter === 'FINE') return item.type === 'FINE';
    if (filter === 'DRIVER') return item.type === 'DRIVER';
    if (filter === 'INSURANCE') return item.type === 'INSURANCE';
    if (filter === 'TRACKER') return item.type === 'TRACKER';

    return true;
  });

  const totalCount = pendings.length;
  const criticalCount = pendings.filter(p => p.priority === 'P0' || p.priority === 'P1').length;
  const importantCount = pendings.filter(p => p.priority === 'P2').length;
  const overdueCount = pendings.filter(p => p.overdueDays > 0).length;

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'P0':
        return <Badge variant="danger" className="font-mono font-bold animate-pulse">P0 • BLOQUEADOR</Badge>;
      case 'P1':
        return <Badge variant="danger" className="font-mono font-bold">P1 • CRÍTICO</Badge>;
      case 'P2':
        return <Badge variant="warning" className="font-mono font-bold">P2 • IMPORTANTE</Badge>;
      default:
        return <Badge variant="info" className="font-mono font-bold">P3 • INFO</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'VEHICLE': return <Car className="w-4 h-4 text-blue-500" />;
      case 'CONTRACT': return <FileText className="w-4 h-4 text-indigo-500" />;
      case 'MAINTENANCE': return <Wrench className="w-4 h-4 text-amber-500" />;
      case 'DOCUMENT': return <FileCheck className="w-4 h-4 text-rose-500" />;
      case 'FINE': return <ShieldAlert className="w-4 h-4 text-orange-500" />;
      case 'DRIVER': return <Users className="w-4 h-4 text-purple-500" />;
      case 'INSURANCE': return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
      case 'TRACKER': return <Radio className="w-4 h-4 text-teal-500" />;
      default: return <AlertTriangle className="w-4 h-4 text-slate-500" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-indigo-900/40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              FASE 3.34 • Central Operacional
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <Lock className="w-3 h-3 text-emerald-400" /> Núcleo Financeiro Congelado (Read-Only)
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Central de Pendências e Alertas Operacionais</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl">
            Visão consolidada em tempo real de impedimentos, vencimentos de contratos, manutenções, CNHs, documentos de frota, multas e seguros para ação gerencial imediata.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={loadPendings}
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Atualizar Dados
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="sm" className="border-l-4 border-l-slate-900 dark:border-l-indigo-500">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total de Pendências</span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 font-mono">{totalCount}</h3>
            </div>
            <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl dark:bg-slate-800 dark:text-slate-300">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Derivado de todas as fontes operacionais</div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-rose-600">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Críticas & Bloqueadores</span>
              <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">{criticalCount}</h3>
            </div>
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl dark:bg-rose-950/60 dark:text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-[11px] text-rose-600 font-medium">Exigem ação imediata (P0 / P1)</div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-amber-500">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Importantes / Avisos</span>
              <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">{importantCount}</h3>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl dark:bg-amber-950/60 dark:text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-[11px] text-amber-600 font-medium">Próximos vencimentos (P2)</div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-blue-600">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Itens Vencidos</span>
              <h3 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 font-mono">{overdueCount}</h3>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl dark:bg-blue-950/60 dark:text-blue-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Com prazo expirado</div>
        </Card>
      </div>

      {/* Filters & Search Bar */}
      <Card padding="sm" className="space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por placa, motorista, contrato..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
            />
          </div>

          {/* Quick Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'ALL', label: 'Todas' },
              { id: 'CRITICAL', label: 'Críticas (P0/P1)' },
              { id: 'IMPORTANT', label: 'Importantes (P2)' },
              { id: 'OVERDUE', label: 'Vencidas' },
              { id: 'VEHICLE', label: 'Veículos' },
              { id: 'CONTRACT', label: 'Contratos' },
              { id: 'MAINTENANCE', label: 'Manutenção' },
              { id: 'DOCUMENT', label: 'Documentos' },
              { id: 'FINE', label: 'Multas' },
              { id: 'DRIVER', label: 'Motoristas' },
              { id: 'INSURANCE', label: 'Seguros' },
              { id: 'TRACKER', label: 'Rastreadores' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as FilterCategory)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === f.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Pendings List / Table */}
      <Card padding="none" className="overflow-hidden border border-slate-200/80 dark:border-slate-800">
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Lista Consolidada de Pendências ({filteredPendings.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Empresa Tenant: {companyId}
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto max-h-[600px]">
          {filteredPendings.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto dark:bg-emerald-950 dark:text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{typeFilter === 'DRIVER' ? 'Nenhum motorista com pendência' : 'Nenhuma pendência encontrada'}</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Parabéns! Sua operação está em perfeita conformidade com os critérios da Central de Alertas.
              </p>
            </div>
          ) : (
            filteredPendings.map((item) => (
              <div
                key={item.id}
                className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl mt-0.5 shrink-0">
                    {getTypeIcon(item.type)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {getPriorityBadge(item.priority)}
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {item.category}
                      </span>
                      {item.vehiclePlate && (
                        <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                          Placa: {item.vehiclePlate}
                        </span>
                      )}
                      {item.contractNumber && (
                        <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                          Contrato: {item.contractNumber}
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </h4>

                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {item.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                      {item.dueDate && (
                        <span>Vencimento: <strong className="text-slate-700 dark:text-slate-300 font-mono">{item.dueDate}</strong></span>
                      )}
                      {item.overdueDays > 0 && (
                        <span className="text-rose-600 font-bold">Em atraso por {item.overdueDays} dia(s)</span>
                      )}
                      <span>Ação Recomendada: <strong className="text-slate-700 dark:text-slate-300">{item.actionRecommended}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onNavigate(item.destinationTab)}
                    icon={<ArrowRight className="w-3.5 h-3.5" />}
                  >
                    Resolver / Visualizar
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
