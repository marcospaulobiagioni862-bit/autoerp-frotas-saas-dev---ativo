import { FinancePeriodApiError, FinancePeriodClient } from '../financePeriodClient';

const period = {
  id: 'period-a',
  companyId: 'company-a',
  year: 2026,
  month: 8,
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  status: 'CLOSED',
  closedAt: '2026-08-22T12:00:00.000Z',
  closedBy: 'Admin A',
  createdAt: '2026-08-22T12:00:00.000Z',
  updatedAt: '2026-08-22T12:00:00.000Z',
};

export class FinancePeriodClientTestRunner {
  static async runAllTests() {
    const originalFetch = globalThis.fetch;
    let passed = 0;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let url = '';
      let credentials: RequestCredentials | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        credentials = init?.credentials;
        return new Response(JSON.stringify({ items: [period] }), { status: 200 });
      }) as typeof fetch;
      const result = await FinancePeriodClient.list();
      if (url !== '/api/finance/periods' || credentials !== 'include' || result[0]?.id !== period.id) {
        throw new Error('period list transport');
      }
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: period }), { status: 201 });
      }) as typeof fetch;
      const result = await FinancePeriodClient.close('2026-08-01', '2026-08-31');
      if (result.status !== 'CLOSED' || body.startDate !== '2026-08-01' || body.endDate !== '2026-08-31') {
        throw new Error('period close transport');
      }
      for (const key of ['companyId', 'userId', 'userName', 'closedBy']) {
        if (key in body) throw new Error(`browser authority leaked on close: ${key}`);
      }
    });

    tests.push(async () => {
      let url = '';
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: { ...period, status: 'OPEN', reopenReason: 'Correção contábil' } }), { status: 200 });
      }) as typeof fetch;
      const result = await FinancePeriodClient.reopen('period-a', 'Correção contábil');
      if (url !== '/api/finance/periods/period-a/reopen' || result.status !== 'OPEN' || body.reason !== 'Correção contábil') {
        throw new Error('period reopen transport');
      }
      for (const key of ['companyId', 'userId', 'userName', 'reopenedBy']) {
        if (key in body) throw new Error(`browser authority leaked on reopen: ${key}`);
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let thrown: unknown;
      try {
        await FinancePeriodClient.close('2026-08-01', '2026-08-31');
      } catch (error) {
        thrown = error;
      }
      if (!(thrown instanceof FinancePeriodApiError) || thrown.status !== 403) {
        throw new Error('period close must fail closed on 403');
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ id: 'bad' }] }), { status: 200 })) as typeof fetch;
      let failed = false;
      try {
        await FinancePeriodClient.list();
      } catch {
        failed = true;
      }
      if (!failed) throw new Error('malformed period list must fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response('not-json', { status: 500 })) as typeof fetch;
      let thrown: unknown;
      try {
        await FinancePeriodClient.reopen('period-a', 'reason');
      } catch (error) {
        thrown = error;
      }
      if (!(thrown instanceof FinancePeriodApiError) || thrown.status !== 500) {
        throw new Error('period reopen must fail closed on server error');
      }
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
    console.log(`FinancePeriodClient ${result.passed}/${result.total} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('financePeriodClientTestRunner')) {
  FinancePeriodClientTestRunner.runAllTests()
    .then((result) => { if (result.failed) process.exit(1); })
    .catch((error) => { console.error(error); process.exit(1); });
}
