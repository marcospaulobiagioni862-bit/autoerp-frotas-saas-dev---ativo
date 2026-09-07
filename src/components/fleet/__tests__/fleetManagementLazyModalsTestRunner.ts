import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatCurrencyInputBRL, parseCurrencyInput } from '../../../shared/utils/currency';

const source = readFileSync(new URL('../FleetManagement.tsx', import.meta.url), 'utf8');
const intakeSource = readFileSync(new URL('../VehicleDocumentIntakeModal.tsx', import.meta.url), 'utf8');
const vehicleFormSource = readFileSync(new URL('../VehicleFormModal.tsx', import.meta.url), 'utf8');
const statusPresentationSource = readFileSync(new URL('../vehicleStatusPresentation.ts', import.meta.url), 'utf8');
const productionSidebarSource = readFileSync(new URL('../../layout/ProductionSidebar.tsx', import.meta.url), 'utf8');

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

assert.match(source, /Ações do veículo/, 'vehicle cards must expose an explicit lifecycle action area');
assert.match(source, /Histórico do veículo/, 'terminal vehicles must expose the read-only history action area');
assert.match(source, />O histórico não será apagado\.</, 'lifecycle actions must explain history preservation');
assert.match(
  source,
  /handleStatusChangeClick\(vehicle, VehicleStatus\.INACTIVE\)/,
  'out-of-use action must reuse the authoritative INACTIVE status transition',
);
assert.match(source, />\s*Fora de uso\s*</, 'out-of-use action must be visible without the generic status selector');
assert.match(
  source,
  /nextValue === '__SELL__'[\s\S]*setVehicleForSale\(vehicle\)/,
  'sold option in status selector must open the dedicated sale flow',
);
assert.match(
  source,
  /value: '__SELL__', label: 'Vender veículo\.\.\.'/,
  'eligible vehicle cards must expose Vender veículo in the status selector',
);
assert.match(
  source,
  /targetStatus === VehicleStatus\.INACTIVE[\s\S]*O histórico não será apagado\./,
  'out-of-use confirmation must preserve the explicit history warning',
);

assert.match(intakeSource, /const failed=extraction\?\.status==='FAILED';/, 'vehicle document intake must expose a failed analysis state');
assert.match(intakeSource, /Análise falhou/, 'failed analysis must have a visible status');
assert.match(intakeSource, /DocumentAiClient\.retry\(extraction\.id\)/, 'failed analysis must reuse the authoritative retry endpoint');
assert.match(intakeSource, /Tentar análise novamente/, 'failed analysis must expose an explicit retry action');
assert.match(intakeSource, /Cadastrar veículo manualmente/, 'failed analysis must allow a safe manual fallback');
assert.match(source, /onManualRequested=\{\(\) => \{ setIsVehicleAiOpen\(false\); setVehicleToEdit\(null\); setIsFormOpen\(true\); \}\}/, 'manual fallback must close the intake and open a blank vehicle form');

assert.match(intakeSource, /useRef\(false\)/, 'vehicle materialization must use a synchronous duplicate-submit lock');
assert.match(intakeSource, /VehicleClient\.list\(\)/, 'vehicle intake must pre-check authoritative fleet identifiers');
assert.match(intakeSource, /normalizedIdentifier\(vehicle\.plate\)===plate/, 'vehicle intake must detect duplicate plates');
assert.match(intakeSource, /normalizedIdentifier\(vehicle\.renavam\)===renavam/, 'vehicle intake must detect duplicate RENAVAM');
assert.match(intakeSource, /Este veículo já possui cadastro no sistema\./, 'vehicle intake must explain the duplicate vehicle conflict');
assert.match(intakeSource, /Abrir cadastro existente/, 'duplicate vehicle warning must offer direct access to the existing record');
assert.match(intakeSource, /disabled=\{busy\|\|materializingRef\.current\|\|Boolean\(duplicateVehicle\)\}/, 'vehicle materialization button must remain locked for duplicate or concurrent submission');

assert.equal(parseCurrencyInput('1.250,56'), 1250.56, 'BRL input must parse dot thousands and comma decimals');
assert.equal(parseCurrencyInput('1250.56'), 1250.56, 'canonical decimal values must remain compatible');
assert.equal(formatCurrencyInputBRL(1250.56), '1.250,56', 'BRL input must render Brazilian separators');
assert.match(vehicleFormSource, /CurrencyInput label="Valor de Aquisição \(R\$\) \*"/, 'manual vehicle monetary inputs must use BRL formatting');
assert.match(intakeSource, /CurrencyInput label="Valor de Compra \(R\$\) \*"/, 'AI vehicle monetary inputs must use BRL formatting');

assert.doesNotMatch(statusPresentationSource, /\{ id: VehicleStatus\.WAITING_MAINTENANCE,/, 'legacy waiting-maintenance status must not appear as a separate filter');
assert.match(source, /v\.status === VehicleStatus\.MAINTENANCE \|\| v\.status === VehicleStatus\.WAITING_MAINTENANCE/, 'legacy waiting-maintenance vehicles must count under Em manutenção');

assert.match(productionSidebarSource, /window\.matchMedia\('\(max-width: 767px\)'\)/, 'production sidebar must decide compact mode at runtime');
assert.match(productionSidebarSource, /data-testid="desktop-sidebar"/, 'desktop sidebar must have an explicit persistent render path');
assert.doesNotMatch(productionSidebarSource, /className="hidden md:block h-dvh/, 'desktop sidebar must not rely on a hidden Tailwind breakpoint');

console.log('Deferred fleet modals regression: PASS');
