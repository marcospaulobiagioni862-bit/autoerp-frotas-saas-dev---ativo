import { FinanceOverdueApiError, FinanceOverdueClient } from '../financeOverdueClient';

const delinquencyItem = {
  companyId: 'tenant-server-only', receivableId: 'rec-1', originType: 'CONTRACT', originId: 'contract-1',
  driverId: 'drv-1', vehicleId: 'veh-1', contractId: 'ctr-1', dueDate: '2026-08-01', daysOverdue: 26,
  originalAmount: 1000, receivedAmount: 200, lateFee: 16, interest: 8, updatedOutstandingAmount: 824,
};

const agingReport = {
  'A VENCER': 100, '1-7': 10, '8-15': 20, '16-30': 30, '31-60': 40, '61-90': 50, '90+': 60,
  aVencer: 100, '1_7': 10, '8_15': 20, '16_30': 30, '31_60': 40, '61_90': 50, '90_plus': 60,
};

export class FinanceOverdueClientTestRunner {
  static async runAllTests() {
    const originalFetch = globalThis.fetch;
    let passed = 0;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let url = ''; let credentials: RequestCredentials | undefined; let body: BodyInit | null | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input); credentials = init?.credentials; body = init?.body;
        return new Response(JSON.stringify({ items: [delinquencyItem] }), { status: 200 });
      }) as typeof fetch;
      const result = await FinanceOverdueClient.getDelinquency('2026-08-27');
      if (!url.includes('/api/finance/overdue/delinquency?processingDate=2026-08-27') || credentials !== 'include' || body !== undefined) throw new Error('Delinquency transport contract failed');
      if (result.length !== 1 || result[0].updatedOutstandingAmount !== 824 || 'companyId' in result[0]) throw new Error('Delinquency sanitized view contract failed');
      if (/companyId=|userId=|userName=/.test(url)) throw new Error('Delinquency client must not send browser authority');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;
      let thrown: unknown; try { await FinanceOverdueClient.getDelinquency('2026-08-27'); } catch (e) { thrown = e; }
      if (!(thrown instanceof FinanceOverdueApiError) || thrown.status !== 401) throw new Error('Delinquency HTTP failure must fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ ...delinquencyItem, updatedOutstandingAmount: 'bad' }] }), { status: 200 })) as typeof fetch;
      let failed = false; try { await FinanceOverdueClient.getDelinquency('2026-08-27'); } catch { failed = true; }
      if (!failed) throw new Error('Malformed delinquency must fail closed');
    });

    tests.push(async () => {
      let url = ''; let credentials: RequestCredentials | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input); credentials = init?.credentials;
        return new Response(JSON.stringify({ report: agingReport }), { status: 200 });
      }) as typeof fetch;
      const result = await FinanceOverdueClient.getAging('PAYABLE', '2026-08-27');
      if (!url.includes('/api/finance/overdue/aging?type=PAYABLE') || !url.includes('processingDate=2026-08-27') || credentials !== 'include' || result.overNinety !== 60) throw new Error('Aging transport contract failed');
      if (/companyId=|userId=|userName=/.test(url)) throw new Error('Aging client must not send browser authority');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ report: { ...agingReport, '90_plus': 'bad' } }), { status: 200 })) as typeof fetch;
      let failed = false; try { await FinanceOverdueClient.getAging('RECEIVABLE', '2026-08-27'); } catch { failed = true; }
      if (!failed) throw new Error('Malformed aging must fail closed');
    });

    tests.push(async () => {
      let called = false;
      globalThis.fetch = (async () => { called = true; return new Response('{}', { status: 200 }); }) as typeof fetch;
      let failed = false; try { await FinanceOverdueClient.getDelinquency('2026-02-30'); } catch { failed = true; }
      if (!failed || called) throw new Error('Invalid processing date must fail before fetch');
    });

    try { for (const test of tests) { await test(); passed += 1; } } finally { globalThis.fetch = originalFetch; }
    const result = { passed, failed: tests.length - passed, total: tests.length };
    console.log(`FinanceOverdueClient ${result.passed}/${result.total} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('financeOverdueClientTestRunner')) {
  FinanceOverdueClientTestRunner.runAllTests().then(r => { if (r.failed) process.exit(1); }).catch(e => { console.error(e); process.exit(1); });
}
