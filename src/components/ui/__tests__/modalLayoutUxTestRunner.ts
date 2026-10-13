import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const modal = readFileSync(new URL('../ModalContainer.tsx', import.meta.url), 'utf8');
const contractForm = readFileSync(new URL('../../contracts/ContractFormModal.tsx', import.meta.url), 'utf8');
const contractDetails = readFileSync(new URL('../../contracts/ContractDetailsModal.tsx', import.meta.url), 'utf8');
const vehicleDetails = readFileSync(new URL('../../fleet/VehicleDetailsModal.tsx', import.meta.url), 'utf8');
const archivedVehicle = readFileSync(new URL('../../fleet/ArchivedVehicleHistoryModal.tsx', import.meta.url), 'utf8');
const input = readFileSync(new URL('../Input.tsx', import.meta.url), 'utf8');
const select = readFileSync(new URL('../Select.tsx', import.meta.url), 'utf8');
const unsavedAuthority = readFileSync(new URL('../../../app/unsavedChangesAuthority.ts', import.meta.url), 'utf8');

assert.match(modal, /overflow-hidden bg-graphite-900\/60/, 'modal overlay must not create a second vertical scrollbar');
assert.match(modal, /document\.querySelector\('main'\)/, 'modal must lock the app scroll root behind it');
assert.match(modal, /'max-w-5xl': 'max-w-5xl'/, 'legacy max-width values must resolve instead of falling back to lg');
assert.match(modal, /max-h-\[96vh\]/, 'modal should use nearly all available viewport height before scrolling');
assert.match(modal, /relative w-full min-w-0/, 'modal shell must allow responsive shrinking');
assert.match(modal, /min-w-0 flex-1 min-h-0 p-4 overflow-y-auto overflow-x-hidden/, 'modal body must not create a page-level horizontal scrollbar');
// AUTOERP-84: flex-1 e min-h-0 sao o que faz o corpo ENCOLHER e rolar por dentro.
// Sem eles o corpo cresce com o conteudo, estoura o painel limitado a 96vh, e o
// rodape com o botao de acao fica fora da tela - era impossivel cadastrar veiculo
// num notebook. A asercao abaixo existe para esse par nunca mais ser removido.
assert.match(modal, /flex-1 min-h-0/, 'modal body must keep flex-1 and min-h-0 or the footer leaves the screen');
assert.match(input, /dark:text-graphite-200/, 'shared input labels must remain legible in dark mode');
assert.match(input, /dark:placeholder-graphite-400/, 'shared input placeholders must remain legible in dark mode');
assert.match(input, /helperText[\s\S]*dark:text-graphite-300/, 'shared input helper text must remain legible in dark mode');
assert.match(select, /dark:text-graphite-200/, 'shared select labels must remain legible in dark mode');
assert.match(select, /helperText[\s\S]*dark:text-graphite-300/, 'shared select helper text must remain legible in dark mode');

assert.match(modal, /data-unsaved-guard=\{guardId\}/, 'every standard modal must participate in the unsaved-changes authority');
assert.match(modal, /onInputCapture=\{\(event\) => markDirty\(event\.target\)\}/, 'modal must detect user edits without per-form wiring');
assert.match(modal, /window\.confirm\(UNSAVED_CHANGES_MESSAGE\)/, 'dirty modal close must require explicit discard confirmation');
assert.match(modal, /onClick=\{requestClose\}/, 'modal close button must use the guarded close authority');
assert.match(modal, /onClick=\{requireExplicitClose \? undefined : requestClose\}/, 'backdrop close must use the guarded close authority when enabled');
assert.doesNotMatch(modal, /onClick=\{requireExplicitClose \? undefined : onClose\}/, 'modal backdrop must not bypass unsaved changes');
assert.match(unsavedAuthority, /beforeunload/, 'global authority must protect browser refresh and tab close');
assert.match(unsavedAuthority, /dirtySources = new Set<string>\(\)/, 'global authority must track multiple independent dirty editors');
assert.match(unsavedAuthority, /requestGuardedClose/, 'explicit Cancel/close actions must have a shared guarded-close authority');
assert.match(unsavedAuthority, /closest\('\[data-unsaved-guard\]'\)/, 'explicit close must resolve the nearest modal dirty source instead of clearing every editor');

const componentsRoot = fileURLToPath(new URL('../../', import.meta.url));
const directCloseBypasses: string[] = [];
const scanDirectCloseBypasses = (directory: string) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      scanDirectCloseBypasses(absolute);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.tsx')) continue;
    const source = readFileSync(absolute, 'utf8');
    if (source.includes('onClick={onClose}')) {
      directCloseBypasses.push(absolute.slice(componentsRoot.length));
    }
  }
};
scanDirectCloseBypasses(componentsRoot);
assert.deepEqual(
  directCloseBypasses,
  [],
  `all explicit component close actions must use requestGuardedClose; bypasses: ${directCloseBypasses.join(', ')}`,
);

