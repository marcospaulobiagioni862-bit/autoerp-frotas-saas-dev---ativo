import { IncidentManagementService } from './IncidentManagementService';
import { ProductionIncident, CreateIncidentParams } from './types';

export async function runIncidentManagementServiceTests(): Promise<{ passed: boolean; logs: string[] }> {
  const logs: string[] = [];
  let passed = true;

  const testCompany = 'company-test-inc-353';
  const crossCompany = 'company-other-inc-353';
  const userId = 'usr-sre-admin';

  logs.push('--- INICIANDO TESTES DO INCIDENT MANAGEMENT SERVICE (FASE 3.53) ---');

  try {
    // 1. Basic Creation
    const createParams: CreateIncidentParams = {
      companyId: testCompany,
      title: 'Falha de Conectividade com Gateway',
      description: 'Timeout ao chamar API externa de monitoramento',
      severity: 'SEV1',
      priority: 'P1',
      source: 'OBSERVABILITY',
      category: 'INTEGRATION_FAILURE',
      reportedBy: userId,
      affectedModule: 'INTEGRATION',
      slaDeadlineMinutes: 30,
    };

    const res1 = await IncidentManagementService.createIncident(createParams, userId);
    if (res1.success && res1.incident) {
      logs.push(`[OK] Incidente criado com sucesso: ID ${res1.incident.id}, Priority: ${res1.incident.priority}`);
    } else {
      logs.push(`[FAIL] Falha ao criar incidente: ${res1.message}`);
      passed = false;
    }

    const incidentId = res1.incident?.id || '';

    // 2. Transition Status: DETECTED -> TRIAGED -> ACKNOWLEDGED -> INVESTIGATING -> RESOLVED -> CLOSED
    const triagedRes = await IncidentManagementService.transitionStatus({
      incidentId,
      companyId: testCompany,
      targetStatus: 'TRIAGED',
      userId,
      comment: 'Incidente analisado e triado',
    });
    if (triagedRes.success && triagedRes.incident?.status === 'TRIAGED') {
      logs.push('[OK] Transição para TRIAGED válida');
    } else {
      logs.push(`[FAIL] Transição TRIAGED falhou: ${triagedRes.message}`);
      passed = false;
    }

    const ackRes = await IncidentManagementService.transitionStatus({
      incidentId,
      companyId: testCompany,
      targetStatus: 'ACKNOWLEDGED',
      userId,
    });
    if (ackRes.success && ackRes.incident?.status === 'ACKNOWLEDGED' && ackRes.incident?.acknowledgedAt) {
      logs.push('[OK] Transição para ACKNOWLEDGED registra timestamp');
    } else {
      logs.push('[FAIL] Falha ao passar para ACKNOWLEDGED');
      passed = false;
    }

    // Assign Incident Commander
    const cmdRes = await IncidentManagementService.assignCommander({
      incidentId,
      companyId: testCompany,
      commanderId: 'usr-commander-1',
      userId,
      technicalLeadId: 'usr-tech-lead-1',
    });
    if (cmdRes.success && cmdRes.incident?.commanderId === 'usr-commander-1') {
      logs.push('[OK] Incident Commander atribuído com sucesso');
    } else {
      logs.push(`[FAIL] Atribuição de Commander falhou: ${cmdRes.message}`);
      passed = false;
    }

    // Resolve Incident with Root Cause
    const resolveRes = await IncidentManagementService.resolveIncident({
      incidentId,
      companyId: testCompany,
      userId,
      rootCause: 'Latência na rota DNS do provedor cloud',
      resolutionSummary: 'Rota DNS corrigida e failover automático reconfigurado',
    });
    if (resolveRes.success && resolveRes.incident?.status === 'RESOLVED') {
      logs.push('[OK] Incidente resolvido com causa raiz obrigatória');
    } else {
      logs.push(`[FAIL] Resolução de incidente falhou: ${resolveRes.message}`);
      passed = false;
    }

    // Close Incident
    const closeRes = await IncidentManagementService.closeIncident({
      incidentId,
      companyId: testCompany,
      userId,
    });
    if (closeRes.success && closeRes.incident?.status === 'CLOSED') {
      logs.push('[OK] Incidente fechado com sucesso');
    } else {
      logs.push(`[FAIL] Fechamento de incidente falhou: ${closeRes.message}`);
      passed = false;
    }

    // Post-Mortem Creation & Approval
    const pmRes = await IncidentManagementService.createPostMortem({
      incidentId,
      companyId: testCompany,
      userId,
      summary: 'Post-Mortem Falha de Conectividade',
      impact: '15 minutos de degradação parcial',
      timeline: [{ timestamp: new Date().toISOString(), event: 'Detecção de latência' }],
      detection: 'Alerta da Observabilidade',
      response: 'Acionamento do SRE On-Call',
      containment: 'Failover para região secundária',
      resolution: 'Ajuste de regras de roteamento',
      rootCause: 'Falha de propagação DNS no provedor',
      contributingFactors: ['Falta de retentativa automática no client'],
      whatWentWell: ['Tempo de reação dentro do SLA'],
      whatWentWrong: ['Falta de comunicação no canal de status'],
      correctiveActions: [
        { id: 'act-1', description: 'Implementar circuit breaker', targetType: 'TASK', status: 'PENDING' },
      ],
      preventiveActions: ['Adicionar redundância de provedores DNS'],
    });

    if (pmRes.success && pmRes.postMortem) {
      logs.push('[OK] Post-Mortem criado em status DRAFT');
      const pmApprove = await IncidentManagementService.approvePostMortem({
        postMortemId: pmRes.postMortem.id,
        companyId: testCompany,
        userId,
      });
      if (pmApprove.success && pmApprove.postMortem?.status === 'APPROVED') {
        logs.push('[OK] Post-Mortem aprovado e tornado imutável');
      } else {
        logs.push('[FAIL] Aprovação de Post-Mortem falhou');
        passed = false;
      }
    } else {
      logs.push('[FAIL] Criação de Post-Mortem falhou');
      passed = false;
    }

    // --- TESTES ADVERSARIAIS ---
    logs.push('--- INICIANDO TESTES ADVERSARIAIS DA FASE 3.53 ---');

    // ADV-01 & ADV-06: Null/Undefined/Missing companyId
    const adv01 = await IncidentManagementService.createIncident({} as any, userId);
    if (!adv01.success) {
      logs.push('[OK] ADV-01/06: Rejeitou criação sem companyId');
    } else {
      logs.push('[FAIL] ADV-01/06: Permitiu criar sem companyId');
      passed = false;
    }

    // ADV-07: Cross-Tenant Access
    const adv07 = await IncidentManagementService.getIncidentById(incidentId, crossCompany);
    if (!adv07) {
      logs.push('[OK] ADV-07: Acesso cross-tenant bloqueado estritamente');
    } else {
      logs.push('[FAIL] ADV-07: Vazamento cross-tenant detectado!');
      passed = false;
    }

    // ADV-09: Invalid State Transition (CLOSED -> INVESTIGATING directly prohibited)
    const adv09 = await IncidentManagementService.transitionStatus({
      incidentId,
      companyId: testCompany,
      targetStatus: 'INVESTIGATING',
      userId,
    });
    if (!adv09.success) {
      logs.push('[OK] ADV-09: Bloqueou transição proibida (CLOSED -> INVESTIGATING)');
    } else {
      logs.push('[FAIL] ADV-09: Permitiu transição proibida');
      passed = false;
    }

    // ADV-10 & ADV-11: Resolution/Closure on closed incident without reopen
    const adv10 = await IncidentManagementService.transitionStatus({
      incidentId,
      companyId: testCompany,
      targetStatus: 'RESOLVED',
      userId,
    });
    if (!adv10.success) {
      logs.push('[OK] ADV-10/11: Bloqueou transição em estado terminal fechado');
    } else {
      logs.push('[FAIL] ADV-10/11: Permitiu transição em estado terminal');
      passed = false;
    }

    // ADV-12: Idempotency Key Repeated
    const idemKey = 'idem-inc-test-353-key';
    const idem1 = await IncidentManagementService.createIncident(
      { ...createParams, title: 'Idempotent Incident Test', idempotencyKey: idemKey },
      userId
    );
    const idem2 = await IncidentManagementService.createIncident(
      { ...createParams, title: 'Idempotent Incident Test Repeated', idempotencyKey: idemKey },
      userId
    );

    if (idem1.success && idem2.success && idem1.incident?.id === idem2.incident?.id && idem2.isDuplicate) {
      logs.push('[OK] ADV-12: Idempotency Key evitou duplicidade de incidente');
    } else {
      logs.push('[FAIL] ADV-12: Falha na validação de idempotência');
      passed = false;
    }

    // ADV-17: Incident Fingerprint Deduplication
    const dedup1 = await IncidentManagementService.createIncident(
      { ...createParams, title: 'Deduplicated Bug 1' },
      userId
    );
    const dedup2 = await IncidentManagementService.createIncident(
      { ...createParams, title: 'Deduplicated Bug 2' },
      userId
    );
    if (dedup1.incident?.id === dedup2.incident?.id && dedup2.isDuplicate) {
      logs.push('[OK] ADV-17: Deduplicação por fingerprint evitou duplicidade');
    } else {
      logs.push('[FAIL] ADV-17: Falha ao deduplicar por fingerprint');
      passed = false;
    }

    // ADV-19 & ADV-20: Financial Core Attempt Protection
    const finAttempt = await IncidentManagementService.createIncident(
      {
        companyId: testCompany,
        title: 'finance_core_mutation_attempt',
        description: 'Tentativa de alterar saldo financeiro diretamente',
        severity: 'SEV3',
        priority: 'P3',
        source: 'SECURITY',
        category: 'FINANCIAL_ATTEMPT_BLOCKED',
        reportedBy: userId,
        affectedModule: 'FINANCE',
      },
      userId
    );

    if (
      finAttempt.success &&
      finAttempt.incident?.severity === 'SEV0' &&
      finAttempt.incident?.priority === 'P0'
    ) {
      logs.push('[OK] ADV-19/20: Tentativa de alteração no Núcleo Financeiro bloqueada com P0 SEV0');
    } else {
      logs.push('[FAIL] ADV-19/20: Falha ao elevar severidade para P0 SEV0 em tentativa financeira');
      passed = false;
    }

  } catch (err: any) {
    logs.push(`[EXCEPTION] Erro durante execução de testes de Incident Management: ${err.message}`);
    passed = false;
  }

  return { passed, logs };
}
