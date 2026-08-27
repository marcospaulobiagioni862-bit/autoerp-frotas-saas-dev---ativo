import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../BankReconciliationView.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../../api/bankReconciliationClient.ts', import.meta.url), 'utf8');

for (const call of ['listEntries', 'suggestions', 'importEntries', 'match', 'unmatch', 'ignore']) {
  assert.match(source, new RegExp(`BankReconciliationClient\\.${call}`), `UI must use authoritative ${call} endpoint`);
}
assert.match(source, /FinanceTransactionClient\.getOptions\(\)/, 'financial account choices must come from authoritative settlement options');
assert.match(source, /Esta área não altera saldo nem cria movimentações financeiras/, 'UI must make reconciliation semantics explicit');
assert.doesNotMatch(source, /updateBalance|createTransaction|FinancialTransactionClient\.transfer|FinanceTransactionClient\.reverse/);
assert.doesNotMatch(source, /localRepositories|localStorage|indexedDB/);
assert.doesNotMatch(client, /companyId\s*[:=]|userId\s*[:=]|userName\s*[:=]/, 'client must not send browser tenant/actor authority');
assert.doesNotMatch(client, /localRepositories|localStorage|indexedDB/);
assert.match(client, /credentials: 'include'/);
console.log('FINANCE-UX-1F bank reconciliation UI authority regression: PASS');
