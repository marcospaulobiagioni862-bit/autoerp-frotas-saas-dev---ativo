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

/**
 * CONTRACT-CANCEL-LIFECYCLE-GATE-1
 * Runs the authoritative contract integration suite and injects one extra assertion exactly
 * after the first successful activation: cancelling an ACTIVE contract must fail closed and
 * must not mutate contract, vehicle binding, receivables or Contract audit history.
 */
export async function runContractCancelLifecycleRegression(): Promise<void> {
  const originalFetch = globalThis.fetch.bind(globalThis);
  let activeCancelChecked = false;

  globalThis.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const response = await originalFetch(input, init);
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const requestMethod = String(init?.method ?? (typeof input === 'string' || input instanceof URL ? 'GET' : input.method)).toUpperCase();

    if (!activeCancelChecked && requestMethod === 'POST' && requestUrl.endsWith('/activate') && response.status === 200) {
      const payload = await response.clone().json() as { item?: { id?: string } };
      const contractId = payload.item?.id;
      assert(contractId, 'successful activation did not expose contract id for lifecycle regression');

      const contractBefore = await scalar(sql`
        SELECT status, vehicle_id, driver_id, end_date
        FROM contracts
        WHERE id=${contractId}
      `);
      assert(contractBefore?.status === ContractStatus.ACTIVE, 'pre-cancel contract must be ACTIVE');
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

      const cancelResponse = await originalFetch(requestUrl.replace(/\/activate$/, '/cancel'), {
        method: 'POST',
        headers: init?.headers,
        body: JSON.stringify({ reason: 'Contrato ativo deve ser encerrado pelo fluxo close' }),
      });
      assert(cancelResponse.status === 409, `ACTIVE cancel expected 409, got ${cancelResponse.status}`);

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

      assert(contractAfter?.status === ContractStatus.ACTIVE && !contractAfter?.end_date, 'ACTIVE cancel mutated contract lifecycle');
      assert(contractAfter?.vehicle_id === contractBefore.vehicle_id && contractAfter?.driver_id === contractBefore.driver_id, 'ACTIVE cancel changed contract bindings');
      assert(vehicleBefore?.status === VehicleStatus.RENTED, 'pre-cancel vehicle must be RENTED');
      assert(vehicleAfter?.status === VehicleStatus.RENTED, 'ACTIVE cancel released vehicle');
      assert(vehicleAfter?.current_contract_id === contractId, 'ACTIVE cancel removed vehicle contract binding');
      assert(vehicleAfter?.current_driver_id === contractBefore.driver_id, 'ACTIVE cancel removed vehicle driver binding');
      assert(Number(receivablesAfter?.count) === Number(receivablesBefore?.count), 'ACTIVE cancel mutated receivables');
      assert(Number(auditsAfter?.count) === Number(auditsBefore?.count), 'ACTIVE cancel created Contract audit mutation');
      activeCancelChecked = true;
    }

    return response;
  }) as typeof fetch;

  try {
    await ContractAuthorityIntegrationRunner.runAllTests();
    assert(activeCancelChecked, 'ACTIVE cancel lifecycle regression was not exercised');
  } finally {
    globalThis.fetch = originalFetch as typeof fetch;
  }
}

if (process.argv[1]?.includes('contractCancelLifecycleRegression')) {
  runContractCancelLifecycleRegression()
    .then(() => console.log('Contract cancel lifecycle regression PASS'))
    .catch((error) => {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`::error title=Contract cancel lifecycle regression::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
      process.exitCode = 1;
    });
}
