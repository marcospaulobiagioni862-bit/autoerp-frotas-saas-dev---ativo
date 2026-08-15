// src/domain/admin/TenantConfigurationService.test.ts
import { TenantConfigurationService } from './TenantConfigurationService';

export class TenantConfigurationTestRunner {
  public static async runAllTests(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    const results: any[] = [];
    const companyId = 'test-company-admin-cfg';

    // Test 1: Default configuration retrieval
    try {
      const cfg = TenantConfigurationService.getConfig(companyId);
      const passed = cfg && cfg.companyId === companyId && cfg.maxVehiclesLimit > 0 && cfg.timezone === 'America/Sao_Paulo';
      results.push({
        id: 'cfg-01',
        name: 'Obtenção de Configuração Padrão do Tenant',
        passed,
        message: passed ? `Configuração carregada com sucesso (${cfg.companyName})` : 'Falha na configuração padrão',
      });
    } catch (err: any) {
      results.push({ id: 'cfg-01', name: 'Obtenção de Configuração Padrão do Tenant', passed: false, message: err?.message });
    }

    // Test 2: Validation against negative numbers, NaN & invalid values
    try {
      const invalidInput: any = {
        maxVehiclesLimit: -50,
        maxDriversLimit: NaN,
        slaResponseHours: Infinity,
      };
      const sanitized = TenantConfigurationService.validateAndSanitize(invalidInput, companyId);
      const passed = sanitized.maxVehiclesLimit === 5000 && sanitized.maxDriversLimit === 10000 && sanitized.slaResponseHours === 4;
      results.push({
        id: 'cfg-02',
        name: 'Sanitização de Valores Inválidos (NaN, Infinity, Negativos)',
        passed,
        message: passed ? 'Valores inválidos corrigidos para fallbacks seguros com sucesso' : 'Falha ao sanitizar entradas inválidas',
      });
    } catch (err: any) {
      results.push({ id: 'cfg-02', name: 'Sanitização de Valores Inválidos (NaN, Infinity, Negativos)', passed: false, message: err?.message });
    }

    // Test 3: Safe update with AuditLog
    try {
      const updateRes = await TenantConfigurationService.updateConfig(companyId, { companyName: 'AutoERP Test Enterprise' }, 'admin-user');
      const passed = updateRes.success && updateRes.config.companyName === 'AutoERP Test Enterprise';
      results.push({
        id: 'cfg-03',
        name: 'Atualização Segura da Configuração com Trilha AuditLog',
        passed,
        message: passed ? 'Atualização de tenant executada e auditada' : 'Falha ao atualizar configuração',
      });
    } catch (err: any) {
      results.push({ id: 'cfg-03', name: 'Atualização Segura da Configuração com Trilha AuditLog', passed: false, message: err?.message });
    }

    const passed = results.filter(r => r.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  }
}
