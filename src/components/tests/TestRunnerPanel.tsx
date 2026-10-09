import React, { useState, useEffect } from 'react';
import { FinanceTestRunner, TestResultItem } from '../../domain/finance/__tests__/financeTestRunner';
import { DriverTestRunner } from '../../domain/services/__tests__/driverTestRunner';
import { ContractTestRunner } from '../../domain/services/__tests__/contractTestRunner';
import { MaintenanceTestRunner } from '../../domain/services/__tests__/maintenanceTestRunner';
import { ComplianceTestRunner } from '../../domain/services/__tests__/complianceTestRunner';
import { SecurityTestRunner } from '../../domain/services/__tests__/securityTestRunner';
import { PersistenceTestRunner } from '../../domain/services/__tests__/persistenceTestRunner';
import { AnalyticsTestRunner } from '../../domain/services/__tests__/analyticsTestRunner';
import { PredictiveTestRunner } from '../../domain/services/__tests__/predictiveTestRunner';
import { AIGovernanceTestRunner } from '../../domain/services/__tests__/aiGovernanceTestRunner';
import { MLOpsTestRunner } from '../../domain/services/__tests__/mlopsTestRunner';
import { APIIntegrationTestRunner } from '../../domain/services/__tests__/apiIntegrationTestRunner';
import { EcosystemIntegrationTestRunner } from '../../domain/services/__tests__/ecosystemIntegrationTestRunner';
import { EcosystemGovernanceTestRunner } from '../../domain/services/__tests__/ecosystemGovernanceTestRunner';
import { FinalOperationalHomologationTestRunner } from '../../domain/services/__tests__/finalOperationalHomologationTestRunner';
import { ManagementReportsTestRunner } from '../../domain/reports/ManagementReportsService.test';
import { DailyOperationsTestRunner } from '../../domain/operations/DailyOperationsService.test';
import { RentalLifecycleTestRunner } from '../../domain/rental/RentalLifecycleService.test';
import { RentalControlTestRunner } from '../../domain/operations/RentalControlCenterService.test';
import { OperationalIncidentTestRunner } from '../../domain/incidents/OperationalIncidentService.test';
import { OperationalTaskTestRunner } from '../../domain/tasks/OperationalTaskService.test';
import { OperationalProductivityTestRunner } from '../../domain/productivity/OperationalProductivityService.test';
import { ManagementGoalsTestRunner } from '../../domain/goals/ManagementGoalsService.test';
import { ExecutiveManagementTestRunner } from '../../domain/executive/ExecutiveManagementService.test';
import { GovernanceAuditTestRunner } from '../../domain/governance/GovernanceAuditService.test';
import { PostGoLiveObservabilityTestRunner } from '../../domain/observability/PostGoLiveObservabilityService.test';
import { BackupServiceTestRunner } from '../../domain/resilience/BackupService.test';
import { ProductionAdministrationTestRunner } from '../../domain/admin/ProductionAdministrationService.test';
import { SystemHealthTestRunner } from '../../domain/admin/SystemHealthService.test';
import { SecurityAdministrationTestRunner } from '../../domain/admin/SecurityAdministrationService.test';
import { TenantConfigurationTestRunner } from '../../domain/admin/TenantConfigurationService.test';
import { runReleaseManagementServiceTests } from '../../domain/release/ReleaseManagementService.test';
import { runChangeManagementServiceTests } from '../../domain/release/ChangeManagementService.test';
import { runConfigurationGovernanceServiceTests } from '../../domain/release/ConfigurationGovernanceService.test';
import { runFeatureFlagServiceTests } from '../../domain/release/FeatureFlagService.test';
import { runIncidentManagementServiceTests } from '../../domain/incident-management/IncidentManagementService.test';
import { runProblemManagementServiceTests } from '../../domain/incident-management/ProblemManagementService.test';
import { runIncidentMetricsServiceTests } from '../../domain/incident-management/IncidentMetricsService.test';
import { SystemIntegrityTestRunner } from '../../domain/audit/SystemIntegrityAuditService.test';
import { EnterpriseConsolidationTestRunner } from '../../domain/consolidation/EnterpriseConsolidationService.test';
import { EnterpriseWorkflowTestRunner } from '../../domain/workflow/EnterpriseWorkflowTestRunner';
import { EnterpriseExecutionTestRunner } from '../../domain/execution/EnterpriseExecutionTestRunner';
import { OperationsExecutiveTestRunner } from '../../domain/operations/OperationsExecutiveTestRunner';
import { DecisionManagementTestRunner } from '../../domain/decision-management/DecisionManagementTestRunner';
import { EnterprisePerformanceTestRunner } from '../../domain/performance/EnterprisePerformanceTestRunner';
import { ShieldCheck, Play, CheckCircle2, XCircle, RefreshCw, Search } from 'lucide-react';
import { Card, Button, Badge, Input, Skeleton } from '../ui';

