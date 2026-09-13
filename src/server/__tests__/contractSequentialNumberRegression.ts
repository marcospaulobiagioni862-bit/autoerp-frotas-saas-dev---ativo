import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repositorySource = readFileSync(
  fileURLToPath(new URL('../../db/repositories/postgresContractRepository.ts', import.meta.url)),
  'utf8',
);

assert(
  repositorySource.includes("const AUTO_CONTRACT_NUMBER_PLACEHOLDER = /^CNT-\\d{8}-[0-9A-F]{8}$/"),
  'automatic legacy placeholder must be recognized explicitly',
);
assert(
  repositorySource.includes('pg_advisory_xact_lock'),
  'automatic contract sequence must be serialized inside the transaction',
);
assert(
  repositorySource.includes("contract_number ~ '^CNT-[0-9]+$'"),
  'sequence authority must ignore legacy/non-sequential contract numbers',
);
assert(
  repositorySource.includes("padStart(6, '0')"),
  'automatic sequence must use zero-padded CNT-000001 format',
);
assert(
  repositorySource.includes('${contractNumber}, ${item.startDate}'),
  'persisted contract must use the server-resolved sequential number',
);
assert(
  repositorySource.includes('let contractNumber = item.contractNumber;'),
  'manual numbers must remain the default value unless the server placeholder is detected',
);

console.log('contract sequential number regression: ok');
