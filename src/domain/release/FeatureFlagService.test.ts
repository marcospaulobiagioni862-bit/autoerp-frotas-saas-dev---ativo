// src/domain/release/FeatureFlagService.test.ts
import { FeatureFlagService } from './FeatureFlagService';

export async function runFeatureFlagServiceTests(): Promise<{ passed: boolean; logs: string[] }> {
  const logs: string[] = [];
  let passed = true;

  const log = (msg: string) => logs.push(`[FeatureFlagService.test] ${msg}`);

  try {
    log('Iniciando Testes da Fase 3.52 - FeatureFlagService...');

    const companyId = 'comp-flags-test';

    // 1. List Default Flags
    const flags = FeatureFlagService.listFlags(companyId);
    if (!flags || flags.length === 0) {
      log('FAIL: Feature Flags padrão não carregadas.');
      passed = false;
    } else {
      log(`SUCCESS: ${flags.length} Feature Flags padrão carregadas com sucesso.`);
    }

    // 2. Create Feature Flag
    const resCreate = await FeatureFlagService.createFeatureFlag(
      {
        key: 'FF_AUTOMATED_RELEASE_SMOKE_TESTS',
        enabled: true,
        description: 'Habilita suíte de testes automatizados pós-deploy.',
        environment: 'PRODUCTION',
      },
      'usr-admin',
      'ADMIN'
    );

    if (!resCreate.success || !resCreate.flag) {
      log(`FAIL: Criar Feature Flag falhou: ${resCreate.message}`);
      passed = false;
    } else {
      log(`SUCCESS: Feature Flag '${resCreate.flag.key}' criada com sucesso.`);
    }

    // 3. Check feature status
    const isEnabled = FeatureFlagService.isFeatureEnabled(companyId, 'FF_AUTOMATED_RELEASE_SMOKE_TESTS', 'PRODUCTION');
    if (!isEnabled) {
      log('FAIL: Feature flag ativada retornou false.');
      passed = false;
    } else {
      log('SUCCESS: Feature flag ativada retornou true.');
    }

    // 4. Toggle Flag
    const flagId = resCreate.flag?.id || '';
    const resToggle = await FeatureFlagService.toggleFeatureFlag(companyId, flagId, false, 'usr-admin', 'ADMIN');
    if (!resToggle.success || resToggle.flag?.enabled !== false) {
      log(`FAIL: Desativar Feature Flag falhou: ${resToggle.message}`);
      passed = false;
    } else {
      log('SUCCESS: Feature flag desativada com sucesso.');
    }

    // 5. RBAC Check on Production Flag
    const resRbac = await FeatureFlagService.toggleFeatureFlag(companyId, flagId, true, 'usr-op', 'OPERATIONAL');
    if (resRbac.success) {
      log('FAIL: Operador não-admin conseguiu alterar flag em PRODUÇÃO.');
      passed = false;
    } else {
      log('SUCCESS: RBAC impediu alteração de Feature Flag em produção por não-admin.');
    }

  } catch (err: any) {
    log(`EXCEPTION durante execução dos testes: ${err.message || String(err)}`);
    passed = false;
  }

  return { passed, logs };
}
