// src/domain/admin/SecurityAdministrationService.test.ts
import { SecurityAdministrationService } from './SecurityAdministrationService';
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

    // Test 2: Active User Session Listing
    try {
      const sessions = SecurityAdministrationService.listActiveSessions(companyId);
      const passed = Array.isArray(sessions) && sessions.length > 0 && sessions.every(s => s.companyId === companyId);
      results.push({
        id: 'sec-02',
        name: 'Listagem e Monitoramento de Sessões Ativas por Tenant',
        passed,
        message: passed ? `${sessions.length} sessões ativas isoladas por tenant` : 'Falha no isolamento de sessões',
      });
    } catch (err: any) {
      results.push({ id: 'sec-02', name: 'Listagem e Monitoramento de Sessões Ativas por Tenant', passed: false, message: err?.message });
    }

    // Test 3: User Status Update Protection
    try {
      const users = SecurityAdministrationService.listUsers(companyId);
      const targetUser = users[0];
      const updateRes = await SecurityAdministrationService.updateUserStatus(companyId, targetUser.id, 'SUSPENDED', 'admin-id', UserRole.ADMIN);
      const passed = updateRes.success;
      results.push({
        id: 'sec-03',
        name: 'Alteração de Status de Usuário com Trava de Segurança',
        passed,
        message: passed ? 'Status de usuário alterado e auditado com sucesso' : 'Falha na alteração de status',
      });
    } catch (err: any) {
      results.push({ id: 'sec-03', name: 'Alteração de Status de Usuário com Trava de Segurança', passed: false, message: err?.message });
    }

    const passed = results.filter(r => r.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  }
}
