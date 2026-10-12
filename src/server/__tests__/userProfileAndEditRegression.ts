import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../password';
import {
  AdminUserAuthority,
  AdminUserForbiddenError,
  AdminUserNotFoundError,
  AdminUserConflictError,
} from '../adminUserAuthority';
import { registerAdminUserRoutes } from '../adminUserRoutes';
import { registerUserProfileRoutes } from '../userProfileRoutes';
import { UnitOfWork } from '../../db/uow';
import type { AuthenticatedPrincipal } from '../auth';

// Test harness simulating Express app and request routing
interface RouteHandler {
  method: string;
  url: string;
  handler: (req: any, res: any) => Promise<any> | any;
}

class MockExpressApp {
  routes: RouteHandler[] = [];

  get(url: string, handler: any) { this.routes.push({ method: 'GET', url, handler }); }
  post(url: string, handler: any) { this.routes.push({ method: 'POST', url, handler }); }
  patch(url: string, handler: any) { this.routes.push({ method: 'PATCH', url, handler }); }
  put(url: string, handler: any) { this.routes.push({ method: 'PUT', url, handler }); }
  delete(url: string, handler: any) { this.routes.push({ method: 'DELETE', url, handler }); }

  async dispatch(method: string, path: string, options: { body?: any; principal?: AuthenticatedPrincipal; params?: any } = {}) {
    const route = this.routes.find((r) => {
      if (r.method !== method.toUpperCase()) return false;
      const patternParts = r.url.split('/');
      const actualParts = path.split('/');
      if (patternParts.length !== actualParts.length) return false;
      return patternParts.every((part, i) => part.startsWith(':') || part === actualParts[i]);
    });

    if (!route) {
      throw new Error(`Route not found: ${method} ${path}`);
    }

    const params: Record<string, string> = { ...(options.params || {}) };
    const patternParts = route.url.split('/');
    const actualParts = path.split('/');
    patternParts.forEach((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = actualParts[i];
      }
    });

    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      params,
      body: options.body || {},
      principal: options.principal,
    };

    const res: any = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(data: any) {
        jsonBody = data;
        return res;
      },
    };

    await route.handler(req, res);
    return { status: statusCode, body: jsonBody };
  }
}

