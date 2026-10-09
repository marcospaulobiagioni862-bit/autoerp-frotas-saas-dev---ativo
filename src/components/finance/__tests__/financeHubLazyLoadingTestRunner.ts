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
assert.match(source, /min-w-0 bg-white[\s\S]*overflow-x-auto md:flex-wrap md:overflow-x-visible/, 'finance tabs must scroll only on small screens and wrap on desktop');
assert.match(source, /className="mt-6 min-w-0"/, 'financial subview container must be allowed to shrink inside the page');


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
assert.match(cards, /Status, saldo e atraso seguem os lançamentos confirmados/, 'card UI must preserve server-derived state semantics');
assert.match(cards, /CreditCardStatementClient\.getStatementDetail\(statementId\)/, 'statement detail must load only through an explicit user action');
assert.match(cards, /Carregado sob demanda; valores exibidos sem recomposição local/, 'statement detail must preserve read-only server authority semantics');
assert.match(cards, /detail\.items\.length === 0/, 'statement detail must expose an explicit empty item state');
assert.match(cards, /detailMessage && <div role="alert"/, 'statement detail failures must remain explicit without fallback data');
assert.match(cards, /new Set<string>\(statements\.map\(\(statement\) => statement\.cycleRef\)\)/, 'cycle catalog must be derived only from authorized statements');
assert.match(cards, /statement\.cycleRef !== cycleRef/, 'cycle filtering must use only the server-returned cycleRef');
assert.match(cards, /Ciclo da fatura/, 'cycle filter must be visible to the operator');
assert.match(cards, /statement\.status !== statusFilter/, 'status filtering must use the server-returned statement status');
assert.match(cards, /dueFilter === 'OVERDUE' && !statement\.isOverdue/, 'overdue filtering must use only server-derived isOverdue');
assert.match(cards, /dueFilter === 'CURRENT' && statement\.isOverdue/, 'current filtering must use only server-derived isOverdue');
assert.match(cards, /Os filtros organizam as informações exibidas e não alteram os lançamentos financeiros/, 'filter semantics must remain presentation-only');
assert.match(cards, /Nenhuma fatura encontrada para o filtro atual/, 'filtered empty state must remain explicit');
assert.doesNotMatch(cards, /new Date\(statement\.dueDate\)|Date\.now\(\)/, 'card UI must not derive overdue state from client clock');
assert.match(cards, /CreditCardStatementClient\.closeStatement\(statement\.id\)/, 'statement close must call only the authoritative client');
assert.match(cards, /statement\.status === 'OPEN'/, 'close action must be exposed only for open statements');
assert.match(cards, /window\.confirm/, 'statement close must require explicit operator confirmation');
assert.match(cards, /await load\(\)/, 'statement close must reload the server read-model after success');
assert.doesNotMatch(cards, /\.createProfile|\.createStatement|\.linkPayment|\.applyAdjustment|fetch\(|localRepositories|localStorage|indexedDB/);
assert.doesNotMatch(cards, /(?:balanceAmount|paidAmount|interestAmount|fineAmount|discountAmount)\s*(?:\+|-|\*|\/)/, 'card UI must not recompute financial authority');

await runBankReconciliationClientTests();
await runCreditCardStatementClientTests();
console.log('Deferred finance subviews regression: PASS');
