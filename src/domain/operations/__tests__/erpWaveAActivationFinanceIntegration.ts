import { sql } from 'drizzle-orm';
import { db } from '../../../db';
import { UnitOfWork } from '../../../db/uow';
import { ContractExecutionAuthorityIntegrationRunner } from '../../../server/__tests__/contractExecutionAuthorityIntegration';
import { ContractStatus, ObligationStatus, OriginType, VehicleStatus } from '../../../types/enums';
import { projectVehicleOperationalState } from '../fleetOperationalState';

const companyId = 'security-2i4c-company-a';
const driverId = 'i4c-drv-a1';
const vehicleId = 'i4c-veh-a1';
const contractNumber = 'CNT-I4C-A-001';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function one(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

export class ErpWaveAActivationFinanceIntegrationRunner {
  static async runAllTests(): Promise<void> {
    // Reuse the authoritative scenario when the full fleet suite already executed it.
    // When this regression runs alone, bootstrap the same real scenario first.
    const existingAuthorityFixture = await one(sql`
      SELECT id, status FROM contracts
      WHERE company_id=${companyId} AND contract_number=${contractNumber}
      LIMIT 1
    `);
    if (!existingAuthorityFixture) {
      await ContractExecutionAuthorityIntegrationRunner.runAllTests();
    }

    const contractRow = await one(sql`
      SELECT id, company_id, driver_id, vehicle_id, status, rental_amount
      FROM contracts
      WHERE company_id=${companyId} AND contract_number=${contractNumber}
      LIMIT 1
    `);
    assert(contractRow, 'INV-002 contract fixture missing after authority execution');
    assert(contractRow.status === ContractStatus.ACTIVE, 'INV-002 contract must finish ACTIVE');
    assert(contractRow.driver_id === driverId, 'INV-002 contract driver binding mismatch');
    assert(contractRow.vehicle_id === vehicleId, 'INV-002 contract vehicle binding mismatch');

    const vehicleRow = await one(sql`
      SELECT id, status, current_driver_id, current_contract_id, is_archived
      FROM vehicles
      WHERE company_id=${companyId} AND id=${vehicleId}
      LIMIT 1
    `);
    assert(vehicleRow?.status === VehicleStatus.RENTED, 'INV-002 ACTIVE contract must make vehicle RENTED');
    assert(vehicleRow?.current_driver_id === driverId, 'INV-002 vehicle current driver mismatch');
    assert(vehicleRow?.current_contract_id === contractRow.id, 'INV-002 vehicle current contract mismatch');

    const driverProjection = await UnitOfWork.run(companyId, async (tx) =>
      tx.getDriverRepo().findByIdForCompany(companyId, driverId)
    );
    assert(driverProjection, 'INV-002 driver read model missing');
    assert(driverProjection.currentVehicleId === vehicleId, 'INV-002 driver read model must derive current vehicle from the active binding');
    assert(driverProjection.currentContractId === contractRow.id, 'INV-002 driver read model must derive current contract from the active binding');

    const operational = projectVehicleOperationalState(
      {
        id: vehicleId,
        status: vehicleRow.status,
        isArchived: Boolean(vehicleRow.is_archived),
      },
      [{
        id: contractRow.id,
        vehicleId,
        driverId,
        status: contractRow.status,
        isArchived: false,
      }]
    );
    assert(operational.state === 'RENTED', 'INV-002 Dashboard projection must classify ACTIVE binding as RENTED');
    assert(operational.availableForNewContract === false, 'INV-002 active vehicle must remain unavailable for another contract');

    const receivable = await one(sql`
      SELECT
        count(*)::int AS count,
        min(id) AS id,
        min(status) AS status,
        min(origin_type) AS origin_type,
        min(driver_id) AS driver_id,
        min(vehicle_id) AS vehicle_id,
        min(original_amount)::numeric AS original_amount
      FROM account_receivables
      WHERE company_id=${companyId}
        AND contract_id=${contractRow.id}
        AND status<>'CANCELLED'
    `);
    assert(Number(receivable?.count) === 1, 'INV-003 document generation/activation must leave exactly one open rental receivable');
    assert(receivable?.status === ObligationStatus.PENDING, 'INV-003 rental receivable must remain PENDING before settlement');
    assert(receivable?.origin_type === OriginType.CONTRACT_RENT, 'INV-003 receivable origin must be CONTRACT_RENT');
    assert(receivable?.driver_id === driverId, 'INV-003 receivable must be linked to the contract driver');
    assert(receivable?.vehicle_id === vehicleId, 'INV-003 receivable must be linked to the contract vehicle');
    assert(Number(receivable?.original_amount) === Number(contractRow.rental_amount), 'INV-003 receivable amount must equal authoritative contract rental amount');

    const audit = await one(sql`
      SELECT count(*)::int AS count
      FROM audit_logs
      WHERE company_id=${companyId}
        AND entity_type='Contract'
        AND entity_id=${contractRow.id}
        AND action='UPDATE'
        AND ((changes::jsonb->>'newState')::jsonb->>'status')='ACTIVE'
    `);
    assert(Number(audit?.count) >= 1, 'INV-002 activation must create an auditable Contract ACTIVE transition');

    const duplicateBinding = await one(sql`
      SELECT count(*)::int AS count
      FROM contracts
      WHERE company_id=${companyId}
        AND id<>${contractRow.id}
        AND is_archived=false
        AND status IN ('DRAFT','AWAITING_SIGNATURE','ACTIVE','SUSPENDED')
        AND (vehicle_id=${vehicleId} OR driver_id=${driverId})
    `);
    assert(Number(duplicateBinding?.count) === 0, 'INV-002 active driver/vehicle must not have a second blocking contract');

    console.log('AUDIT-WAVE-A INV-002/INV-003 activation-finance integration: PASS');
  }
}

if (process.argv[1]?.includes('erpWaveAActivationFinanceIntegration')) {
  ErpWaveAActivationFinanceIntegrationRunner.runAllTests()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
}
