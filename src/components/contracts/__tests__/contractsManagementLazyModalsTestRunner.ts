import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../ContractsManagement.tsx', import.meta.url), 'utf8');

const modals = ['ContractFormModal', 'ContractDetailsModal', 'ContractTemplateManagementModal'] as const;

for (const modal of modals) {
  assert.equal(
    new RegExp(`import\\s+\\{\\s*${modal}\\s*\\}\\s+from`).test(source),
    false,
    `${modal} must not remain a static import`,
  );
  assert.match(
    source,
    new RegExp(`const\\s+${modal}=lazy\\(\\(\\)=>import\\('\\./${modal}'\\)`),
    `${modal} must be loaded through React.lazy`,
  );
}

assert.equal(
  (source.match(/=lazy\(\(\)=>import\('\.\/Contract(?:Form|Details|TemplateManagement)Modal'/g) ?? []).length,
  modals.length,
  'ContractsManagement must define exactly three lazy modal loaders',
);
assert.match(source, /\{formOpen&&<ContractFormModal/, 'contract form must render only when open');
assert.match(
  source,
  /\{detailsOpen&&selectedContractId&&<ContractDetailsModal/,
  'contract details must render only when open with a selected server id',
);
assert.match(
  source,
  /\{templateManagerOpen&&<ContractTemplateManagementModal/,
  'contract templates must render only when explicitly opened',
);
assert.match(
  source,
  /<LazyModuleErrorBoundary resetKey=\{contractModalResetKey\} onRetry=\{\(\)=>window\.location\.reload\(\)\}>/,
  'contract modal recovery must reset between modal targets',
);
assert.match(
  source,
  /<Suspense fallback=\{<div role="status"[^>]*>.*Carregando dados do contrato\.\.\./,
  'contract modals must expose a neutral loading state',
);
assert.doesNotMatch(
  source,
  /error\.(?:message|stack)|String\(error\)/,
  'contract modal fallback must not expose raw errors',
);

console.log('Deferred contract modals regression: PASS');
