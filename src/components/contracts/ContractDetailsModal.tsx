import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Car,
  User,
  Calendar,
  DollarSign,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Play,
  CheckCircle,
  XCircle,
  RefreshCw,
  PlusCircle,
  Receipt,
  History,
  AlertTriangle,
  X,
  CreditCard,
  Building2,
} from 'lucide-react';
import {
  ModalContainer,
  Card,
  Button,
  Badge,
} from '../ui';
import {
  ContractRepository,
  VehicleRepository,
  DriverRepository,
  AccountReceivableRepository,
  AuditLogRepository,
  TrafficTicketRepository,
} from '../../persistence/repositories/localRepositories';
import { AttachmentList } from '../documents/AttachmentList';
import { FileUpload } from '../documents/FileUpload';
import { ContractService, ContractFinancialSummary } from '../../domain/services/ContractService';
import { FinanceDepositClient } from '../../api/financeDepositClient';
import { Contract, Vehicle, Driver, AccountReceivable, SecurityDeposit, AuditLog, TrafficTicket } from '../../types/entities';
import { ContractStatus, ObligationStatus, VehicleStatus } from '../../types/enums';
import { formatCurrencyBRL } from '../../shared/utils/currency';

interface ContractDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractId: string | null;
  companyId: string;
  onRefresh: () => void;
  onOpenReceiptModal?: (receivableId: string) => void;
}


