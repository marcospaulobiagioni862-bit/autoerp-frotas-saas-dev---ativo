// src/domain/admin/SecurityAdministrationService.test.ts
import { SecurityAdministrationService } from './SecurityAdministrationService';
import { UserRole } from '../../types/enums';

export class SecurityAdministrationTestRunner {
  public static async runAllTests(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    const results: any[] = [];
    const companyId = 'test-company-security';
    const developmentOptions = { allowDevelopmentMockData: true };

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

    // Test 2: Explicit development session simulation remains tenant-scoped
    try {
      const sessions = SecurityAdministrationService.listActiveSessions(companyId, developmentOptions);
      const passed = Array.isArray(sessions) && sessions.length > 0 && sessions.every(s => s.companyId === companyId);
      results.push({
        id: 'sec-02',
        name: 'Simulação de sessões somente em desenvolvimento e isolada por tenant',
        passed,
        message: passed ? `${sessions.length} sessões simuladas explicitamente em desenvolvimento` : 'Falha no isolamento da simulação de sessões',
      });
    } catch (err: any) {
      results.push({ id: 'sec-02', name: 'Simulação de sessões somente em desenvolvimento e isolada por tenant', passed: false, message: err?.message });
    }

    // Test 3: Development mock user status update remains RBAC protected
    try {
      const users = SecurityAdministrationService.listUsers(companyId, developmentOptions);
      const targetUser = users[0];
      const updateRes = await SecurityAdministrationService.updateUserStatus(
        companyId,
        targetUser.id,
        'SUSPENDED',
        'admin-id',
        UserRole.ADMIN,
        'corr-security-admin-dev-test',
        developmentOptions
      );
      const passed = updateRes.success;
      results.push({
        id: 'sec-03',
        name: 'Alteração de status simulada com trava RBAC em desenvolvimento',
        passed,
        message: passed ? 'Status de usuário simulado alterado com autorização explícita' : 'Falha na alteração simulada de status',
      });
    } catch (err: any) {
      results.push({ id: 'sec-03', name: 'Alteração de status simulada com trava RBAC em desenvolvimento', passed: false, message: err?.message });
    }

    // Test 4: Production/default mode must never fabricate users or sessions
    try {
      const users = SecurityAdministrationService.listUsers(companyId);
      const sessions = SecurityAdministrationService.listActiveSessions(companyId);
      const updateRes = await SecurityAdministrationService.updateUserStatus(
        companyId,
        'usr-admin-test',
        'SUSPENDED',
        'admin-id',
        UserRole.ADMIN
      );
      const passed = users.length === 0 && sessions.length === 0 && updateRes.success === false;
      results.push({
        id: 'sec-04',
        name: 'Modo padrão/produção falha fechado sem telemetria administrativa fabricada',
        passed,
        message: passed
          ? 'Nenhum usuário/sessão mock foi exposto e escrita local foi rejeitada'
          : 'Modo padrão expôs ou alterou dados administrativos simulados',
      });
    } catch (err: any) {
      results.push({ id: 'sec-04', name: 'Modo padrão/produção falha fechado sem telemetria administrativa fabricada', passed: false, message: err?.message });
    }

    const passed = results.filter(r => r.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  }
}
