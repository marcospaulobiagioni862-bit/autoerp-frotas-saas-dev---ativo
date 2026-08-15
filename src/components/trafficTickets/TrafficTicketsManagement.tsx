import React, { useState, useEffect } from 'react';
import { TrafficTicketRepository, VehicleRepository, DriverRepository } from '../../persistence/repositories/localRepositories';
import { TrafficTicket, Vehicle, Driver } from '../../types/entities';
import { TicketResponsibility, TicketStatus } from '../../types/enums';
import { TrafficTicketFormModal } from './TrafficTicketFormModal';
import { TrafficTicketDetailsModal } from './TrafficTicketDetailsModal';
import { Card, Button, Badge, Input, Select, PageHeader } from '../ui';
import { AlertTriangle, Plus, Search, Filter, Car, User, DollarSign, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';
import { formatCurrencyBRL } from '../../shared/utils/currency';

interface TrafficTicketsManagementProps {
  companyId?: string;
}

export const TrafficTicketsManagement: React.FC<TrafficTicketsManagementProps> = ({
  companyId = 'company-main-uuid',
}) => {
  const [tickets, setTickets] = useState<TrafficTicket[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [responsibilityFilter, setResponsibilityFilter] = useState<string>('ALL');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const ticketRepo = new TrafficTicketRepository();
      const vehicleRepo = new VehicleRepository();
      const driverRepo = new DriverRepository();

      const tList = await ticketRepo.findAll({ companyId });
      const vList = await vehicleRepo.findAll({ companyId });
      const dList = await driverRepo.findAll({ companyId });

      // Sort tickets newest first
      tList.sort((a, b) => new Date(b.infractionDate).getTime() - new Date(a.infractionDate).getTime());

      setTickets(tList);
      setVehicles(vList);
      setDrivers(dList);
    } catch (err) {
      console.error('Erro ao carregar multas:', err);
    } finally {
      setLoading(false);
    }
  };

  const getVehicleInfo = (vehicleId: string) => {
    const v = vehicles.find((item) => item.id === vehicleId);
    return v ? `${v.plate} (${v.brand} ${v.model})` : vehicleId;
  };

  const getDriverInfo = (driverId?: string) => {
    if (!driverId) return 'Não Identificado';
    const d = drivers.find((item) => item.id === driverId);
    return d ? d.fullName : driverId;
  };

  const filteredTickets = tickets.filter((t) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      t.autoNumber.toLowerCase().includes(term) ||
      t.description.toLowerCase().includes(term) ||
      getVehicleInfo(t.vehicleId).toLowerCase().includes(term) ||
      getDriverInfo(t.driverId).toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesResp = responsibilityFilter === 'ALL' || t.responsibility === responsibilityFilter;

    return matchesSearch && matchesStatus && matchesResp;
  });

  // KPIs
  const totalAmountSum = tickets.reduce((acc, t) => acc + (t.discountedAmount || t.originalAmount), 0);
  const pendingIdentCount = tickets.filter((t) => t.status === TicketStatus.PENDING_IDENTIFICATION).length;
  const chargedDriverCount = tickets.filter((t) => t.responsibility === TicketResponsibility.DRIVER).length;
  const companyPaidCount = tickets.filter((t) => t.responsibility === TicketResponsibility.COMPANY).length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Multas de Trânsito"
        description="Controle de infrações, identificação de condutores, apuração de responsabilidades e integração financeira"
        breadcrumb="Operação • Gestão de Multas"
        primaryAction={{
          label: 'Nova Multa',
          onClick: () => setIsFormOpen(true),
          icon: <Plus className="w-4 h-4" />
        }}
      />

      {/* KPI Dashboard Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <span className="text-slate-500 text-xs font-medium block">Total de Multas Registradas</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {tickets.length}
            </span>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <span className="text-[11px] text-slate-400">Total acumulado na frota</span>
        </Card>

        <Card className="p-4 space-y-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <span className="text-slate-500 text-xs font-medium block">Pendentes de Identificação</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {pendingIdentCount}
            </span>
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          </div>
          <span className="text-[11px] text-amber-600/80">Requer atribuição de condutor</span>
        </Card>

        <Card className="p-4 space-y-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <span className="text-slate-500 text-xs font-medium block">Cobradas do Motorista</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              {chargedDriverCount}
            </span>
            <User className="w-5 h-5 text-indigo-500" />
          </div>
          <span className="text-[11px] text-indigo-600/80">Com Contas a Receber</span>
        </Card>

        <Card className="p-4 space-y-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <span className="text-slate-500 text-xs font-medium block">Valor Total das Infrações</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrencyBRL(totalAmountSum)}
            </span>
            <DollarSign className="w-5 h-5 text-emerald-500" />
          </div>
          <span className="text-[11px] text-slate-400">Soma dos montantes cadastrados</span>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 space-y-3 bg-white dark:bg-slate-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              type="text"
              placeholder="Buscar por auto, descrição, placa ou motorista..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Responsibility Filter */}
          <Select
            value={responsibilityFilter}
            onChange={(e) => setResponsibilityFilter(e.target.value)}
          >
            <option value="ALL">Todas as Responsabilidades</option>
            <option value={TicketResponsibility.DRIVER}>Motorista</option>
            <option value={TicketResponsibility.COMPANY}>Empresa/Locadora</option>
            <option value={TicketResponsibility.UNIDENTIFIED}>Não Identificado</option>
          </Select>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Todos os Status Operacionais</option>
            <option value={TicketStatus.PENDING_IDENTIFICATION}>Pendente Identificação</option>
            <option value={TicketStatus.IDENTIFIED}>Identificado</option>
            <option value={TicketStatus.CHARGED_DRIVER}>Cobrada do Motorista</option>
            <option value={TicketStatus.PAID_BY_COMPANY}>Paga pela Empresa</option>
            <option value={TicketStatus.APPEALED}>Em Recurso</option>
            <option value={TicketStatus.CANCELLED}>Cancelada</option>
          </Select>
        </div>
      </Card>

      {/* Table Section */}
      <Card className="overflow-hidden border border-slate-200 dark:border-slate-800">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">Carregando multas de trânsito...</div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Nenhuma multa de trânsito encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-800 font-semibold">
                <tr>
                  <th className="p-3">Auto de Infração</th>
                  <th className="p-3">Veículo</th>
                  <th className="p-3">Motorista</th>
                  <th className="p-3">Data / Venc.</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3">Atribuição</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="p-3">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 block">
                        {t.autoNumber}
                      </span>
                      <span className="text-[11px] text-slate-500 line-clamp-1">{t.description}</span>
                    </td>

                    <td className="p-3">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                        {getVehicleInfo(t.vehicleId)}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className="text-slate-700 dark:text-slate-300">
                        {getDriverInfo(t.driverId)}
                      </span>
                    </td>

                    <td className="p-3 font-mono text-[11px]">
                      <div>Infra: {new Date(t.infractionDate).toLocaleDateString('pt-BR')}</div>
                      <div className="text-slate-400">Venc: {new Date(t.dueDate).toLocaleDateString('pt-BR')}</div>
                    </td>

                    <td className="p-3 font-mono">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">
                        {formatCurrencyBRL(t.originalAmount)}
                      </span>
                      {t.discountedAmount && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                          Desc: {formatCurrencyBRL(t.discountedAmount)}
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <Badge
                        variant={
                          t.responsibility === TicketResponsibility.DRIVER
                            ? 'indigo'
                            : t.responsibility === TicketResponsibility.COMPANY
                            ? 'slate'
                            : 'warning'
                        }
                      >
                        {t.responsibility}
                      </Badge>
                    </td>

                    <td className="p-3">
                      <Badge
                        variant={
                          t.status === TicketStatus.CANCELLED
                            ? 'danger'
                            : t.status === TicketStatus.CHARGED_DRIVER
                            ? 'success'
                            : t.status === TicketStatus.APPEALED
                            ? 'warning'
                            : 'secondary'
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>

                    <td className="p-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTicketId(t.id)}
                      >
                        Ver Detalhes
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modals */}
      <TrafficTicketFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        companyId={companyId}
        onSuccess={loadData}
      />

      <TrafficTicketDetailsModal
        isOpen={!!selectedTicketId}
        onClose={() => setSelectedTicketId(null)}
        ticketId={selectedTicketId}
        companyId={companyId}
        onRefresh={loadData}
      />
    </div>
  );
};
