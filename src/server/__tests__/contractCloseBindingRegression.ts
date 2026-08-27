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
 * CONTRACT-CLOSE-BINDING-GATE-1
 * Runs the authoritative contract integration suite and injects one extra assertion exactly
 * after the first successful activation: closing an ACTIVE contract with a divergent
 * Vehicle↔Driver binding must fail closed and must not mutate contract, receivables or audit.
 */
export async function runContractCloseBindingRegression(): Promise<void> {
  const originalFetch = globalThis.fetch.bind(globalThis);
  let bindingMismatchChecked = false;

  globalThis.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const response = await originalFetch(input, init);
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const requestMethod = String(init?.method ?? (typeof input === 'string' || input instanceof URL ? 'GET' : input.method)).toUpperCase();

    if (!bindingMismatchChecked && requestMethod === 'POST' && requestUrl.endsWith('/activate') && response.status === 200) {
      const payload = await response.clone().json() as { item?: { id?: string } };
      const contractId = payload.item?.id;
      assert(contractId, 'successful activation did not expose contract id for close binding regression');

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
      assert(vehicleBefore?.status === VehicleStatus.RENTED, 'pre-close vehicle must be RENTED');
      assert(vehicleBefore?.current_contract_id === contractId, 'pre-close vehicle contract binding mismatch');
      assert(vehicleBefore?.current_driver_id === contractBefore.driver_id, 'pre-close vehicle driver binding mismatch');

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

      await db.execute(sql`
        UPDATE vehicles
        SET current_driver_id=''
        WHERE id=${contractBefore.vehicle_id}
      `);

      try {
        const closeResponse = await originalFetch(requestUrl.replace(/\/activate$/, '/close'), {
          method: 'POST',
          headers: init?.headers,
          body: JSON.stringify({ reason: 'Binding divergente deve falhar fechado' }),
        });
        assert(closeResponse.status === 409, `binding-mismatch close expected 409, got ${closeResponse.status}`);

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

        assert(contractAfter?.status === ContractStatus.ACTIVE && !contractAfter?.end_date, 'binding-mismatch close mutated contract lifecycle');
        assert(contractAfter?.vehicle_id === contractBefore.vehicle_id && contractAfter?.driver_id === contractBefore.driver_id, 'binding-mismatch close changed contract bindings');
        assert(vehicleAfter?.status === VehicleStatus.RENTED, 'binding-mismatch close released vehicle');
        assert(vehicleAfter?.current_contract_id === contractId, 'binding-mismatch close changed vehicle contract binding');
        assert(vehicleAfter?.current_driver_id === '', 'binding-mismatch close unexpectedly rewrote divergent driver binding');
        assert(Number(receivablesAfter?.count) === Number(receivablesBefore?.count), 'binding-mismatch close mutated receivables');
        assert(Number(auditsAfter?.count) === Number(auditsBefore?.count), 'binding-mismatch close created Contract audit mutation');
        bindingMismatchChecked = true;
      } finally {
        await db.execute(sql`
          UPDATE vehicles
          SET current_driver_id=${contractBefore.driver_id}
          WHERE id=${contractBefore.vehicle_id}
        `);
      }
    }

    return response;
  }) as typeof fetch;

  try {
    await ContractAuthorityIntegrationRunner.runAllTests();
    assert(bindingMismatchChecked, 'close binding regression was not exercised');
  } finally {
    globalThis.fetch = originalFetch as typeof fetch;
  }
}

if (process.argv[1]?.includes('contractCloseBindingRegression')) {
  runContractCloseBindingRegression()
    .then(() => console.log('Contract close binding regression PASS'))
    .catch((error) => {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`::error title=Contract close binding regression::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
      process.exitCode = 1;
    });
}
