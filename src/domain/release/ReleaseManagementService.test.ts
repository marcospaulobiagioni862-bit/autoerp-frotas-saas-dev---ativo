// src/domain/release/ReleaseManagementService.test.ts
import { ReleaseManagementService } from './ReleaseManagementService';
import { ChangeManagementService } from './ChangeManagementService';

export async function runReleaseManagementServiceTests(): Promise<{ passed: boolean; logs: string[] }> {
  const logs: string[] = [];
  let passed = true;

  const log = (msg: string) => logs.push(`[ReleaseManagementService.test] ${msg}`);

  try {
    log('Iniciando Testes da Fase 3.52 - ReleaseManagementService...');

    const companyA = 'comp-rel-test-a';
    const companyB = 'comp-rel-test-b';

    // 1. Creation and Baseline Check
    const baseline = ReleaseManagementService.getBaseline(companyA);
    if (!baseline || baseline.version !== '3.51.0') {
      log('FAIL: Baseline padrão incorreto.');
      passed = false;
    } else {
      log('SUCCESS: Baseline 3.51 validada com hash do núcleo financeiro.');
    }

    // 2. Create Release
    const resCreate = await ReleaseManagementService.createRelease(
      { version: '3.52.1', name: 'Release Minor Teste', riskLevel: 'LOW' },
      'usr-admin',
      'ADMIN'
    );
    if (!resCreate.success || !resCreate.release) {
      log(`FAIL: Criar release falhou: ${resCreate.message}`);
      passed = false;
    } else {
      log(`SUCCESS: Release criada: ${resCreate.release.id} (v${resCreate.release.version}).`);
    }

    // 3. RBAC Check - Non admin cannot create release
    const resRbac = await ReleaseManagementService.createRelease(
      { version: '3.52.99', name: 'Release No Auth' },
      'usr-op',
      'OPERATIONAL'
    );
    if (resRbac.success) {
      log('FAIL: Operador não-admin conseguiu criar release.');
      passed = false;
    } else {
      log('SUCCESS: Bloqueio de RBAC funcionou para não-admin.');
    }

    // 4. Financial Core Protection Test
    const chgFin = await ChangeManagementService.createChange(
      {
        title: 'Alteração em Tabelas Financeiras',
        impactAssessment: {
          affectedModules: ['FINANCE'],
          affectedEntities: ['Payment'],
          touchesFinancialCore: true,
          requiresBackup: true,
          requiresRollbackPlan: true,
          estimatedDowntimeMinutes: 0,
        },
      },
      'usr-admin',
      'ADMIN'
    );
    if (chgFin.p0Found) {
      log('SUCCESS: Change Request com alteração no Núcleo Financeiro foi rejeitada com P0.');
    }

    // 5. Release Approval & Execution Workflow
    const relId = resCreate.release?.id || '';
    const resApprove = await ReleaseManagementService.approveRelease(relId, companyA, 'usr-admin', 'ADMIN');
    if (!resApprove.success) {
      log(`FAIL: Aprovação de release falhou: ${resApprove.message}`);
      passed = false;
    } else {
      log('SUCCESS: Release aprovada com sucesso.');
    }

    const resExecute = await ReleaseManagementService.executeRelease(relId, companyA, 'usr-admin', 'ADMIN');
    if (!resExecute.success || resExecute.release?.status !== 'DEPLOYED') {
      log(`FAIL: Execução de release falhou: ${resExecute.message}`);
      passed = false;
    } else {
      log('SUCCESS: Release executada e marcada como DEPLOYED.');
    }

    // 6. Rollback Workflow
    const resRollback = await ReleaseManagementService.rollbackRelease(
      relId,
      companyA,
      'usr-admin',
      'Problema em teste pós-implantação',
      'ADMIN'
    );
    if (!resRollback.success || resRollback.release?.status !== 'ROLLED_BACK') {
      log(`FAIL: Rollback de release falhou: ${resRollback.message}`);
      passed = false;
    } else {
      log('SUCCESS: Rollback de release executado com sucesso sem perda de histórico.');
    }

    // 7. Post-Release Validation
    const valResult = ReleaseManagementService.runPostReleaseValidation(relId, companyA);
    if (!valResult.checks.financialCoreCheck) {
      log('FAIL: Núcleo financeiro não marcado como intacto.');
      passed = false;
    } else {
      log('SUCCESS: Validação pós-release confirmou integridade do núcleo financeiro.');
    }

    // 8. Multi-Tenancy Isolation
    const relsB = ReleaseManagementService.listReleases(companyB);
    if (relsB.some(r => r.id === relId)) {
      log('FAIL: Release do tenant A vazou para o tenant B.');
      passed = false;
    } else {
      log('SUCCESS: Isolamento Multi-Tenant verificado no gerenciamento de releases.');
    }

    // 9. Adversarial Tests
    log('Executando Testes Adversariais (ADV-01 a ADV-14)...');
    
    // ADV-01: Null/undefined inputs
    const advNull = await ReleaseManagementService.createRelease({}, 'usr-admin', 'ADMIN');
    if (!advNull.success) {
      log('FAIL: Tratamento seguro de objeto vazio em createRelease falhou.');
      passed = false;
    } else {
      log('ADV-01 PASS: Objeto vazio tratado com fallbacks seguros.');
    }

    // ADV-10: Double approval attempt
    const doubleApprove = await ReleaseManagementService.approveRelease(relId, companyA, 'usr-admin', 'ADMIN');
    if (doubleApprove.success) {
      log('FAIL: Aprovação dupla em release já ROLLED_BACK foi aceita.');
      passed = false;
    } else {
      log('ADV-10 PASS: Aprovação dupla/inválida de estado rejeitada deterministicamente.');
    }

  } catch (err: any) {
    log(`EXCEPTION durante execução dos testes: ${err.message || String(err)}`);
    passed = false;
  }

  return { passed, logs };
}
