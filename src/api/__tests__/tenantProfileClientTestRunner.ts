import { TenantProfileClient } from '../tenantProfileClient';

const profile = {
  companyId: 'company-a',
  companyName: 'MoveFlex',
  document: '12345678000199',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  maxVehiclesLimit: 500,
  maxDriversLimit: 1000,
  updatedAt: '2026-08-24T20:00:00.000Z',
  updatedBy: 'admin-a',
};

export class TenantProfileClientTestRunner {
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
        return new Response(JSON.stringify({ item: profile }), { status: 200 });
      }) as typeof fetch;
      const result = await TenantProfileClient.get();
      if (url !== '/api/admin/tenant-profile' || credentials !== 'include' || body !== undefined || result.companyId !== profile.companyId) {
        throw new Error('Tenant profile GET transport contract failed');
      }
      if (/companyId|userId|role=/.test(url)) throw new Error('Tenant profile GET must not send browser authority');
    });

    tests.push(async () => {
      let method = '';
      let credentials: RequestCredentials | undefined;
      let sent: unknown;
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = init?.method || '';
        credentials = init?.credentials;
        sent = init?.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(JSON.stringify({ item: { ...profile, companyName: 'MoveFlex Locação' } }), { status: 200 });
      }) as typeof fetch;
      const result = await TenantProfileClient.update({
        companyName: 'MoveFlex Locação',
        timezone: 'America/Sao_Paulo',
        currency: 'BRL',
        maxVehiclesLimit: 750,
        maxDriversLimit: 1500,
      });
      if (method !== 'PATCH' || credentials !== 'include' || result.companyName !== 'MoveFlex Locação') {
        throw new Error('Tenant profile PATCH transport contract failed');
      }
      const body = sent as Record<string, unknown>;
      const keys = Object.keys(body).sort().join(',');
      if (keys !== 'companyName,currency,maxDriversLimit,maxVehiclesLimit,timezone') {
        throw new Error('Tenant profile PATCH must send exact mutable allowlist');
      }
      if ('companyId' in body || 'document' in body || 'updatedBy' in body || 'userId' in body || 'role' in body) {
        throw new Error('Tenant profile PATCH must not send immutable/browser authority fields');
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let failed = false;
      try { await TenantProfileClient.get(); } catch { failed = true; }
      if (!failed) throw new Error('Tenant profile client HTTP error must fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...profile, maxDriversLimit: 'many' } }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await TenantProfileClient.get(); } catch { failed = true; }
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
    console.log(`TenantProfileClient ${result.passed}/${result.total} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('tenantProfileClientTestRunner')) {
  TenantProfileClientTestRunner.runAllTests()
    .then((result) => { if (result.failed) process.exit(1); })
    .catch((error) => { console.error(error); process.exit(1); });
}
