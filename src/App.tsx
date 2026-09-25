import React, { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { Header } from './components/layout/Header';
import { LazyModuleErrorBoundary } from './components/common/LazyModuleErrorBoundary';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { AccountReceivable, AccountPayable } from './types/entities';
import { useAuth } from './hooks/useAuth';
import type { NotificationItem } from './api/notificationClient';
import { clearAllUnsavedChanges, confirmDiscardUnsavedChanges, installUnsavedChangesBeforeUnload } from './app/unsavedChangesAuthority';

const OverviewDashboard=lazy(()=>import('./components/dashboard/OverviewDashboard').then(module=>({default:module.OverviewDashboard})));
const PendingCenterView=lazy(()=>import('./components/operations/PendingCenterView').then(module=>({default:module.PendingCenterView})));
const DocumentCenter=lazy(()=>import('./components/documents/DocumentCenter').then(module=>({default:module.DocumentCenter})));
const ManagementReportsView=lazy(()=>import('./components/reports/ManagementReportsView').then(module=>({default:module.ManagementReportsView})));
const DailyOperationsView=lazy(()=>import('./components/operations/DailyOperationsView').then(module=>({default:module.DailyOperationsView})));
const RentalLifecycleView=lazy(()=>import('./components/rental/RentalLifecycleView').then(module=>({default:module.RentalLifecycleView})));
const RentalControlCenterView=lazy(()=>import('./components/operations/RentalControlCenterView').then(module=>({default:module.RentalControlCenterView})));
const OperationalIncidentCenterView=lazy(()=>import('./components/incidents/OperationalIncidentCenterView').then(module=>({default:module.OperationalIncidentCenterView})));
const OperationalTasksView=lazy(()=>import('./components/tasks/OperationalTasksView').then(module=>({default:module.OperationalTasksView})));
const OperationalProductivityView=lazy(()=>import('./components/productivity/OperationalProductivityView').then(module=>({default:module.OperationalProductivityView})));
const ManagementGoalsView=lazy(()=>import('./components/goals/ManagementGoalsView').then(module=>({default:module.ManagementGoalsView})));
const ExecutiveDashboardView=lazy(()=>import('./components/executive/ExecutiveDashboardView').then(module=>({default:module.ExecutiveDashboardView})));
const ExecutiveOperationsCenterView=lazy(()=>import('./components/operations/ExecutiveOperationsCenterView').then(module=>({default:module.ExecutiveOperationsCenterView})));
const DecisionManagementCenterView=lazy(()=>import('./components/decision-management/DecisionManagementCenterView').then(module=>({default:module.DecisionManagementCenterView})));
const PerformanceManagementCenterView=lazy(()=>import('./components/performance/PerformanceManagementCenterView').then(module=>({default:module.PerformanceManagementCenterView})));
const GovernanceCenterView=lazy(()=>import('./components/governance/GovernanceCenterView').then(module=>({default:module.GovernanceCenterView})));
const PostGoLiveObservabilityView=lazy(()=>import('./components/observability/PostGoLiveObservabilityView').then(module=>({default:module.PostGoLiveObservabilityView})));
const ResilienceCenterView=lazy(()=>import('./components/resilience/ResilienceCenterView').then(module=>({default:module.ResilienceCenterView})));
const AdministrationCenterView=lazy(()=>import('./components/admin/AdministrationCenterView').then(module=>({default:module.AdministrationCenterView})));
const SystemHealthCenterView=lazy(()=>import('./components/admin/SystemHealthCenterView').then(module=>({default:module.SystemHealthCenterView})));
const ReleaseGovernanceCenterView=lazy(()=>import('./components/release/ReleaseGovernanceCenterView').then(module=>({default:module.ReleaseGovernanceCenterView})));
const IncidentManagementCenterView=lazy(()=>import('./components/incident-management/IncidentManagementCenterView').then(module=>({default:module.IncidentManagementCenterView})));
const SystemIntegrityAuditView=lazy(()=>import('./components/audit/SystemIntegrityAuditView').then(module=>({default:module.SystemIntegrityAuditView})));
const EnterpriseConsolidationView=lazy(()=>import('./components/consolidation/EnterpriseConsolidationView').then(module=>({default:module.EnterpriseConsolidationView})));
const OperationalWorkflowCenterView=lazy(()=>import('./components/workflow/OperationalWorkflowCenterView').then(module=>({default:module.OperationalWorkflowCenterView})));
const OperationalExecutionCenterView=lazy(()=>import('./components/execution/OperationalExecutionCenterView').then(module=>({default:module.OperationalExecutionCenterView})));
const FleetManagement=lazy(()=>import('./components/fleet/FleetManagement').then(module=>({default:module.FleetManagement})));
const FleetComplianceManagement=lazy(()=>import('./components/fleet/FleetComplianceManagement').then(module=>({default:module.FleetComplianceManagement})));
const TelemetryKmDivergenceOverview=lazy(()=>import('./components/fleet/TelemetryKmDivergenceOverview').then(module=>({default:module.TelemetryKmDivergenceOverview})));
const TelemetrySanitizedLocationOverview=lazy(()=>import('./components/fleet/TelemetrySanitizedLocationOverview').then(module=>({default:module.TelemetrySanitizedLocationOverview})));
const DriversManagement=lazy(()=>import('./components/drivers/DriversManagement').then(module=>({default:module.DriversManagement})));
const ContractsManagement=lazy(()=>import('./components/contracts/ContractsManagement').then(module=>({default:module.ContractsManagement})));
const TrafficTicketsManagement=lazy(()=>import('./components/trafficTickets/TrafficTicketsManagement').then(module=>({default:module.TrafficTicketsManagement})));
const MaintenanceManagement=lazy(()=>import('./components/maintenance/MaintenanceManagement').then(module=>({default:module.MaintenanceManagement})));
const FinanceHubView=lazy(()=>import('./components/finance/FinanceHubView').then(module=>({default:module.FinanceHubView})));
const TestRunnerPanel=lazy(()=>import('./components/tests/TestRunnerPanel').then(module=>({default:module.TestRunnerPanel})));
const ReceiptModal=lazy(()=>import('./components/modals/ReceiptModal').then(module=>({default:module.ReceiptModal})));
const PaymentModal=lazy(()=>import('./components/modals/PaymentModal').then(module=>({default:module.PaymentModal})));
const TransferModal=lazy(()=>import('./components/modals/TransferModal').then(module=>({default:module.TransferModal})));
const RenegotiationModal=lazy(()=>import('./components/modals/RenegotiationModal').then(module=>({default:module.RenegotiationModal})));

export default function App(){
  const {user}=useAuth();const [activeTab,setActiveTab]=useState<NavigationTab>('dashboard');const [testStatus,setTestStatus]=useState<{passed:number;total:number;failed:number}|null>(null);const [isMobileSidebarOpen,setIsMobileSidebarOpen]=useState(false);
  const [selectedReceivableForReceipt,setSelectedReceivableForReceipt]=useState<AccountReceivable|null>(null),[selectedPayableForPayment,setSelectedPayableForPayment]=useState<AccountPayable|null>(null),[isTransferModalOpen,setIsTransferModalOpen]=useState(false),[selectedReceivablesForRenegotiation,setSelectedReceivablesForRenegotiation]=useState<AccountReceivable[]>([]);
  const [pendingReceivablesCount,setPendingReceivablesCount]=useState(0),[pendingPayablesCount,setPendingPayablesCount]=useState(0),[pendingPendingsCount,setPendingPendingsCount]=useState(0);
  const [documentFocusFileName,setDocumentFocusFileName]=useState<string|null>(null);
  const [settlementRefreshVersion,setSettlementRefreshVersion]=useState(0);
  const badgesRequestVersionRef=useRef(0),activeCompanyIdRef=useRef<string|undefined>(user?.companyId);activeCompanyIdRef.current=user?.companyId;
  const requestTabChange=(tab:NavigationTab):boolean=>{
    if(tab===activeTab)return true;
    if(!confirmDiscardUnsavedChanges())return false;
    clearAllUnsavedChanges();
    setActiveTab(tab);
    return true;
  };
  const clearBadgeState=()=>{setPendingReceivablesCount(0);setPendingPayablesCount(0);setPendingPendingsCount(0);};

  useEffect(()=>installUnsavedChangesBeforeUnload(),[]);
  useEffect(()=>{clearAllUnsavedChanges();},[user?.companyId]);
    useEffect(()=>{const requestVersion=++badgesRequestVersionRef.current,companyIdSnapshot=user?.companyId;clearBadgeState();if(companyIdSnapshot)void refreshBadges(companyIdSnapshot,requestVersion);return()=>{badgesRequestVersionRef.current+=1;};},[user?.companyId]);
  const refreshBadges=async(companyIdSnapshot:string,requestVersion:number)=>{
    const requestStillCurrent=()=>requestVersion===badgesRequestVersionRef.current&&activeCompanyIdRef.current===companyIdSnapshot;
    const {loadNavigationBadgeCounts}=await import('./app/navigationBadgeLoader');
    if(!requestStillCurrent())return;
    const counts=await loadNavigationBadgeCounts(companyIdSnapshot,requestStillCurrent);
    if(!counts||!requestStillCurrent())return;
    setPendingReceivablesCount(counts.pendingReceivablesCount);setPendingPayablesCount(counts.pendingPayablesCount);setPendingPendingsCount(counts.pendingPendingsCount);
  };
  const handleOperationSuccess=async()=>{const companyIdSnapshot=activeCompanyIdRef.current,requestVersion=++badgesRequestVersionRef.current;if(!companyIdSnapshot){clearBadgeState();return;}await refreshBadges(companyIdSnapshot,requestVersion);};
  const handleSettlementSuccess=()=>{
    // Remount only the visible read-model after the server confirms the command.
    // FinanceHub keeps its current subtab; every view reloads from its existing API.
    setSettlementRefreshVersion(version=>version+1);
    void handleOperationSuccess().catch(error=>console.error('Settlement badge refresh failed',error));
  };
  const handleResolveNotification=async(item:NotificationItem)=>{
    if(item.entityType==='Document'&&item.entityId){
      try{
        const [{DocumentClient},{AttachmentClient}]=await Promise.all([
          import('./api/documentClient'),
          import('./api/attachmentClient'),
        ]);
        const document=await DocumentClient.get(item.entityId);
        if(document.attachmentId){
          const attachment=await AttachmentClient.get(document.attachmentId);
          setDocumentFocusFileName(attachment.fileName);
        }else{
          setDocumentFocusFileName(null);
        }
      }catch{
        setDocumentFocusFileName(null);
      }
      requestTabChange('documentos');
      return;
    }
    setDocumentFocusFileName(null);
    if(item.entityType==='Insurance'){requestTabChange('compliance');return;}
    if(item.entityType==='MaintenancePlan'){requestTabChange('maintenance');return;}
    requestTabChange('pendencias');
  };

  const financeModalResetKey=selectedReceivableForReceipt?'receipt':selectedPayableForPayment?'payment':isTransferModalOpen?'transfer':selectedReceivablesForRenegotiation.length>0?'renegotiation':'none';

  return <div className="h-full min-h-0 overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
    <Header testStatus={testStatus} onOpenTestRunner={()=>requestTabChange('tests')} onToggleMobileSidebar={()=>setIsMobileSidebarOpen(prev=>!prev)} onResolveNotification={handleResolveNotification}/>
    <div className="flex-1 min-h-0 flex overflow-hidden"><Sidebar activeTab={activeTab} onTabChange={requestTabChange} pendingReceivablesCount={pendingReceivablesCount} pendingPayablesCount={pendingPayablesCount} pendingPendingsCount={pendingPendingsCount} isMobileOpen={isMobileSidebarOpen} onCloseMobile={()=>setIsMobileSidebarOpen(false)}/>
      <main className="app-content-scrollbar flex-1 min-h-0 overflow-y-scroll overflow-x-hidden bg-slate-50/50 dark:bg-slate-950"><LazyModuleErrorBoundary resetKey={activeTab} onRetry={()=>window.location.reload()}><Suspense fallback={<div className="p-6 text-sm text-slate-500">Carregando módulo...</div>}>
        {activeTab==='dashboard'&&<OverviewDashboard key={settlementRefreshVersion} onNavigate={tab=>requestTabChange(tab as NavigationTab)} onOpenReceiptModal={setSelectedReceivableForReceipt} onOpenPaymentModal={setSelectedPayableForPayment} onOpenTransferModal={()=>setIsTransferModalOpen(true)} onOpenTestRunner={()=>requestTabChange('tests')}/>}
        {activeTab==='executive-operations'&&<ExecutiveOperationsCenterView/>}
        {activeTab==='performance-management'&&<PerformanceManagementCenterView/>}
        {activeTab==='decision-management'&&<DecisionManagementCenterView/>}
        {activeTab==='executive'&&<div className="p-4 sm:p-6"><ExecutiveDashboardView companyId={user.companyId} onNavigate={tab=>requestTabChange(tab as NavigationTab)}/></div>}
        {activeTab==='governance'&&<div className="p-4 sm:p-6"><GovernanceCenterView companyId={user.companyId}/></div>}
        {activeTab==='observability'&&<PostGoLiveObservabilityView/>}{activeTab==='resilience'&&<ResilienceCenterView/>}
        {activeTab==='administration'&&<AdministrationCenterView companyId={user.companyId} currentUserId={user.userId} currentUserRole={user.role}/>} 
        {activeTab==='release-governance'&&<ReleaseGovernanceCenterView/>}{activeTab==='incident-management'&&<IncidentManagementCenterView/>}
        {activeTab==='system-integrity'&&<SystemIntegrityAuditView companyId={user.companyId}/>} {activeTab==='enterprise-consolidation'&&<EnterpriseConsolidationView companyId={user.companyId}/>} 
        {activeTab==='workflow-center'&&<OperationalWorkflowCenterView/>}{activeTab==='execution-center'&&<OperationalExecutionCenterView/>}
        {activeTab==='system-health'&&<div className="p-4 sm:p-6"><SystemHealthCenterView companyId={user.companyId}/></div>}
        {activeTab==='operacao-diaria'&&<DailyOperationsView companyId={user.companyId} onNavigate={tab=>requestTabChange(tab as NavigationTab)}/>} 
        {activeTab==='ciclo-locacao'&&<RentalLifecycleView companyId={user.companyId} onNavigate={tab=>requestTabChange(tab as NavigationTab)}/>} 
        {activeTab==='central-controle'&&<RentalControlCenterView companyId={user.companyId} onNavigate={tab=>requestTabChange(tab as NavigationTab)}/>} 
        {activeTab==='central-incidentes'&&<OperationalIncidentCenterView companyId={user.companyId} onNavigate={tab=>requestTabChange(tab as NavigationTab)}/>} 
        {activeTab==='central-tarefas'&&<div className="p-4 sm:p-6"><OperationalTasksView companyId={user.companyId} onNavigate={tab=>requestTabChange(tab as NavigationTab)}/></div>}
        {activeTab==='produtividade'&&<div className="p-4 sm:p-6"><OperationalProductivityView companyId={user.companyId}/></div>}
        {activeTab==='metas'&&<div className="p-4 sm:p-6"><ManagementGoalsView companyId={user.companyId}/></div>}
        {activeTab==='documentos'&&<DocumentCenter focusFileName={documentFocusFileName||undefined} onFocusConsumed={()=>setDocumentFocusFileName(null)}/>}{activeTab==='pendencias'&&<PendingCenterView companyId={user.companyId} onNavigate={tab=>requestTabChange(tab as NavigationTab)}/>} 
        {activeTab==='relatorios'&&<ManagementReportsView companyId={user.companyId} onNavigate={tab=>requestTabChange(tab as NavigationTab)}/>} 
        {activeTab==='fleet'&&<FleetManagement/>}{activeTab==='compliance'&&<><TelemetryKmDivergenceOverview/><TelemetrySanitizedLocationOverview/><FleetComplianceManagement/></>}
        {activeTab==='drivers'&&<div className="p-4 sm:p-6"><DriversManagement companyId={user.companyId} onSelectVehicle={()=>requestTabChange('fleet')}/></div>}
        {activeTab==='contracts'&&<ContractsManagement companyId={user.companyId}/>} {activeTab==='trafficTickets'&&<TrafficTicketsManagement companyId={user.companyId}/>} 
        {activeTab==='maintenance'&&<MaintenanceManagement key={settlementRefreshVersion} companyId={user.companyId} onOpenPaymentModal={setSelectedPayableForPayment}/>}
        {activeTab==='finance-overview'&&<FinanceHubView refreshVersion={settlementRefreshVersion} initialSubTab="overview" onOpenReceiptModal={setSelectedReceivableForReceipt} onOpenPaymentModal={setSelectedPayableForPayment} onOpenTransferModal={()=>setIsTransferModalOpen(true)} onOpenRenegotiationModal={setSelectedReceivablesForRenegotiation}/>}
        {activeTab==='receivables'&&<FinanceHubView refreshVersion={settlementRefreshVersion} initialSubTab="receivables" onOpenReceiptModal={setSelectedReceivableForReceipt} onOpenPaymentModal={setSelectedPayableForPayment} onOpenTransferModal={()=>setIsTransferModalOpen(true)} onOpenRenegotiationModal={setSelectedReceivablesForRenegotiation}/>}
        {activeTab==='payables'&&<FinanceHubView refreshVersion={settlementRefreshVersion} initialSubTab="payables" onOpenReceiptModal={setSelectedReceivableForReceipt} onOpenPaymentModal={setSelectedPayableForPayment} onOpenTransferModal={()=>setIsTransferModalOpen(true)} onOpenRenegotiationModal={setSelectedReceivablesForRenegotiation}/>}
        {activeTab==='transactions'&&<FinanceHubView refreshVersion={settlementRefreshVersion} initialSubTab="transactions" onOpenReceiptModal={setSelectedReceivableForReceipt} onOpenPaymentModal={setSelectedPayableForPayment} onOpenTransferModal={()=>setIsTransferModalOpen(true)} onOpenRenegotiationModal={setSelectedReceivablesForRenegotiation}/>}
        {activeTab==='cashflow'&&<FinanceHubView initialSubTab="cashflow" refreshVersion={settlementRefreshVersion} onOpenReceiptModal={setSelectedReceivableForReceipt} onOpenPaymentModal={setSelectedPayableForPayment} onOpenTransferModal={()=>setIsTransferModalOpen(true)} onOpenRenegotiationModal={setSelectedReceivablesForRenegotiation}/>}
        {activeTab==='dre'&&<FinanceHubView refreshVersion={settlementRefreshVersion} initialSubTab="dre" onOpenReceiptModal={setSelectedReceivableForReceipt} onOpenPaymentModal={setSelectedPayableForPayment} onOpenTransferModal={()=>setIsTransferModalOpen(true)} onOpenRenegotiationModal={setSelectedReceivablesForRenegotiation}/>}
        {activeTab==='tests'&&<TestRunnerPanel onTestsCompleted={setTestStatus}/>} 
      </Suspense></LazyModuleErrorBoundary></main>
    </div>
    <LazyModuleErrorBoundary resetKey={financeModalResetKey} onRetry={()=>window.location.reload()}><Suspense fallback={null}>
      {selectedReceivableForReceipt&&<ReceiptModal isOpen onClose={()=>setSelectedReceivableForReceipt(null)} receivable={selectedReceivableForReceipt} onSuccess={handleSettlementSuccess}/>}
      {selectedPayableForPayment&&<PaymentModal isOpen onClose={()=>setSelectedPayableForPayment(null)} payable={selectedPayableForPayment} onSuccess={handleSettlementSuccess}/>}
      {isTransferModalOpen&&<TransferModal isOpen onClose={()=>setIsTransferModalOpen(false)} onSuccess={handleOperationSuccess}/>}
      {selectedReceivablesForRenegotiation.length>0&&<RenegotiationModal isOpen onClose={()=>setSelectedReceivablesForRenegotiation([])} receivables={selectedReceivablesForRenegotiation} onSuccess={handleOperationSuccess}/>}
    </Suspense></LazyModuleErrorBoundary>
  </div>;
}