// AUTOERP-92. A asercao acima e um grep por onClick={onClose}: ela e satisfeita por
// qualquer coisa que nao seja esse literal, inclusive por um requestGuardedClose que
// nunca dispara. E foi o que quase aconteceu no assistente de vistoria: ele tem shell
// propria, sem ModalContainer, e requestGuardedClose so age dentro de
// `if (guardId && ...)`, com guardId vindo de closest('[data-unsaved-guard]'). Sem o
// atributo no painel, o teste ficava verde e o confirm nunca aparecia.
//
// Por isso todo modal de shell propria - o que nao importa ModalContainer mas monta o
// proprio overlay fixed inset-0 - tem de declarar o atributo, ou nao ha onde pendurar
// o estado sujo. Quem usa ModalContainer ja recebe o atributo dele e fica de fora.
const ownShellMissingGuard: string[] = [];
const scanOwnShellModals = (directory: string) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      scanOwnShellModals(absolute);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.tsx')) continue;
    const source = readFileSync(absolute, 'utf8');
    // Cada filtro olha CODIGO, nunca mencao. Tres vezes nesta sessao uma checagem por
    // string solta foi derrotada por um comentario que citava o proprio termo - e o
    // efeito e sempre o mesmo e sempre silencioso: o arquivo e pulado e a invariante
    // vira enfeite. Por isso: uso em JSX para o componente, chamada para a funcao.
    if (!source.includes('fixed inset-0')) continue;
    if (/<ModalContainer[\s>]/.test(source)) continue;
    if (!/requestGuardedClose\(/.test(source)) continue;
    // Procura o ATRIBUTO, nao a string: a primeira versao desta checagem usava
    // includes('data-unsaved-guard') e era derrotada por um comentario que apenas
    // citava o atributo - descoberto ao mutar o wizard e ver o teste passar, o que
    // e precisamente o defeito que este card existe para corrigir.
    if (/data-unsaved-guard=\{/.test(source)) continue;
    // Shell propria SEM campo editavel nao tem trabalho a perder - o comparador de
    // vistoria e a previa de documento sao so leitura, e exigir ancora de estado sujo
    // neles seria cerimonia sem protecao. A exigencia vale onde ha o que digitar, e e
    // deduzida do proprio arquivo em vez de lista de excecao, que apodrece.
    if (!/<(Input|input|textarea|Textarea|Select|select)\b/.test(source)) continue;
    ownShellMissingGuard.push(absolute.slice(componentsRoot.length));
  }
};
scanOwnShellModals(componentsRoot);
assert.deepEqual(
  ownShellMissingGuard,
  [],
  `own-shell modals calling requestGuardedClose must carry data-unsaved-guard or the guard never fires; missing: ${ownShellMissingGuard.join(', ')}`,
);

// O custo real do assistente de vistoria e a FOTO, nao o campo digitado: seis angulos
// tirados no patio. O markDirty do ModalContainer reage a evento de input e nunca veria
// isso, entao o wizard calcula o sujo do proprio estado e expoe pela sentinela que a
// autoridade le (nestedDirty). Se esta ligacao cair, fechar no X volta a descartar as
// seis fotos sem perguntar nada.
const inspectionWizard = readFileSync(
  new URL('../../fleet/VehicleInspectionWizardModal.tsx', import.meta.url),
  'utf8',
);
assert.match(
  inspectionWizard,
  /data-draft-dirty=\{hasPendingWork \? 'true' : 'false'\}/,
  'inspection wizard must expose its dirty state through the data-draft-dirty sentinel',
);
assert.match(
  inspectionWizard,
  /photo\.dataUrl !== ''\)\) return true/,
  'inspection wizard dirty check must count a captured photo as unsaved work',
);



assert.match(contractForm, /size="5xl"/, 'contract form should use a wide desktop workspace');
assert.match(contractForm, /title=\{contractToEdit \? 'Editar Contrato' : 'Novo Contrato'\}/, 'contract form must use ModalContainer title');
assert.doesNotMatch(contractForm, /<h2 className="flex items-center gap-2 font-bold">/, 'contract form must not render a second modal header');
assert.doesNotMatch(contractForm, /<button onClick=\{onClose\} className="text-graphite-400">/, 'contract form must not render a second close button');
assert.doesNotMatch(contractForm, /max-h-\[80vh\][^"]*overflow-y-auto/, 'contract form must not create nested vertical scroll');

assert.match(contractDetails, /size="6xl"/, 'contract details should use a near-full desktop workspace');
assert.doesNotMatch(contractDetails, /max-h-\[65vh\][^"]*overflow-y-auto/, 'contract details must not create nested vertical scroll');
assert.match(contractDetails, /grid grid-cols-2 gap-2/, 'contract detail tabs must use a responsive grid');

assert.match(vehicleDetails, /grid grid-cols-2 gap-2 border-b pb-3/, 'vehicle detail tabs must use a responsive grid');
assert.match(archivedVehicle, /grid grid-cols-2 gap-2 border-b pb-3/, 'archived vehicle tabs must use a responsive grid');

console.log('Modal layout UX regression PASS');

const app = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf8');
// AUTOERP-95 (revisao). Esta invariante lia ProductionSidebar.tsx, que virou re-export de
// 11 linhas no AUTOERP-67 e nao tem JSX nenhum: ela passava apenas porque a string exata da
// classe foi colada num COMENTARIO do stub - apagar so o comentario deixa o teste vermelho,
// o que prova que ela nao vigiava codigo. Repontada para o Sidebar.tsx canonico, que e onde
// a barra de rolagem de fato existe hoje. Vale a regra 3.2-d: invariante sobre arquivo que
// virou stub morre calada.
const sidebarCanonico = readFileSync(new URL('../../layout/Sidebar.tsx', import.meta.url), 'utf8');
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
  sidebarCanonico,
  /overflow-y-auto overflow-x-hidden overscroll-contain \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/,
  'sidebar scrollbar must remain functional but visually hidden',
);
// O stub continua vigiado, mas pelo que ele de fato deve ser: um re-export. Se alguem voltar
// a escrever navegacao propria nele, a paridade entre dev e producao quebra de novo.
assert.match(
  productionSidebar,
  // O \b final importa: sem ele o regex casa por prefixo e um export de "SidebarX" passaria.
  /export\s*\{\s*Sidebar\b/,
  'ProductionSidebar must stay a re-export of the canonical Sidebar',
);
