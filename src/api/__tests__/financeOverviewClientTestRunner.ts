import { FinanceOverviewApiError, FinanceOverviewClient } from '../financeOverviewClient';

export class FinanceOverviewClientTestRunner {
  static async runAllTests() {
    const originalFetch = globalThis.fetch;
    let passed = 0;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let seenUrl = '';
      let seenCredentials: RequestCredentials | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        seenUrl = String(input);
        seenCredentials = init?.credentials;
        return new Response(JSON.stringify({ totalReceivable: 10, totalPayable: 5, totalBalance: 30 }), { status: 200 });
      }) as typeof fetch;
      const result = await FinanceOverviewClient.getOverview();
      if (seenUrl !== '/api/finance/overview' || seenCredentials !== 'include' || result.totalBalance !== 30) {
        throw new Error('overview request contract failed');
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({
        totalReceivable: '100.50', totalPayable: '20.25', totalBalance: '80.25',
      }), { status: 200 })) as typeof fetch;
      const result = await FinanceOverviewClient.getOverview();
      if (result.totalReceivable !== 100.5 || result.totalPayable !== 20.25 || result.totalBalance !== 80.25) {
        throw new Error('numeric normalization failed');
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;
      let thrown: unknown;
      try { await FinanceOverviewClient.getOverview(); } catch (error) { thrown = error; }
      if (!(thrown instanceof FinanceOverviewApiError) || thrown.status !== 401) {
        throw new Error('HTTP failure must fail closed');
      }
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({
        totalReceivable: 1, totalPayable: 2, totalBalance: 'not-a-number',
      }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await FinanceOverviewClient.getOverview(); } catch { failed = true; }
      if (!failed) throw new Error('invalid payload must be rejected');
    });

    try {
      for (const run of tests) {
        await run();
        passed += 1;
      }
    } finally {
      globalThis.fetch = originalFetch;
    }

    const result = { passed, failed: tests.length - passed, total: tests.length };
    console.log(`FinanceOverviewClient ${result.passed}/${result.total} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('financeOverviewClientTestRunner')) {
  FinanceOverviewClientTestRunner.runAllTests().then((result) => {
    if (result.failed) process.exit(1);
  }).catch((error) => { console.error(error); process.exit(1); });
}
