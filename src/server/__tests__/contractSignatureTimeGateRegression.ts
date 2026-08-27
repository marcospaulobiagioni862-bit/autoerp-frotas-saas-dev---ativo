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
 */
export async function runContractSignatureTimeGateRegression(): Promise<void> {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const originalStorageDir = process.env.ATTACHMENT_STORAGE_DIR;
  process.env.ATTACHMENT_STORAGE_DIR = await mkdtemp(join(tmpdir(), 'autoerp-signature-time-gate-'));
  let rejectedHistoricalSignature = false;

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
          WHERE entity_name='ContractArtifact'
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
          WHERE entity_name='ContractArtifact'
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
