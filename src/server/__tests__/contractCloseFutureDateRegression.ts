import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { ContractStatus, VehicleStatus } from '../../types/enums';
import { ContractAuthorityIntegrationRunner } from './contractAuthorityIntegration';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

function futureDate(days = 2): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * CONTRACT-CLOSE-FUTURE-DATE-GATE-1
 * Runs the authoritative contract integration suite and injects one extra assertion exactly
 * after the first successful activation: closing an ACTIVE contract with a future closeDate
 * must fail closed and preserve contract, vehicle binding, receivables and audit history.
 */
export async function runContractCloseFutureDateRegression(): Promise<void> {
  const originalFetch = globalThis.fetch.bind(globalThis);
  let futureCloseChecked = false;

  globalThis.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const response = await originalFetch(input, init);
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const requestMethod = String(init?.method ?? (typeof input === 'string' || input instanceof URL ? 'GET' : input.method)).toUpperCase();

    if (!futureCloseChecked && requestMethod === 'POST' && requestUrl.endsWith('/activate') && response.status === 200) {
      const payload = await response.clone().json() as { item?: { id?: string } };
      const contractId = payload.item?.id;
      assert(contractId, 'successful activation did not expose contract id for future-date regression');

      const contractBefore = await scalar(sql`
        SELECT status, vehicle_id, driver_id, end_date
        FROM contracts
        WHERE id=${contractId}
      `);
      assert(contractBefore?.status === ContractStatus.ACTIVE, 'pre-close contract must be ACTIVE');

      const vehicleBefore = await scalar(sql`
        SELECT status, current_driver_id, current_contract_id
        FROM vehicles
        WHERE id=${contractBefore.vehicle_id}
      `);
      const receivablesBefore = await scalar(sql`
        SELECT count(*)::int AS count
        FROM account_receivables
        WHERE contract_id=${contractId}
      `);
      const auditsBefore = await scalar(sql`
        SELECT count(*)::int AS count
        FROM audit_logs
        WHERE entity_type='Contract' AND entity_id=${contractId}
      `);

      const closeResponse = await originalFetch(requestUrl.replace(/\/activate$/, '/close'), {
        method: 'POST',
        headers: init?.headers,
        body: JSON.stringify({ closeDate: futureDate(), reason: 'Data futura deve falhar fechado' }),
      });
      assert([400, 409].includes(closeResponse.status), `future close expected 400/409, got ${closeResponse.status}`);

      const contractAfter = await scalar(sql`
        SELECT status, vehicle_id, driver_id, end_date
        FROM contracts
        WHERE id=${contractId}
      `);
      const vehicleAfter = await scalar(sql`
        SELECT status, current_driver_id, current_contract_id
        FROM vehicles
        WHERE id=${contractBefore.vehicle_id}
      `);
      const receivablesAfter = await scalar(sql`
        SELECT count(*)::int AS count
        FROM account_receivables
        WHERE contract_id=${contractId}
      `);
      const auditsAfter = await scalar(sql`
        SELECT count(*)::int AS count
        FROM audit_logs
        WHERE entity_type='Contract' AND entity_id=${contractId}
      `);

      assert(contractAfter?.status === ContractStatus.ACTIVE && !contractAfter?.end_date, 'future-date close mutated contract lifecycle');
      assert(vehicleBefore?.status === VehicleStatus.RENTED, 'pre-close vehicle must be RENTED');
      assert(vehicleAfter?.status === VehicleStatus.RENTED, 'future-date close released vehicle');
      assert(vehicleAfter?.current_contract_id === contractId, 'future-date close removed vehicle contract binding');
      assert(vehicleAfter?.current_driver_id === contractBefore.driver_id, 'future-date close removed vehicle driver binding');
      assert(Number(receivablesAfter?.count) === Number(receivablesBefore?.count), 'future-date close mutated receivables');
      assert(Number(auditsAfter?.count) === Number(auditsBefore?.count), 'future-date close created Contract audit mutation');
      futureCloseChecked = true;
    }

    return response;
  }) as typeof fetch;

  try {
    await ContractAuthorityIntegrationRunner.runAllTests();
    assert(futureCloseChecked, 'future close date regression was not exercised');
  } finally {
    globalThis.fetch = originalFetch as typeof fetch;
  }
}

if (process.argv[1]?.includes('contractCloseFutureDateRegression')) {
  runContractCloseFutureDateRegression()
    .then(() => console.log('Contract close future date regression PASS'))
    .catch((error) => {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`::error title=Contract close future date regression::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
      process.exitCode = 1;
    });
}
