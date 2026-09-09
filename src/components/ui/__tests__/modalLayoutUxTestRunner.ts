import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../ModalContainer.tsx', import.meta.url), 'utf8');
const contractForm = readFileSync(new URL('../../contracts/ContractFormModal.tsx', import.meta.url), 'utf8');
const contractDetails = readFileSync(new URL('../../contracts/ContractDetailsModal.tsx', import.meta.url), 'utf8');
const vehicleDetails = readFileSync(new URL('../../fleet/VehicleDetailsModal.tsx', import.meta.url), 'utf8');
const archivedVehicle = readFileSync(new URL('../../fleet/ArchivedVehicleHistoryModal.tsx', import.meta.url), 'utf8');
const input = readFileSync(new URL('../Input.tsx', import.meta.url), 'utf8');
const select = readFileSync(new URL('../Select.tsx', import.meta.url), 'utf8');
const unsavedAuthority = readFileSync(new URL('../../../app/unsavedChangesAuthority.ts', import.meta.url), 'utf8');

assert.match(modal, /overflow-hidden bg-slate-900\/60/, 'modal overlay must not create a second vertical scrollbar');
assert.match(modal, /document\.querySelector\('main'\)/, 'modal must lock the app scroll root behind it');
assert.match(modal, /'max-w-5xl': 'max-w-5xl'/, 'legacy max-width values must resolve instead of falling back to lg');
assert.match(modal, /max-h-\[96vh\]/, 'modal should use nearly all available viewport height before scrolling');
assert.match(modal, /relative w-full min-w-0/, 'modal shell must allow responsive shrinking');
assert.match(modal, /min-w-0 p-4 overflow-y-auto overflow-x-hidden/, 'modal body must not create a page-level horizontal scrollbar');
assert.match(input, /dark:text-slate-200/, 'shared input labels must remain legible in dark mode');
assert.match(input, /dark:placeholder-slate-400/, 'shared input placeholders must remain legible in dark mode');
assert.match(input, /helperText[\s\S]*dark:text-slate-300/, 'shared input helper text must remain legible in dark mode');
assert.match(select, /dark:text-slate-200/, 'shared select labels must remain legible in dark mode');
assert.match(select, /helperText[\s\S]*dark:text-slate-300/, 'shared select helper text must remain legible in dark mode');

assert.match(modal, /data-unsaved-guard=\{guardId\}/, 'every standard modal must participate in the unsaved-changes authority');
assert.match(modal, /onInputCapture=\{\(event\) => markDirty\(event\.target\)\}/, 'modal must detect user edits without per-form wiring');
assert.match(modal, /window\.confirm\(UNSAVED_CHANGES_MESSAGE\)/, 'dirty modal close must require explicit discard confirmation');
assert.match(modal, /onClick=\{requestClose\}/, 'modal close button must use the guarded close authority');
assert.match(modal, /onClick=\{requireExplicitClose \? undefined : requestClose\}/, 'backdrop close must use the guarded close authority when enabled');
assert.doesNotMatch(modal, /onClick=\{requireExplicitClose \? undefined : onClose\}/, 'modal backdrop must not bypass unsaved changes');
assert.match(unsavedAuthority, /beforeunload/, 'global authority must protect browser refresh and tab close');
assert.match(unsavedAuthority, /dirtySources = new Set<string>\(\)/, 'global authority must track multiple independent dirty editors');


assert.match(contractForm, /size="5xl"/, 'contract form should use a wide desktop workspace');
assert.match(contractForm, /title=\{contractToEdit \? 'Editar Contrato' : 'Novo Contrato'\}/, 'contract form must use ModalContainer title');
assert.doesNotMatch(contractForm, /<h2 className="flex items-center gap-2 font-bold">/, 'contract form must not render a second modal header');
assert.doesNotMatch(contractForm, /<button onClick=\{onClose\} className="text-slate-400">/, 'contract form must not render a second close button');
assert.doesNotMatch(contractForm, /max-h-\[80vh\][^"]*overflow-y-auto/, 'contract form must not create nested vertical scroll');

assert.match(contractDetails, /size="6xl"/, 'contract details should use a near-full desktop workspace');
assert.doesNotMatch(contractDetails, /max-h-\[65vh\][^"]*overflow-y-auto/, 'contract details must not create nested vertical scroll');
assert.match(contractDetails, /grid grid-cols-2 gap-2/, 'contract detail tabs must use a responsive grid');

assert.match(vehicleDetails, /grid grid-cols-2 gap-2 border-b pb-3/, 'vehicle detail tabs must use a responsive grid');
assert.match(archivedVehicle, /grid grid-cols-2 gap-2 border-b pb-3/, 'archived vehicle tabs must use a responsive grid');

console.log('Modal layout UX regression PASS');

const app = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf8');
const productionSidebar = readFileSync(new URL('../../layout/ProductionSidebar.tsx', import.meta.url), 'utf8');

assert.match(
  app,
  /app-content-scrollbar flex-1 min-h-0 overflow-y-scroll overflow-x-hidden/,
  'root content must expose one visible global vertical scrollbar',
);
assert.doesNotMatch(
  app,
  /scrollbar-width:none|\[&::-webkit-scrollbar\]:hidden/,
  'root content scrollbar must never be visually hidden',
);
assert.match(
  app,
  /handleResolveNotification/,
  'global scrollbar changes must preserve notification source-module routing',
);
assert.match(app, /confirmDiscardUnsavedChanges\(\)/, 'module navigation must consult the global unsaved-changes authority');
assert.match(app, /onTabChange=\{requestTabChange\}/, 'sidebar navigation must never bypass the unsaved-changes guard');
assert.match(app, /installUnsavedChangesBeforeUnload\(\)/, 'application root must install browser-exit protection');
assert.doesNotMatch(app, /onTabChange=\{setActiveTab\}/, 'sidebar must not navigate directly around the unsaved-changes authority');
assert.match(
  productionSidebar,
  /overflow-y-auto overflow-x-hidden overscroll-contain \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/,
  'production sidebar scrollbar must remain functional but visually hidden',
);
