import { useAuth } from '../../hooks/useAuth';
import React, { useEffect, useState } from 'react';
import {
  AccountReceivableRepository,
  AccountPayableRepository,
  FinancialAccountRepository,
  FinancialTransactionRepository,
  VehicleRepository,
  ContractRepository,
  MaintenanceRepository,
  VehicleDocumentRepository,
  DriverDocumentRepository,
  TrafficTicketRepository,
  DriverRepository,
  InsuranceRepository,
  TrackerRepository,
} from '../../persistence/repositories/localRepositories';
import {
  AccountReceivable,
  AccountPayable,
  FinancialAccount,
  FinancialTransaction,
  Vehicle,
} from '../../types/entities';
import { ObligationStatus, TransactionType } from '../../types/enums';
import {
  TrendingUp,
  CreditCard,
  Wallet,
  Car,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRightLeft,
  ShieldCheck,
  BellRing,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Card, Button, Badge, Skeleton, PageHeader } from '../ui';
import { PerformanceMetricsWidget } from './PerformanceMetricsWidget';
import { generateOperationalPendings, OperationalPendingItem } from '../../domain/operations/OperationalPendingService';

interface OverviewDashboardProps {
  onNavigate: (tab: any) => void;
  onOpenReceiptModal: (receivable: AccountReceivable) => void;
  onOpenPaymentModal: (payable: AccountPayable) => void;
  onOpenTransferModal: () => void;
  onOpenTestRunner: () => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  onNavigate,
  onOpenReceiptModal,
  onOpenPaymentModal,
  onOpenTransferModal,
  onOpenTestRunner,
}) => {
  const { user } = useAuth();
  const [receivables, setReceivables] = useState<AccountReceivable[]>([]);
  const [payables, setPayables] = useState<AccountPayable[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [pendings, setPendings] = useState<OperationalPendingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    
    // Clear state immediately on tenant change
    setReceivables([]);
    setPayables([]);
    setAccounts([]);
    setTransactions([]);
    setVehicles([]);
    setDrivers([]);
    setContracts([]);
    setPendings([]);
    
    loadDashboardData(isMounted);
    
    return () => {
      isMounted = false;
    };
  }, [user?.companyId]);

  const loadDashboardData = async (isMounted: boolean = true) => {
    setLoading(true);
    if (!user?.companyId) {
      setReceivables([]);
      setPayables([]);
      setAccounts([]);
      setTransactions([]);
      setVehicles([]);
      setDrivers([]);
      setContracts([]);
      setPendings([]);
      setLoading(false);
      return;
    }
    const currentCompanyId = user.companyId;

    const recRepo = new AccountReceivableRepository();
    const payRepo = new AccountPayableRepository();
    const accRepo = new FinancialAccountRepository();
    const txRepo = new FinancialTransactionRepository();
    const vehRepo = new VehicleRepository();
    const contractRepo = new ContractRepository();
    const maintRepo = new MaintenanceRepository();
    const vehDocRepo = new VehicleDocumentRepository();
    const drvDocRepo = new DriverDocumentRepository();
    const ticketRepo = new TrafficTicketRepository();
    const drvRepo = new DriverRepository();
    const insRepo = new InsuranceRepository();
    const trackRepo = new TrackerRepository();

    const [recList, payList, accList, txList, vehList, contractList, maintList, vehDocs, drvDocs, tickets, drvList, insurances, trackers] = await Promise.all([
      recRepo.findAllForCompany(currentCompanyId),
      payRepo.findAllForCompany(currentCompanyId),
      accRepo.findAllForCompany(currentCompanyId),
      txRepo.findAllForCompany(currentCompanyId),
      vehRepo.findAllForCompany(currentCompanyId),
      contractRepo.findAllForCompany(currentCompanyId),
      maintRepo.findAllForCompany(currentCompanyId),
      vehDocRepo.findAllForCompany(currentCompanyId),
      drvDocRepo.findAllForCompany(currentCompanyId),
      ticketRepo.findAllForCompany(currentCompanyId),
      drvRepo.findAllForCompany(currentCompanyId),
      insRepo.findAllForCompany(currentCompanyId),
      trackRepo.findAllForCompany(currentCompanyId),
    ]);

    if (!isMounted || user?.companyId !== currentCompanyId) {
      return;
    }

    setReceivables(recList);
    setPayables(payList);
    setAccounts(accList);
    setTransactions(txList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setVehicles(vehList);
    setDrivers(drvList);
    setContracts(contractList);

    const operationalPendings = generateOperationalPendings({
      vehicles: vehList,
      contracts: contractList,
      maintenances: maintList,
      vehicleDocuments: vehDocs,
      driverDocuments: drvDocs,
      tickets,
      drivers: drvList,
      insurances,
      trackers,
    });
    setPendings(operationalPendings);

    setLoading(false);
  };

  const totalAccountBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);

  const pendingReceivables = receivables.filter(
    (r) => r.status === ObligationStatus.PENDING || r.status === ObligationStatus.PARTIALLY_PAID
  );
  const overdueReceivables = receivables.filter(
    (r) => (r.status === ObligationStatus.PENDING || r.status === ObligationStatus.PARTIALLY_PAID) && r.dueDate < new Date().toISOString().split('T')[0]
  );
  const totalReceivableBalance = pendingReceivables.reduce((sum, r) => sum + r.balanceAmount, 0);

  const pendingPayables = payables.filter(
    (p) => p.status === ObligationStatus.PENDING || p.status === ObligationStatus.PARTIALLY_PAID
  );
  const totalPayableBalance = pendingPayables.reduce((sum, p) => sum + p.balanceAmount, 0);

  const activeVehicles = vehicles.filter((v) => v.status === 'RENTED');
  const availableVehicles = vehicles.filter((v) => v.status === 'AVAILABLE');
  const maintenanceVehicles = vehicles.filter((v) => v.status === 'MAINTENANCE');
  const activeDriversCount = drivers.filter((d) => d.status === 'ACTIVE').length;
  const activeContractsCount = contracts.filter((c) => c.status === 'ACTIVE').length;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        description="Visão geral operacional e financeira da frota e do motor financeiro"
        breadcrumb="Plataforma AutoERP • Visão Consolidada"
        primaryAction={{
          label: 'Nova Transferência',
          onClick: onOpenTransferModal,
          icon: <ArrowRightLeft className="w-4 h-4" />
        }}
        secondaryActions={
          <Button
            onClick={onOpenTestRunner}
            variant="secondary"
            size="sm"
            icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
          >
            Suíte 42 Testes
          </Button>
        }
      />

      {/* Hero Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Saldo Consolidado */}
        <Card padding="sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Saldo Consolidado</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 font-mono tabular-nums">
                R$ {totalAccountBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl dark:bg-blue-950/60 dark:text-blue-400">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 flex justify-between">
            <span>Contas Ativas:</span>
            <strong className="text-slate-700 dark:text-slate-300">{accounts.length} contas</strong>
          </div>
        </Card>

        {/* Card 2: Contas a Receber Pendentes */}
        <Card padding="sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">A Receber Pendente</span>
              <h3 className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono tabular-nums">
                R$ {totalReceivableBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl dark:bg-emerald-950/60 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] flex justify-between">
            <span className="text-slate-500">Em Atraso:</span>
            <span className="text-amber-600 font-bold">{overdueReceivables.length} títulos</span>
          </div>
        </Card>

        {/* Card 3: Contas a Pagar Pendentes */}
        <Card padding="sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">A Pagar Pendente</span>
              <h3 className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 font-mono tabular-nums">
                R$ {totalPayableBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl dark:bg-indigo-950/60 dark:text-indigo-400">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] flex justify-between">
            <span className="text-slate-500">Fornecedores / Cartões:</span>
            <strong className="text-slate-700 dark:text-slate-300">{pendingPayables.length} obrigações</strong>
          </div>
        </Card>

        {/* Card 4: Frota Locada */}
        <Card padding="sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Frota em Operação</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                {activeVehicles.length} / {vehicles.length}
              </h3>
            </div>
            <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl dark:bg-slate-800 dark:text-slate-300">
              <Car className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] flex justify-between">
            <span className="text-slate-500">Taxa de Ocupação:</span>
            <strong className="text-emerald-600 font-bold">
              {vehicles.length > 0 ? `${Math.round((activeVehicles.length / vehicles.length) * 100)}%` : '0%'}
            </strong>
          </div>
        </Card>
      </div>

      {/* Operational Summary Bento Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="sm" onClick={() => onNavigate('fleet')} className="cursor-pointer hover:border-blue-500 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Veículos Disponíveis</span>
              <h3 className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {availableVehicles.length}
              </h3>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 flex justify-between">
            <span>Prontos para locação</span>
            <span className="text-blue-600 font-semibold">Ver Frota →</span>
          </div>
        </Card>

        <Card padding="sm" onClick={() => onNavigate('maintenance')} className="cursor-pointer hover:border-blue-500 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Em Manutenção</span>
              <h3 className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                {maintenanceVehicles.length}
              </h3>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl dark:bg-amber-950/60 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 flex justify-between">
            <span>Oficina & Reparos</span>
            <span className="text-blue-600 font-semibold">Ver Manutenção →</span>
          </div>
        </Card>

        <Card padding="sm" onClick={() => onNavigate('drivers')} className="cursor-pointer hover:border-blue-500 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Motoristas Ativos</span>
              <h3 className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {activeDriversCount} <span className="text-xs text-slate-400 font-normal">/ {drivers.length}</span>
              </h3>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl dark:bg-blue-950/60 dark:text-blue-400">
              <Car className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 flex justify-between">
            <span>Cadastrados no sistema</span>
            <span className="text-blue-600 font-semibold">Ver Motoristas →</span>
          </div>
        </Card>

        <Card padding="sm" onClick={() => onNavigate('contracts')} className="cursor-pointer hover:border-blue-500 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Contratos Ativos</span>
              <h3 className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {activeContractsCount} <span className="text-xs text-slate-400 font-normal">/ {contracts.length}</span>
              </h3>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl dark:bg-indigo-950/60 dark:text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 flex justify-between">
            <span>Locações vigentes</span>
            <span className="text-blue-600 font-semibold">Ver Contratos →</span>
          </div>
        </Card>
      </div>

      {/* Performance Metrics & Operational Health Widget */}
      <PerformanceMetricsWidget
        vehicles={vehicles}
        receivables={receivables}
        payables={payables}
        accounts={accounts}
      />

      {/* Central de Pendências Summary Widget */}
      <Card padding="none" className="border border-indigo-200/80 dark:border-indigo-900/50 shadow-sm overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/30 rounded-xl text-indigo-400 border border-indigo-500/30">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Central de Pendências & Alertas Operacionais
              </h3>
              <p className="text-[11px] text-slate-300">
                Consolidação de impedimentos, vencimentos de documentos, contratos e manutenções
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onNavigate('pendencias')}
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Abrir Central Completa ({pendings.length})
          </Button>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Pendente</span>
              <p className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">{pendings.length}</p>
            </div>
            <div className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-rose-600 uppercase">Críticas & Bloqueadores</span>
              <p className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                {pendings.filter(p => p.priority === 'P0' || p.priority === 'P1').length}
              </p>
            </div>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-amber-600 uppercase">Próximos Vencimentos</span>
              <p className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                {pendings.filter(p => p.priority === 'P2').length}
              </p>
            </div>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        </div>
      </Card>

      {/* Relatórios & Indicadores Gerenciais Quick Access */}
      <Card padding="none" className="border border-blue-200/80 dark:border-blue-900/50 shadow-sm overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/30 rounded-xl text-blue-400 border border-blue-500/30">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Relatórios e Indicadores Gerenciais (Fase 3.36)
              </h3>
              <p className="text-[11px] text-slate-300">
                Análise gerencial consolidada de frota, utilização, contratos, manutenções e compliance
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onNavigate('relatorios')}
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Abrir Relatórios Gerenciais
          </Button>
        </div>
      </Card>

      {/* Main Content Grid: Pending Receivables & Recent Financial Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Receivables to Liquidate */}
        <Card padding="none" className="flex flex-col">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Títulos a Receber Prioritários
            </h3>
            <button
              onClick={() => onNavigate('receivables')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 focus:outline-none focus:underline"
            >
              Ver Todos →
            </button>
          </div>

          <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-[360px]">
            {pendingReceivables.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Nenhum título pendente no momento.</p>
            ) : (
              pendingReceivables.slice(0, 5).map((rec) => {
                const isOverdue = rec.dueDate < new Date().toISOString().split('T')[0];
                return (
                  <div
                    key={rec.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{rec.description}</p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span>Venc: {rec.dueDate}</span>
                        {isOverdue && (
                          <Badge variant="danger">Em Atraso</Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        R$ {rec.balanceAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onOpenReceiptModal(rec)}
                        className="!bg-emerald-600 hover:!bg-emerald-700 !text-white"
                      >
                        Receber
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Recent Financial Transactions Extract */}
        <Card padding="none" className="flex flex-col">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-500" /> Extrato de Eventos Financeiros Recentes
            </h3>
            <button
              onClick={() => onNavigate('transactions')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 focus:outline-none focus:underline"
            >
              Extrato Completo →
            </button>
          </div>

          <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-[360px]">
            {transactions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Nenhuma transação registrada.</p>
            ) : (
              transactions.slice(0, 5).map((tx) => {
                const isIncome = tx.type === TransactionType.INCOME;
                const isExpense = tx.type === TransactionType.EXPENSE;

                return (
                  <div
                    key={tx.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-1.5 rounded-lg ${
                          isIncome
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : isExpense
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        }`}
                      >
                        {isIncome ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : isExpense ? (
                          <ArrowDownRight className="w-4 h-4" />
                        ) : (
                          <ArrowRightLeft className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{tx.description}</p>
                        <span className="text-[10px] text-slate-500">
                          Data: {tx.transactionDate} • {tx.type}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`font-mono font-bold tabular-nums text-xs ${
                        isIncome
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isExpense
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {isIncome ? '+' : isExpense ? '-' : ''} R${' '}
                      {tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

