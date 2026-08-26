import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../DriversManagement.tsx', import.meta.url), 'utf8');

for (const modal of ['DriverFormModal', 'DriverDetailsModal']) {
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
  (source.match(/=lazy\(\(\)=>import\('\.\/Driver(?:Form|Details)Modal'/g) ?? []).length,
  2,
  'DriversManagement must define exactly two lazy modal loaders',
);
assert.match(
  source,
  /\{isFormOpen&&<DriverFormModal/,
  'driver form must only render after an explicit open action',
);
assert.match(
  source,
  /\{isDetailsOpen&&selectedDriverId&&<DriverDetailsModal/,
  'driver details must only render when open with a selected server id',
);
assert.match(
  source,
  /<LazyModuleErrorBoundary resetKey=\{driverModalResetKey\} onRetry=\{\(\)=>window\.location\.reload\(\)\}>/,
  'driver modal recovery must reset between modal targets',
);
assert.match(
  source,
  /<Suspense fallback=\{<div role="status"[^>]*>.*Carregando dados do motorista\.\.\./,
  'driver modals must expose a neutral loading state',
);
assert.doesNotMatch(
  source,
  /error\.(?:message|stack)|String\(error\)/,
  'driver modal fallback must not expose raw errors',
);

console.log('Deferred driver modals regression: PASS');
