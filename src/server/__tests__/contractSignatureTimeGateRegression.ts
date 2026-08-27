import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { ContractExecutionAuthorityIntegrationRunner } from './contractExecutionAuthorityIntegration';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

/**
 * CONTRACT-SIGNATURE-TIME-GATE-1
 * Reuses the authoritative execution suite and intercepts its signature registration.
 * The suite intentionally submits a historical signedAt (2026-08-19) after generating
 * the current PDF. That first request must fail closed. The interceptor then retries
 * the same evidence with the current timestamp so the authoritative suite can continue.
 * The legacy suite also carries a fixed future contract start date and predates the
 * categoryId activation authority; this wrapper aligns only those fixtures with the
 * current server contract while preserving both production gates.
 */
export async function runContractSignatureTimeGateRegression(): Promise<void> {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const originalStorageDir = process.env.ATTACHMENT_STORAGE_DIR;
  const activationCategoryId = 'signature-time-gate-income';
  process.env.ATTACHMENT_STORAGE_DIR = await mkdtemp(join(tmpdir(), 'autoerp-signature-time-gate-'));
  let rejectedHistoricalSignature = false;

  await db.execute(sql`
    INSERT INTO financial_categories (id, company_id, name, type, active, created_at, updated_at)
    VALUES (${activationCategoryId}, 'security-2i4c-company-a', 'Signature Time Gate Rental Income', 'INCOME', true, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET active=true, type='INCOME', updated_at=NOW()
  `);

  globalThis.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const requestMethod = String(
      init?.method ?? (typeof input === 'string' || input instanceof URL ? 'GET' : input.method)
    ).toUpperCase();

    if (
      requestMethod === 'POST' &&
      /\/api\/contracts$/.test(requestUrl) &&
      typeof init?.body === 'string'
    ) {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (body.contractNumber === 'CNT-I4C-A-001') {
        return await originalFetch(input, {
          ...init,
          body: JSON.stringify({ ...body, startDate: new Date().toISOString().slice(0, 10) }),
        });
      }
    }

    if (
      requestMethod === 'POST' &&
      /\/api\/contracts\/[^/]+\/activate$/.test(requestUrl) &&
      typeof init?.body === 'string'
    ) {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (Object.keys(body).length === 0) {
        return await originalFetch(input, {
          ...init,
          body: JSON.stringify({ categoryId: activationCategoryId }),
        });
      }
    }

    if (
      !rejectedHistoricalSignature &&
      requestMethod === 'POST' &&
      /\/api\/contracts\/[^/]+\/signature-evidence$/.test(requestUrl) &&
      typeof init?.body === 'string'
    ) {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (body.signedAt === '2026-08-19T17:00:00.000Z') {
        const contractId = decodeURIComponent(requestUrl.match(/\/api\/contracts\/([^/]+)\/signature-evidence$/)?.[1] || '');
        assert(contractId, 'signature time regression could not resolve contract id');

        const beforeArtifact = await scalar(sql`
          SELECT count(*)::int AS count
          FROM contract_artifacts
          WHERE contract_id=${contractId} AND artifact_type='SIGNED_EVIDENCE' AND is_current=true
        `);
        const beforeAudit = await scalar(sql`
          SELECT count(*)::int AS count
          FROM audit_logs
          WHERE entity_type='ContractArtifact'
        `);

        const rejected = await originalFetch(input, init);
        assert(rejected.status === 409, `historical signedAt expected 409, got ${rejected.status}`);

        const afterArtifact = await scalar(sql`
          SELECT count(*)::int AS count
          FROM contract_artifacts
          WHERE contract_id=${contractId} AND artifact_type='SIGNED_EVIDENCE' AND is_current=true
        `);
        const afterAudit = await scalar(sql`
          SELECT count(*)::int AS count
          FROM audit_logs
          WHERE entity_type='ContractArtifact'
        `);
        assert(Number(afterArtifact?.count) === Number(beforeArtifact?.count), 'historical signedAt created signed evidence');
        assert(Number(afterAudit?.count) === Number(beforeAudit?.count), 'historical signedAt created audit mutation');
        rejectedHistoricalSignature = true;

        return await originalFetch(input, {
          ...init,
          body: JSON.stringify({ ...body, signedAt: new Date().toISOString() }),
        });
      }
    }

    return await originalFetch(input, init);
  }) as typeof fetch;

  try {
    await ContractExecutionAuthorityIntegrationRunner.runAllTests();
    assert(rejectedHistoricalSignature, 'signature time regression was not exercised');
  } finally {
    globalThis.fetch = originalFetch as typeof fetch;
    if (originalStorageDir === undefined) delete process.env.ATTACHMENT_STORAGE_DIR;
    else process.env.ATTACHMENT_STORAGE_DIR = originalStorageDir;
  }
}

if (process.argv[1]?.includes('contractSignatureTimeGateRegression')) {
  runContractSignatureTimeGateRegression()
    .then(() => console.log('Contract signature time gate regression PASS'))
    .catch((error) => {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`::error title=Contract signature time gate regression::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
      process.exitCode = 1;
    });
}
