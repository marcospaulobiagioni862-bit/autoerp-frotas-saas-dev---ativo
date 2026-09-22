import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../FleetManagement.tsx', import.meta.url), 'utf8');
const formSource = readFileSync(new URL('../VehicleFormModal.tsx', import.meta.url), 'utf8');
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
assert.doesNotMatch(source, /<span[^>]*>O histórico não será apagado\.<\/span>/, 'fleet cards must not repeat history-preservation copy on every row');
assert.match(
  source,
  /handleStatusChangeClick\(vehicle, VehicleStatus\.INACTIVE\)/,
  'out-of-use action must reuse the authoritative INACTIVE status transition',
);
assert.match(source, />Colocar fora de uso<\/button>/, 'out-of-use action must remain available in the contextual actions menu');
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

assert.match(formSource, /const emptyVehicleForm = \(\): VehicleFormData => \(\{[\s\S]*yearFabrication: '',[\s\S]*yearModel: '',[\s\S]*currentKm: '',[\s\S]*acquisitionValue: '',[\s\S]*currentValue: '',[\s\S]*rentalValueBase: ''/, 'manual vehicle form must initialize required numeric fields empty');
assert.match(formSource, /fuelType: '',[\s\S]*category: ''/, 'manual vehicle form must not assume fuel type or category');
assert.doesNotMatch(formSource, /color:\s*'Branco'|nextMaintenanceKm:\s*10000|acquisitionValue:\s*70000|currentValue:\s*65000|rentalValueBase:\s*750/, 'manual vehicle form must not contain example values as persisted defaults');
assert.match(formSource, /rawValue === '' \? '' : Number\(rawValue\)/, 'clearing a numeric field must keep it empty instead of coercing it to zero');
assert.equal((formSource.match(/\{ value: '', label: 'Selecione\.\.\.', disabled: true \}/g) ?? []).length, 2, 'manual fuel and category selects must start with an explicit empty option');
assert.match(formSource, /if \(vehicleToEdit\) \{[\s\S]*yearFabrication: vehicleToEdit\.yearFabrication/, 'editing must continue loading persisted vehicle values');

assert.match(intakeSource, /useRef\(false\)/, 'vehicle materialization must use a synchronous duplicate-submit lock');
assert.match(intakeSource, /VehicleClient\.checkIdentity\(\{plate,renavam,chassis\}\)/, 'vehicle intake must preflight plate, RENAVAM and chassis against the server authority');
assert.match(intakeSource, /\['REVIEW_REQUIRED','(?:COMPLETED',')?APPROVED'\]\.includes\(extraction\.status\)/, 'identity preflight must start as soon as AI identifiers are available for human review');
assert.match(intakeSource, /Veículo já cadastrado no ERP/, 'identity conflict must be visible before completing the vehicle form');
assert.match(intakeSource, /Vendidos \/ Arquivados — histórico/, 'identity conflict must tell the user when the existing vehicle is historical');
assert.match(intakeSource, /Abrir cadastro existente/, 'identity conflict must provide a direct action to the existing record');
assert.match(intakeSource, /disabled=\{busy\|\|materializingRef\.current\|\|checkingIdentity\|\|Boolean\(identityCheck\?\.exists\)\}/, 'vehicle materialization must remain locked during identity checks or existing-registration conflicts');
assert.match(source, /onExistingFound=\{\(vehicle\) =>/, 'fleet must receive existing vehicle detection from AI intake');
assert.match(source, /setReadOnlyVehicleIdForHistory\(vehicle\.id\)/, 'archived or sold duplicate must open its read-only historical record');

assert.match(detailsSource, /id:'files',label:'Fotos, Vídeos & Arquivos'/, 'vehicle details must expose the explicit photos, videos and files tab');
assert.match(detailsSource, /<EntityFileGallery entityType="Vehicle" entityId=\{vehicle\.id\}\/>/, 'vehicle file tab must bind the selected vehicle to the shared gallery');
assert.match(gallerySource, /AttachmentClient\.listEntityGallery\(entityType,entityId\)/, 'entity gallery must load through the authenticated gallery client');
assert.match(gallerySource, /Todas as origens/, 'entity gallery must filter by source');
assert.match(gallerySource, /Todos os tipos/, 'entity gallery must filter by file kind');
assert.match(gallerySource, /type="date"/, 'entity gallery must support date filtering');
assert.match(gallerySource, /Vídeo MP4/, 'entity gallery must expose the configured video upload surface');
assert.match(gallerySource, /10 MB por arquivo/, 'entity gallery must state the actual storage size limit');
assert.doesNotMatch(gallerySource, /storageKey|companyId|x-autoerp-/, 'entity gallery UI must not consume storage or tenant authority fields');

assert.match(detailsSource, /<Icon className="w-3\.5 h-3\.5 shrink-0"\/>/, 'vehicle detail tab icons must not shrink into labels');
assert.match(detailsSource, /<span className="min-w-0 leading-tight \[overflow-wrap:anywhere\]">\{tab\.label\}<\/span>/, 'vehicle detail tab labels must wrap without horizontal overflow');
assert.match(detailsSource, /min-w-5 shrink-0 rounded-full px-1\.5 text-center/, 'vehicle detail tab counters must keep a centered minimum width');

const technicalSheetStart = detailsSource.indexOf('const printVehicleTechnicalSheet=');
const technicalSheetEnd = detailsSource.indexOf("const printMaintenanceHistory=", technicalSheetStart);
assert.ok(technicalSheetStart >= 0 && technicalSheetEnd > technicalSheetStart, 'vehicle details must define the consolidated technical sheet');
const technicalSheetSource = detailsSource.slice(technicalSheetStart, technicalSheetEnd);
assert.match(detailsSource, />Salvar ficha em PDF<\/Button>/, 'vehicle header must expose the technical sheet action independently from the active tab');
assert.match(technicalSheetSource, /window\.open\('','_blank','width=900,height=800'\)/, 'technical sheet must open synchronously for browser printing');
assert.match(technicalSheetSource, /popup\.opener=null/, 'technical sheet popup must detach its opener before writing');
assert.match(technicalSheetSource, /Imprimir \/ Salvar em PDF/, 'technical sheet must expose browser print/PDF action');
for (const label of ['Identificação', 'Status operacional', 'KM atual', 'Próxima manutenção', 'Motorista atual', 'Contrato vigente', 'Manutenções', 'Multas', 'Documentos', 'Seguros', 'Rastreadores', 'Vistorias']) {
  assert.ok(technicalSheetSource.includes(label), `technical sheet must include ${label}`);
}
assert.doesNotMatch(technicalSheetSource, /\.cpf|\.cnhNumber|\.cnhCategory/, 'technical sheet must not include unnecessary driver identifiers');

console.log('Deferred fleet modals regression: PASS');
