import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { ContractExecutionAuthorityIntegrationRunner } from './contractExecutionAuthorityIntegration';
import { runContractSuspendRegression } from './contractSuspendRegression';
import { runContractTemplateFileSourceRegression } from './contractTemplateFileSourceRegression';
import { runContractDocxTemplateRendererRegression } from './contractDocxTemplateRendererRegression';
import { runContractDocxPackageRendererRegression } from './contractDocxPackageRendererRegression';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function ensureCurrentActivationPrerequisites(): Promise<void> {
  await db.execute(sql`
    INSERT INTO file_attachments (
      id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
      size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
    ) VALUES
      ('signature-time-att-a1', 'security-2i4c-company-a', 'Vehicle', 'Vehicle', 'i4c-veh-a1', 'CRLV', 'signature-time-a1.pdf', 'application/pdf', 'attachment://signature-time-a1', 10, 10, 'SERVER_FS', 'signature-time/a1', repeat('a',64), 'security-2i4c-admin-a', false, 'AVAILABLE', NOW()),
      ('signature-time-att-a2', 'security-2i4c-company-a', 'Vehicle', 'Vehicle', 'i4c-veh-a2', 'CRLV', 'signature-time-a2.pdf', 'application/pdf', 'attachment://signature-time-a2', 10, 10, 'SERVER_FS', 'signature-time/a2', repeat('b',64), 'security-2i4c-admin-a', false, 'AVAILABLE', NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO documents (
      id, company_id, subject_type, subject_id, document_type, reference_year, expiration_date, attachment_id,
      version_number, is_current, is_archived, cost, created_by, created_at, updated_at
    ) VALUES
      ('signature-time-doc-a1-ipva', 'security-2i4c-company-a', 'VEHICLE', 'i4c-veh-a1', 'IPVA', 2026, '2035-01-01', 'signature-time-att-a1', 1, true, false, 0, 'security-2i4c-admin-a', NOW(), NOW()),
      ('signature-time-doc-a1-crlv', 'security-2i4c-company-a', 'VEHICLE', 'i4c-veh-a1', 'CRLV', 2026, '2035-01-01', 'signature-time-att-a1', 1, true, false, 0, 'security-2i4c-admin-a', NOW(), NOW()),
      ('signature-time-doc-a1-lic', 'security-2i4c-company-a', 'VEHICLE', 'i4c-veh-a1', 'LICENCIAMENTO', 2026, '2035-01-01', 'signature-time-att-a1', 1, true, false, 0, 'security-2i4c-admin-a', NOW(), NOW()),
      ('signature-time-doc-a2-ipva', 'security-2i4c-company-a', 'VEHICLE', 'i4c-veh-a2', 'IPVA', 2026, '2035-01-01', 'signature-time-att-a2', 1, true, false, 0, 'security-2i4c-admin-a', NOW(), NOW()),
      ('signature-time-doc-a2-crlv', 'security-2i4c-company-a', 'VEHICLE', 'i4c-veh-a2', 'CRLV', 2026, '2035-01-01', 'signature-time-att-a2', 1, true, false, 0, 'security-2i4c-admin-a', NOW(), NOW()),
      ('signature-time-doc-a2-lic', 'security-2i4c-company-a', 'VEHICLE', 'i4c-veh-a2', 'LICENCIAMENTO', 2026, '2035-01-01', 'signature-time-att-a2', 1, true, false, 0, 'security-2i4c-admin-a', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET is_current=true, is_archived=false, expiration_date='2035-01-01', updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO insurances (
      id, company_id, vehicle_id, insurance_company, policy_number, coverage_details,
      deductible_amount, total_premium_amount, installments_count, start_date, end_date, status,
      account_payable_ids, created_by, created_at, updated_at
    ) VALUES
      ('signature-time-ins-a1', 'security-2i4c-company-a', 'i4c-veh-a1', 'Seguradora Teste', 'SIGN-A1', 'Cobertura teste', 0, 0, 1, '2026-01-01', '2035-01-01', 'ACTIVE', '[]'::jsonb, 'security-2i4c-admin-a', NOW(), NOW()),
      ('signature-time-ins-a2', 'security-2i4c-company-a', 'i4c-veh-a2', 'Seguradora Teste', 'SIGN-A2', 'Cobertura teste', 0, 0, 1, '2026-01-01', '2035-01-01', 'ACTIVE', '[]'::jsonb, 'security-2i4c-admin-a', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status='ACTIVE', start_date='2026-01-01', end_date='2035-01-01', updated_at=NOW()
  `);
}

/**
 * CONTRACT-SIGNATURE-TIME-GATE-1
 * Reuses the authoritative execution suite and intercepts its signature registration.
 * The suite intentionally submits a historical signedAt (2026-08-19) after generating
 * the current PDF. That first request must fail closed. The interceptor then retries
 * the same evidence with the current timestamp so the authoritative suite can continue.
 * The legacy suite also predates later contract activation prerequisites; this wrapper
 * supplies only deterministic test fixtures required by the current server contract.
 */
export async function runContractSignatureTimeGateRegression(): Promise<void> {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const originalStorageDir = process.env.ATTACHMENT_STORAGE_DIR;
  const activationCategoryId = 'signature-time-gate-income';
  const currentDate = new Date().toISOString().slice(0, 10);
  const contractsNeedingCurrentDate = new Set(['CNT-I4C-A-001', 'CNT-I4C-LEGACY']);
  process.env.ATTACHMENT_STORAGE_DIR = await mkdtemp(join(tmpdir(), 'autoerp-signature-time-gate-'));
  let rejectedHistoricalSignature = false;
  let activationPrerequisitesReady = false;

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
      if (typeof body.contractNumber === 'string' && contractsNeedingCurrentDate.has(body.contractNumber)) {
        return await originalFetch(input, {
          ...init,
          body: JSON.stringify({ ...body, startDate: currentDate }),
        });
      }
    }

    if (
      requestMethod === 'POST' &&
      /\/api\/contracts\/[^/]+\/activate$/.test(requestUrl) &&
      typeof init?.body === 'string'
    ) {
      if (!activationPrerequisitesReady) {
        await ensureCurrentActivationPrerequisites();
        activationPrerequisitesReady = true;
      }
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

  await runContractSuspendRegression();
  await runContractTemplateFileSourceRegression();
  await runContractDocxTemplateRendererRegression();
  await runContractDocxPackageRendererRegression();
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
