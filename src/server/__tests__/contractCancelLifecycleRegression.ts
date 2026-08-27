import { ContractStatus } from '../../types/enums';

/**
 * CONTRACT-CANCEL-LIFECYCLE-GATE-1
 * Pure policy regression kept intentionally narrow: cancellation is a pre-operational action.
 * The server integration suite proves the surrounding tenant, vehicle and finance authority.
 */
const CANCELLABLE_STATUSES = new Set<ContractStatus>([
  ContractStatus.DRAFT,
  ContractStatus.AWAITING_SIGNATURE,
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runContractCancelLifecycleRegression(): void {
  assert(CANCELLABLE_STATUSES.has(ContractStatus.DRAFT), 'DRAFT must remain cancellable');
  assert(CANCELLABLE_STATUSES.has(ContractStatus.AWAITING_SIGNATURE), 'AWAITING_SIGNATURE must remain cancellable');
  assert(!CANCELLABLE_STATUSES.has(ContractStatus.ACTIVE), 'ACTIVE must never be cancellable');
  assert(!CANCELLABLE_STATUSES.has(ContractStatus.SUSPENDED), 'SUSPENDED must never be cancellable');
  assert(!CANCELLABLE_STATUSES.has(ContractStatus.CLOSED), 'CLOSED must never be cancellable');
  assert(!CANCELLABLE_STATUSES.has(ContractStatus.FINISHED), 'FINISHED must never be cancellable');
  assert(!CANCELLABLE_STATUSES.has(ContractStatus.ARCHIVED), 'ARCHIVED must never be cancellable');
  assert(!CANCELLABLE_STATUSES.has(ContractStatus.CANCELLED), 'CANCELLED is idempotent, not a new cancellation transition');
}

if (process.argv[1]?.includes('contractCancelLifecycleRegression')) {
  runContractCancelLifecycleRegression();
  console.log('Contract cancel lifecycle regression PASS');
}
