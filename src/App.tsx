import React, { useEffect, useState } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard';
import { PendingCenterView } from './components/operations/PendingCenterView';
import { DocumentCenter } from './components/documents/DocumentCenter';
import { ManagementReportsView } from './components/reports/ManagementReportsView';
import { DailyOperationsView } from './components/operations/DailyOperationsView';
import { RentalLifecycleView } from './components/rental/RentalLifecycleView';
import { RentalControlCenterView } from './components/operations/RentalControlCenterView';
import { OperationalIncidentCenterView } from './components/incidents/OperationalIncidentCenterView';
import { OperationalTasksView } from './components/tasks/OperationalTasksView';
import { OperationalProductivityView } from './components/productivity/OperationalProductivityView';
import { ManagementGoalsView } from './components/goals/ManagementGoalsView';
import { ExecutiveDashboardView } from './components/executive/ExecutiveDashboardView';
import { ExecutiveOperationsCenterView } from './components/operations/ExecutiveOperationsCenterView';
import { DecisionManagementCenterView } from './components/decision-management/DecisionManagementCenterView';
import { PerformanceManagementCenterView } from './components/performance/PerformanceManagementCenterView';
import { GovernanceCenterView } from './components/governance/GovernanceCenterView';
import { PostGoLiveObservabilityView } from './components/observability/PostGoLiveObservabilityView';
import { ResilienceCenterView } from './components/resilience/ResilienceCenterView';
import { AdministrationCenterView } from './components/admin/AdministrationCenterView';
import { SystemHealthCenterView } from './components/admin/SystemHealthCenterView';
import { ReleaseGovernanceCenterView } from './components/release/ReleaseGovernanceCenterView';
import { IncidentManagementCenterView } from './components/incident-management/IncidentManagementCenterView';
import { SystemIntegrityAuditView } from './components/audit/SystemIntegrityAuditView';
import { EnterpriseConsolidationView } from './components/consolidation/EnterpriseConsolidationView';
import { OperationalWorkflowCenterView } from './components/workflow/OperationalWorkflowCenterView';
import { OperationalExecutionCenterView } from './components/execution/OperationalExecutionCenterView';
import { FleetManagement } from './components/fleet/FleetManagement';
import { FleetComplianceManagement } from './components/fleet/FleetComplianceManagement';
import { DriversManagement } from './components/drivers/DriversManagement';
import { ContractsManagement } from './components/contracts/ContractsManagement';
import { TrafficTicketsManagement } from './components/trafficTickets/TrafficTicketsManagement';
import { MaintenanceManagement } from './components/maintenance/MaintenanceManagement';
import { ReceivablesView } from './components/finance/ReceivablesView';
import { PayablesView } from './components/finance/PayablesView';
import { TransactionsView } from './components/finance/TransactionsView';
import { DREReportView } from './components/finance/DREReportView';
import { FinanceHubView } from './components/finance/FinanceHubView';
import { TestRunnerPanel } from './components/tests/TestRunnerPanel';

import { ReceiptModal } from './components/modals/ReceiptModal';
import { PaymentModal } from './components/modals/PaymentModal';
import { TransferModal } from './components/modals/TransferModal';
import { RenegotiationModal } from './components/modals/RenegotiationModal';

import { AccountReceivable, AccountPayable } from './types/entities';
import { seedAutoERPTestData } from './persistence/seed/seedData';
import { useAuth } from './hooks/useAuth';
import {
  AccountReceivableRepository,
  AccountPayableRepository,
  VehicleRepository,
  ContractRepository,
  MaintenanceRepository,
  VehicleDocumentRepository,
  DriverDocumentRepository,
  TrafficTicketRepository,
  DriverRepository,
  InsuranceRepository,
  TrackerRepository,
} from './persistence/repositories/localRepositories';
import { ObligationStatus } from './types/enums';
import { generateOperationalPendings } from './domain/operations/OperationalPendingService';

