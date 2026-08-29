import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../DriversManagement.tsx', import.meta.url), 'utf8');
const detailsSource = readFileSync(new URL('../DriverDetailsModal.tsx', import.meta.url), 'utf8');
const profilePhotoSource = readFileSync(new URL('../DriverProfilePhoto.tsx', import.meta.url), 'utf8');

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
assert.match(
  source,
  /\{isFormOpen\s*&&\s*<DriverFormModal/,
  'driver form must only render after an explicit open action',
);
assert.match(
  source,
  /\{isDetailsOpen\s*&&\s*selectedDriverId\s*&&\s*<DriverDetailsModal/,
  'driver details must only render when open with a selected server id',
);
assert.match(
  source,
  /\{isCnhIntakeOpen\s*&&\s*<DriverCnhIntakeModal/,
  'CNH intake must only render after an explicit open action',
);
assert.match(
  source,
  /<LazyModuleErrorBoundary resetKey=\{driverModalResetKey\} onRetry=\{\(\)\s*=>\s*window\.location\.reload\(\)\}>/,
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

console.log('Deferred driver modals and profile photo header regression: PASS');