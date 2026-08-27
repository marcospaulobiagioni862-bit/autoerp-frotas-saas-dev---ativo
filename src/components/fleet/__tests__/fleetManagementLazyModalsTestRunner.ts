import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../FleetManagement.tsx', import.meta.url), 'utf8');

const modals = ['VehicleFormModal', 'VehicleDetailsModal', 'RecordKmModal'] as const;

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
  (source.match(/=lazy\(\(\)=>import\('\.\/(?:VehicleFormModal|VehicleDetailsModal|RecordKmModal)'/g) ?? []).length,
  modals.length,
  'FleetManagement must define exactly three lazy modal loaders',
);
assert.match(source, /\{isFormOpen&&<VehicleFormModal/, 'vehicle form must render only when open');
assert.match(
  source,
  /\{selectedVehicleIdForDetails&&<VehicleDetailsModal/,
  'vehicle details must render only with a selected server id',
);
assert.match(
  source,
  /\{vehicleForKmRecord&&<RecordKmModal/,
  'KM recording must render only with its authorized vehicle',
);
assert.match(
  source,
  /<LazyModuleErrorBoundary resetKey=\{fleetModalResetKey\} onRetry=\{\(\)=>window\.location\.reload\(\)\}>/,
  'fleet modal recovery must reset between modal targets',
);
assert.match(
  source,
  /<Suspense fallback=\{<div role="status"[^>]*>.*Carregando dados do veículo\.\.\./,
  'fleet modals must expose a neutral loading state',
);
assert.doesNotMatch(
  source,
  /error\.(?:message|stack)|String\(error\)/,
  'fleet modal fallback must not expose raw errors',
);

console.log('Deferred fleet modals regression: PASS');
