import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../FleetManagement.tsx', import.meta.url), 'utf8');
const intakeSource = readFileSync(new URL('../VehicleDocumentIntakeModal.tsx', import.meta.url), 'utf8');
const detailsSource = readFileSync(new URL('../VehicleDetailsModal.tsx', import.meta.url), 'utf8');
const gallerySource = readFileSync(new URL('../../documents/EntityFileGallery.tsx', import.meta.url), 'utf8');

const modals = ['VehicleFormModal', 'VehicleDetailsModal', 'RecordKmModal', 'VehicleKmBatchModal'] as const;

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
  (source.match(/=lazy\(\(\)=>import\('\.\/(?:VehicleFormModal|VehicleDetailsModal|RecordKmModal|VehicleKmBatchModal)'/g) ?? []).length,
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
assert.match(source, /Atualizar KM em lote/, 'fleet must expose the batch KM action');
assert.match(
  source,
  /\{isKmBatchOpen&&<VehicleKmBatchModal isOpen vehicles=\{vehicles\}/,
  'KM batch modal must receive the authoritative active fleet list only when opened',
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
assert.match(intakeSource, /VehicleClient\.checkIdentity\(\{plate,renavam,chassis\}\)/, 'vehicle intake must preflight plate, RENAVAM and chassis against the server authority');
assert.match(intakeSource, /\['REVIEW_REQUIRED','APPROVED'\]\.includes\(extraction\.status\)/, 'identity preflight must start as soon as AI identifiers are available for human review');
assert.match(intakeSource, /Veículo já cadastrado no ERP/, 'identity conflict must be visible before completing the vehicle form');
assert.match(intakeSource, /Vendidos \/ Arquivados — histórico/, 'identity conflict must tell the user when the existing vehicle is historical');
assert.match(intakeSource, /Abrir cadastro existente/, 'identity conflict must provide a direct action to the existing record');
assert.match(intakeSource, /disabled=\{busy\|\|materializingRef\.current\|\|checkingIdentity\|\|Boolean\(identityCheck\?\.exists\)\}/, 'vehicle materialization must remain locked during identity checks or existing-registration conflicts');
assert.match(source, /onExistingFound=\{\(vehicle\) =>/, 'fleet must receive existing vehicle detection from AI intake');
assert.match(source, /setReadOnlyVehicleIdForHistory\(vehicle\.id\)/, 'archived or sold duplicate must open its read-only historical record');

assert.match(detailsSource, /id:'files',label:'Arquivos'/, 'vehicle details must expose the unified Arquivos tab');
assert.match(detailsSource, /<EntityFileGallery entityType="Vehicle" entityId=\{vehicle\.id\}\/>/, 'vehicle file tab must bind the selected vehicle to the shared gallery');
assert.match(gallerySource, /AttachmentClient\.listEntityGallery\(entityType,entityId\)/, 'entity gallery must load through the authenticated gallery client');
assert.match(gallerySource, /Todas as origens/, 'entity gallery must filter by source');
assert.match(gallerySource, /Todos os tipos/, 'entity gallery must filter by file kind');
assert.match(gallerySource, /type="date"/, 'entity gallery must support date filtering');
assert.match(gallerySource, /Vídeo MP4/, 'entity gallery must expose the configured video upload surface');
assert.match(gallerySource, /10 MB por arquivo/, 'entity gallery must state the actual storage size limit');
assert.doesNotMatch(gallerySource, /storageKey|companyId|x-autoerp-/, 'entity gallery UI must not consume storage or tenant authority fields');

console.log('Deferred fleet modals regression: PASS');
