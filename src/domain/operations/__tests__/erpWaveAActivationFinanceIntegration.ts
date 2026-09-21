import { sql } from 'drizzle-orm';
import { db } from '../../../db';
import { UnitOfWork } from '../../../db/uow';
import { ContractAuthorityIntegrationRunner } from '../../../server/__tests__/contractAuthorityIntegration';
import { ContractStatus, ObligationStatus, OriginType, VehicleStatus } from '../../../types/enums';
import { projectVehicleOperationalState } from '../fleetOperationalState';

const companyId = 'security-2i3-company-a';
const driverId = 'i3-drv-a1';
const vehicleId = 'i3-veh-a1';
const contractNumber = 'CNT-V2-P0-A-001';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function one(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

export class ErpWaveAActivationFinanceIntegrationRunner {
  static async runAllTests(): Promise<void> {
    // Reuse the V2 P0 scenario when the full fleet suite already executed it.
    // When this regression runs alone, bootstrap the same atomic route flow first.
    const existingAuthorityFixture = await one(sql`
      SELECT id, status FROM contracts
      WHERE company_id=${companyId} AND contract_number=${contractNumber}
      LIMIT 1
    `);
    if (!existingAuthorityFixture) {
      await ContractAuthorityIntegrationRunner.runAllTests();
    }

    const contractRow = await one(sql`
      SELECT id, company_id, driver_id, vehicle_id, status, rental_amount, security_deposit_amount
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
        count(*) FILTER (WHERE origin_type='CONTRACT_RENT')::int AS rent_count,
        count(*) FILTER (WHERE origin_type='SECURITY_DEPOSIT')::int AS deposit_count,
        count(*) FILTER (WHERE status='PENDING')::int AS pending_count,
        min(driver_id) AS driver_id,
        min(vehicle_id) AS vehicle_id,
        max(original_amount) FILTER (WHERE origin_type='CONTRACT_RENT')::numeric AS rental_amount,
        max(original_amount) FILTER (WHERE origin_type='SECURITY_DEPOSIT')::numeric AS deposit_amount
      FROM account_receivables
      WHERE company_id=${companyId}
        AND contract_id=${contractRow.id}
        AND status<>'CANCELLED'
    `);
    assert(Number(receivable?.count) === 2, 'INV-003 modern activation must leave rent and security-deposit receivables open');
    assert(Number(receivable?.rent_count) === 1, 'INV-003 document generation/activation must leave exactly one open rental receivable');
    assert(Number(receivable?.deposit_count) === 1, 'INV-003 modern activation must create exactly one security-deposit receivable');
    assert(Number(receivable?.pending_count) === 2, 'INV-003 receivables must remain PENDING before settlement');
    assert(receivable?.driver_id === driverId, 'INV-003 receivables must be linked to the contract driver');
    assert(receivable?.vehicle_id === vehicleId, 'INV-003 receivables must be linked to the contract vehicle');
    assert(Number(receivable?.rental_amount) === Number(contractRow.rental_amount), 'INV-003 rental receivable amount must equal authoritative contract rental amount');
    assert(Number(receivable?.deposit_amount) === Number(contractRow.security_deposit_amount), 'INV-003 deposit receivable amount must equal authoritative contract security deposit');

    const audit = await one(sql`
      SELECT count(*)::int AS count
      FROM audit_logs
      WHERE company_id=${companyId}
        AND entity_type='Contract'
        AND entity_id=${contractRow.id}
        AND action='CREATE'
    `);
    assert(Number(audit?.count) >= 1, 'INV-002 atomic creation must create an auditable ACTIVE contract');

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
