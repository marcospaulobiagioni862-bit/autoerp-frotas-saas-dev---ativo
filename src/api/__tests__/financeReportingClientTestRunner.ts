import { FinanceReportingApiError, FinanceReportingClient } from '../financeReportingClient';
import { AccountingRegime } from '../../types/enums';

const dreReport = {
  periodStart: '2026-01-01', periodEnd: '2026-12-31', regime: AccountingRegime.CASH,
  grossRevenue: { code: '1', description: 'gross', amount: 100 },
  deductions: { code: '2', description: 'ded', amount: 0 },
  netRevenue: { code: '3', description: 'net', amount: 100 },
  directCosts: { code: '4', description: 'cost', amount: 40 },
  grossProfit: { code: '5', description: 'profit', amount: 60 },
  operatingExpenses: { code: '6', description: 'opex', amount: 0 },
  operatingProfit: { code: '7', description: 'op', amount: 60 },
  financialResult: { code: '8', description: 'fin', amount: 0 },
  netIncome: { code: '9', description: 'income', amount: 60 },
  netProfit: 60, breakdown: { maintenanceCosts: 16, insuranceCosts: 12, trackerCosts: 8, trafficTicketCosts: 4 },
};

const profitabilityReport = {
  vehicleId: 'veh-1', plate: '', model: '', brand: '', status: '', regime: AccountingRegime.CASH,
  periodStart: '2026-01-01', periodEnd: '2026-12-31', kmTraveledPeriod: 0,
  rentalIncome: 1000, kmExcessIncome: 100, finesReimbursedIncome: 50, otherIncome: 0, totalIncome: 1150, grossRevenue: 1150,
  maintenanceExpense: 200, insuranceExpense: 100, trackerExpense: 50, documentationExpense: 25, finesCompanyExpense: 10,
  financingExpense: 15, depreciationExpense: 0, otherExpense: 20, totalExpense: 420, totalExpenses: 420,
  netProfit: 730, profitMarginPercentage: 63.48, marginPercentage: 63.48, costPerKm: 0, revenuePerKm: 0,
};

export class FinanceReportingClientTestRunner {
  static async runAllTests() {
    const originalFetch = globalThis.fetch;
    let passed = 0;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let url = ''; let credentials: RequestCredentials | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input); credentials = init?.credentials;
        return new Response(JSON.stringify({ report: dreReport }), { status: 200 });
      }) as typeof fetch;
      const result = await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.CASH);
      if (!url.includes('/api/finance/reports/dre?') || !url.includes('regime=CASH') || credentials !== 'include' || result.netProfit !== 60) throw new Error('DRE transport contract failed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;
      let thrown: unknown; try { await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.CASH); } catch (e) { thrown = e; }
      if (!(thrown instanceof FinanceReportingApiError) || thrown.status !== 401) throw new Error('DRE HTTP failure must fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ report: { netProfit: 'bad' } }), { status: 200 })) as typeof fetch;
      let failed = false; try { await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.ACCRUAL); } catch { failed = true; }
      if (!failed) throw new Error('Malformed DRE must fail closed');
    });

    tests.push(async () => {
      let body: unknown = 'not-set';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { body = init?.body; return new Response(JSON.stringify({ report: dreReport }), { status: 200 }); }) as typeof fetch;
      await FinanceReportingClient.getDRE('2026-01-01','2026-12-31',AccountingRegime.CASH);
      if (body !== undefined) throw new Error('DRE GET must not send browser identity/body');
    });

    tests.push(async () => {
      let url = ''; let credentials: RequestCredentials | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input); credentials = init?.credentials;
        return new Response(JSON.stringify({ report: profitabilityReport }), { status: 200 });
      }) as typeof fetch;
      const result = await FinanceReportingClient.getVehicleProfitability('veh-1','2026-01-01','2026-12-31',AccountingRegime.CASH);
      if (!url.includes('/api/finance/reports/vehicle-profitability?') || !url.includes('vehicleId=veh-1') || credentials !== 'include' || result.netProfit !== 730) throw new Error('Profitability transport contract failed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;
      let thrown: unknown; try { await FinanceReportingClient.getVehicleProfitability('veh-1','2026-01-01','2026-12-31',AccountingRegime.CASH); } catch (e) { thrown = e; }
      if (!(thrown instanceof FinanceReportingApiError) || thrown.status !== 401) throw new Error('Profitability HTTP failure must fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ report: { vehicleId: 'veh-1', netProfit: 'bad' } }), { status: 200 })) as typeof fetch;
      let failed = false; try { await FinanceReportingClient.getVehicleProfitability('veh-1','2026-01-01','2026-12-31',AccountingRegime.ACCRUAL); } catch { failed = true; }
      if (!failed) throw new Error('Malformed profitability must fail closed');
    });

    tests.push(async () => {
      let body: unknown = 'not-set'; let url = '';
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { body = init?.body; url = String(input); return new Response(JSON.stringify({ report: profitabilityReport }), { status: 200 }); }) as typeof fetch;
      await FinanceReportingClient.getVehicleProfitability('veh-1','2026-01-01','2026-12-31',AccountingRegime.CASH);
      if (body !== undefined || /companyId=|userId=|userName=/.test(url)) throw new Error('Profitability GET must not send browser authority');
    });

    try { for (const test of tests) { await test(); passed += 1; } } finally { globalThis.fetch = originalFetch; }
    const result = { passed, failed: tests.length - passed, total: tests.length };
    console.log(`FinanceReportingClient ${result.passed}/${result.total} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('financeReportingClientTestRunner')) {
  FinanceReportingClientTestRunner.runAllTests().then(r => { if (r.failed) process.exit(1); }).catch(e => { console.error(e); process.exit(1); });
}
