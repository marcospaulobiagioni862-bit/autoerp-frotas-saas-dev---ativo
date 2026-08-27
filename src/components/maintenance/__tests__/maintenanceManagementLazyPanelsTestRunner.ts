import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../MaintenanceManagement.tsx', import.meta.url), 'utf8');

for (const component of ['AttachmentModal', 'MaintenancePreventivePanel']) {
  assert.equal(
    new RegExp(`import\\s+\\{\\s*${component}\\s*\\}\\s+from`).test(source),
    false,
    `${component} must not remain a static import`,
  );
}
assert.match(
  source,
  /const\s+AttachmentModal=lazy\(\(\)=>import\('\.\.\/documents\/AttachmentModal'\)/,
  'maintenance attachments must load only when requested',
);
assert.match(
  source,
  /const\s+MaintenancePreventivePanel=lazy\(\(\)=>import\('\.\/MaintenancePreventivePanel'\)/,
  'preventive maintenance must load only when its subtab opens',
);
assert.match(
  source,
  /tab==='oilTires' && <LazyModuleErrorBoundary resetKey="preventive"/,
  'preventive recovery must reset independently from work-order attachments',
);
assert.match(
  source,
  /attachmentEntity && <LazyModuleErrorBoundary resetKey=\{`attachment:\$\{attachmentEntity\.id\}`\}/,
  'attachment recovery must reset between work orders',
);
assert.match(source, /Carregando manutenção preventiva\.\.\./, 'preventive loading must remain neutral');
assert.match(source, /Carregando anexos da manutenção\.\.\./, 'attachment loading must remain neutral');
assert.doesNotMatch(
  source,
  /error\.(?:message|stack)|String\(error\)/,
  'lazy maintenance fallbacks must not expose raw errors',
);

console.log('Deferred maintenance panels regression: PASS');
