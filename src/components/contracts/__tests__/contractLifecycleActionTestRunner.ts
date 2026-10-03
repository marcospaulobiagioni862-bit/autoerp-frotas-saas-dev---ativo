import assert from 'node:assert/strict';
import { activeContractAction } from '../ContractsManagement';
import { ContractStatus } from '../../../types/enums';

const contract = { status: ContractStatus.ACTIVE, startDate: '2026-10-04' };

assert.equal(activeContractAction(contract, new Date('2026-10-04T02:59:59Z')), 'CANCEL');
assert.equal(activeContractAction(contract, new Date('2026-10-04T03:00:00Z')), 'CLOSE');
assert.equal(activeContractAction(contract, new Date('2026-10-05T03:00:00Z')), 'CLOSE');
assert.equal(activeContractAction({ ...contract, status: ContractStatus.CANCELLED }), null);

console.log('Contract frontend lifecycle action: PASS');
