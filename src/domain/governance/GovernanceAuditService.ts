import { AuditLog } from '../../types/entities/audit';

export type GovernanceSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type GovernanceStatus = 'COMPLETED' | 'BLOCKED' | 'REJECTED' | 'FAILED' | 'PENDING' | 'CANCELLED' | 'OPEN';

export interface GovernanceEventProcessed {
  id: string;
  companyId: string;
  userId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  module: string;
  timestamp: string;
  correlationId?: string;
  severity: GovernanceSeverity;
  status: GovernanceStatus;
  previousState?: string;
  newState?: string;
  reason?: string;
  metadata?: Record<string, any>;
  isAnomalous?: boolean;
  anomalyReason?: string;
}

export interface GovernanceAnalysisReport {
  companyId: string;
  generatedAt: string;
  healthScore: {
    score: number;
    classification: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
    components: {
      auditIntegrity: number;
      rbacCompliance: number;
      multiTenantIsolation: number;
      traceability: number;
      operationalIntegrity: number;
      failureRate: number;
    };
  };
  indicators: {
    audit: {
      totalEvents: number;
      criticalEvents: number;
      p0: number;
      p1: number;
      p2: number;
      p3: number;
      withoutUser: number;
      withoutTimestamp: number;
      withoutCorrelationId: number;
      withoutEntityId: number;
      withoutCompanyId: number;
    };
    security: {
      deniedAttempts: number;
      crossTenantAttempts: number;
      rbacViolations: number;
      administrativeActions: number;
      permissionChanges: number;
    };
    integrity: {
      duplicateEvents: number;
      inconsistentEvents: number;
      invalidStates: number;
      recordsWithoutTraceability: number;
    };
    operation: {
      operationalFailures: number;
      blockedOperations: number;
      completedOperations: number;
      cancelledOperations: number;
      recurrentExceptions: number;
    };
  };
  anomalies: Array<{
    id: string;
    type: string;
    description: string;
    severity: GovernanceSeverity;
    timestamp: string;
  }>;
  recommendations: Array<{
    id: string;
    priority: GovernanceSeverity;
    title: string;
    rationale: string;
    actionText: string;
  }>;
  processedEvents: GovernanceEventProcessed[];
}

