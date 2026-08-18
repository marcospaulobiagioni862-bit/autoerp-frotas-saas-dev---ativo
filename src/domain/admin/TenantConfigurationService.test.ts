// src/domain/admin/TenantConfigurationService.test.ts
import {
  resolveTenantLocalConfigurationMode,
  TenantConfigurationService,
} from './TenantConfigurationService';

export class TenantConfigurationTestRunner {
  public static async runAllTests(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    const results: any[] = [];
    const companyId = 'test-company-admin-cfg';

    // Test 1: Runtime resolver must enable local authority only in DEV
    try {
      const developmentEnabled = resolveTenantLocalConfigurationMode(true) === true;
      const productionDisabled = resolveTenantLocalConfigurationMode(false) === false;
      const passed = developmentEnabled && productionDisabled;
      results.push({
        id: 'cfg-01',
        name: 'Configuração local do tenant somente em runtime DEV',
        passed,
        message: passed ? 'DEV habilita configuração local e produção permanece fail-closed' : 'Falha no gate de runtime',
      });
    } catch (err: any) {
      results.push({ id: 'cfg-01', name: 'Configuração local do tenant somente em runtime DEV', passed: false, message: err?.message });
    }

    // Test 2: Non-DEV retrieval must expose no fabricated company identity
    try {
      const cfg = TenantConfigurationService.getConfig(companyId);
      const passed =
        cfg.companyId === companyId &&
        cfg.companyName === '' &&
        cfg.document === '' &&
        cfg.email === '' &&
        cfg.address === '' &&
        cfg.maxVehiclesLimit === 0 &&
        cfg.updatedBy === 'SERVER_SOURCE_NOT_CONNECTED';
      results.push({
        id: 'cfg-02',
        name: 'Modo não-DEV retorna estado neutro sem dados empresariais fabricados',
        passed,
        message: passed ? 'Fonte server-side ausente representada explicitamente' : 'Modo não-DEV expôs configuração local/fabricada',
      });
    } catch (err: any) {
      results.push({ id: 'cfg-02', name: 'Modo não-DEV retorna estado neutro sem dados empresariais fabricados', passed: false, message: err?.message });
    }

    // Test 3: Validation against negative numbers, NaN & invalid values remains intact
    try {
      const invalidInput: any = {
        maxVehiclesLimit: -50,
        maxDriversLimit: NaN,
        slaResponseHours: Infinity,
      };
      const sanitized = TenantConfigurationService.validateAndSanitize(invalidInput, companyId);
      const passed = sanitized.maxVehiclesLimit === 5000 && sanitized.maxDriversLimit === 10000 && sanitized.slaResponseHours === 4;
      results.push({
        id: 'cfg-03',
        name: 'Sanitização de Valores Inválidos (NaN, Infinity, Negativos)',
        passed,
        message: passed ? 'Sanitização existente preservada' : 'Falha ao sanitizar entradas inválidas',
      });
    } catch (err: any) {
      results.push({ id: 'cfg-03', name: 'Sanitização de Valores Inválidos (NaN, Infinity, Negativos)', passed: false, message: err?.message });
    }

    // Test 4: Non-DEV local update must be rejected
    try {
      const updateRes = await TenantConfigurationService.updateConfig(
        companyId,
        { companyName: 'Should Not Persist' },
        'admin-user'
      );
      const passed =
        updateRes.success === false &&
        updateRes.config.updatedBy === 'SERVER_SOURCE_NOT_CONNECTED' &&
        updateRes.config.companyName === '';
      results.push({
        id: 'cfg-04',
        name: 'Modo não-DEV rejeita mutação local de configuração do tenant',
        passed,
        message: passed ? 'Escrita local rejeitada sem fabricar configuração' : 'Escrita local foi aceita fora de DEV',
      });
    } catch (err: any) {
      results.push({ id: 'cfg-04', name: 'Modo não-DEV rejeita mutação local de configuração do tenant', passed: false, message: err?.message });
    }

    const passed = results.filter(r => r.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  }
}