async function runRegression(): Promise<void> {
  console.log('=== AUTOERP-88 & AUTOERP-89: SUÍTE DE TESTES REGRESSIVOS DE EDIÇÃO DE USUÁRIOS E MEU PERFIL ===\n');

  // ==========================================
  // CENÁRIO 1: Mock de Banco e Scrypt
  // ==========================================
  console.log('[1/7] Testando hash e verificação de senha scrypt...');
  const initialPassword = 'Initial-Secure-Password-123';
  const hashedInitial = await hashPassword(initialPassword);
  assert(await verifyPassword(initialPassword, hashedInitial), 'Scrypt hash must verify initial password');
  assert(!(await verifyPassword('WrongPassword', hashedInitial)), 'Wrong password must be rejected');

  // Estrutura in-memory de usuários e credenciais
  const mockUsers: Record<string, any> = {
    'user-colab-1': {
      id: 'user-colab-1',
      companyId: 'company-alpha',
      name: 'João Mecânico',
      email: 'joao@alpha.com',
      role: 'OPERATIONAL',
      active: true,
      phone: '(11) 98888-1111',
      avatarUrl: null,
      permissions: ['OPERATIONS_WRITE'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    'user-admin-1': {
      id: 'user-admin-1',
      companyId: 'company-alpha',
      name: 'Carlos Administrador',
      email: 'carlos@alpha.com',
      role: 'ADMIN',
      active: true,
      phone: '(11) 99999-0000',
      avatarUrl: null,
      permissions: ['*'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    'user-other-tenant': {
      id: 'user-other-tenant',
      companyId: 'company-beta',
      name: 'Outro Usuário',
      email: 'outro@beta.com',
      role: 'OPERATIONAL',
      active: true,
      phone: null,
      avatarUrl: null,
      permissions: ['OPERATIONS_WRITE'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };

  const mockCredentials: Record<string, string> = {
    'user-colab-1': hashedInitial,
    'user-admin-1': hashedInitial,
  };

  const mockAuditLogs: any[] = [];

  // Mock do UnitOfWork.run global
  let currentLookupUserId: string | null = null;

  // Mock do UnitOfWork.run global
  const originalRun = UnitOfWork.run;
  (UnitOfWork as any).run = async (companyId: string, callback: any) => {
    const tx = {
      _isMock: true,
      execute: async (sqlText: any) => {
        const queryStr = String(sqlText?.queryChunks?.map((c: any) => c.value || c).join(' ') || sqlText?.strings?.join(' ') || sqlText || '');
        if (queryStr.includes('user_credentials') || queryStr.includes('to_regclass')) {
          return { rows: [{ reg: 'user_credentials', exists: true }] };
        }
        return { rows: [{ exists: true, reg: null }] };
      },
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              for: () => ({
                limit: async () => [],
              }),
            }),
          }),
          where: (clause: any) => ({
            for: () => ({
              limit: async () => {
                const found = Object.values(mockUsers).find((u) => u.companyId === companyId && (!currentLookupUserId || u.id === currentLookupUserId));
                return found ? [found] : [];
              },
            }),
            limit: async () => {
              const found = Object.values(mockUsers).find((u) => u.companyId === companyId && (!currentLookupUserId || u.id === currentLookupUserId));
              return found ? [found] : [];
            },
          }),
        }),
      }),
      update: (table: any) => ({
        set: (data: any) => ({
          where: async () => {
            if (currentLookupUserId && mockUsers[currentLookupUserId]) {
              mockUsers[currentLookupUserId] = { ...mockUsers[currentLookupUserId], ...data };
            }
            return true;
          },
        }),
      }),
      insert: (table: any) => ({
        values: (vals: any) => ({
          onConflictDoUpdate: async (conf: any) => {
            if (vals.passwordHash && vals.userId) {
              mockCredentials[vals.userId] = vals.passwordHash;
            }
          },
        }),
      }),
    };

    const txContext = {
      getRawTransaction: () => tx,
      getAuditLogRepo: () => ({
        create: async (log: any) => {
          mockAuditLogs.push(log);
        },
      }),
    };

    return callback(txContext);
  };

  // ==========================================
  // CENÁRIO 2: Guardas em AdminUserAuthority.updateUser
  // ==========================================
  console.log('[2/7] Testando guardas de permissão no AdminUserAuthority.updateUser...');

  const operationalPrincipal: AuthenticatedPrincipal = {
    userId: 'user-colab-1',
    companyId: 'company-alpha',
    role: 'OPERATIONAL',
    name: 'João Mecânico',
    permissions: ['OPERATIONS_WRITE'],
  };

  const adminPrincipal: AuthenticatedPrincipal = {
    userId: 'user-admin-1',
    companyId: 'company-alpha',
    role: 'ADMIN',
    name: 'Carlos Administrador',
    permissions: ['*'],
  };

  // 2.1 Não-admin é bloqueado por assertCanManageUsers
  let errorCaught = false;
  try {
    await AdminUserAuthority.updateUser(operationalPrincipal, 'user-colab-1', { name: 'Tentativa Invalida' });
  } catch (err: any) {
    errorCaught = true;
    assert(err instanceof AdminUserForbiddenError || err.name === 'AdminUserForbiddenError', 'Must reject non-admin with AdminUserForbiddenError');
  }
  assert(errorCaught, 'Non-admin must be blocked from calling AdminUserAuthority.updateUser');

  // 2.2 Isolamento multi-tenant: Admin não pode editar usuário de outra locadora
  errorCaught = false;
  currentLookupUserId = 'user-other-tenant';
  try {
    await AdminUserAuthority.updateUser(adminPrincipal, 'user-other-tenant', { name: 'Tentativa Cross-Tenant' });
  } catch (err: any) {
    errorCaught = true;
    assert(
      err instanceof AdminUserForbiddenError ||
      err instanceof AdminUserNotFoundError ||
      err.name === 'AdminUserForbiddenError' ||
      err.name === 'AdminUserNotFoundError',
      'Must reject cross-tenant edit'
    );
  }
  assert(errorCaught, 'Admin must not be able to edit user from another company');

  // 2.3 Validação de senha fraca (< 12 chars) no AdminUserAuthority
  errorCaught = false;
  currentLookupUserId = 'user-colab-1';
  try {
    await AdminUserAuthority.updateUser(adminPrincipal, 'user-colab-1', { password: 'curta' });
  } catch (err: any) {
    errorCaught = true;
    assert(err instanceof AdminUserConflictError || err.name === 'AdminUserConflictError', 'Must reject password under 12 characters');
    assert(err.message.includes('12 caracteres'), 'Message must specify 12 characters');
  }
  assert(errorCaught, 'Weak password must be rejected by AdminUserAuthority');

  // ==========================================
  // CENÁRIO 3: Admin Atualiza Colaborador com Sucesso
  // ==========================================
  console.log('[3/7] Testando atualização legítima de colaborador e redefinição de senha pelo Admin...');
  const newStrongPass = 'NovoP@sswordForte2026!';
  currentLookupUserId = 'user-colab-1';
  const updatedUser = await AdminUserAuthority.updateUser(adminPrincipal, 'user-colab-1', {
    name: 'João Silva Mecânico',
    phone: '(11) 97777-6666',
    role: 'MANAGER',
    password: newStrongPass,
  });

  assert.equal(updatedUser.name, 'João Silva Mecânico', 'Name must be updated');
  assert.equal(updatedUser.role, 'MANAGER', 'Role must be updated to MANAGER');
  assert(mockCredentials['user-colab-1'] !== hashedInitial, 'Credential must have been updated in repository');
  assert(await verifyPassword(newStrongPass, mockCredentials['user-colab-1']), 'New password must verify against updated scrypt hash');

  console.log('✓ AdminUserAuthority.updateUser passou com sucesso');

  // ==========================================
  // CENÁRIO 4: Rotas HTTP Express - /api/me/profile Fail-Closed
  // ==========================================
  console.log('[4/7] Testando proteção fail-closed contra privilege escalation em /api/me/profile...');
  const app = new MockExpressApp();
  registerUserProfileRoutes(app as any);
  registerAdminUserRoutes(app as any);

  // 4.1 Tentativa de elevar privilégios enviando role: 'ADMIN' no perfil pessoal
  const hackPayload1 = await app.dispatch('PATCH', '/api/me/profile', {
    principal: operationalPrincipal,
    body: { role: 'ADMIN' },
  });
  assert.equal(hackPayload1.status, 400, 'Must return 400 Bad Request when trying to send role');
  assert(hackPayload1.body.error.includes('role') && hackPayload1.body.error.includes('não é permitido'), 'Must specify forbidden property role');

  // 4.2 Tentativa de enviar permissions
  const hackPayload2 = await app.dispatch('PATCH', '/api/me/profile', {
    principal: operationalPrincipal,
    body: { permissions: ['*'] },
  });
  assert.equal(hackPayload2.status, 400, 'Must return 400 Bad Request when trying to send permissions');

  // 4.3 Tentativa de trocar companyId
  const hackPayload3 = await app.dispatch('PATCH', '/api/me/profile', {
    principal: operationalPrincipal,
    body: { companyId: 'company-beta' },
  });
  assert.equal(hackPayload3.status, 400, 'Must return 400 Bad Request when trying to send companyId');

  console.log('✓ Fail-closed estrito contra Privilege Escalation em /api/me/profile validado');

  // ==========================================
  // CENÁRIO 5: Rotas HTTP Express - /api/me/avatar
  // ==========================================
  console.log('[5/7] Testando validação de foto de perfil em /api/me/avatar...');

  // 5.1 Envio de URL / imagem inválida (ex: script malévolo ou string aleatória)
  const invalidAvatar = await app.dispatch('POST', '/api/me/avatar', {
    principal: operationalPrincipal,
    body: { avatarUrl: 'javascript:alert(1)' },
  });
  assert.equal(invalidAvatar.status, 400, 'Invalid avatar format must return 400');

  // 5.2 Sem avatarUrl no payload
  const emptyAvatar = await app.dispatch('POST', '/api/me/avatar', {
    principal: operationalPrincipal,
    body: {},
  });
  assert.equal(emptyAvatar.status, 400, 'Missing avatarUrl must return 400');

  console.log('✓ Validação de integridade de /api/me/avatar validada');

  // ==========================================
  // CENÁRIO 6: Rotas HTTP Express - /api/me/change-password
  // ==========================================
  console.log('[6/7] Testando validações de troca de senha pessoal em /api/me/change-password...');

  // 6.1 Senha nova muito curta (< 12 chars)
  const shortPass = await app.dispatch('POST', '/api/me/change-password', {
    principal: operationalPrincipal,
    body: {
      currentPassword: 'qualquer-senha',
      newPassword: 'curta',
    },
  });
  assert.equal(shortPass.status, 400, 'Short newPassword must return 400');
  assert(shortPass.body.error.includes('12 caracteres'), 'Error message must specify minimum 12 characters');

  // 6.2 Faltando campos obrigatórios
  const missingFields = await app.dispatch('POST', '/api/me/change-password', {
    principal: operationalPrincipal,
    body: { currentPassword: 'apenas-atual' },
  });
  assert.equal(missingFields.status, 400, 'Missing newPassword must return 400');

  console.log('✓ Validações de entrada de /api/me/change-password validadas');

  // ==========================================
  // CENÁRIO 7: Autenticação não informada (401 Unauthorized)
  // ==========================================
  console.log('[7/7] Testando rejeição para requisição não autenticada...');
  const unauthProfile = await app.dispatch('GET', '/api/me/profile', {
    principal: undefined,
  });
  assert.equal(unauthProfile.status, 401, 'Unauthenticated request to /api/me/profile must return 401');

  const unauthChangePass = await app.dispatch('POST', '/api/me/change-password', {
    principal: undefined,
    body: { currentPassword: 'a', newPassword: 'b' },
  });
  assert.equal(unauthChangePass.status, 401, 'Unauthenticated request to /api/me/change-password must return 401');

  // Restore UnitOfWork.run
  UnitOfWork.run = originalRun;

  console.log('\n================================================================');
  console.log('AUTOERP-88 & AUTOERP-89: TODOS OS TESTES PASSARAM COM SUCESSO (100%)');
  console.log('================================================================\n');
}

runRegression()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('REGRESSION FAILED:', err);
    process.exit(1);
  });