export class GovernanceAuditService {
  /**
   * Generates a comprehensive, deterministic governance and audit analysis report.
   * Strictly read-only; never mutates input data or touches financial core.
   */
  public static analyzeGovernance(input: {
    companyId: string;
    auditLogs?: AuditLog[];
    tasks?: any[];
    incidents?: any[];
    pendings?: any[];
    userRole?: string;
  }): GovernanceAnalysisReport {
    const companyId = input?.companyId || 'company-default';
    const rawLogs = Array.isArray(input?.auditLogs) ? input.auditLogs : [];
    
    // Normalize audit logs and operational events into GovernanceEventProcessed
    const processedEvents: GovernanceEventProcessed[] = rawLogs.map((log, index) => {
      const cId = log.companyId || companyId;
      const isCrossTenant = cId !== companyId;
      const severity: GovernanceSeverity = 
        isCrossTenant || log.action?.includes('DELETE') || log.action?.includes('REJECT') || log.action?.includes('FAIL') ? 'P0' :
        log.action?.includes('UPDATE') || log.action?.includes('CANCEL') ? 'P1' :
        log.action?.includes('CREATE') ? 'P2' : 'P3';

      return {
        id: log.id || `log-${index}`,
        companyId: cId,
        userId: log.userId,
        actorId: log.userId,
        action: log.action || 'UNKNOWN_ACTION',
        entityType: log.entityName || 'UNKNOWN_ENTITY',
        entityId: log.entityId || 'UNKNOWN_ID',
        module: 'AUDIT',
        timestamp: log.timestamp || new Date().toISOString(),
        correlationId: (log as any).correlationId,
        severity,
        status: (log as any).status || 'COMPLETED',
        previousState: log.previousState,
        newState: log.newState,
        reason: (log as any).reason,
        metadata: { ipAddress: log.ipAddress, userName: log.userName },
      };
    });

    // Add synthetic operational events if audit logs are sparse
    const tasks = Array.isArray(input?.tasks) ? input.tasks : [];
    tasks.forEach((t, idx) => {
      processedEvents.push({
        id: `task-evt-${t.id || idx}`,
        companyId: t.companyId || companyId,
        userId: t.assignedTo || 'system',
        action: t.status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_UPDATED',
        entityType: 'OperationalTask',
        entityId: t.id || `t-${idx}`,
        module: 'TASKS',
        timestamp: t.updatedAt || t.createdAt || new Date().toISOString(),
        correlationId: t.correlationId,
        severity: t.deadlineStatus === 'ATRASADA' ? 'P1' : 'P3',
        status: t.status === 'COMPLETED' ? 'COMPLETED' : 'OPEN',
      });
    });

    const incidents = Array.isArray(input?.incidents) ? input.incidents : [];
    incidents.forEach((inc, idx) => {
      processedEvents.push({
        id: `inc-evt-${inc.id || idx}`,
        companyId: inc.companyId || companyId,
        userId: inc.userId || 'system',
        action: inc.status === 'OPEN' ? 'INCIDENT_OPENED' : 'INCIDENT_RESOLVED',
        entityType: 'OperationalIncident',
        entityId: inc.id || `inc-${idx}`,
        module: 'INCIDENTS',
        timestamp: inc.updatedAt || inc.createdAt || new Date().toISOString(),
        correlationId: inc.correlationId,
        severity: inc.priority === 'P0' ? 'P0' : inc.priority === 'P1' ? 'P1' : 'P2',
        status: inc.status === 'OPEN' ? 'OPEN' : 'COMPLETED',
      });
    });

    // Tenant Isolation Check (Filter out foreign tenant logs to maintain secure view)
    const tenantEvents = processedEvents.filter(e => e.companyId === companyId);
    const foreignEventsCount = processedEvents.length - tenantEvents.length;

    // Indicators
    const totalEvents = tenantEvents.length;
    const p0Events = tenantEvents.filter(e => e.severity === 'P0').length + (foreignEventsCount > 0 ? 1 : 0);
    const p1Events = tenantEvents.filter(e => e.severity === 'P1').length;
    const p2Events = tenantEvents.filter(e => e.severity === 'P2').length;
    const p3Events = tenantEvents.filter(e => e.severity === 'P3').length;

    const withoutUser = tenantEvents.filter(e => !e.userId).length;
    const withoutTimestamp = tenantEvents.filter(e => !e.timestamp || isNaN(Date.parse(e.timestamp))).length;
    const withoutCorrelationId = tenantEvents.filter(e => !e.correlationId).length;
    const withoutEntityId = tenantEvents.filter(e => !e.entityId).length;
    const withoutCompanyId = tenantEvents.filter(e => !e.companyId).length;

    const deniedAttempts = tenantEvents.filter(e => e.status === 'BLOCKED' || e.status === 'REJECTED').length;
    const crossTenantAttempts = foreignEventsCount;
    const rbacViolations = tenantEvents.filter(e => e.reason?.includes('RBAC') || e.reason?.includes('permissão')).length;
    const administrativeActions = tenantEvents.filter(e => e.action.includes('ADMIN') || e.action.includes('CONFIG')).length;
    const permissionChanges = tenantEvents.filter(e => e.action.includes('PERMISSION') || e.action.includes('ROLE')).length;

    const duplicateEvents = tenantEvents.filter((e, idx, arr) => arr.findIndex(x => x.entityId === e.entityId && x.action === e.action && x.timestamp === e.timestamp) !== idx).length;
    const inconsistentEvents = tenantEvents.filter(e => !e.action || !e.entityType).length;
    const invalidStates = tenantEvents.filter(e => e.timestamp && isNaN(Date.parse(e.timestamp))).length;
    const recordsWithoutTraceability = withoutCorrelationId + withoutUser;

    const operationalFailures = tenantEvents.filter(e => e.status === 'FAILED').length;
    const blockedOperations = tenantEvents.filter(e => e.status === 'BLOCKED').length;
    const completedOperations = tenantEvents.filter(e => e.status === 'COMPLETED').length;
    const cancelledOperations = tenantEvents.filter(e => e.status === 'CANCELLED').length;
    const recurrentExceptions = operationalFailures > 2 ? operationalFailures : 0;

    // Anomaly Detection
    const anomalies: Array<{ id: string; type: string; description: string; severity: GovernanceSeverity; timestamp: string; }> = [];
    if (crossTenantAttempts > 0) {
      anomalies.push({
        id: 'anom-cross-tenant',
        type: 'CROSS_TENANT_ATTEMPT',
        description: `Detectada(s) ${crossTenantAttempts} tentativa(s) de acesso cross-tenant ou registros de outra empresa.`,
        severity: 'P0',
        timestamp: new Date().toISOString(),
      });
    }
    if (withoutCorrelationId > totalEvents * 0.5 && totalEvents > 0) {
      anomalies.push({
        id: 'anom-traceability',
        type: 'MISSING_CORRELATION',
        description: `Alto índice de eventos sem correlationId (${withoutCorrelationId} de ${totalEvents}).`,
        severity: 'P2',
        timestamp: new Date().toISOString(),
      });
    }
    if (operationalFailures > 3) {
      anomalies.push({
        id: 'anom-failures',
        type: 'RECURRENT_FAILURES',
        description: `Detectadas falhas operacionais recorrentes (${operationalFailures} falhas registradas).`,
        severity: 'P1',
        timestamp: new Date().toISOString(),
      });
    }

    // Health Score calculation (0 to 100)
    const auditIntegrity = totalEvents === 0 ? 100 : Math.max(0, 100 - (withoutTimestamp * 20 + inconsistentEvents * 15));
    const rbacCompliance = Math.max(0, 100 - (rbacViolations * 25));
    const multiTenantIsolation = crossTenantAttempts === 0 ? 100 : Math.max(0, 100 - (crossTenantAttempts * 50));
    const traceability = totalEvents === 0 ? 100 : Math.max(0, Math.round(((totalEvents - withoutCorrelationId) / totalEvents) * 100));
    const operationalIntegrity = totalEvents === 0 ? 100 : Math.max(0, Math.round(((totalEvents - operationalFailures) / totalEvents) * 100));
    const failureRateScore = Math.max(0, 100 - (operationalFailures * 15));

    let rawScore = (
      auditIntegrity * 0.25 +
      rbacCompliance * 0.20 +
      multiTenantIsolation * 0.20 +
      traceability * 0.15 +
      operationalIntegrity * 0.10 +
      failureRateScore * 0.10
    );

    if (isNaN(rawScore) || !isFinite(rawScore)) rawScore = 100;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    const classification = 
      score >= 90 ? 'EXCELLENT' :
      score >= 75 ? 'GOOD' :
      score >= 60 ? 'WARNING' : 'CRITICAL';

    // Recommendations
    const recommendations: Array<{ id: string; priority: GovernanceSeverity; title: string; rationale: string; actionText: string; }> = [];
    if (crossTenantAttempts > 0) {
      recommendations.push({
        id: 'rec-1',
        priority: 'P0',
        title: 'Investigar Isolamento Multi-Tenant',
        rationale: 'Foram detectadas tentativas ou registros cruzados entre tenants que exigem contenção imediata.',
        actionText: 'Auditar Permissões',
      });
    }
    if (withoutCorrelationId > 0) {
      recommendations.push({
        id: 'rec-2',
        priority: 'P1',
        title: 'Revisar Rastreabilidade (CorrelationId)',
        rationale: `Existem ${withoutCorrelationId} eventos operacionais sem correlationId associado.`,
        actionText: 'Padronizar Logs',
      });
    }
    if (operationalFailures > 0) {
      recommendations.push({
        id: 'rec-3',
        priority: 'P1',
        title: 'Análise de Falhas Operacionais',
        rationale: `Detectadas ${operationalFailures} falhas operacionais que requerem verificação de causa raiz.`,
        actionText: 'Ver Ocorrências',
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        id: 'rec-4',
        priority: 'P3',
        title: 'Governança Operacional Estável',
        rationale: 'Todos os indicadores de auditoria, isolamento e rastreabilidade estão dentro dos parâmetros ótimos.',
        actionText: 'Visualizar Relatório',
      });
    }

    return {
      companyId,
      generatedAt: new Date().toISOString(),
      healthScore: {
        score,
        classification,
        components: {
          auditIntegrity: Math.round(auditIntegrity),
          rbacCompliance: Math.round(rbacCompliance),
          multiTenantIsolation: Math.round(multiTenantIsolation),
          traceability: Math.round(traceability),
          operationalIntegrity: Math.round(operationalIntegrity),
          failureRate: Math.round(failureRateScore),
        },
      },
      indicators: {
        audit: {
          totalEvents,
          criticalEvents: p0Events + p1Events,
          p0: p0Events,
          p1: p1Events,
          p2: p2Events,
          p3: p3Events,
          withoutUser,
          withoutTimestamp,
          withoutCorrelationId,
          withoutEntityId,
          withoutCompanyId,
        },
        security: {
          deniedAttempts,
          crossTenantAttempts,
          rbacViolations,
          administrativeActions,
          permissionChanges,
        },
        integrity: {
          duplicateEvents,
          inconsistentEvents,
          invalidStates,
          recordsWithoutTraceability,
        },
        operation: {
          operationalFailures,
          blockedOperations,
          completedOperations,
          cancelledOperations,
          recurrentExceptions,
        },
      },
      anomalies,
      recommendations,
      processedEvents: tenantEvents,
    };
  }
}
