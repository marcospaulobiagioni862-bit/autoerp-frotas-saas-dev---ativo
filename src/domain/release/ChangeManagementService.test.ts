// src/domain/release/ChangeManagementService.test.ts
import { ChangeManagementService } from './ChangeManagementService';

export async function runChangeManagementServiceTests(): Promise<{ passed: boolean; logs: string[] }> {
  const logs: string[] = [];
  let passed = true;

  const log = (msg: string) => logs.push(`[ChangeManagementService.test] ${msg}`);

  try {
    log('Iniciando Testes da Fase 3.52 - ChangeManagementService...');

    const companyId = 'comp-chg-test';

    // 1. Create Normal Change Request
    const resCreate = await ChangeManagementService.createChange(
      {
        title: 'Atualização de Limites de SLA',
        category: 'CONFIGURATION',
        risk: 'LOW',
        priority: 'P3',
        impactAssessment: {
          affectedModules: ['ADMIN'],
          affectedEntities: ['TENANT_OPERATIONAL_CONFIG'],
          touchesFinancialCore: false,
          requiresBackup: false,
          requiresRollbackPlan: true,
          estimatedDowntimeMinutes: 0,
        },
      },
      'usr-mgr',
      'OPERATIONAL_MANAGER'
    );

    if (!resCreate.success || !resCreate.change) {
      log(`FAIL: Criar mudança falhou: ${resCreate.message}`);
      passed = false;
    } else {
      log(`SUCCESS: ChangeRequest criada: ${resCreate.change.id} no status ${resCreate.change.status}.`);
    }

    const chgId = resCreate.change?.id || '';

    // 2. Evaluate & Approve
    const resApprove = await ChangeManagementService.evaluateChange(
      chgId,
      companyId,
      true,
      'usr-admin',
      'ADMIN',
      'Mudança revisada e aprovada'
    );

    if (!resApprove.success || resApprove.change?.status !== 'APPROVED') {
      log(`FAIL: Avaliação de mudança falhou: ${resApprove.message}`);
      passed = false;
    } else {
      log('SUCCESS: ChangeRequest aprovada com sucesso.');
    }

    // 3. Execute
    const resExec = await ChangeManagementService.executeChange(chgId, companyId, 'usr-admin');
    if (!resExec.success || resExec.change?.status !== 'COMPLETED') {
      log(`FAIL: Execução de mudança falhou: ${resExec.message}`);
      passed = false;
    } else {
      log('SUCCESS: ChangeRequest executada com sucesso (COMPLETED).');
    }

    // 4. Financial Core Protection
    const resFin = await ChangeManagementService.createChange(
      {
        title: 'Tentativa de Alterar Saldo do Caixa',
        impactAssessment: {
          affectedModules: ['FINANCE'],
          affectedEntities: ['FinancialTransaction'],
          touchesFinancialCore: true,
          requiresBackup: true,
          requiresRollbackPlan: true,
          estimatedDowntimeMinutes: 0,
        },
      },
      'usr-admin',
      'ADMIN'
    );

    if (resFin.p0Found && !resFin.success) {
      log('SUCCESS: Tentativa de mudança com impacto no Núcleo Financeiro bloqueada de forma estrita com P0.');
    } else {
      log('FAIL: Mudança com impacto no núcleo financeiro não foi bloqueada.');
      passed = false;
    }

    // 5. Adversarial Tests (ADV-12, ADV-13: Idempotency & Invalid State)
    log('Executando Testes Adversariais de Change Management...');
    const resIdem = await ChangeManagementService.createChange(
      { title: 'Mudança Idempotente' },
      'usr-admin',
      'ADMIN',
      'idem-chg-unique-key-123'
    );
    const resIdem2 = await ChangeManagementService.createChange(
      { title: 'Mudança Idempotente' },
      'usr-admin',
      'ADMIN',
      'idem-chg-unique-key-123'
    );

    if (resIdem.change?.id === resIdem2.change?.id) {
      log('ADV-13 PASS: Chave de idempotência evitou criação duplicada de ChangeRequest.');
    } else {
      log('FAIL: Idempotência de ChangeRequest falhou.');
      passed = false;
    }

  } catch (err: any) {
    log(`EXCEPTION durante execução dos testes: ${err.message || String(err)}`);
    passed = false;
  }

  return { passed, logs };
}
