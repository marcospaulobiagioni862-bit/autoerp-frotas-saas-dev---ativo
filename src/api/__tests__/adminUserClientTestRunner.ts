import { AdminUserClient } from '../adminUserClient';
import { TenantProfileClientTestRunner } from './tenantProfileClientTestRunner';

const user = {
  id: 'user-1',
  name: 'User One',
  email: 'user.one@example.test',
  role: 'OPERATIONAL',
  active: true,
  permissions: ['FLEET_READ'],
  createdAt: '2026-08-23T10:00:00.000Z',
  updatedAt: '2026-08-23T10:00:00.000Z',
};

export class AdminUserClientTestRunner {
  static async runAllTests() {
    const originalFetch = globalThis.fetch;
    let passed = 0;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let url = '';
      let credentials: RequestCredentials | undefined;
      let body: BodyInit | null | undefined = 'unexpected';
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        credentials = init?.credentials;
        body = init?.body;
        return new Response(JSON.stringify({ items: [user] }), { status: 200 });
      }) as typeof fetch;
      const result = await AdminUserClient.listUsers();
      if (url !== '/api/admin/users' || credentials !== 'include' || body !== undefined || result[0]?.id !== user.id) {
        throw new Error('ADMIN user list transport contract failed');
      }
      if (/companyId|userId|role=/.test(url)) throw new Error('ADMIN list must not send browser authority');
    });

    tests.push(async () => {
      let url = '';
      let method = '';
      let credentials: RequestCredentials | undefined;
      let sent: unknown;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        method = init?.method || '';
        credentials = init?.credentials;
        sent = init?.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(JSON.stringify({ item: { ...user, active: false } }), { status: 200 });
      }) as typeof fetch;
      const result = await AdminUserClient.setUserActive(user.id, false);
      if (url !== `/api/admin/users/${user.id}/status` || method !== 'PATCH' || credentials !== 'include' || result.active !== false) {
        throw new Error('ADMIN user status transport contract failed');
      }
      const body = sent as Record<string, unknown>;
      if (Object.keys(body).length !== 1 || body.active !== false || 'companyId' in body || 'userId' in body || 'role' in body) {
        throw new Error('ADMIN user status must send only desired active state');
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let failed = false;
      try { await AdminUserClient.listUsers(); } catch { failed = true; }
      if (!failed) throw new Error('ADMIN client HTTP error must fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ ...user, active: 'yes' }] }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await AdminUserClient.listUsers(); } catch { failed = true; }
      if (!failed) throw new Error('Malformed ADMIN user payload must fail closed');
    });

    try {
      for (const test of tests) {
        await test();
        passed += 1;
      }
    } finally {
      globalThis.fetch = originalFetch;
    }

    const tenant = await TenantProfileClientTestRunner.runAllTests();
    const result = {
      passed: passed + tenant.passed,
      failed: (tests.length - passed) + tenant.failed,
      total: tests.length + tenant.total,
    };
    console.log(`AdministrationClients ${result.passed}/${result.total} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('adminUserClientTestRunner')) {
  AdminUserClientTestRunner.runAllTests()
    .then((result) => { if (result.failed) process.exit(1); })
    .catch((error) => { console.error(error); process.exit(1); });
}
