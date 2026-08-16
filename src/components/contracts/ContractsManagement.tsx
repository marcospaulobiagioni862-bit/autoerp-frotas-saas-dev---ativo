import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Car,
  User,
  Calendar,
  DollarSign,
  Play,
  CheckCircle,
  XCircle,
  Eye,
  Edit2,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ChevronRight,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Input,
  Select,
  PageHeader,
} from '../ui';
import {
  ContractRepository,
  VehicleRepository,
  DriverRepository,
  AccountReceivableRepository,
} from '../../persistence/repositories/localRepositories';
import { ContractService } from '../../domain/services/ContractService';
import { Contract, Vehicle, Driver, AccountReceivable } from '../../types/entities';
import { ContractStatus, VehicleStatus, DriverStatus } from '../../types/enums';
import { ContractFormModal } from './ContractFormModal';
import { ContractDetailsModal } from './ContractDetailsModal';
import { ReceiptModal } from '../modals/ReceiptModal';

interface ContractsManagementProps {
  companyId: string;
}

export const ContractsManagement: React.FC<ContractsManagementProps> = ({ companyId }) => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [vehiclesMap, setVehiclesMap] = useState<Record<string, Vehicle>>({});
  const [driversMap, setDriversMap] = useState<Record<string, Driver>>({});
  const [receivablesMap, setReceivablesMap] = useState<Record<string, AccountReceivable[]>>({});

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [contractToEdit, setContractToEdit] = useState<Contract | null>(null);

  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<AccountReceivable | null>(null);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setContracts([]);
    setVehiclesMap({});
    setDriversMap({});
    setReceivablesMap({});
    setSelectedContractId(null);
    setSelectedReceivable(null);
    setContractToEdit(null);
    setIsFormModalOpen(false);
    setIsDetailsModalOpen(false);
    setIsReceiptModalOpen(false);
    loadData(isMounted);
    return () => {
      isMounted = false;
    };
  }, [companyId]);

  const loadData = async (isMounted: boolean = true) => {
    setLoading(true);
    if (!companyId) {
      if (isMounted) {
        setContracts([]);
        setVehiclesMap({});
        setDriversMap({});
        setReceivablesMap({});
      }
      setLoading(false);
      return;
    }
    const currentCompanyId = companyId;
    try {
      const contractRepo = new ContractRepository();
      const vehicleRepo = new VehicleRepository();
      const driverRepo = new DriverRepository();
      const receivableRepo = new AccountReceivableRepository();

      const [allContracts, allVehicles, allDrivers] = await Promise.all([
        contractRepo.findAllForCompany(currentCompanyId),
        vehicleRepo.findAllForCompany(currentCompanyId),
        driverRepo.findAllForCompany(currentCompanyId),
      ]);

      const vMap: Record<string, Vehicle> = {};
      allVehicles.forEach((v) => (vMap[v.id] = v));

      const dMap: Record<string, Driver> = {};
      allDrivers.forEach((d) => (dMap[d.id] = d));

      // Mapear recebíveis de cada contrato
      const recMap: Record<string, AccountReceivable[]> = {};
      for (const c of allContracts) {
        const recs = await receivableRepo.findByContractIdForCompany(currentCompanyId, c.id);
        recMap[c.id] = recs;
      }

      if (!isMounted || companyId !== currentCompanyId) return;

      setContracts(allContracts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setVehiclesMap(vMap);
      setDriversMap(dMap);
      setReceivablesMap(recMap);
    } catch (err) {
      console.error('Erro ao carregar dados de contratos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleActivateContract = async (contractId: string) => {
    setActionLoadingId(contractId);
    try {
      const contractService = new ContractService();
      await contractService.activateContract({
        companyId,
        contractId,
        userId: 'usr-admin',
        userName: 'Administrador',
      });
      await loadData();
    } catch (err: any) {
      alert(`Erro ao ativar contrato: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleProcessRecurring = async (contractId: string) => {
    setActionLoadingId(contractId);
    try {
      const contractService = new ContractService();
      const today = new Date().toISOString().split('T')[0];
      const recs = await contractService.processContractRecurring(
        contractId,
        today,
        'usr-admin',
        'Administrador'
      );
      if (recs.length > 0) {
        alert('Cobrança de aluguel gerada com sucesso!');
      } else {
        alert('Cobrança para a competência de hoje já havia sido gerada.');
      }
      await loadData();
    } catch (err: any) {
      alert(`Erro ao faturar aluguel: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCloseContract = async (contractId: string) => {
    if (!confirm('Deseja realmente encerrar este contrato? O veículo ficará disponível para novas locações.')) return;
    setActionLoadingId(contractId);
    try {
      const contractService = new ContractService();
      await contractService.closeContract({
        companyId,
        contractId,
        notes: 'Encerrado via atalho da tabela',
        userId: 'usr-admin',
        userName: 'Administrador',
      });
      await loadData();
    } catch (err: any) {
      alert(`Erro ao encerrar contrato: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteOrArchive = async (contractId: string) => {
    if (!confirm('Deseja excluir ou arquivar este contrato?')) return;
    setActionLoadingId(contractId);
    try {
      const contractService = new ContractService();
      const res = await contractService.deleteOrArchiveContract(contractId, 'usr-admin', 'Administrador');
      alert(res.action === 'archived' ? 'Contrato arquivado por possuir histórico financeiro.' : 'Contrato excluído com sucesso.');
      await loadData();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // KPIs Calculations
  const activeContracts = contracts.filter((c) => c.status === ContractStatus.ACTIVE);
  const draftContracts = contracts.filter((c) => c.status === ContractStatus.DRAFT || c.status === ContractStatus.AWAITING_SIGNATURE);
  const closedContracts = contracts.filter((c) => c.status === ContractStatus.CLOSED);

  const totalVehiclesCount = Object.keys(vehiclesMap).length || 1;
  const rawOccupancy = (activeContracts.length / totalVehiclesCount) * 100;
  const occupancyRate = (isNaN(rawOccupancy) ? 0 : rawOccupancy).toFixed(1);

  const totalActiveWeeklyRevenue = activeContracts.reduce((sum, c) => {
    if (c.billingPeriodicity === 'WEEKLY') return sum + c.rentalAmount;
    if (c.billingPeriodicity === 'MONTHLY') return sum + c.rentalAmount / 4;
    return sum + c.rentalAmount;
  }, 0);

  // Contratos com cobranças em atraso
  const todayStr = new Date().toISOString().split('T')[0];
  const contractsWithOverdue = contracts.filter((c) => {
    const recs = receivablesMap[c.id] || [];
    return recs.some((r) => r.dueDate < todayStr && r.balanceAmount > 0 && r.status !== 'CANCELLED');
  });

  // Filtered Contracts List
  const filteredContracts = contracts.filter((c) => {
    const v = vehiclesMap[c.vehicleId];
    const d = driversMap[c.driverId];

    const matchesSearch =
      c.contractNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v && (v.plate.toLowerCase().includes(searchTerm.toLowerCase()) || v.model.toLowerCase().includes(searchTerm.toLowerCase()))) ||
      (d && d.fullName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === 'ALL' || c.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Contratos"
        description="Controle do ciclo de vida, vigência, taxas, caução e faturamento recorrente"
        breadcrumb="Operação • Gestão de Contratos"
        primaryAction={{
          label: 'Novo Contrato',
          onClick: () => {
            setContractToEdit(null);
            setIsFormModalOpen(true);
          },
          icon: <Plus className="w-4 h-4" />
        }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">Contratos Ativos</span>
              <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono tabular-nums">
                {activeContracts.length}
              </h3>
              <span className="text-[10px] text-slate-400">Em locação regular</span>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">Taxa de Ocupação</span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-0.5 font-mono tabular-nums">
                {occupancyRate}%
              </h3>
              <span className="text-[10px] text-slate-400">{activeContracts.length} de {totalVehiclesCount} veículos</span>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">Receita Estimada / Sem</span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-0.5 font-mono tabular-nums">
                R$ {totalActiveWeeklyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
              <span className="text-[10px] text-slate-400">Projeção semanal ativa</span>
            </div>
            <div className="p-2.5 bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">Inadimplência / Atraso</span>
              <h3 className={`text-2xl font-black mt-0.5 font-mono tabular-nums ${contractsWithOverdue.length > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {contractsWithOverdue.length}
              </h3>
              <span className="text-[10px] text-slate-400">Contratos com débitos</span>
            </div>
            <div className={`p-2.5 rounded-xl ${contractsWithOverdue.length > 0 ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="w-full sm:w-80">
            <Input
              type="text"
              placeholder="Buscar por Nº contrato, placa do veículo ou motorista..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <span className="text-slate-400 font-semibold shrink-0">Status:</span>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-colors focus:outline-hidden ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Todos ({contracts.length})
            </button>
            <button
              onClick={() => setStatusFilter(ContractStatus.ACTIVE)}
              className={`px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-colors focus:outline-hidden ${
                statusFilter === ContractStatus.ACTIVE
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Ativos ({activeContracts.length})
            </button>
            <button
              onClick={() => setStatusFilter(ContractStatus.DRAFT)}
              className={`px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-colors focus:outline-hidden ${
                statusFilter === ContractStatus.DRAFT
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Rascunho ({draftContracts.length})
            </button>
            <button
              onClick={() => setStatusFilter(ContractStatus.CLOSED)}
              className={`px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-colors focus:outline-hidden ${
                statusFilter === ContractStatus.CLOSED
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Encerrados ({closedContracts.length})
            </button>
          </div>
        </div>
      </Card>

      {/* Contracts Table */}
      <Card padding="none">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">
            Carregando lista de contratos de locação...
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            Nenhum contrato encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Contrato</th>
                  <th className="py-3 px-4">Motorista</th>
                  <th className="py-3 px-4">Veículo</th>
                  <th className="py-3 px-4">Vigência</th>
                  <th className="py-3 px-4 text-right">Valor / Freq.</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredContracts.map((contract) => {
                  const vehicle = vehiclesMap[contract.vehicleId];
                  const driver = driversMap[contract.driverId];

                  return (
                    <tr
                      key={contract.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Contrato */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {contract.contractNumber}
                      </td>

                      {/* Motorista */}
                      <td className="py-3 px-4">
                        {driver ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-[11px] text-slate-700 dark:text-slate-300">
                              {driver.fullName.charAt(0)}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 dark:text-slate-100 block">
                                {driver.fullName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                CPF: {driver.cpf}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Desconhecido</span>
                        )}
                      </td>

                      {/* Veículo */}
                      <td className="py-3 px-4">
                        {vehicle ? (
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100 block">
                              {vehicle.brand} {vehicle.model}
                            </span>
                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-bold">
                              {vehicle.plate}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Desconhecido</span>
                        )}
                      </td>

                      {/* Vigência */}
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                        <div>Início: {contract.startDate}</div>
                        <div className="text-slate-400">Fim: {contract.endDate || 'Indeterminado'}</div>
                      </td>

                      {/* Valor / Freq */}
                      <td className="py-3 px-4 text-right font-mono">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          R$ {contract.rentalAmount.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {contract.billingPeriodicity === 'WEEKLY' ? 'Semanal' : 'Mensal'}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={
                            contract.status === ContractStatus.ACTIVE
                              ? 'success'
                              : contract.status === ContractStatus.CLOSED
                              ? 'neutral'
                              : contract.status === ContractStatus.CANCELLED
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {contract.status}
                        </Badge>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setSelectedContractId(contract.id);
                              setIsDetailsModalOpen(true);
                            }}
                            title="Ver Detalhes"
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {contract.status !== ContractStatus.CLOSED && contract.status !== ContractStatus.CANCELLED && (
                            <button
                              onClick={() => {
                                setContractToEdit(contract);
                                setIsFormModalOpen(true);
                              }}
                              title="Editar"
                              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {(contract.status === ContractStatus.DRAFT || contract.status === ContractStatus.AWAITING_SIGNATURE) && (
                            <button
                              onClick={() => handleActivateContract(contract.id)}
                              disabled={actionLoadingId === contract.id}
                              title="Ativar Contrato"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}

                          {contract.status === ContractStatus.ACTIVE && (
                            <>
                              <button
                                onClick={() => handleProcessRecurring(contract.id)}
                                disabled={actionLoadingId === contract.id}
                                title="Faturar Aluguel"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleCloseContract(contract.id)}
                                disabled={actionLoadingId === contract.id}
                                title="Encerrar Contrato"
                                className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => handleDeleteOrArchive(contract.id)}
                            disabled={actionLoadingId === contract.id}
                            title="Excluir/Arquivar"
                            className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* MODALS */}
      <ContractFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        contractToEdit={contractToEdit}
        companyId={companyId}
        onSuccess={() => {
          loadData();
        }}
      />

      <ContractDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        contractId={selectedContractId}
        companyId={companyId}
        onRefresh={loadData}
        onOpenReceiptModal={async (receivableId) => {
          const receivableRepo = new AccountReceivableRepository();
          const rec = await receivableRepo.findByIdForCompany(receivableId, companyId);
          if (rec) {
            setSelectedReceivable(rec);
            setIsReceiptModalOpen(true);
          }
        }}
      />

      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        receivable={selectedReceivable}
        onSuccess={() => {
          loadData();
          if (selectedContractId) {
            // refresh details modal if open
          }
        }}
      />
    </div>
  );
};
