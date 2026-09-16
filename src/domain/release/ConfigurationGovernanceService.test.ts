// src/domain/release/ConfigurationGovernanceService.test.ts
import { ConfigurationGovernanceService } from './ConfigurationGovernanceService';
import { TenantConfigurationService } from '../admin/TenantConfigurationService';

export async function runConfigurationGovernanceServiceTests(): Promise<{ passed: boolean; logs: string[] }> {
  const logs: string[] = [];
  let passed = true;

  const log = (msg: string) => logs.push(`[ConfigurationGovernanceService.test] ${msg}`);

  try {
    log('Iniciando Testes da Fase 3.52 - ConfigurationGovernanceService...');

    const companyId = 'comp-cfg-test';

    // 1. Take Snapshot
    const snap = ConfigurationGovernanceService.takeSnapshot(companyId, 'usr-admin', 'SNAP_TEST_V1');
    if (!snap || !snap.snapshotId || !snap.checksum) {
      log('FAIL: Criação de snapshot de configuração falhou.');
      passed = false;
    } else {
      log(`SUCCESS: Snapshot de configuração criado: ${snap.snapshotId} (${snap.configurationVersion}).`);
    }

    // 2. Update Configuration Key
    const initialConfig = TenantConfigurationService.getConfig(companyId);
    const initialDays = initialConfig.auditRetentionDays;

    const resUpdate = await ConfigurationGovernanceService.updateConfigurationKey(
      companyId,
      'auditRetentionDays',
      999,
      'usr-admin',
      'Aumento de retenção de auditoria para 999 dias.',
      'ADMIN'
    );

    if (!resUpdate.success || !resUpdate.changeRecord) {
      log(`FAIL: Atualização de chave de configuração falhou: ${resUpdate.message}`);
      passed = false;
    } else {
      log('SUCCESS: Chave auditRetentionDays atualizada para 999 com registro de alteração.');
    }

    // Verify current config value
    const updatedConfig = TenantConfigurationService.getConfig(companyId);
    if (updatedConfig.auditRetentionDays !== 999) {
      log('FAIL: Valor da configuração não reflete no TenantConfigurationService.');
      passed = false;
    } else {
      log('SUCCESS: TenantConfigurationService refletiu a nova configuração.');
    }

    // 3. Rollback Configuration
    const resRollback = await ConfigurationGovernanceService.rollbackConfiguration(
      companyId,
      snap.snapshotId,
      'usr-admin',
      'Restaurando retenção original pós-teste.',
      'ADMIN'
    );

    if (!resRollback.success) {
      log(`FAIL: Rollback de configuração falhou: ${resRollback.message}`);
      passed = false;
    } else {
      log('SUCCESS: Rollback de configuração executado com sucesso.');
    }

    // Verify value after rollback
    const postRollbackConfig = TenantConfigurationService.getConfig(companyId);
    if (postRollbackConfig.auditRetentionDays !== initialDays) {
      log(`FAIL: Valor de auditRetentionDays após rollback é ${postRollbackConfig.auditRetentionDays}, esperado ${initialDays}.`);
      passed = false;
    } else {
      log('SUCCESS: Configuração restaurada para o estado do snapshot.');
    }

    // 4. RBAC Check - Non-admin cannot update config
    const resRbac = await ConfigurationGovernanceService.updateConfigurationKey(
      companyId,
      'auditRetentionDays',
      500,
      'usr-op',
      'Tentativa não autorizada',
      'OPERATIONAL'
    );

    if (resRbac.success) {
      log('FAIL: Usuário sem perfil ADMIN conseguiu alterar configuração global.');
      passed = false;
    } else {
      log('SUCCESS: RBAC impediu alteração não autorizada de configuração.');
    }

  } catch (err: any) {
    log(`EXCEPTION durante execução dos testes: ${err.message || String(err)}`);
    passed = false;
  }

  return { passed, logs };
}