export const ContractDetailsModal: React.FC<ContractDetailsModalProps> = ({
  isOpen,
  onClose,
  contractId,
  companyId,
  onRefresh,
  onOpenReceiptModal,
}) => {
  const detailsRequestVersionRef = useRef(0);

  const activeCompanyIdRef = useRef<string>(companyId);
  activeCompanyIdRef.current = companyId;

  const activeContractIdRef = useRef<string | null>(contractId);
  activeContractIdRef.current = contractId;

  const activeIsOpenRef = useRef(isOpen);
  activeIsOpenRef.current = isOpen;

  const clearDetailsState = () => {
    setContract(null);
    setVehicle(null);
    setDriver(null);
    setSummary(null);
    setReceivables([]);
    setDeposit(null);
    setTickets([]);
    setHistory([]);
    setAttachmentEntity(null);
    setError(null);
    setSuccessMsg(null);
  };
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'FINANCIAL' | 'DEPOSIT' | 'TICKETS' | 'AUDIT'>('OVERVIEW');

  const [contract, setContract] = useState<Contract | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [summary, setSummary] = useState<ContractFinancialSummary | null>(null);
  const [receivables, setReceivables] = useState<AccountReceivable[]>([]);
  const [deposit, setDeposit] = useState<SecurityDeposit | null>(null);
  const [tickets, setTickets] = useState<TrafficTicket[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);

  const [loading, setLoading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [attachmentEntity, setAttachmentEntity] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const requestVersion = ++detailsRequestVersionRef.current;
    const companyIdSnapshot = companyId;
    const contractIdSnapshot = contractId;

    clearDetailsState();

    if (!isOpen || !contractIdSnapshot || !companyIdSnapshot) {
      setLoading(false);

      return () => {
        detailsRequestVersionRef.current += 1;
      };
    }

    setLoading(true);

    void loadDetails(
      companyIdSnapshot,
      contractIdSnapshot,
      requestVersion
    );

    return () => {
      detailsRequestVersionRef.current += 1;
    };
  }, [isOpen, contractId, companyId]);

  const loadDetails = async (
    companyIdSnapshot: string,
    contractIdSnapshot: string,
    requestVersion: number
  ) => {
    try {
      setError(null);
      
      const contractRepo = new ContractRepository();
      const vehicleRepo = new VehicleRepository();
      const driverRepo = new DriverRepository();
      const receivableRepo = new AccountReceivableRepository();
      const ticketRepo = new TrafficTicketRepository();
      
      const c = await contractRepo.findByIdForCompany(
        contractIdSnapshot,
        companyIdSnapshot
      );

      if (
        requestVersion !== detailsRequestVersionRef.current ||
        activeCompanyIdRef.current !== companyIdSnapshot ||
        activeContractIdRef.current !== contractIdSnapshot ||
        !activeIsOpenRef.current
      ) {
        return;
      }

      if (!c) {
        setError('Contrato não encontrado.');
        setLoading(false);
        return;
      }

      const contractService = new ContractService();
      const [v, d, summaryRes, recs, dep, allTickets, historyRes] = await Promise.all([
        vehicleRepo.findByIdForCompany(c.vehicleId, companyIdSnapshot),
        driverRepo.findByIdForCompany(c.driverId, companyIdSnapshot),
        contractService.getContractFinancialSummary(c.id),
        receivableRepo.findByContractIdForCompany(
          companyIdSnapshot,
          c.id
        ),
        FinanceDepositClient.getByContract(c.id),
        ticketRepo.findAllForCompany(companyIdSnapshot),
        contractService.getContractHistory(c.id)
      ]);

      if (
        requestVersion !== detailsRequestVersionRef.current ||
        activeCompanyIdRef.current !== companyIdSnapshot ||
        activeContractIdRef.current !== contractIdSnapshot ||
        !activeIsOpenRef.current
      ) {
        return;
      }

      setContract(c);
      setVehicle(v || null);
      setDriver(d || null);
      
      const relatedTickets = allTickets.filter(t => t.contractId === c.id);
      const sortedRecs = [...recs].sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
      
      setSummary(summaryRes);
      setReceivables(sortedRecs);
      setDeposit(dep);
      setTickets(relatedTickets);
      setHistory(historyRes);
      
      setAttachmentEntity({
        type: 'contract',
        id: c.id,
        title: `Contrato ${c.id.substring(0, 8)}`,
        subtitle: v ? `Veículo: ${v.plate}` : undefined
      });
      
    } catch (err) {
      if (
        requestVersion === detailsRequestVersionRef.current &&
        activeCompanyIdRef.current === companyIdSnapshot &&
        activeContractIdRef.current === contractIdSnapshot &&
        activeIsOpenRef.current
      ) {
        console.error('Error loading contract details:', err);
        setError('Erro ao carregar os detalhes do contrato.');
      }
    } finally {
      if (
        requestVersion === detailsRequestVersionRef.current &&
        activeCompanyIdRef.current === companyIdSnapshot &&
        activeContractIdRef.current === contractIdSnapshot &&
        activeIsOpenRef.current
      ) {
        setLoading(false);
      }
    }
  };

  const reloadDetails = async () => {
    const companyIdSnapshot = activeCompanyIdRef.current;
    const contractIdSnapshot = activeContractIdRef.current;

    if (
      !activeIsOpenRef.current ||
      !companyIdSnapshot ||
      !contractIdSnapshot
    ) {
      return;
    }

    const requestVersion = ++detailsRequestVersionRef.current;
    setLoading(true);

    await loadDetails(
      companyIdSnapshot,
      contractIdSnapshot,
      requestVersion
    );
  };
  const handleActivate = async () => {
    if (!contract) return;
    const actionCompanyId = activeCompanyIdRef.current;
    const actionVersion = detailsRequestVersionRef.current;
    
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const contractService = new ContractService();
      await contractService.activateContract({
        companyId,
        contractId: contract.id,
        userId: 'usr-admin',
        userName: 'Administrador',
      });

      if (
        activeCompanyIdRef.current !== actionCompanyId ||
        detailsRequestVersionRef.current !== actionVersion
      ) {
        return;
      }
      setSuccessMsg('Operação realizada com sucesso.');
      await reloadDetails();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao ativar contrato.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseContract = async () => {
    const actionCompanyId = activeCompanyIdRef.current;
    const actionVersion = detailsRequestVersionRef.current;
    if (!contract) return;
    if (!confirm('Deseja realmente encerrar este contrato? O veículo será liberado como Disponível.')) return;

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const contractService = new ContractService();
      await contractService.closeContract({
        companyId,
        contractId: contract.id,
        notes: 'Encerrado manualmente via painel do operador',
        userId: 'usr-admin',
        userName: 'Administrador',
      });

      if (
        activeCompanyIdRef.current !== actionCompanyId ||
        detailsRequestVersionRef.current !== actionVersion
      ) {
        return;
      }
      setSuccessMsg('Operação realizada com sucesso.');
      await reloadDetails();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao encerrar contrato.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelContract = async () => {
    const actionCompanyId = activeCompanyIdRef.current;
    const actionVersion = detailsRequestVersionRef.current;
    if (!contract) return;
    const reason = prompt('Informe o motivo do cancelamento do contrato:');
    if (!reason) return;

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const contractService = new ContractService();
      await contractService.cancelContract(contract.id, reason, 'usr-admin', 'Administrador');

      if (
        activeCompanyIdRef.current !== actionCompanyId ||
        detailsRequestVersionRef.current !== actionVersion
      ) {
        return;
      }
      setSuccessMsg('Operação realizada com sucesso.');
      await reloadDetails();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao cancelar contrato.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcessRecurring = async () => {
    if (!contract) return;
    const actionCompanyId = activeCompanyIdRef.current;
    const actionVersion = detailsRequestVersionRef.current;
    
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const contractService = new ContractService();
      const today = new Date().toISOString().split('T')[0];
      const recs = await contractService.processContractRecurring(
        contract.id,
        today,
        'usr-admin',
        'Administrador'
      );

      if (recs.length > 0) {
        setSuccessMsg('Cobrança de aluguel gerada com sucesso para hoje!');
      } else {
        setSuccessMsg('Cobrança já processada para esta competência.');
      }

      await reloadDetails();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao faturar aluguel.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceiveDeposit = async () => {
    const actionCompanyId = activeCompanyIdRef.current;
    const actionVersion = detailsRequestVersionRef.current;
    if (!contract || !driver || !vehicle) return;
    const amountStr = prompt('Valor da caução a receber:', (contract.securityDepositAmount || 1000).toString());
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      alert('Valor inválido');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await FinanceDepositClient.receive({
        contractId: contract.id,
        amount,
        financialAccountId: 'acc-nubank-1',
        paymentMethodId: 'pm-pix',
      });

      if (
        activeCompanyIdRef.current !== actionCompanyId ||
        detailsRequestVersionRef.current !== actionVersion
      ) {
        return;
      }
      setSuccessMsg('Operação realizada com sucesso.');
      await reloadDetails();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao receber caução.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!contractId) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">
                {contract?.contractNumber || 'Carregando...'}
              </h2>
              {contract && (
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
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {driver ? `Motorista: ${driver.fullName}` : ''} {vehicle ? `| Veículo: ${vehicle.brand} ${vehicle.model} (${vehicle.plate})` : ''}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg self-start sm:self-center"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Action Toolbar */}
      {contract && (
        <div className="px-5 py-2.5 bg-slate-100/70 dark:bg-slate-800/50 border-b border-slate-200/60 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {(contract.status === ContractStatus.DRAFT || contract.status === ContractStatus.AWAITING_SIGNATURE) && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleActivate}
                isLoading={actionLoading}
                className="!bg-emerald-600 hover:!bg-emerald-700"
                icon={<Play className="w-3.5 h-3.5" />}
              >
                Ativar Contrato
              </Button>
            )}

            {contract.status === ContractStatus.ACTIVE && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleProcessRecurring}
                  isLoading={actionLoading}
                  icon={<RefreshCw className="w-3.5 h-3.5 text-blue-600" />}
                >
                  Faturar Aluguel
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReceiveDeposit}
                  isLoading={actionLoading}
                  icon={<ShieldCheck className="w-3.5 h-3.5 text-amber-600" />}
                >
                  Receber Caução
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseContract}
                  isLoading={actionLoading}
                  className="hover:!bg-amber-50 dark:hover:!bg-amber-950/40 text-amber-700 dark:text-amber-300"
                  icon={<CheckCircle className="w-3.5 h-3.5" />}
                >
                  Encerrar Contrato
                </Button>
              </>
            )}

            {contract.status !== ContractStatus.CANCELLED && contract.status !== ContractStatus.CLOSED && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelContract}
                isLoading={actionLoading}
                className="hover:!bg-rose-50 dark:hover:!bg-rose-950/40 text-rose-600 dark:text-rose-400"
                icon={<XCircle className="w-3.5 h-3.5" />}
              >
                Cancelar
              </Button>
            )}
          </div>

          <div className="text-slate-500 font-mono text-[11px]">
            Criado em: {new Date(contract.createdAt).toLocaleDateString('pt-BR')}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="px-5 pt-3">
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/80 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 text-xs font-semibold mt-2">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'OVERVIEW'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          Visão Geral
        </button>

        <button
          onClick={() => setActiveTab('FINANCIAL')}
          className={`py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'FINANCIAL'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Cobranças ({receivables.length})
        </button>

        <button
          onClick={() => setActiveTab('DEPOSIT')}
          className={`py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'DEPOSIT'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Caução
        </button>

        <button
          onClick={() => setActiveTab('TICKETS')}
          className={`py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'TICKETS'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Multas ({tickets.length})
        </button>

        <button
          onClick={() => setActiveTab('AUDIT')}
          className={`py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'AUDIT'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <History className="w-4 h-4" />
          Auditoria ({history.length})
        </button>
      </div>

      {/* Content */}
      <div className="p-5 max-h-[65vh] overflow-y-auto">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">
            Carregando detalhes do contrato...
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'OVERVIEW' && contract && (
              <div className="space-y-5 text-xs">
                {/* Financial Summary Cards */}
                {summary && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card padding="sm">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Valor Locação</span>
                      <p className="text-base font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                        R$ {summary.rentalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        {contract.billingPeriodicity === 'WEEKLY' ? 'Semanal' : 'Mensal'}
                      </span>
                    </Card>

                    <Card padding="sm">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Faturado</span>
                      <p className="text-base font-black text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                        R$ {summary.totalBilled.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <span className="text-[10px] text-slate-500">{summary.receivablesCount} cobrança(s)</span>
                    </Card>

                    <Card padding="sm">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Pago</span>
                      <p className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                        R$ {summary.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <span className="text-[10px] text-emerald-500 font-semibold">Recebido</span>
                    </Card>

                    <Card padding="sm">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Saldo Devedor / Atraso</span>
                      <p className={`text-base font-black font-mono mt-0.5 ${summary.totalOverdue > 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                        R$ {summary.pendingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      {summary.totalOverdue > 0 && (
                        <span className="text-[10px] text-rose-500 font-bold">
                          R$ {summary.totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em atraso
                        </span>
                      )}
                    </Card>
                  </div>
                )}

                {/* Grid Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Veículo */}
                  <Card padding="sm" className="space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                      <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <Car className="w-4 h-4 text-emerald-600" />
                        Veículo Alocado
                      </span>
                      {vehicle && <Badge variant="info">{vehicle.status}</Badge>}
                    </div>
                    {vehicle ? (
                      <div className="space-y-1 text-slate-600 dark:text-slate-400">
                        <p><strong className="text-slate-800 dark:text-slate-200">Modelo:</strong> {vehicle.brand} {vehicle.model} ({vehicle.year})</p>
                        <p><strong className="text-slate-800 dark:text-slate-200">Placa:</strong> <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-bold">{vehicle.plate}</span></p>
                        <p><strong className="text-slate-800 dark:text-slate-200">Chassi:</strong> {vehicle.chassis || 'N/A'}</p>
                        <p><strong className="text-slate-800 dark:text-slate-200">Cor:</strong> {vehicle.color || 'N/A'}</p>
                      </div>
                    ) : (
                      <p className="text-slate-400">Sem veículo atrelado</p>
                    )}
                  </Card>

                  {/* Motorista */}
                  <Card padding="sm" className="space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                      <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-emerald-600" />
                        Motorista Locatário
                      </span>
                      {driver && <Badge variant="success">{driver.status}</Badge>}
                    </div>
                    {driver ? (
                      <div className="space-y-1 text-slate-600 dark:text-slate-400">
                        <p><strong className="text-slate-800 dark:text-slate-200">Nome:</strong> {driver.fullName}</p>
                        <p><strong className="text-slate-800 dark:text-slate-200">CPF:</strong> {driver.cpf}</p>
                        <p><strong className="text-slate-800 dark:text-slate-200">Telefone:</strong> {driver.phone}</p>
                        <p><strong className="text-slate-800 dark:text-slate-200">CNH:</strong> {driver.cnhNumber} (Venc: {driver.cnhExpiration})</p>
                      </div>
                    ) : (
                      <p className="text-slate-400">Sem motorista atrelado</p>
                    )}
                  </Card>
                </div>

                {/* Condições do Contrato */}
                <Card padding="sm" className="space-y-3">
                  <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    Parâmetros Operacionais & Vigência
                  </span>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Data de Início</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{contract.startDate}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Data Término</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{contract.endDate || 'Indeterminado'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Franquia de KM</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{contract.franchiseKm || 1500} km / semana</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Taxa KM Excedente</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">R$ {(contract.excessKmRate || 0.5).toFixed(2)}/km</span>
                    </div>
                  </div>

                  {contract.notes && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Observações:</span>
                      <p className="text-slate-700 dark:text-slate-300 font-mono text-[11px] whitespace-pre-wrap mt-0.5">
                        {contract.notes}
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* FINANCIAL / RECEIVABLES TAB */}
            {activeTab === 'FINANCIAL' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">
                    Histórico de Cobranças do Contrato
                  </h3>
                  {contract?.status === ContractStatus.ACTIVE && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleProcessRecurring}
                      isLoading={actionLoading}
                      icon={<PlusCircle className="w-3.5 h-3.5" />}
                    >
                      Faturar Nova Competência
                    </Button>
                  )}
                </div>

                {receivables.length === 0 ? (
                  <Card padding="md" className="text-center text-slate-400 py-8">
                    Nenhuma cobrança registrada para este contrato ainda.
                  </Card>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {receivables.map((rec) => (
                      <div
                        key={rec.id}
                        className="p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                              {rec.description}
                            </span>
                            <Badge
                              variant={
                                rec.status === ObligationStatus.PAID
                                  ? 'success'
                                  : rec.status === ObligationStatus.PARTIALLY_PAID
                                  ? 'warning'
                                  : rec.status === ObligationStatus.CANCELLED
                                  ? 'neutral'
                                  : 'danger'
                              }
                            >
                              {rec.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-slate-500 text-[11px] mt-1 font-mono">
                            <span>Vencimento: {rec.dueDate}</span>
                            <span>| Original: R$ {rec.originalAmount.toFixed(2)}</span>
                            <span>| Pago: R$ {rec.paidAmount.toFixed(2)}</span>
                            <span>| Saldo: R$ {rec.balanceAmount.toFixed(2)}</span>
                          </div>
                        </div>

                        {rec.status !== ObligationStatus.PAID && rec.status !== ObligationStatus.CANCELLED && onOpenReceiptModal && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => onOpenReceiptModal(rec.id)}
                            icon={<Receipt className="w-3.5 h-3.5" />}
                            className="!bg-emerald-600 hover:!bg-emerald-700"
                          >
                            Dar Baixa
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* DEPOSIT TAB */}
            {activeTab === 'DEPOSIT' && (
              <div className="space-y-4 text-xs">
                <Card padding="md" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      Status da Caução
                    </h3>
                    {deposit && <Badge variant="success">{deposit.status}</Badge>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Valor Previsto</span>
                      <p className="text-lg font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                        R$ {(contract?.securityDepositAmount || (deposit ? deposit.originalAmount : 0)).toFixed(2)}
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Valor Recebido</span>
                      <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                        R$ {(deposit ? deposit.receivedAmount : 0).toFixed(2)}
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Saldo Devedor Caução</span>
                      <p className="text-lg font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                        R$ {Math.max(0, (contract?.securityDepositAmount || 0) - (deposit ? deposit.receivedAmount : 0)).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {(!deposit || deposit.receivedAmount < (contract?.securityDepositAmount || 0)) && (
                    <div className="pt-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleReceiveDeposit}
                        isLoading={actionLoading}
                        icon={<ShieldCheck className="w-4 h-4 mr-1" />}
                        className="!bg-emerald-600 hover:!bg-emerald-700"
                      >
                        Registrar Recebimento de Caução
                      </Button>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* TICKETS TAB */}
            {activeTab === 'TICKETS' && (
              <div className="space-y-3 text-xs">
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  Multas de Trânsito Ocorridas Durante a Vigência do Contrato
                </h3>

                {tickets.length === 0 ? (
                  <Card padding="md" className="text-center text-slate-400 py-8">
                    Nenhuma multa de trânsito vinculada a este contrato.
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {tickets.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              Auto: {t.autoNumber}
                            </span>
                            <Badge variant={t.responsibility === 'DRIVER' ? 'indigo' : 'slate'}>
                              {t.responsibility}
                            </Badge>
                            <Badge variant="warning">{t.status}</Badge>
                          </div>
                          <p className="text-slate-600 dark:text-slate-400 mt-1">{t.description}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Data: {new Date(t.infractionDate).toLocaleDateString('pt-BR')} • Vencimento: {new Date(t.dueDate).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm block">
                            {formatCurrencyBRL(t.originalAmount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AUDIT TAB */}
            {activeTab === 'AUDIT' && (
              <div className="space-y-3 text-xs">
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  Trilha de Auditoria e Rastreabilidade
                </h3>

                {history.length === 0 ? (
                  <Card padding="md" className="text-center text-slate-400 py-8">
                    Nenhum registro de auditoria encontrado para este contrato.
                  </Card>
                ) : (
                  <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-3 space-y-4 py-2">
                    {history.map((log) => (
                      <div key={log.id} className="relative pl-5">
                        <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {log.action}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              por {log.userName} ({new Date(log.timestamp).toLocaleString('pt-BR')})
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-400 font-mono text-[11px] mt-0.5">
                            Entidade: {log.entityName} #{log.entityId.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <div className="grid grid-cols-1 gap-4 text-xs mt-6">
          <div className="col-span-1 p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 bg-slate-50 dark:bg-slate-800/30">
            <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Arquivos e Anexos (Contrato, Termos, Vistorias)
            </h4>
            <FileUpload 
              entityType="Contract"
              entityId={contract.id}
              documentType="CONTRACT_DOCUMENT"
              onUploadComplete={() => {
                setUploadCount(prev => prev + 1);
              }}
              multiple={true}
            />
            <div className="mt-4">
              <div key={uploadCount}><AttachmentList entityType="Contract" entityId={contract.id} /></div>
            </div>
          </div>
        </div>
      </div>
    </ModalContainer>
  );
};
