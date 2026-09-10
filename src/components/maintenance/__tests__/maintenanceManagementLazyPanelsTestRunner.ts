import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './maintenanceSlaTestRunner';

const source = readFileSync(new URL('../MaintenanceManagement.tsx', import.meta.url), 'utf8');
const preventiveSource = readFileSync(new URL('../MaintenancePreventivePanel.tsx', import.meta.url), 'utf8');

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

assert.doesNotMatch(source, /window\.prompt\(/, 'maintenance cancellation must not depend on native browser prompt');
assert.match(source, /Cancelar \{cancelTarget\.number\}/, 'maintenance cancellation must use an in-app modal');
assert.match(source, /Informe o motivo do cancelamento da OS\./, 'maintenance cancellation must require a reason');
assert.match(source, /Confirmar cancelamento/, 'maintenance cancellation modal must expose an explicit confirmation action');

assert.match(preventiveSource, /Todos os veículos/, 'preventive plans must offer vehicle filtering');
assert.match(preventiveSource, /Todas as categorias/, 'preventive plans must offer category filtering');
assert.match(preventiveSource, /Todos os tipos\/itens/, 'preventive plans must offer maintenance item filtering');
assert.match(preventiveSource, /Todas as ações/, 'preventive plans must offer action filtering');
assert.match(preventiveSource, /Todos os status/, 'preventive plans must offer operational status filtering');
assert.match(preventiveSource, /Até X km restantes/, 'preventive plans must offer KM proximity filtering');
assert.match(preventiveSource, /Até X dias restantes/, 'preventive plans must offer day proximity filtering');
assert.match(preventiveSource, /filteredPlans\.map/, 'preventive table must render the filtered projection');
assert.match(preventiveSource, /OVERDUE:0,DUE:1,UPCOMING:2,OK:3,PAUSED:4/, 'preventive plans must sort by operational urgency');
assert.match(preventiveSource, /Nenhum plano corresponde aos filtros selecionados/, 'combined filters must provide an empty state');
assert.doesNotMatch(preventiveSource, /plans\.map\(p=><tr/, 'preventive table must not bypass the filtered projection');

console.log('Deferred maintenance panels regression: PASS');
