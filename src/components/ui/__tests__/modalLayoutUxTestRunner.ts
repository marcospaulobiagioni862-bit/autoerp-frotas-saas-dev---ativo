import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../ModalContainer.tsx', import.meta.url), 'utf8');
const contractForm = readFileSync(new URL('../../contracts/ContractFormModal.tsx', import.meta.url), 'utf8');
const contractDetails = readFileSync(new URL('../../contracts/ContractDetailsModal.tsx', import.meta.url), 'utf8');
const vehicleDetails = readFileSync(new URL('../../fleet/VehicleDetailsModal.tsx', import.meta.url), 'utf8');
const archivedVehicle = readFileSync(new URL('../../fleet/ArchivedVehicleHistoryModal.tsx', import.meta.url), 'utf8');

assert.match(modal, /overflow-hidden bg-slate-900\/60/, 'modal overlay must not create a second vertical scrollbar');
assert.match(modal, /document\.querySelector\('main'\)/, 'modal must lock the app scroll root behind it');
assert.match(modal, /'max-w-5xl': 'max-w-5xl'/, 'legacy max-width values must resolve instead of falling back to lg');
assert.match(modal, /max-h-\[96vh\]/, 'modal should use nearly all available viewport height before scrolling');

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
  /overflow-y-auto overflow-x-hidden \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/,
  'root content scrollbar must remain functional but visually hidden',
);
assert.match(
  productionSidebar,
  /overflow-y-auto overflow-x-hidden overscroll-contain \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/,
  'production sidebar scrollbar must remain functional but visually hidden',
);
