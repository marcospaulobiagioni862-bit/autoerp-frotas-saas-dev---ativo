import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../FinanceHubView.tsx', import.meta.url), 'utf8');

const views = [
  'FinanceOverviewView',
  'ReceivablesView',
  'PayablesView',
  'TransactionsView',
  'CashFlowView',
  'FinancialPeriodsView',
  'DREReportView',
  'FinancialMasterDataView',
] as const;

for (const view of views) {
  assert.equal(
    new RegExp(`import\\s+\\{\\s*${view}\\s*\\}\\s+from`).test(source),
    false,
    `${view} must not remain a static import`,
  );
  assert.match(
    source,
    new RegExp(`const\\s+${view}=lazy\\(\\(\\)=>import\\('\\./${view}'\\)`),
    `${view} must be loaded through React.lazy`,
  );
}

assert.equal(
  (source.match(/=lazy\(\(\)=>import\('\.\//g) ?? []).length,
  views.length,
  'Finance Hub must define exactly one lazy loader per financial subview',
);
assert.match(
  source,
  /<LazyModuleErrorBoundary resetKey=\{activeSubTab\} onRetry=\{\(\)=>window\.location\.reload\(\)\}>/,
  'financial lazy recovery must reset when the active subtab changes',
);
assert.match(
  source,
  /<Suspense fallback=\{<div[^>]*>Carregando área financeira\.\.\.<\/div>\}>/,
  'financial subviews must expose a neutral loading fallback',
);

for (const tab of ['overview', 'receivables', 'payables', 'transactions', 'cashflow', 'periods', 'dre', 'settings']) {
  assert.match(
    source,
    new RegExp(`activeSubTab === ['"]${tab}['"]`),
    `financial subtab ${tab} must remain routed`,
  );
}

console.log('Deferred finance subviews regression: PASS');
