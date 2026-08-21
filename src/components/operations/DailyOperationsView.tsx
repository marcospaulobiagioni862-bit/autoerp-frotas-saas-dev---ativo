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
import { generateDailyOperations, DailyOperationsSummary, DailyActionItem } from '../../domain/operations/DailyOperationsService';
import { 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Car, 
  Users, 
  FileText, 
  Wrench, 
  FileCheck, 
  ShieldAlert, 
  Search, 
  ArrowRight, 
  Lock, 
  RefreshCw,
  Flame,
  Zap,
  Filter
} from 'lucide-react';
import { Card, Button, Badge, Skeleton } from '../ui';

interface DailyOperationsViewProps {
  companyId?: string;
  onNavigate: (tab: any) => void;
}

type AgendaFilter = 'all' | 'today' | 'overdue' | '7days' | '15days' | '30days';
type CategoryFilter = 'ALL' | 'DELIVERY' | 'RETURN' | 'CONTRACT' | 'MAINTENANCE' | 'DOCUMENT' | 'INSURANCE' | 'TICKET';

export const DailyOperationsView: React.FC<DailyOperationsViewProps> = ({
  companyId = 'company-main-uuid',
  onNavigate,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<DailyOperationsSummary | null>(null);
  const [agendaFilter, setAgendaFilter] = useState<AgendaFilter>('today');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

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

      const data = generateDailyOperations({
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

      setSummary(data);
    } catch (err) {
      console.error('Failed to load daily operations data:', err);
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

  const { counts, actions, todayStr } = summary;

  // Filter actions based on agendaFilter, categoryFilter, and search
  const filteredActions = actions.filter(item => {
    // Category filter
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) {
      return false;
    }

    // Search term filter
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchesTitle = item.title.toLowerCase().includes(term);
      const matchesDesc = item.description.toLowerCase().includes(term);
      const matchesPlate = item.vehiclePlate && item.vehiclePlate.toLowerCase().includes(term);
      const matchesDriver = item.driverName && item.driverName.toLowerCase().includes(term);
      const matchesContract = item.contractNumber && item.contractNumber.toLowerCase().includes(term);
      if (!matchesTitle && !matchesDesc && !matchesPlate && !matchesDriver && !matchesContract) {
        return false;
      }
    }

    // Agenda date filter
    const itemDate = new Date(item.dueDate).getTime();
    const todayTime = new Date(todayStr).getTime();
    const diffDays = Math.floor((itemDate - todayTime) / (1000 * 60 * 60 * 24));

    if (agendaFilter === 'today') {
      return item.dueDate === todayStr || item.overdueDays > 0;
    } else if (agendaFilter === 'overdue') {
      return item.overdueDays > 0;
    } else if (agendaFilter === '7days') {
      return diffDays >= 0 && diffDays <= 7;
    } else if (agendaFilter === '15days') {
      return diffDays >= 0 && diffDays <= 15;
    } else if (agendaFilter === '30days') {
      return diffDays >= 0 && diffDays <= 30;
    }

    return true;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-blue-900/40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              FASE 3.37 • Operação Diária & Produtividade
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <Lock className="w-3 h-3 text-emerald-400" /> Núcleo Financeiro Congelado
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">O que preciso fazer hoje?</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl">
            Central operacional unificada para gerenciar entregas, devoluções, contratos, manutenções e compliance com priorização inteligente.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={loadData}
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Atualizar Operação
          </Button>
          <Button
            onClick={() => onNavigate('pendencias')}
            variant="primary"
            size="sm"
            icon={<Zap className="w-4 h-4" />}
          >
            Central de Pendências
          </Button>
        </div>
      </div>

      {/* KPI Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card padding="sm" className="border-l-4 border-l-rose-600 bg-rose-50/30 dark:bg-rose-950/20">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">Críticos (P0)</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">{counts.p0}</h3>
            <Flame className="w-4 h-4 text-rose-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-amber-500">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Alta Prioridade (P1)</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-amber-600 font-mono">{counts.p1}</h3>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-blue-600">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Entregas Hoje</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-blue-600 font-mono">{counts.deliveriesToday}</h3>
            <Car className="w-4 h-4 text-blue-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-indigo-600">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Devoluções Hoje</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-indigo-600 font-mono">{counts.returnsToday}</h3>
            <Calendar className="w-4 h-4 text-indigo-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-teal-600">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Manutenções Hoje</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-teal-600 font-mono">{counts.maintenancesDueToday}</h3>
            <Wrench className="w-4 h-4 text-teal-500" />
          </div>
        </Card>

        <Card padding="sm" className="border-l-4 border-l-purple-600">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">Itens em Atraso</span>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-2xl font-black text-purple-600 font-mono">{counts.overdueItems}</h3>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Agenda:
          </span>
          {[
            { id: 'today', label: 'Hoje & Atrasados' },
            { id: 'overdue', label: 'Apenas Atrasados' },
            { id: '7days', label: 'Próximos 7 dias' },
            { id: '15days', label: 'Próximos 15 dias' },
            { id: '30days', label: 'Próximos 30 dias' },
            { id: 'all', label: 'Todos' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setAgendaFilter(f.id as AgendaFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                agendaFilter === f.id
                  ? 'bg-blue-600 text-white shadow-sm'
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
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {[
          { id: 'ALL', label: 'Todas as Categorias' },
          { id: 'DELIVERY', label: 'Entregas' },
          { id: 'RETURN', label: 'Devoluções' },
          { id: 'CONTRACT', label: 'Contratos' },
          { id: 'MAINTENANCE', label: 'Manutenção' },
          { id: 'DOCUMENT', label: 'Documentos' },
          { id: 'INSURANCE', label: 'Seguros' },
          { id: 'TICKET', label: 'Multas' },
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id as CategoryFilter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              categoryFilter === cat.id
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Action Items List */}
      <div className="space-y-3">
        {filteredActions.length === 0 ? (
          <Card className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Nenhuma pendência operacional para os filtros selecionados</h3>
            <p className="text-xs text-slate-500 mt-1">Sua operação diária está em dia!</p>
          </Card>
        ) : (
          filteredActions.map(item => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:shadow-md ${
                item.priority === 'P0'
                  ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/20'
                  : item.priority === 'P1'
                  ? 'border-amber-300 dark:border-amber-900/60'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={
                    item.priority === 'P0' ? 'danger' :
                    item.priority === 'P1' ? 'warning' : 'info'
                  }>
                    {item.priority} • {item.category}
                  </Badge>

                  {item.vehiclePlate && (
                    <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-mono text-xs font-bold">
                      Placa: {item.vehiclePlate}
                    </span>
                  )}

                  {item.contractNumber && (
                    <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono text-xs font-bold">
                      Contrato: {item.contractNumber}
                    </span>
                  )}

                  {item.overdueDays > 0 && (
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-mono text-xs font-bold">
                      Atrasado há {item.overdueDays} dia(s)
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.title}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">{item.description}</p>

                {item.driverName && (
                  <div className="text-xs text-slate-500 flex items-center gap-1 pt-0.5">
                    <Users className="w-3.5 h-3.5" /> Motorista: <strong className="text-slate-700 dark:text-slate-300">{item.driverName}</strong>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                <div className="text-right hidden sm:block">
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Ação Recomendada</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{item.actionRecommended}</span>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onNavigate(item.destinationTab || 'fleet')}
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Resolver
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