interface TestRunnerPanelProps {
  onTestsCompleted?: (summary: { total: number; passed: number; failed: number }) => void;
}

export const TestRunnerPanel: React.FC<TestRunnerPanelProps> = ({ onTestsCompleted }) => {
  const [testSummary, setTestSummary] = useState<{
    total: number;
    passed: number;
    failed: number;
    results: TestResultItem[];
  } | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASSED' | 'FAILED'>('ALL');

  useEffect(() => {
    executeSuite();
  }, []);

  const executeSuite = async () => {
    setIsRunning(true);
    try {
      const financeSummary = await FinanceTestRunner.runAllTests();
      const driverSummary = await DriverTestRunner.runAllTests();
      const contractSummary = await ContractTestRunner.runAllTests();
      const maintenanceSummary = await MaintenanceTestRunner.runAllTests();
      const complianceSummary = await ComplianceTestRunner.runAllTests();
      const securitySummary = await SecurityTestRunner.runAllTests();
      const persistenceSummary = await PersistenceTestRunner.runAllTests();
      const analyticsSummary = await AnalyticsTestRunner.runAllTests();
      const predictiveSummary = await PredictiveTestRunner.runAllTests();
      const aiGovSummary = await AIGovernanceTestRunner.runAllTests();
      const mlopsSummary = await MLOpsTestRunner.runAllTests();
      const apiIntegrationSummary = await APIIntegrationTestRunner.runAllTests();
      const ecosystemSummary = await EcosystemIntegrationTestRunner.runAllTests();
      const ecosystemGovSummary = await EcosystemGovernanceTestRunner.runAllTests();
      const finalHomologationSummary = await FinalOperationalHomologationTestRunner.runAllTests();
      const managementReportsSummary = await ManagementReportsTestRunner.runAllTests();
      const dailyOpsSummary = await DailyOperationsTestRunner.runAllTests();
      const rentalLifecycleSummary = await RentalLifecycleTestRunner.runAllTests();
      const rentalControlSummary = await RentalControlTestRunner.runAllTests();
      const operationalIncidentSummary = await OperationalIncidentTestRunner.runAllTests();
      const operationalTaskSummary = await OperationalTaskTestRunner.runAllTests();
      const productivitySummary = await OperationalProductivityTestRunner.runAllTests();
      const goalsSummary = await ManagementGoalsTestRunner.runAllTests();
      const executiveSummary = await ExecutiveManagementTestRunner.runAllTests();
      const governanceSummary = await GovernanceAuditTestRunner.runAllTests();
      const observabilitySummary = await PostGoLiveObservabilityTestRunner.runAllTests();
      const resilienceSummary = await BackupServiceTestRunner.runAllTests();
      const prodAdminSummary = await ProductionAdministrationTestRunner.runAllTests();
      const sysHealthSummary = await SystemHealthTestRunner.runAllTests();
      const secAdminSummary = await SecurityAdministrationTestRunner.runAllTests();
      const tenantCfgSummary = await TenantConfigurationTestRunner.runAllTests();

      const releaseMgmtRes = await runReleaseManagementServiceTests();
      const changeMgmtRes = await runChangeManagementServiceTests();
      const configGovRes = await runConfigurationGovernanceServiceTests();
      const featureFlagRes = await runFeatureFlagServiceTests();

      const incidentMgmtRes = await runIncidentManagementServiceTests();
      const problemMgmtRes = await runProblemManagementServiceTests();
      const incidentMetricsRes = await runIncidentMetricsServiceTests();

      const sysIntegritySummary = await SystemIntegrityTestRunner.runAllTests();
      const consolidationSummary = await EnterpriseConsolidationTestRunner.runAllTests();
      const workflowSummary = await EnterpriseWorkflowTestRunner.runAllTests();
      const workflowCombinedResults = [
        ...workflowSummary.adversarialResults.map(r => ({ id: r.id, name: r.name, passed: r.passed, message: r.message })),
        ...workflowSummary.e2eResults.map(r => ({ id: r.id, name: r.name, passed: r.passed, message: r.message }))
      ];

      const executionSummary = await EnterpriseExecutionTestRunner.runAllTests();
      const executionCombinedResults = [
        ...executionSummary.adversarialResults.map(r => ({ id: r.id, name: r.name, passed: r.passed, message: r.message })),
        ...executionSummary.e2eResults.map(r => ({ id: r.id, name: r.name, passed: r.passed, message: r.message })),
        ...executionSummary.financialResults.map(r => ({ id: r.id, name: r.name, passed: r.passed, message: r.message }))
      ];

      const opsExecutiveSummary = await OperationsExecutiveTestRunner.runAllTests();
      const opsExecutiveCombinedResults = opsExecutiveSummary.results.map(r => ({
        id: r.id,
        name: r.name,
        passed: r.status === 'PASSED',
        message: r.message || 'Sucesso',
      }));

      const decisionManagementSummary = await DecisionManagementTestRunner.runAllTests();
      const decisionManagementCombinedResults = [
        {
          id: 'TEST-3.59-UNIT',
          name: decisionManagementSummary.unitTests.suiteName,
          passed: decisionManagementSummary.unitTests.failed === 0,
          message: `${decisionManagementSummary.unitTests.passed}/${decisionManagementSummary.unitTests.total} testes unitários aprovados`,
        },
        {
          id: 'TEST-3.59-ADV',
          name: decisionManagementSummary.adversarialTests.suiteName,
          passed: decisionManagementSummary.adversarialTests.failed === 0,
          message: `${decisionManagementSummary.adversarialTests.passed}/${decisionManagementSummary.adversarialTests.total} testes adversariais aprovados`,
        },
        {
          id: 'TEST-3.59-E2E',
          name: decisionManagementSummary.e2eTests.suiteName,
          passed: decisionManagementSummary.e2eTests.failed === 0,
          message: `${decisionManagementSummary.e2eTests.passed}/${decisionManagementSummary.e2eTests.total} testes E2E aprovados`,
        },
        {
          id: 'TEST-3.59-FIN',
          name: decisionManagementSummary.financialProtectionTest.suiteName,
          passed: decisionManagementSummary.financialProtectionTest.failed === 0,
          message: 'Núcleo financeiro 100% congelado e protegido',
        },
      ];

      const performanceSummary = await EnterprisePerformanceTestRunner.runAllTests();
      const performanceCombinedResults = [
        {
          id: 'TEST-3.60-UNIT',
          name: performanceSummary.unitTests.suiteName,
          passed: performanceSummary.unitTests.failed === 0,
          message: `${performanceSummary.unitTests.passed}/${performanceSummary.unitTests.total} testes unitários aprovados`,
        },
        {
          id: 'TEST-3.60-ADV',
          name: performanceSummary.adversarialTests.suiteName,
          passed: performanceSummary.adversarialTests.failed === 0,
          message: `${performanceSummary.adversarialTests.passed}/${performanceSummary.adversarialTests.total} testes adversariais aprovados`,
        },
        {
          id: 'TEST-3.60-E2E',
          name: performanceSummary.e2eTests.suiteName,
          passed: performanceSummary.e2eTests.failed === 0,
          message: `${performanceSummary.e2eTests.passed}/${performanceSummary.e2eTests.total} testes E2E aprovados`,
        },
        {
          id: 'TEST-3.60-FIN',
          name: performanceSummary.financialProtectionTest.suiteName,
          passed: performanceSummary.financialProtectionTest.failed === 0,
          message: 'Núcleo financeiro 100% congelado e inalterado na Fase 3.60',
        },
      ];

      const combinedResults: TestResultItem[] = [
        ...financeSummary.results,
        ...driverSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...contractSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...maintenanceSummary.results.map((r, idx) => ({
          id: `maint-${idx}`,
          name: r.name,
          passed: r.passed,
          message: r.error || 'Sucesso',
        })),
        ...complianceSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...securitySummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...persistenceSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...analyticsSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...predictiveSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...aiGovSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...mlopsSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...apiIntegrationSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...ecosystemSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...ecosystemGovSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...finalHomologationSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...managementReportsSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...dailyOpsSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...rentalLifecycleSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...rentalControlSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...operationalIncidentSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...operationalTaskSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...productivitySummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...goalsSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...executiveSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...governanceSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...observabilitySummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...resilienceSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...prodAdminSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...sysHealthSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...secAdminSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        ...tenantCfgSummary.results.map((r) => ({
          id: r.id,
          name: r.name,
          passed: r.passed,
          message: r.message,
        })),
        {
          id: 'test-f352-release-mgmt',
          name: 'Fase 3.52 — Release Management & State Machine',
          passed: releaseMgmtRes.passed,
          message: releaseMgmtRes.logs.join(' | '),
        },
        {
          id: 'test-f352-change-mgmt',
          name: 'Fase 3.52 — Change Management & Risk Assessment',
          passed: changeMgmtRes.passed,
          message: changeMgmtRes.logs.join(' | '),
        },
        {
          id: 'test-f352-config-gov',
          name: 'Fase 3.52 — Configuration Governance & Snapshots',
          passed: configGovRes.passed,
          message: configGovRes.logs.join(' | '),
        },
        {
          id: 'test-f352-feature-flags',
          name: 'Fase 3.52 — Feature Flags e isolamento entre empresas',
          passed: featureFlagRes.passed,
          message: featureFlagRes.logs.join(' | '),
        },
        {
          id: 'test-f353-incident-mgmt',
          name: 'Fase 3.53 — Incident Management & State Machine (SEV0-SEV4)',
          passed: incidentMgmtRes.passed,
          message: incidentMgmtRes.logs.join(' | '),
        },
        {
          id: 'test-f353-problem-mgmt',
          name: 'Fase 3.53 — Problem Management & Known Errors',
          passed: problemMgmtRes.passed,
          message: problemMgmtRes.logs.join(' | '),
        },
        {
          id: 'test-f353-sre-metrics',
          name: 'Fase 3.53 — SRE Metrics & SLA Compliance (MTTD/MTTA/MTTR/MTBF)',
          passed: incidentMetricsRes.passed,
          message: incidentMetricsRes.logs.join(' | '),
        },
        ...sysIntegritySummary.results,
        ...consolidationSummary.results,
        ...workflowCombinedResults,
        ...executionCombinedResults,
        ...opsExecutiveCombinedResults,
        ...decisionManagementCombinedResults,
        ...performanceCombinedResults,
      ];

      const workflowTotal = workflowCombinedResults.length;
      const workflowPassed = workflowCombinedResults.filter(r => r.passed).length;
      const workflowFailed = workflowTotal - workflowPassed;

      const executionTotal = executionCombinedResults.length;
      const executionPassed = executionCombinedResults.filter(r => r.passed).length;
      const executionFailed = executionTotal - executionPassed;

      const opsExecTotal = opsExecutiveCombinedResults.length;
      const opsExecPassed = opsExecutiveCombinedResults.filter(r => r.passed).length;
      const opsExecFailed = opsExecTotal - opsExecPassed;

      const combined = {
        total: financeSummary.total + driverSummary.total + contractSummary.total + maintenanceSummary.total + complianceSummary.total + securitySummary.total + persistenceSummary.total + analyticsSummary.total + predictiveSummary.total + aiGovSummary.total + mlopsSummary.total + apiIntegrationSummary.total + ecosystemSummary.total + ecosystemGovSummary.total + finalHomologationSummary.total + managementReportsSummary.total + dailyOpsSummary.total + rentalLifecycleSummary.total + rentalControlSummary.total + operationalIncidentSummary.total + operationalTaskSummary.total + productivitySummary.total + goalsSummary.total + executiveSummary.total + governanceSummary.total + observabilitySummary.total + resilienceSummary.total + prodAdminSummary.total + sysHealthSummary.total + secAdminSummary.total + tenantCfgSummary.total + sysIntegritySummary.total + consolidationSummary.total + workflowTotal + executionTotal + opsExecTotal,
        passed: financeSummary.passed + driverSummary.passed + contractSummary.passed + maintenanceSummary.passed + complianceSummary.passed + securitySummary.passed + persistenceSummary.passed + analyticsSummary.passed + predictiveSummary.passed + aiGovSummary.passed + mlopsSummary.passed + apiIntegrationSummary.passed + ecosystemSummary.passed + ecosystemGovSummary.passed + finalHomologationSummary.passed + managementReportsSummary.passed + dailyOpsSummary.passed + rentalLifecycleSummary.passed + rentalControlSummary.passed + operationalIncidentSummary.passed + operationalTaskSummary.passed + productivitySummary.passed + goalsSummary.passed + executiveSummary.passed + governanceSummary.passed + observabilitySummary.passed + resilienceSummary.passed + prodAdminSummary.passed + sysHealthSummary.passed + secAdminSummary.passed + tenantCfgSummary.passed + sysIntegritySummary.passed + consolidationSummary.passed + workflowPassed + executionPassed + opsExecPassed,
        failed: financeSummary.failed + driverSummary.failed + contractSummary.failed + maintenanceSummary.failed + complianceSummary.failed + securitySummary.failed + persistenceSummary.failed + analyticsSummary.failed + predictiveSummary.failed + aiGovSummary.failed + mlopsSummary.failed + apiIntegrationSummary.failed + ecosystemSummary.failed + ecosystemGovSummary.failed + finalHomologationSummary.failed + managementReportsSummary.failed + dailyOpsSummary.failed + rentalLifecycleSummary.failed + rentalControlSummary.failed + operationalIncidentSummary.failed + operationalTaskSummary.failed + productivitySummary.failed + goalsSummary.failed + executiveSummary.failed + governanceSummary.failed + observabilitySummary.failed + resilienceSummary.failed + prodAdminSummary.failed + sysHealthSummary.failed + secAdminSummary.failed + tenantCfgSummary.failed + sysIntegritySummary.failed + consolidationSummary.failed + workflowFailed + executionFailed + opsExecFailed,
        results: combinedResults,
      };

      setTestSummary(combined);
      if (onTestsCompleted) {
        onTestsCompleted({
          total: combined.total,
          passed: combined.passed,
          failed: combined.failed,
        });
      }
    } catch (err) {
      console.error('Error running test suite:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const filteredResults = testSummary
    ? testSummary.results.filter((res) => {
        const matchesSearch =
          res.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          res.id.toString().includes(searchTerm) ||
          res.message.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus =
          statusFilter === 'ALL' || (statusFilter === 'PASSED' ? res.passed : !res.passed);
        return matchesSearch && matchesStatus;
      })
    : [];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            Suíte de Auditoria AutoERP (Fase 3.31 — Homologação Operacional Final)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Homologação operacional final: veículos, motoristas, contratos, entrega/devolução, manutenção, multas, financeiro (🔒 congelado), idempotência, multi-tenancy, RBAC e regressão 3.7 → 3.31.
          </p>
        </div>

        <Button
          onClick={executeSuite}
          disabled={isRunning}
          variant="primary"
          size="sm"
          className="!bg-emerald-600 hover:!bg-emerald-700 !text-white"
          icon={
            isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )
          }
        >
          {isRunning ? 'Executando Auditoria...' : 'Re-Executar 42 Testes'}
        </Button>
      </div>

      {testSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card padding="sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">Total de Testes</span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-0.5 font-mono tabular-nums">
                  {testSummary.total}
                </h3>
              </div>
              <div className="p-2.5 bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">Testes Aprovados</span>
                <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono tabular-nums">
                  {testSummary.passed}
                </h3>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">Testes Reprovados</span>
                <h3 className={`text-2xl font-black mt-0.5 font-mono tabular-nums ${testSummary.failed > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {testSummary.failed}
                </h3>
              </div>
              <div className={`p-2.5 rounded-xl ${testSummary.failed > 0 ? 'bg-red-50 text-red-600 dark:bg-red-950/60' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                <XCircle className="w-5 h-5" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="w-full sm:w-80">
            <Input
              type="text"
              placeholder="Filtrar testes por nome, ID ou detalhes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('PASSED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                statusFilter === 'PASSED'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Aprovados
            </button>
            <button
              onClick={() => setStatusFilter('FAILED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                statusFilter === 'FAILED'
                  ? 'bg-red-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Reprovados
            </button>
          </div>
        </div>
      </Card>

      {/* Test Log List */}
      <Card padding="none">
        {isRunning ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <span>Executando bateria de testes do motor financeiro...</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {filteredResults.map((log, idx) => (
              <div key={`${log.id}-${idx}`} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-[11px] font-bold text-slate-400">#{log.id}</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{log.name}</span>
                  </div>

                  <Badge variant={log.passed ? 'success' : 'danger'}>
                    {log.passed ? 'APROVADO' : 'REPROVADO'}
                  </Badge>
                </div>

                <div className="text-slate-600 dark:text-slate-400 pl-6 border-l-2 border-slate-200 dark:border-slate-700 py-0.5 font-mono text-[11px]">
                  {log.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

