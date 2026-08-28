import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runBankReconciliationClientTests } from '../../../api/__tests__/bankReconciliationClientTestRunner';
import { runCreditCardStatementClientTests } from '../../../api/__tests__/creditCardStatementClientTestRunner';

const source = readFileSync(new URL('../FinanceHubView.tsx', import.meta.url), 'utf8');
const reconciliation = readFileSync(new URL('../BankReconciliationView.tsx', import.meta.url), 'utf8');
const cards = readFileSync(new URL('../CreditCardStatementsView.tsx', import.meta.url), 'utf8');

const views = [
  'FinanceOverviewView',
  'ReceivablesView',
  'PayablesView',
  'TransactionsView',
  'CashFlowView',
  'DelinquencyView',
  'BankReconciliationView',
  'CreditCardStatementsView',
  'FinancialPeriodsView',
  'DREReportView',
  'FinancialMasterDataView',
] as const;

for (const view of views) {
  assert.equal(new RegExp(`import\\s+\\{\\s*${view}\\s*\\}\\s+from`).test(source), false, `${view} must not remain a static import`);
  assert.match(source, new RegExp(`const\\s+${view}=lazy\\(\\(\\)=>import\\('\\./${view}'\\)`), `${view} must be loaded through React.lazy`);
}

assert.equal((source.match(/=lazy\(\(\)=>import\('\.\//g) ?? []).length, views.length, 'Finance Hub must define exactly one lazy loader per financial subview');
assert.match(source, /<LazyModuleErrorBoundary resetKey=\{activeSubTab\} onRetry=\{\(\)=>window\.location\.reload\(\)\}>/, 'financial lazy recovery must reset when the active subtab changes');
assert.match(source, /<Suspense fallback=\{<div[^>]*>Carregando área financeira\.\.\.<\/div>\}>/, 'financial subviews must expose a neutral loading fallback');

for (const tab of ['overview', 'receivables', 'payables', 'transactions', 'cashflow', 'delinquency', 'reconciliation', 'cards', 'periods', 'dre', 'settings']) {
  assert.match(source, new RegExp(`activeSubTab === ['"]${tab}['"]`), `financial subtab ${tab} must remain routed`);
}

for (const method of ['listEntries', 'suggestions', 'importEntries', 'match', 'unmatch', 'ignore']) {
  assert.match(reconciliation, new RegExp(`BankReconciliationClient\\.${method}`), `reconciliation UI must use authoritative ${method}`);
}
assert.match(reconciliation, /FinanceTransactionClient\.getOptions\(\)/, 'reconciliation accounts must come from authoritative finance options');
assert.match(reconciliation, /Escolha um candidato/, 'ambiguous reconciliation must require explicit operator choice');
assert.match(reconciliation, /Esta área não altera saldo nem cria movimentações financeiras/, 'reconciliation semantics must remain explicit');
assert.doesNotMatch(reconciliation, /updateBalance|createTransaction|localRepositories|localStorage|indexedDB/);

assert.match(cards, /CreditCardStatementClient\.listProfiles\(\)/, 'card UI must read profiles from server authority');
assert.match(cards, /CreditCardStatementClient\.listStatements\(\)/, 'card UI must read statements from server authority');
assert.match(cards, /Visão somente leitura/, 'card UI must make read-only semantics explicit');
assert.match(cards, /Status, saldo e atraso são exibidos exatamente como retornados/, 'card UI must preserve server-derived state semantics');
assert.doesNotMatch(cards, /\.createProfile|\.createStatement|\.closeStatement|\.linkPayment|\.applyAdjustment|fetch\(|localRepositories|localStorage|indexedDB/);
assert.doesNotMatch(cards, /balanceAmount\s*[+\-*/]|paidAmount\s*[+\-*/]|interestAmount\s*[+\-*/]|fineAmount\s*[+\-*/]|discountAmount\s*[+\-*/]/, 'card UI must not recompute financial authority');

await runBankReconciliationClientTests();
await runCreditCardStatementClientTests();
console.log('Deferred finance subviews regression: PASS');
