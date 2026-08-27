import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { ContractStatus } from '../../types/enums';
import { ContractAuthorityIntegrationRunner } from './contractAuthorityIntegration';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

/**
 * CONTRACT-BILL-PERIOD-GATE-1
 * Runs the authoritative contract integration suite and injects manual billing assertions
 * after the first successful activation. Competence outside the authoritative contract period
 * must fail closed without creating receivables or audit records, while a valid competence
 * remains billable and duplicate calls remain idempotent in the base suite.
 */
export async function runContractBillPeriodRegression(): Promise<void> {
  const originalFetch = globalThis.fetch.bind(globalThis);
  let periodGateChecked = false;

  globalThis.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const response = await originalFetch(input, init);
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const requestMethod = String(init?.method ?? (typeof input === 'string' || input instanceof URL ? 'GET' : input.method)).toUpperCase();

    if (!periodGateChecked && requestMethod === 'POST' && requestUrl.endsWith('/activate') && response.status === 200) {
      const payload = await response.clone().json() as { item?: { id?: string; startDate?: string } };
      const contractId = payload.item?.id;
      const startDate = payload.item?.startDate;
      assert(contractId && startDate, 'successful activation did not expose contract period for billing regression');

      const contractBefore = await scalar(sql`
        SELECT status, start_date, end_date
        FROM contracts
        WHERE id=${contractId}
      `);
      assert(contractBefore?.status === ContractStatus.ACTIVE, 'pre-bill contract must be ACTIVE');

      const headers = init?.headers;
      const categoryId = 'finance-r3-contract-income-a';
      const beforeStart = '2026-07-31';
      const syntheticEnd = '2026-08-31';
      const afterEnd = '2026-09-01';

      await db.execute(sql`UPDATE contracts SET end_date=${syntheticEnd} WHERE id=${contractId}`);

      try {
        const receivablesBefore = await scalar(sql`
          SELECT count(*)::int AS count
          FROM account_receivables
          WHERE contract_id=${contractId}
        `);
        const auditsBefore = await scalar(sql`SELECT count(*)::int AS count FROM audit_logs`);

        const beforeStartResponse = await originalFetch(requestUrl.replace(/\/activate$/, '/bill'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dueDate: '2026-08-05',
            competenceDate: beforeStart,
            categoryId,
          }),
        });
        assert(beforeStartResponse.status === 409, `pre-start competence expected 409, got ${beforeStartResponse.status}`);

        const afterEndResponse = await originalFetch(requestUrl.replace(/\/activate$/, '/bill'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dueDate: '2026-09-08',
            competenceDate: afterEnd,
            categoryId,
          }),
        });
        assert(afterEndResponse.status === 409, `post-end competence expected 409, got ${afterEndResponse.status}`);

        const receivablesAfter = await scalar(sql`
          SELECT count(*)::int AS count
          FROM account_receivables
          WHERE contract_id=${contractId}
        `);
        const auditsAfter = await scalar(sql`SELECT count(*)::int AS count FROM audit_logs`);

        assert(Number(receivablesAfter?.count) === Number(receivablesBefore?.count), 'invalid billing competence created receivable');
        assert(Number(auditsAfter?.count) === Number(auditsBefore?.count), 'invalid billing competence created audit record');
        periodGateChecked = true;
      } finally {
        await db.execute(sql`UPDATE contracts SET end_date=${contractBefore.end_date ?? null} WHERE id=${contractId}`);
      }
    }

    return response;
  }) as typeof fetch;

  try {
    await ContractAuthorityIntegrationRunner.runAllTests();
    assert(periodGateChecked, 'contract billing period regression was not exercised');
  } finally {
    globalThis.fetch = originalFetch as typeof fetch;
  }
}

if (process.argv[1]?.includes('contractBillPeriodRegression')) {
  runContractBillPeriodRegression()
    .then(() => console.log('Contract bill period regression PASS'))
    .catch((error) => {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`::error title=Contract bill period regression::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
      process.exitCode = 1;
    });
}
