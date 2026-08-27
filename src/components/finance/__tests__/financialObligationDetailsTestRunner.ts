import assert from 'node:assert/strict';
import fs from 'node:fs';

const modal = fs.readFileSync('src/components/finance/FinancialObligationDetailsModal.tsx', 'utf8');
const receivables = fs.readFileSync('src/components/finance/ReceivablesView.tsx', 'utf8');
const payables = fs.readFileSync('src/components/finance/PayablesView.tsx', 'utf8');

assert.match(modal, /FinanceTransactionClient\.listTransactions\(\)/);
assert.match(modal, /transaction\.receivableId === obligation\.id/);
assert.match(modal, /transaction\.payableId === obligation\.id/);
assert.match(modal, /let active = true/);
assert.match(modal, /if \(!active\) return/);
assert.match(modal, /setTransactions\(\[\]\)/);
for (const field of [
  'originalAmount',
  'discountAmount',
  'fineAmount',
  'interestAmount',
  'updatedAmount',
  'paidAmount',
  'balanceAmount',
]) {
  assert.ok(modal.includes(`obligation.${field}`), `missing authoritative amount: ${field}`);
}
assert.match(modal, /transaction\.isReversed/);
assert.match(modal, /transaction\.reversalTransactionId/);
assert.doesNotMatch(modal, /FinanceTransactionClient\.(reverse|transfer)\(/);
assert.doesNotMatch(modal, /FinanceObligationClient\.(create|cancel|settle)/);
assert.match(receivables, /FinancialObligationDetailsModal/);
assert.match(receivables, /type="RECEIVABLE"/);
assert.match(receivables, /setDetailsTarget\(item\)/);
assert.match(payables, /FinancialObligationDetailsModal/);
assert.match(payables, /type="PAYABLE"/);
assert.match(payables, /setDetailsTarget\(item\)/);
console.log('FINANCE-UX-1C obligation details regression: PASS');
