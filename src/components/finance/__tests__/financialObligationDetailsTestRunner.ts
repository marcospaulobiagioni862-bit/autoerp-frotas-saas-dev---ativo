import assert from 'node:assert/strict';
import fs from 'node:fs';

const modal = fs.readFileSync('src/components/finance/FinancialObligationDetailsModal.tsx', 'utf8');
const receivables = fs.readFileSync('src/components/finance/ReceivablesView.tsx', 'utf8');
const payables = fs.readFileSync('src/components/finance/PayablesView.tsx', 'utf8');
const routes = fs.readFileSync('src/server/financeObligationHistoryRoutes.ts', 'utf8');

assert.match(modal, /FinanceTransactionClient\.listByObligation\(type, obligation\.id\)/);
assert.doesNotMatch(modal, /FinanceTransactionClient\.listTransactions\(\)/);
assert.doesNotMatch(modal, /transaction\.receivableId === obligation\.id/);
assert.doesNotMatch(modal, /transaction\.payableId === obligation\.id/);
assert.match(routes, /\/api\/finance\/transactions\/by-obligation/);
assert.match(routes, /findByReceivableId\(receivableId\)/);
assert.match(routes, /findByPayableId\(payableId\)/);
assert.match(routes, /FinancialAuthorizationService\.authorize\(actor\.userId, actor\.companyId, 'VIEW_FINANCIAL'/);
assert.doesNotMatch(routes, /req\.query\.companyId|req\.query\.userId|req\.query\.userName/);
assert.match(modal, /let active = true/);
assert.match(modal, /if \(!active\) return/);
assert.match(modal, /setTransactions\(\[\]\)/);
for (const field of [
  'originalAmount',
  'discountAmount',
  'fineAmount',
  'interestAmount',
  'additionalAmount',
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
assert.match(receivables, /setDetailsTarget\(withInstallmentTotal\(item\)\)/);
assert.match(receivables, /group\.length === item\.totalInstallments/);
assert.match(payables, /FinancialObligationDetailsModal/);
assert.match(payables, /type="PAYABLE"/);
assert.match(payables, /setDetailsTarget\(withInstallmentTotal\(item\)\)/);
assert.match(payables, /group\.length === item\.totalInstallments/);
assert.match(payables, /Filtrar contas a pagar por origem/);
assert.match(payables, /Todas as origens/);
assert.match(payables, /originLabel\(String\(item\.originType\)\)/);
assert.match(payables, /Categoria:/);
assert.match(payables, /Despesa Total/);
assert.match(payables, /Valor da Parcela/);
assert.match(payables, /item\.installmentGroupId/);
assert.match(payables, /entry\.installmentGroupId === item\.installmentGroupId/);
assert.match(payables, /\`\$\{item\.installmentNumber\}\/\$\{item\.totalInstallments\}\`/);
assert.match(payables, /statusLabel\(String\(item\.status\)\)/);
assert.match(payables, /Nenhuma conta a pagar encontrada para os filtros atuais/);
console.log('FINANCE-UX-1C obligation details regression: PASS');
