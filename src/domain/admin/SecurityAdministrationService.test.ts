// src/domain/admin/SecurityAdministrationService.test.ts
import {
  resolveSecurityAdministrationMockMode,
  SecurityAdministrationService,
} from './SecurityAdministrationService';
import { UserRole } from '../../types/enums';

export class SecurityAdministrationTestRunner {
  public static async runAllTests(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    const results: any[] = [];
    const companyId = 'test-company-security';

    // Test 1: RBAC Permission Matrix Validation
    try {
      const adminAllowed = SecurityAdministrationService.isActionAllowed(UserRole.ADMIN, 'CONFIGURE_TENANT');
      const managerBlocked = !SecurityAdministrationService.isActionAllowed('OPERATIONAL_MANAGER', 'CONFIGURE_TENANT');
      const passed = adminAllowed && managerBlocked;
      results.push({
        id: 'sec-01',
        name: 'Matriz de Permissões RBAC (ADMIN vs. GESTOR)',
        passed,
        message: passed ? 'Acesso negado e permitido conforme matriz RBAC' : 'Falha na matriz RBAC',
      });
    } catch (err: any) {
      results.push({ id: 'sec-01', name: 'Matriz de Permissões RBAC (ADMIN vs. GESTOR)', passed: false, message: err?.message });
    }

    // Test 2: Only a development runtime may resolve mock mode
    try {
      const developmentEnabled = resolveSecurityAdministrationMockMode(true) === true;
      const productionDisabled = resolveSecurityAdministrationMockMode(false) === false;
      const passed = developmentEnabled && productionDisabled;
      results.push({
        id: 'sec-02',
        name: 'Mocks administrativos só podem ser habilitados pelo runtime de desenvolvimento',
        passed,
        message: passed ? 'DEV habilita simulação e produção permanece fail-closed' : 'Falha na resolução do modo de simulação',
      });
    } catch (err: any) {
      results.push({ id: 'sec-02', name: 'Mocks administrativos só podem ser habilitados pelo runtime de desenvolvimento', passed: false, message: err?.message });
    }

    // Test 3: Node/non-Vite runtime represents production fail-closed behavior
    try {
      const users = SecurityAdministrationService.listUsers(companyId);
      const sessions = SecurityAdministrationService.listActiveSessions(companyId);
      const passed = users.length === 0 && sessions.length === 0;
      results.push({
        id: 'sec-03',
        name: 'Modo não-DEV não fabrica usuários ou sessões administrativas',
        passed,
        message: passed ? 'Nenhum usuário/sessão mock foi exposto' : 'Modo não-DEV expôs telemetria simulada',
      });
    } catch (err: any) {
      results.push({ id: 'sec-03', name: 'Modo não-DEV não fabrica usuários ou sessões administrativas', passed: false, message: err?.message });
    }

    // Test 4: Local user mutation must also fail closed outside DEV
    try {
      const updateRes = await SecurityAdministrationService.updateUserStatus(
        companyId,
        'usr-admin-test',
        'SUSPENDED',
        'admin-id',
        UserRole.ADMIN
      );
      const passed = updateRes.success === false;
      results.push({
        id: 'sec-04',
        name: 'Modo não-DEV rejeita alteração local de usuário administrativo',
        passed,
        message: passed ? 'Escrita local simulada rejeitada' : 'Escrita local simulada foi aceita fora de DEV',
      });
    } catch (err: any) {
      results.push({ id: 'sec-04', name: 'Modo não-DEV rejeita alteração local de usuário administrativo', passed: false, message: err?.message });
    }

    const passed = results.filter(r => r.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  }
}
