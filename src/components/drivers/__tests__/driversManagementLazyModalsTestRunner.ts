import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesDriverSearch } from '../driverSearch';

const source = readFileSync(new URL('../DriversManagement.tsx', import.meta.url), 'utf8');
const detailsSource = readFileSync(new URL('../DriverDetailsModal.tsx', import.meta.url), 'utf8');
const profilePhotoSource = readFileSync(new URL('../DriverProfilePhoto.tsx', import.meta.url), 'utf8');
const formSource = readFileSync(new URL('../DriverFormModal.tsx', import.meta.url), 'utf8');
const cnhIntakeSource = readFileSync(new URL('../DriverCnhIntakeModal.tsx', import.meta.url), 'utf8');
const cnhCardSource = readFileSync(new URL('../DriverCnhDocumentCard.tsx', import.meta.url), 'utf8');
const fileUploadSource = readFileSync(new URL('../../documents/FileUpload.tsx', import.meta.url), 'utf8');
const attachmentListSource = readFileSync(new URL('../../documents/AttachmentList.tsx', import.meta.url), 'utf8');

for (const modal of ['DriverFormModal', 'DriverDetailsModal', 'DriverCnhIntakeModal']) {
  assert.equal(
    new RegExp(`import\\s+\\{\\s*${modal}\\s*\\}\\s+from`).test(source),
    false,
    `${modal} must not remain a static import`,
  );
  assert.match(
    source,
    new RegExp(`const\\s+${modal}\\s*=\\s*lazy\\(\\s*\\(\\)\\s*=>\\s*import\\('\\./${modal}'\\)`),
    `${modal} must be loaded through React.lazy`,
  );
}

