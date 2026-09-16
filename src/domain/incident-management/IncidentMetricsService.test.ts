import { IncidentMetricsService } from './IncidentMetricsService';
import { IncidentManagementService } from './IncidentManagementService';

export async function runIncidentMetricsServiceTests(): Promise<{ passed: boolean; logs: string[] }> {
  const logs: string[] = [];
  let passed = true;

  const testCompany = 'company-test-metrics-353';
  const userId = 'usr-sre-metrics';

  logs.push('--- INICIANDO TESTES DO INCIDENT METRICS SERVICE SRE (FASE 3.53) ---');

  try {
    // 1. Empty metrics (Zero/NaN protection check)
    const emptyMetrics = await IncidentMetricsService.calculateMetrics('company-empty-353');
    if (
      emptyMetrics.totalIncidents === 0 &&
      emptyMetrics.mttdMinutes === 0 &&
      emptyMetrics.mttaMinutes === 0 &&
      emptyMetrics.mttrMinutes === 0 &&
      !isNaN(emptyMetrics.slaComplianceRate) &&
      !isNaN(emptyMetrics.reopenRate)
    ) {
      logs.push('[OK] Cálculo de métricas em empresa sem incidentes não gera NaN ou erros');
    } else {
      logs.push('[FAIL] Métricas vazias retornaram valores matematicamente inválidos');
      passed = false;
    }

    // 2. Populate incidents to calculate MTTD, MTTA, MTTR, SLA Compliance
    const inc1 = await IncidentManagementService.createIncident(
      {
        companyId: testCompany,
        title: 'Métricas Test Inc 1',
        description: 'Test incident 1',
        severity: 'SEV1',
        priority: 'P1',
        source: 'OBSERVABILITY',
        category: 'PERFORMANCE_DEGRADATION',
        reportedBy: userId,
      },
      userId
    );

    const incId1 = inc1.incident?.id || '';

    await IncidentManagementService.transitionStatus({
      incidentId: incId1,
      companyId: testCompany,
      targetStatus: 'ACKNOWLEDGED',
      userId,
    });

    await IncidentManagementService.resolveIncident({
      incidentId: incId1,
      companyId: testCompany,
      userId,
      rootCause: 'Root cause for metrics',
      resolutionSummary: 'Resolution summary',
    });

    // Calculate populated metrics
    const metrics = await IncidentMetricsService.calculateMetrics(testCompany);

    if (
      metrics.totalIncidents >= 1 &&
      typeof metrics.mttdMinutes === 'number' &&
      typeof metrics.mttaMinutes === 'number' &&
      typeof metrics.mttrMinutes === 'number' &&
      metrics.slaComplianceRate >= 0 &&
      metrics.slaComplianceRate <= 100
    ) {
      logs.push(`[OK] Métricas SRE calculadas: Total=${metrics.totalIncidents}, MTTR=${metrics.mttrMinutes}m, SLA Compliance=${metrics.slaComplianceRate}%`);
    } else {
      logs.push('[FAIL] Cálculo de métricas falhou em dados preenchidos');
      passed = false;
    }

  } catch (err: any) {
    logs.push(`[EXCEPTION] Erro ao executar testes de Incident Metrics: ${err.message}`);
    passed = false;
  }

  return { passed, logs };
}
