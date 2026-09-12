import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './maintenanceSlaTestRunner';

const source = readFileSync(new URL('../MaintenanceManagement.tsx', import.meta.url), 'utf8');
const preventiveSource = readFileSync(new URL('../MaintenancePreventivePanel.tsx', import.meta.url), 'utf8');
const preventiveClientSource = readFileSync(new URL('../../../api/maintenancePreventiveClient.ts', import.meta.url), 'utf8');
const templateVehicleRoutesSource = readFileSync(new URL('../../../server/maintenanceTemplateVehicleRoutes.ts', import.meta.url), 'utf8');
const templateAuthoritySource = readFileSync(new URL('../../../server/maintenancePlanTemplateAuthority.ts', import.meta.url), 'utf8');

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

for (const ruleLabel of ['Aviso KM', 'Urgente KM', 'Aviso dias', 'Urgente dias', 'Tolerância KM', 'Tolerância dias']) {
  assert.match(
    preventiveSource,
    new RegExp(`<span className="mb-1 block text-\\[10px\\] font-semibold text-slate-500">${ruleLabel}<\\/span><Input aria-label="${ruleLabel}"`),
    `${ruleLabel} must remain visible and accessible when the rule field has a value`,
  );
}

assert.match(preventiveSource, /Todos os veículos/, 'preventive plans must offer vehicle filtering');
assert.match(preventiveSource, /Todas as categorias/, 'preventive plans must offer category filtering');
assert.match(preventiveSource, /Todos os tipos\/itens/, 'preventive plans must offer maintenance item filtering');
assert.match(preventiveSource, /Todas as ações/, 'preventive plans must offer action filtering');
assert.match(preventiveSource, /Todos os status/, 'preventive plans must offer operational status filtering');
assert.match(preventiveSource, /Todas as prioridades/, 'preventive plans must offer priority filtering');
assert.match(preventiveSource, /Ordenar por urgência/, 'preventive plans must keep urgency as the default sorting option');
assert.match(preventiveSource, /Maior prioridade/, 'preventive plans must allow explicit priority sorting');
assert.match(preventiveSource, /Menor KM restante/, 'preventive plans must allow KM proximity sorting');
assert.match(preventiveSource, /Menor prazo em dias/, 'preventive plans must allow day proximity sorting');
assert.match(preventiveSource, /PRIORITY_RANK=\{CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3\}/, 'priority sorting must use the approved critical-to-low order');
assert.match(preventiveSource, /<th className="p-3 text-left">Prioridade<\/th>/, 'preventive plan table must display priority');
assert.match(preventiveSource, /priorityBadge\(p\)/, 'preventive rows must project the plan priority visibly');
assert.match(preventiveSource, /Até X km restantes/, 'preventive plans must offer KM proximity filtering');
assert.match(preventiveSource, /Até X dias restantes/, 'preventive plans must offer day proximity filtering');
assert.match(preventiveSource, /filteredPlans\.map/, 'preventive table must render the filtered projection');
assert.match(preventiveSource, /OVERDUE:0,DUE:1,UPCOMING:2,OK:3,PAUSED:4/, 'preventive plans must sort by operational urgency');
assert.match(preventiveSource, /Nenhum plano corresponde aos filtros selecionados/, 'combined filters must provide an empty state');
assert.doesNotMatch(preventiveSource, /plans\.map\(p=><tr/, 'preventive table must not bypass the filtered projection');

assert.match(preventiveSource, /aria-label="Item preventivo para aplicação individual"/, 'individual preventive apply must expose template selection');
assert.match(preventiveSource, /aria-label="Veículo para aplicação individual"/, 'individual preventive apply must expose vehicle selection');
assert.match(preventiveSource, />Aplicar ao veículo</, 'individual preventive apply must expose an explicit action');
assert.match(preventiveSource, />Aplicar à frota</, 'fleet-wide preventive apply must remain available');
assert.ok(
  preventiveSource.includes('MaintenancePreventiveClient.applyTemplatesToVehicle(applyVehicle,applyTemplate)'),
  'individual preventive action must send both selected vehicle and selected template',
);
assert.ok(
  preventiveClientSource.includes("templateId?{vehicleId,templateId}:{vehicleId}"),
  'preventive client must preserve vehicle-only compatibility while supporting explicit template scope',
);
assert.ok(
  templateVehicleRoutesSource.includes("key !== 'vehicleId' && key !== 'templateId'"),
  'server route must accept only the protected vehicle/template scope fields',
);
assert.ok(
  templateVehicleRoutesSource.includes('}, requestedTemplateId);'),
  'server route must pass the selected template to authority',
);
assert.ok(
  templateAuthoritySource.includes('AND id=${templateId} AND active=true LIMIT 1'),
  'authority must resolve the selected template server-side and require it to be active',
);
assert.ok(
  templateAuthoritySource.includes("templateId?'APPLIED_FROM_SELECTED_TEMPLATE':'APPLIED_FROM_GLOBAL_TEMPLATE'"),
  'individual template application must remain auditable separately from fleet-wide application',
);

assert.match(preventiveSource, />Desativar<\/Button>/, 'active preventive templates must expose an explicit deactivate action');
assert.ok(
  preventiveSource.includes('MaintenancePreventiveClient.updateTemplate(t.id,{active:false})'),
  'template deactivation must use the existing server-side update authority',
);
assert.match(preventiveSource, /histórico será preservado/, 'template deactivation must warn that history is preserved');
assert.ok(
  templateAuthoritySource.includes("UPDATE maintenance_plans SET status='PAUSED'") && templateAuthoritySource.includes("template_id=${id} AND status='ACTIVE'"),
  'server authority must pause active plans when a template is deactivated',
);
assert.ok(
  templateAuthoritySource.includes('previousState:JSON.stringify(before),newState:JSON.stringify(saved)'),
  'template deactivation must remain covered by server-side before/after audit',
);

assert.match(source, /Itens preventivos executados nesta OS/, 'OS completion must expose executed preventive item selection');
assert.match(source, /Preventiva Antecipada/, 'OS completion must explain early preventive execution');
assert.match(source, /MaintenancePreventiveClient\.listPlans\(wo\.vehicleId\)/, 'OS completion must load preventive plans for the same vehicle');
assert.match(source, /plan=>plan\.status==='ACTIVE'/, 'OS completion must only offer active preventive plans');
assert.match(source, /preventivePlanIds:preventiveSelection/, 'OS completion must send the explicit preventive selection to server authority');
assert.match(source, /completePlansLoaded\?selectedPreventivePlanIds:undefined/, 'failed preventive-plan loading must preserve legacy completion behavior');
assert.match(source, /type="checkbox"/, 'OS completion must support multiple preventive items');

console.log('Deferred maintenance panels regression: PASS');
