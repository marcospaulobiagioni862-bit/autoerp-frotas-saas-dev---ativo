import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../ContractsManagement.tsx', import.meta.url), 'utf8');
const contractForm = readFileSync(new URL('../ContractFormModal.tsx', import.meta.url), 'utf8');
const templateModal = readFileSync(new URL('../ContractTemplateManagementModal.tsx', import.meta.url), 'utf8');
const templateRoutes = readFileSync(new URL('../../../server/contractTemplateRoutes.ts', import.meta.url), 'utf8');
const detailsModal = readFileSync(new URL('../ContractDetailsModal.tsx', import.meta.url), 'utf8');
const executionPanel = readFileSync(new URL('../ContractExecutionPanel.tsx', import.meta.url), 'utf8');
const templatePolicy = readFileSync(new URL('../../../domain/contracts/contractTemplatePolicy.ts', import.meta.url), 'utf8');
const executionRoutes = readFileSync(new URL('../../../server/contractExecutionRoutes.ts', import.meta.url), 'utf8');

const modals = ['ContractFormModal', 'ContractDetailsModal', 'ContractTemplateManagementModal'] as const;

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
  (source.match(/=lazy\(\(\)=>import\('\.\/Contract(?:Form|Details|TemplateManagement)Modal'/g) ?? []).length,
  modals.length,
  'ContractsManagement must define exactly three lazy modal loaders',
);
assert.match(source, /\{formOpen&&<ContractFormModal/, 'contract form must render only when open');
assert.match(
  source,
  /\{detailsOpen&&selectedContractId&&<ContractDetailsModal/,
  'contract details must render only when open with a selected server id',
);
assert.match(
  source,
  /\{templateManagerOpen&&<ContractTemplateManagementModal/,
  'contract templates must render only when explicitly opened',
);
assert.match(
  source,
  /<LazyModuleErrorBoundary resetKey=\{contractModalResetKey\} onRetry=\{\(\)=>window\.location\.reload\(\)\}>/,
  'contract modal recovery must reset between modal targets',
);
assert.match(
  source,
  /<Suspense fallback=\{<div role="status"[^>]*>.*Carregando dados do contrato\.\.\./,
  'contract modals must expose a neutral loading state',
);
assert.doesNotMatch(
  source,
  /error\.(?:message|stack)|String\(error\)/,
  'contract modal fallback must not expose raw errors',
);

assert.match(source, /openContractDetails\(item\.id, 'PDF_SIGNATURE'\)[\s\S]*PDF \/ Assinatura/, 'PDF / Assinatura action must target the document execution section');
assert.match(source, /openContractDetails\(item\.id, 'FINANCIAL'\)[\s\S]*Faturar \/ Categoria/, 'billing action must target the financial tab');
assert.match(source, /initialFocus=\{detailsFocus\}/, 'details modal must receive the requested action focus');
assert.match(detailsModal, /initialFocus === 'FINANCIAL' \? 'FINANCIAL' : 'OVERVIEW'/, 'details modal must open billing actions in the financial tab');
assert.match(detailsModal, /focusOnOpen=\{initialFocus === 'PDF_SIGNATURE'\}/, 'details modal must focus the execution panel for PDF/signature');
assert.match(executionPanel, /data-contract-section="pdf-signature"/, 'execution panel must expose a stable PDF/signature anchor');
assert.match(executionPanel, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/, 'PDF/signature action must visibly navigate to its section');
for (const placeholder of [
  'driver.rg','driver.birthDate','driver.phone','driver.whatsapp','driver.email','driver.cnhCategory',
  'vehicle.version','vehicle.brandModel','vehicle.yearFabrication','vehicle.yearModel','vehicle.yearDisplay',
  'vehicle.color','vehicle.chassis','vehicle.currentKm',
]) {
  assert.ok(templatePolicy.includes(`'${placeholder}'`), `MoveFlex placeholder missing: ${placeholder}`);
}
assert.match(executionRoutes, /rg: driver\.rg \|\| ''/, 'contract snapshot must source driver RG from the server-authoritative driver');
assert.match(executionRoutes, /cnhCategory: driver\.cnhCategory/, 'contract snapshot must source CNH category');
assert.match(executionRoutes, /brandModel: \[vehicle\.brand, vehicle\.model, vehicle\.version\]/, 'contract snapshot must derive full vehicle display name');
assert.match(executionRoutes, /yearDisplay: `\$\{vehicle\.yearFabrication\}\/\$\{vehicle\.yearModel\}`/, 'contract snapshot must derive fabrication/model year');
assert.match(contractForm, /templateList\.find\(\(item\) => item\.templateKey === 'locacao-padrao'\)/, 'new contract must prefer the active standard rental template');
assert.match(executionPanel, /templateList\.find\(\(item\) => item\.templateKey === 'locacao-padrao'\)/, 'contract execution must prefer the standard rental template');
for (const placeholder of [
  'company.tradeName','company.email','company.phone','company.whatsapp',
  'company.address.street','company.address.number','company.address.complement','company.address.neighborhood',
  'company.address.city','company.address.state','company.address.zipCode','company.address.full',
  'company.legalRepresentative.name','company.legalRepresentative.cpf',
]) {
  assert.ok(templatePolicy.includes(`'${placeholder}'`), `MoveFlex company placeholder missing: ${placeholder}`);
}
assert.match(executionRoutes, /tradeName: company\.tradeName \|\| ''/, 'contract generator must source company trade name server-side');
assert.match(executionRoutes, /legalRepresentativeName/, 'contract generator must source the legal representative from the company profile');
assert.match(executionRoutes, /'company\.address\.full': snapshot\.company\.address\.full/, 'company full address must be exposed to the template renderer');




assert.match(
  templateRoutes,
  /findVersions\(principal\.companyId, key\)[\s\S]*Math\.max\(\.\.\.versions\.map\(\(version\) => version\.versionNumber\), 0\) \+ 1/,
  'recreating a template key with historical versions must allocate the next version instead of colliding with v1',
);
assert.match(
  contractForm,
  /dark:text-slate-200/,
  'contract form labels must remain readable in dark mode',
);
assert.match(
  contractForm,
  /dark:text-slate-300/,
  'contract attachment helper text must remain readable in dark mode',
);
assert.match(
  templateModal,
  /Anexar PDF\/DOCX/,
  'template modal must expose the file-source action explicitly',
);
assert.match(
  templateModal,
  /dark:bg-slate-950\/50 dark:text-slate-200/,
  'template file input must have an explicit readable dark-mode surface',
);

console.log('Deferred contract modals regression: PASS');