export default function App() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [testStatus, setTestStatus] = useState<{ passed: number; total: number; failed: number } | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Modals state
  const [selectedReceivableForReceipt, setSelectedReceivableForReceipt] = useState<AccountReceivable | null>(null);
  const [selectedPayableForPayment, setSelectedPayableForPayment] = useState<AccountPayable | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [selectedReceivablesForRenegotiation, setSelectedReceivablesForRenegotiation] = useState<AccountReceivable[]>([]);

  // Pending counts for sidebar badges
  const [pendingReceivablesCount, setPendingReceivablesCount] = useState<number>(0);
  const [pendingPayablesCount, setPendingPayablesCount] = useState<number>(0);
  const [pendingPendingsCount, setPendingPendingsCount] = useState<number>(0);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    // 1. Seed database if empty (non-destructive)
    await seedAutoERPTestData(false);

    // 2. Load counts for badges
    await refreshBadges();
  };

  const refreshBadges = async () => {
    const recRepo = new AccountReceivableRepository();
    const payRepo = new AccountPayableRepository();
    const vehRepo = new VehicleRepository();
    const contractRepo = new ContractRepository();
    const maintRepo = new MaintenanceRepository();
    const vehDocRepo = new VehicleDocumentRepository();
    const drvDocRepo = new DriverDocumentRepository();
    const ticketRepo = new TrafficTicketRepository();
    const drvRepo = new DriverRepository();
    const insRepo = new InsuranceRepository();
    const trackRepo = new TrackerRepository();

    const [recs, pays, vehicles, contracts, maintenances, vehicleDocuments, driverDocuments, tickets, drivers, insurances, trackers] = await Promise.all([
      recRepo.findAll({ companyId: user.companyId }),
      payRepo.findAll({ companyId: user.companyId }),
      vehRepo.findAll({ companyId: user.companyId }),
      contractRepo.findAll({ companyId: user.companyId }),
      maintRepo.findAll({ companyId: user.companyId }),
      vehDocRepo.findAll({ companyId: user.companyId }),
      drvDocRepo.findAll({ companyId: user.companyId }),
      ticketRepo.findAll({ companyId: user.companyId }),
      drvRepo.findAll({ companyId: user.companyId }),
      insRepo.findAll({ companyId: user.companyId }),
      trackRepo.findAll({ companyId: user.companyId }),
    ]);

    const pendingRecs = recs.filter((r) => r.status === ObligationStatus.PENDING || r.status === ObligationStatus.PARTIALLY_PAID);
    const pendingPays = pays.filter((p) => p.status === ObligationStatus.PENDING || p.status === ObligationStatus.PARTIALLY_PAID);

    setPendingReceivablesCount(pendingRecs.length);
    setPendingPayablesCount(pendingPays.length);

    const opPendings = generateOperationalPendings({
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
    setPendingPendingsCount(opPendings.length);
  };

  const handleResetSeedData = async () => {
    if (confirm('Deseja realmente reiniciar os dados de teste da base de dados?')) {
      await seedAutoERPTestData(true);
      await initApp();
      alert('Banco de dados do AutoERP restaurado com sucesso!');
    }
  };

  const handleTestsCompleted = (summary: { total: number; passed: number; failed: number }) => {
    setTestStatus({
      passed: summary.passed,
      total: summary.total,
      failed: summary.failed,
    });
  };

  const handleOperationSuccess = async () => {
    await refreshBadges();
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <Header
        testStatus={testStatus}
        onOpenTestRunner={() => setActiveTab('tests')}
        onResetSeedData={handleResetSeedData}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pendingReceivablesCount={pendingReceivablesCount}
          pendingPayablesCount={pendingPayablesCount}
          pendingPendingsCount={pendingPendingsCount}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Content View */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950">
          {activeTab === 'dashboard' && (
            <OverviewDashboard
              onNavigate={(tab) => setActiveTab(tab as any)}
              onOpenReceiptModal={(rec) => setSelectedReceivableForReceipt(rec)}
              onOpenPaymentModal={(pay) => setSelectedPayableForPayment(pay)}
              onOpenTransferModal={() => setIsTransferModalOpen(true)}
              onOpenTestRunner={() => setActiveTab('tests' as any)}
            />
          )}

          {activeTab === 'executive-operations' && (
            <ExecutiveOperationsCenterView />
          )}

          {activeTab === 'performance-management' && (
            <PerformanceManagementCenterView />
          )}

          {activeTab === 'decision-management' && (
            <DecisionManagementCenterView />
          )}

          {activeTab === 'executive' && (
            <div className="p-4 sm:p-6">
              <ExecutiveDashboardView
                companyId={user.companyId}
                onNavigate={(tab) => setActiveTab(tab as any)}
              />
            </div>
          )}

          {activeTab === 'governance' && (
            <div className="p-4 sm:p-6">
              <GovernanceCenterView
                companyId={user.companyId}
              />
            </div>
          )}

          {activeTab === 'observability' && (
            <PostGoLiveObservabilityView />
          )}

          {activeTab === 'resilience' && (
            <ResilienceCenterView />
          )}

          {activeTab === 'administration' && (
            <AdministrationCenterView />
          )}

          {activeTab === 'release-governance' && (
            <ReleaseGovernanceCenterView />
          )}

          {activeTab === 'incident-management' && (
            <IncidentManagementCenterView />
          )}

          {activeTab === 'system-integrity' && (
            <SystemIntegrityAuditView companyId={user.companyId} />
          )}

          {activeTab === 'enterprise-consolidation' && (
            <EnterpriseConsolidationView companyId={user.companyId} />
          )}

          {activeTab === 'workflow-center' && (
            <OperationalWorkflowCenterView />
          )}

          {activeTab === 'execution-center' && (
            <OperationalExecutionCenterView />
          )}

          {activeTab === 'system-health' && (
            <div className="p-4 sm:p-6">
              <SystemHealthCenterView companyId={user.companyId} />
            </div>
          )}

          {activeTab === 'operacao-diaria' && (
            <DailyOperationsView
              companyId={user.companyId}
              onNavigate={(tab) => setActiveTab(tab as any)}
            />
          )}

          {activeTab === 'ciclo-locacao' && (
            <RentalLifecycleView
              companyId={user.companyId}
              onNavigate={(tab) => setActiveTab(tab as any)}
            />
          )}

          {activeTab === 'central-controle' && (
            <RentalControlCenterView
              companyId={user.companyId}
              onNavigate={(tab) => setActiveTab(tab as any)}
            />
          )}

          {activeTab === 'central-incidentes' && (
            <OperationalIncidentCenterView
              companyId={user.companyId}
              onNavigate={(tab) => setActiveTab(tab as any)}
            />
          )}

          {activeTab === 'central-tarefas' && (
            <div className="p-4 sm:p-6">
              <OperationalTasksView
                companyId={user.companyId}
                onNavigate={(tab) => setActiveTab(tab as any)}
              />
            </div>
          )}

          {activeTab === 'produtividade' && (
            <div className="p-4 sm:p-6">
              <OperationalProductivityView
                companyId={user.companyId}
              />
            </div>
          )}

          {activeTab === 'metas' && (
            <div className="p-4 sm:p-6">
              <ManagementGoalsView
                companyId={user.companyId}
              />
            </div>
          )}

          {activeTab === 'documentos' && <DocumentCenter />}
          {activeTab === 'pendencias' && (
            <PendingCenterView
              companyId={user.companyId}
              onNavigate={(tab) => setActiveTab(tab as any)}
            />
          )}

          {activeTab === 'relatorios' && (
            <ManagementReportsView
              companyId={user.companyId}
              onNavigate={(tab) => setActiveTab(tab as any)}
            />
          )}

          {activeTab === 'fleet' && <FleetManagement />}

          {activeTab === 'compliance' && <FleetComplianceManagement />}

          {activeTab === 'drivers' && (
            <div className="p-4 sm:p-6">
              <DriversManagement
                companyId={user.companyId}
                onSelectVehicle={() => setActiveTab('fleet')}
              />
            </div>
          )}

          {activeTab === 'contracts' && (
            <ContractsManagement companyId={user.companyId} />
          )}

          {activeTab === 'trafficTickets' && (
            <TrafficTicketsManagement companyId={user.companyId} />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceManagement
              companyId={user.companyId}
              onOpenPaymentModal={(pay) => setSelectedPayableForPayment(pay)}
            />
          )}

          {activeTab === 'finance-overview' && (
            <FinanceHubView
              initialSubTab="overview"
              onOpenReceiptModal={(rec) => setSelectedReceivableForReceipt(rec)}
              onOpenPaymentModal={(pay) => setSelectedPayableForPayment(pay)}
              onOpenTransferModal={() => setIsTransferModalOpen(true)}
              onOpenRenegotiationModal={(recs) => setSelectedReceivablesForRenegotiation(recs)}
            />
          )}

          {activeTab === 'receivables' && (
            <FinanceHubView
              initialSubTab="receivables"
              onOpenReceiptModal={(rec) => setSelectedReceivableForReceipt(rec)}
              onOpenPaymentModal={(pay) => setSelectedPayableForPayment(pay)}
              onOpenTransferModal={() => setIsTransferModalOpen(true)}
              onOpenRenegotiationModal={(recs) => setSelectedReceivablesForRenegotiation(recs)}
            />
          )}

          {activeTab === 'payables' && (
            <FinanceHubView
              initialSubTab="payables"
              onOpenReceiptModal={(rec) => setSelectedReceivableForReceipt(rec)}
              onOpenPaymentModal={(pay) => setSelectedPayableForPayment(pay)}
              onOpenTransferModal={() => setIsTransferModalOpen(true)}
              onOpenRenegotiationModal={(recs) => setSelectedReceivablesForRenegotiation(recs)}
            />
          )}

          {activeTab === 'transactions' && (
            <FinanceHubView
              initialSubTab="transactions"
              onOpenReceiptModal={(rec) => setSelectedReceivableForReceipt(rec)}
              onOpenPaymentModal={(pay) => setSelectedPayableForPayment(pay)}
              onOpenTransferModal={() => setIsTransferModalOpen(true)}
              onOpenRenegotiationModal={(recs) => setSelectedReceivablesForRenegotiation(recs)}
            />
          )}

          {activeTab === 'dre' && (
            <FinanceHubView
              initialSubTab="dre"
              onOpenReceiptModal={(rec) => setSelectedReceivableForReceipt(rec)}
              onOpenPaymentModal={(pay) => setSelectedPayableForPayment(pay)}
              onOpenTransferModal={() => setIsTransferModalOpen(true)}
              onOpenRenegotiationModal={(recs) => setSelectedReceivablesForRenegotiation(recs)}
            />
          )}

          {activeTab === 'tests' && <TestRunnerPanel onTestsCompleted={handleTestsCompleted} />}
        </main>
      </div>

      {/* Modals */}
      <ReceiptModal
        isOpen={!!selectedReceivableForReceipt}
        onClose={() => setSelectedReceivableForReceipt(null)}
        receivable={selectedReceivableForReceipt}
        onSuccess={handleOperationSuccess}
      />

      <PaymentModal
        isOpen={!!selectedPayableForPayment}
        onClose={() => setSelectedPayableForPayment(null)}
        payable={selectedPayableForPayment}
        onSuccess={handleOperationSuccess}
      />

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onSuccess={handleOperationSuccess}
      />

      <RenegotiationModal
        isOpen={selectedReceivablesForRenegotiation.length > 0}
        onClose={() => setSelectedReceivablesForRenegotiation([])}
        receivables={selectedReceivablesForRenegotiation}
        onSuccess={handleOperationSuccess}
      />
    </div>
  );
}
