import { AdminTenantClient } from '../adminTenantClient';

const profile = {
  companyId: 'company-a',
  companyName: 'Empresa A',
  document: '12345678000199',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  maxVehiclesLimit: 5000,
  maxDriversLimit: 10000,
  updatedAt: '2026-08-23T10:00:00.000Z',
  updatedBy: 'admin-a',
};

export class AdminTenantClientTestRunner {
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
        return new Response(JSON.stringify({ profile }), { status: 200 });
      }) as typeof fetch;
      const result = await AdminTenantClient.getProfile();
      if (url !== '/api/admin/tenant-profile' || credentials !== 'include' || body !== undefined || result.companyId !== profile.companyId) {
        throw new Error('Tenant profile GET transport contract failed');
      }
      if (/companyId|userId|role=/.test(url)) throw new Error('Tenant profile GET must not send browser authority');
    });

    tests.push(async () => {
      let sent: Record<string, unknown> = {};
      let method = '';
      let credentials: RequestCredentials | undefined;
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = init?.method || '';
        credentials = init?.credentials;
        sent = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({ profile: { ...profile, companyName: 'Empresa A Nova' } }), { status: 200 });
      }) as typeof fetch;
      const result = await AdminTenantClient.updateProfile({
        companyName: 'Empresa A Nova',
        timezone: 'America/Sao_Paulo',
        currency: 'BRL',
        maxVehiclesLimit: 6000,
        maxDriversLimit: 11000,
      });
      if (method !== 'PATCH' || credentials !== 'include' || result.companyName !== 'Empresa A Nova') {
        throw new Error('Tenant profile PATCH transport contract failed');
      }
      const forbidden = ['companyId', 'document', 'userId', 'role', 'updatedBy'];
      if (forbidden.some((key) => key in sent)) throw new Error('Tenant profile PATCH transmitted forbidden browser authority/identity');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let failed = false;
      try { await AdminTenantClient.getProfile(); } catch { failed = true; }
      if (!failed) throw new Error('Tenant profile HTTP error must fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ profile: { ...profile, maxVehiclesLimit: '5000' } }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await AdminTenantClient.getProfile(); } catch { failed = true; }
      if (!failed) throw new Error('Malformed tenant profile payload must fail closed');
    });

    try {
      for (const test of tests) {
        await test();
        passed += 1;
      }
    } finally {
      globalThis.fetch = originalFetch;
    }

    const result = { passed, failed: tests.length - passed, total: tests.length };
    console.log(`AdminTenantClient ${result.passed}/${result.total} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('adminTenantClientTestRunner')) {
  AdminTenantClientTestRunner.runAllTests()
    .then((result) => { if (result.failed) process.exit(1); })
    .catch((error) => { console.error(error); process.exit(1); });
}