assert.equal(
  (source.match(/=\s*lazy\(\s*\(\)\s*=>\s*import\('\.\/Driver(?:Form|Details|CnhIntake)Modal'/g) ?? []).length,
  3,
  'DriversManagement must define exactly three lazy modal loaders',
);
assert.match(source, /\{isFormOpen\s*&&\s*<DriverFormModal/, 'driver form must only render after an explicit open action');
assert.match(source, /\{isDetailsOpen\s*&&\s*selectedDriverId\s*&&\s*<DriverDetailsModal/, 'driver details must only render when open with a selected server id');
assert.match(source, /\{isCnhIntakeOpen\s*&&\s*<DriverCnhIntakeModal/, 'CNH intake must only render after an explicit open action');
assert.match(source, /<LazyModuleErrorBoundary resetKey=\{driverModalResetKey\} onRetry=\{\(\)\s*=>\s*window\.location\.reload\(\)\}>/, 'driver modal recovery must reset between modal targets');
assert.match(source, /<Suspense fallback=\{<div role="status"[^>]*>.*Carregando dados do motorista\.\.\./, 'driver modals must expose a neutral loading state');
assert.doesNotMatch(source, /error\.(?:message|stack)|String\(error\)/, 'driver modal fallback must not expose raw errors');

assert.match(detailsSource, /import\s+\{\s*DriverProfilePhoto\s*\}\s+from\s+'\.\/DriverProfilePhoto'/, 'driver details must import the approved profile photo component');
assert.match(detailsSource, /<DriverProfilePhoto\s+driverId=\{driver\.id\}\s+driverName=\{driver\.fullName\}\s*\/>/, 'driver header must render the approved profile photo component');
assert.doesNotMatch(detailsSource, /driver\.fullName\.substring\(0,\s*2\)\.toUpperCase\(\)/, 'legacy initials avatar must not remain in the driver header');

assert.match(profilePhotoSource, /documentType:\s*PROFILE_PHOTO_DOCUMENT_TYPE/, 'profile photo must use the canonical attachment document type');
assert.match(profilePhotoSource, /entityType:\s*'Driver'/, 'profile photo must remain bound to Driver attachment authority');
assert.match(profilePhotoSource, /AttachmentClient\.content\(current\.id\)/, 'profile photo preview must load through authenticated attachment content');
assert.match(profilePhotoSource, /if \(previous\) await AttachmentClient\.archive\(previous\.id\)/, 'previous photo must only archive after the replacement upload succeeds');
assert.match(profilePhotoSource, /await AttachmentClient\.archive\(photo\.id\)/, 'profile photo removal must archive instead of deleting bytes directly');
assert.match(profilePhotoSource, /image\/jpeg.*image\/jpg.*image\/png.*image\/webp/, 'profile photo UI must allow only image MIME types');
assert.doesNotMatch(profilePhotoSource, /application\/pdf|storageKey|companyId|x-autoerp-/, 'profile photo component must not allow PDF or consume server authority fields');

assert.match(formSource, /Foto do motorista \(opcional\)/, 'new driver form must explicitly keep the photo optional');
assert.match(formSource, /const created = await DriverClient\.create\(input\);[\s\S]*setCreatedDriverId\(created\.id\);/, 'created driver id must be retained before optional post-create work');
assert.match(formSource, /if \(profilePhoto && !profilePhotoUploaded\)[\s\S]*AttachmentClient\.upload\(\{[\s\S]*entityType: 'Driver'[\s\S]*entityId: driverId[\s\S]*documentType: PROFILE_PHOTO_DOCUMENT_TYPE/, 'selected photo must upload only after creation through Driver attachment authority');
assert.match(formSource, /setProfilePhotoUploaded\(true\)/, 'a confirmed photo upload must not be repeated after a later retry');
assert.match(formSource, /PROFILE_PHOTO_MIME_TYPES\.includes\(selected\.type\)/, 'new driver photo must use the canonical MIME allowlist');
assert.match(formSource, /selected\.size <= 0 \|\| selected\.size > PROFILE_PHOTO_MAX_BYTES/, 'new driver photo must use the canonical size policy');
assert.match(formSource, /const clearProfilePhoto = \(\) => \{[\s\S]*setProfilePhoto\(null\)[\s\S]*profilePhotoInputRef\.current\.value = ''/, 'invalid or removed photo must clear state and native input');
assert.doesNotMatch(formSource, /required[^\n]*profilePhoto|profilePhoto[^\n]*required/, 'photo must not become a driver creation prerequisite');

const vehicleDocumentCatalog = [
  ['CRLV', 'CRLV / Licenciamento'],
  ['CRV', 'CRV'],
  ['ATPV_E', 'ATPV-e'],
  ['IPVA', 'IPVA'],
  ['DPVAT_SPVAT', 'DPVAT / SPVAT'],
  ['INSURANCE_POLICY', 'Seguro / Apólice'],
  ['INSPECTION_REPORT', 'Vistoria / Laudo'],
  ['PURCHASE_INVOICE', 'Nota fiscal / Compra'],
  ['FINANCING', 'Financiamento'],
  ['VEHICLE_DOCUMENT', 'Outro documento'],
] as const;
for (const [value, label] of vehicleDocumentCatalog) {
  assert.equal(fileUploadSource.includes(`['${value}', '${label}']`), true, `vehicle document catalog must preserve ${value}`);
}
assert.match(fileUploadSource, /useState\('CRLV'\)/, 'vehicle document type must default to CRLV');
assert.match(fileUploadSource, /effectiveDocumentType\s*=\s*isVehicleDocument\s*\?\s*selectedVehicleDocumentType\s*:\s*documentType/, 'selected vehicle type must be sent as documentType');
assert.match(fileUploadSource, /documentType:\s*effectiveDocumentType/, 'upload must use the effective vehicle document type');
assert.match(fileUploadSource, /description:\s*isVehicleDocument[\s\S]*Documento do veículo:/, 'vehicle upload must preserve a typed description');
assert.match(fileUploadSource, /finally\s*\{[\s\S]*fileInputRef\.current\.value\s*=\s*''/, 'vehicle upload must clear the native input after every attempt');

assert.match(cnhIntakeSource, /const ALLOWED_MIME_TYPES = new Set\(\['application\/pdf', 'image\/jpeg', 'image\/png', 'image\/webp'\]\)/, 'CNH intake must keep the explicit MIME allowlist');
assert.match(cnhIntakeSource, /if \(!file \|\| busy\) return;/, 'CNH analysis must not start without a selected file');
assert.match(cnhIntakeSource, /if \(!ALLOWED_MIME_TYPES\.has\(selected\.type\)\)[\s\S]*setFile\(null\)[\s\S]*fileInputRef\.current\.value = ''/, 'invalid CNH MIME must clear state and native input');
assert.match(cnhIntakeSource, /if \(selected\.size <= 0 \|\| selected\.size > MAX_BYTES\)[\s\S]*setFile\(null\)[\s\S]*fileInputRef\.current\.value = ''/, 'invalid CNH size must clear state and native input');
assert.match(cnhIntakeSource, /const clearSelectedFile = \(\) => \{[\s\S]*setFile\(null\)[\s\S]*fileInputRef\.current\.value = ''/, 'CNH removal must clear state and native input');
assert.match(cnhIntakeSource, /\{file \? 'Trocar arquivo' : 'Selecionar CNH'\}/, 'CNH intake must expose selection and replacement states');
assert.match(cnhIntakeSource, />\s*Remover arquivo\s*</, 'CNH intake must expose explicit removal');
assert.match(cnhIntakeSource, /disabled=\{!file \|\| busy\}/, 'CNH analysis action must remain disabled without a file');
assert.match(detailsSource, /<AttachmentList[\s\S]*entityType="Driver"[\s\S]*entityId=\{driver\.id\}[\s\S]*showPdfActions[\s\S]*protectLatestDriverCnh[\s\S]*\/>/, 'driver CNH file list must protect the latest CNH');
assert.match(attachmentListSource, /const latestDriverCnhId = protectLatestDriverCnh[\s\S]*documentType \|\| ''\)\.toUpperCase\(\) === 'CNH'/, 'attachment list must identify the latest available driver CNH');
assert.match(attachmentListSource, /disabled=\{att\.id === latestDriverCnhId\}/, 'archive action must be disabled for the current CNH');
assert.match(attachmentListSource, /CNH vigente: substitua pelo fluxo Nova CNH \/ Renovar CNH/, 'current CNH archive guard must explain the renewal flow');
assert.match(detailsSource, /Nova CNH \/ Renovar CNH/, 'driver details must expose the explicit CNH renewal action');
assert.match(detailsSource, /onRenewCnh\(driver\.id\)/, 'CNH renewal action must keep the selected driver id');
assert.match(source, /expectedDriverId=\{cnhRenewalDriverId \|\| undefined\}/, 'CNH intake must receive the selected renewal driver');
assert.match(source, /onRenewCnh=\{handleOpenCnhRenewal\}/, 'driver details must be wired to the renewal intake');
assert.match(source, /onRenewed=\{handleCnhRenewed\}/, 'successful renewal must refresh the selected driver details');

assert.match(cnhCardSource, /const current = items[\s\S]*documentType \|\| ''\)\.toUpperCase\(\) === 'CNH'/, 'CNH card must select only the current available CNH');
assert.match(cnhCardSource, /CNH vigente/, 'CNH card must label only the current CNH');
assert.doesNotMatch(cnhCardSource, /Última CNH anterior|history\.map|setAttachments\(cnh\)/, 'previous CNHs must not occupy the main driver profile');
assert.match(detailsSource, /Ver arquivo \/ histórico/, 'driver documents must keep old attachments behind a collapsed history action');
assert.match(detailsSource, /showDocumentArchive&&/, 'driver attachment history must render only after explicit user expansion');
assert.match(detailsSource, /currentOnly:\s*true/, 'driver document list must request only current document records for the main profile');
assert.match(detailsSource, /includeArchived:\s*false/, 'driver document list must exclude archived records from the main profile');
assert.doesNotMatch(cnhCardSource, /storageKey|companyId|x-autoerp-/, 'current CNH UI must not consume storage or tenant authority fields');

assert.match(source, /Promise\.allSettled\(\[\s*DriverClient\.list\(\),\s*VehicleClient\.list\(\),?\s*\]\)/, 'driver list and optional vehicle enrichment must settle independently');
assert.match(source, /if \(driversResult\.status === 'rejected'\)[\s\S]*setDrivers\(\[\]\)[\s\S]*return;/, 'driver authority failure must fail the primary list closed');
assert.match(source, /setDrivers\(driversResult\.value\);[\s\S]*if \(vehiclesResult\.status === 'fulfilled'\)[\s\S]*setVehiclesMap\(vMap\);[\s\S]*else[\s\S]*setVehiclesMap\(\{\}\);/, 'vehicle enrichment failure must preserve the already loaded driver list');
assert.doesNotMatch(source, /Promise\.all\(\[\s*DriverClient\.list\(\),\s*VehicleClient\.list\(/, 'vehicle enrichment must not be able to reject the primary driver load');

const searchableDriver = {
  fullName: 'Yasmin Marques Pereira',
  cpf: '539.382.738-52',
  rg: '58.279.323-3 SSP SP',
  birthDate: '2003-05-27',
  phone: '(11) 99999-0000',
  cnhNumber: '08115969538',
  cnhExpiration: '2031-09-10',
  address: {
    street: 'Rua das Flores',
    number: '180',
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '18077-381',
  },
} as any;

for (const term of [
  'yasmin',
  '539382',
  '081159',
  '999990000',
  '58279323',
  'Rua das Flores',
  'flores',
  'Centro',
  'sao paulo',
  '18077381',
  '2003-05-27',
  '27/05/2003',
  '2031-09-10',
  '10/09/2031',
]) {
  assert.equal(matchesDriverSearch(searchableDriver, term), true, `driver expanded search must match: ${term}`);
}
assert.equal(matchesDriverSearch(searchableDriver, '1999-01-01'), false, 'driver expanded search must reject unrelated dates');
assert.match(source, /matchesDriverSearch\(driver, searchTerm\)/, 'DriversManagement must delegate free-text matching to the expanded driver search policy');
assert.match(source, /RG, endereço, CEP ou data/, 'driver search placeholder must advertise the expanded searchable fields');

console.log('Deferred driver modals, profile photo, CNH history, document upload UX and driver list resilience regression: PASS');
