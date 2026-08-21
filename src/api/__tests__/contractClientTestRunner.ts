import { ContractApiError, ContractClient } from '../contractClient';
import { ContractStatus, ObligationStatus, OriginType, RecurringFrequency } from '../../types/enums';

const categoryId = 'finance-r3-contract-income-a';
const contract = {
  id: 'contract-1', companyId: 'company-a', contractNumber: 'CNT-20260819-ABC12345',
  driverId: 'driver-1', vehicleId: 'vehicle-1', startDate: '2026-08-19', status: ContractStatus.DRAFT,
  rentalAmount: 700, billingPeriodicity: RecurringFrequency.WEEKLY, billingDueDayOfWeek: 1,
  billingDueDayOfMonth: 1, securityDepositAmount: 1000, franchiseKm: 1500, excessKmRate: 0.5,
  signatureRequired: true, isArchived: false, createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z',
};

const receivable = {
  id: 'receivable-1', companyId: 'company-a', originType: OriginType.CONTRACT_RENT, originId: 'contract-1',
  vehicleId: 'vehicle-1', driverId: 'driver-1', contractId: 'contract-1', categoryId,
  description: 'Aluguel', originalAmount: 700, discountAmount: 0, fineAmount: 0, interestAmount: 0,
  updatedAmount: 700, paidAmount: 0, balanceAmount: 700, dueDate: '2026-08-19', competenceDate: '2026-08-19',
  status: ObligationStatus.PENDING, createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z',
};

export class ContractClientTestRunner {
  static async runAllTests(): Promise<void> {
    const originalFetch = globalThis.fetch;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let credentials = '';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        credentials = String(init?.credentials);
        return new Response(JSON.stringify({ items: [contract] }), { status: 200 });
      }) as typeof fetch;
      const items = await ContractClient.list();
      if (items.length !== 1 || credentials !== 'include') throw new Error('LIST transport');
    });

    tests.push(async () => {
      let url = '';
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        if (init?.credentials !== 'include') throw new Error('GET credentials');
        return new Response(JSON.stringify({ item: contract }), { status: 200 });
      }) as typeof fetch;
      await ContractClient.get('contract 1');
      if (!url.includes('contract%201')) throw new Error('GET encoding');
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: contract }), { status: 201 });
      }) as typeof fetch;
      await ContractClient.create({
        driverId: 'driver-1', vehicleId: 'vehicle-1', startDate: '2026-08-19', rentalAmount: 700,
        billingPeriodicity: RecurringFrequency.WEEKLY,
      });
      for (const key of ['companyId','userId','userName','role','status','isArchived','securityDepositId']) {
        if (key in body) throw new Error(`CREATE authority leaked ${key}`);
      }
    });

    tests.push(async () => {
      let method = '';
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = String(init?.method);
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: { ...contract, rentalAmount: 750 } }), { status: 200 });
      }) as typeof fetch;
      await ContractClient.update('contract-1', { rentalAmount: 750 });
      if (method !== 'PATCH' || body.rentalAmount !== 750) throw new Error('UPDATE transport');
    });

    tests.push(async () => {
      let url = '';
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: { ...contract, status: ContractStatus.ACTIVE }, receivables: [receivable] }), { status: 200 });
      }) as typeof fetch;
      const result = await ContractClient.activate('contract-1', categoryId);
      if (!url.endsWith('/activate') || body.categoryId !== categoryId || result.item.status !== ContractStatus.ACTIVE || result.receivables.length !== 1) {
        throw new Error('ACTIVATE transport');
      }
    });

    tests.push(async () => {
      const paths: string[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input); paths.push(url);
        if (url.endsWith('/close')) return new Response(JSON.stringify({ item: { ...contract, status: ContractStatus.CLOSED } }), { status: 200 });
        if (url.endsWith('/cancel')) return new Response(JSON.stringify({ item: { ...contract, status: ContractStatus.CANCELLED } }), { status: 200 });
        return new Response(JSON.stringify({ item: { ...contract, status: ContractStatus.ARCHIVED, isArchived: true } }), { status: 200 });
      }) as typeof fetch;
      await ContractClient.close('contract-1', { reason: 'fim' });
      await ContractClient.cancel('contract-1', 'cancelar');
      await ContractClient.archive('contract-1', 'arquivo');
      if (!paths.some((p) => p.endsWith('/close')) || !paths.some((p) => p.endsWith('/cancel')) || !paths.some((p) => p.endsWith('/archive'))) {
        throw new Error('lifecycle paths');
      }
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ items: [receivable] }), { status: 200 });
      }) as typeof fetch;
      const items = await ContractClient.bill('contract-1', '2026-08-26', '2026-08-26', categoryId);
      if (items.length !== 1 || body.dueDate !== '2026-08-26' || body.competenceDate !== '2026-08-26' || body.categoryId !== categoryId) throw new Error('BILL transport');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let caught: unknown;
      try { await ContractClient.activate('contract-1', categoryId); } catch (error) { caught = error; }
      if (!(caught instanceof ContractApiError) || caught.status !== 403) throw new Error('403 fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...contract, status: 'BROKEN' } }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await ContractClient.get('contract-1'); } catch { failed = true; }
      if (!failed) throw new Error('malformed Contract must fail');
    });

    try {
      for (const test of tests) await test();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}
