import { requireContractEffectivePeriod } from '../contractEffectivePeriod';
import type { Contract } from '../../../types/entities';
import { ContractStatus, RecurringFrequency } from '../../../types/enums';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const contract = {
    id: 'contract-v2-core',
    companyId: 'company-v2',
    contractNumber: 'CNT-000001',
    driverId: 'driver-v2',
    vehicleId: 'vehicle-v2',
    startDate: '2026-09-17',
    status: ContractStatus.DRAFT,
    rentalAmount: 700,
    billingPeriodicity: RecurringFrequency.WEEKLY,
    billingDueDayOfWeek: 4,
    billingDueDayOfMonth: 1,
    securityDepositAmount: 0,
    franchiseKm: 0,
    excessKmRate: 0,
    signatureRequired: true,
    isArchived: false,
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T10:00:00.000Z',
  } as Contract;

  const period = await requireContractEffectivePeriod(contract, {} as never);

  assert(period.effectiveStartDate === contract.startDate, 'V2 deve usar a data inicial salva como vigência operacional.');
  assert(period.plannedStartDate === contract.startDate, 'Data planejada não deve ser reescrita por assinatura.');
  assert(period.signatureArtifactId === `operational:${contract.id}`, 'Assinatura não deve ser exigida como gate operacional.');

  const invalid = { ...contract, endDate: '2026-09-16' } as Contract;
  let rejected = false;
  try {
    await requireContractEffectivePeriod(invalid, {} as never);
  } catch {
    rejected = true;
  }
  assert(rejected, 'Intervalo de datas inválido deve continuar bloqueado.');

  console.log('PASS v2 contract effective period regression');
}

void main();
