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
const approvedMasterRegistry = readFileSync(new URL('../../../domain/contracts/moveflexApprovedContractMaster.ts', import.meta.url), 'utf8');
const visualFixedRenderer = readFileSync(new URL('../../../domain/contracts/moveflexVisualFixedPdfRenderer.ts', import.meta.url), 'utf8');
const attachmentRoutes = readFileSync(new URL('../../../server/attachmentRoutes.ts', import.meta.url), 'utf8');
const templateClient = readFileSync(new URL('../../../api/contractTemplateClient.ts', import.meta.url), 'utf8');

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
for (const placeholder of ['driver.maritalStatus','driver.profession','driver.motherName','driver.pixKey']) {
  assert.ok(templatePolicy.includes(`'${placeholder}'`), `MoveFlex driver profile placeholder missing: ${placeholder}`);
}
assert.match(executionRoutes, /maritalStatus: driver\.maritalStatus \|\| ''/, 'contract snapshot must source marital status');
assert.match(executionRoutes, /profession: driver\.profession \|\| ''/, 'contract snapshot must source profession');
assert.match(executionRoutes, /motherName: driver\.motherName \|\| ''/, 'contract snapshot must source mother name');
assert.match(executionRoutes, /pixKey: driver\.pixKey \|\| ''/, 'contract snapshot must source PIX key');
assert.match(executionRoutes, /'driver\.pixKey': snapshot\.driver\.pixKey/, 'PIX key must be exposed to template renderer');

assert.match(executionRoutes, /brandModel: \[vehicle\.brand, vehicle\.model, vehicle\.version\]/, 'contract snapshot must derive full vehicle display name');
assert.match(executionRoutes, /yearDisplay: `\$\{vehicle\.yearFabrication\}\/\$\{vehicle\.yearModel\}`/, 'contract snapshot must derive fabrication/model year');
assert.match(contractForm, /getMoveFlexApprovedContractMaster\(item\.templateKey\)\?\.templateKey === 'locacao-padrao'/, 'new contract must preselect Contract 01 even when the persisted key uses the legacy alias');
assert.match(contractForm, /contractNumber: '', vehicleId: '', driverId: '',[\s\S]*startDate: '', endDate: '', rentalAmount: '',[\s\S]*billingPeriodicity: '',[\s\S]*securityDepositAmount: '', franchiseKm: '', excessKmRate: '',[\s\S]*templateId: defaultTemplate\?\.id \|\| ''/, 'new contract must keep operational and financial values blank while preselecting only the template');
assert.match(executionPanel, /getMoveFlexApprovedContractMaster\(item\.templateKey\)\?\.templateKey === 'locacao-padrao'/, 'contract execution must prefer Contract 01 even when the persisted key uses the legacy alias');
assert.match(contractForm, /ContractTemplateClient\.ensureMoveFlexDefault\(\)/, 'new contract must ensure both persisted MoveFlex official models before listing templates');
assert.match(contractForm, /Modelo de contrato \*/, 'new contract must expose an explicit model selector');
assert.match(templateClient, /ensure-moveflex-default/, 'template client must expose the idempotent MoveFlex default endpoint');
assert.match(contractForm, /visualFixed \|\| selectedTemplate\.contentMarkdown\.trim\(\)/, 'VISUAL_FIXO and Markdown templates must generate PDF directly');
assert.match(contractForm, /ContractExecutionClient\.generatePdf\(savedContract\.id, selectedTemplate\.id\)/, 'standard VISUAL_FIXO contract must generate its official PDF automatically after save');
assert.match(contractForm, /ContractExecutionClient\.generateDocx\(savedContract\.id, selectedTemplate\.id\)/, 'custom DOCX templates must retain their separate DOCX flow');
assert.doesNotMatch(contractForm, /generatePdfFromDocx/, 'new DOCX-backed contract must not reflow the official Word layout into the legacy server PDF');
assert.match(executionPanel, /getMoveFlexApprovedContractMaster\(selected\.templateKey\)/, 'contract execution must recognize VISUAL_FIXO standard templates');
assert.match(executionPanel, /visualFixed \|\| selected\.contentMarkdown\.trim\(\)/, 'VISUAL_FIXO standard must generate PDF instead of DOCX');
assert.doesNotMatch(executionPanel, /generatePdfFromDocx/, 'contract execution UI must not use the layout-losing DOCX-to-text PDF path');
assert.match(source, /handleContractSaved[\s\S]*openContractDetails\(result\.contract\.id, 'PDF_SIGNATURE'\)/, 'new contract save must open the PDF/signature flow automatically');
assert.match(contractForm, /Segunda-feira/, 'weekly billing must offer Monday');
assert.match(contractForm, /Domingo/, 'weekly billing must offer Sunday');
assert.match(contractForm, /Dia do vencimento no mês \*/, 'non-weekly billing must use a day-of-month field');
assert.match(contractForm, /form\.billingPeriodicity !== RecurringFrequency\.WEEKLY/, 'monthly-or-longer billing must share day-of-month semantics');
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
  /required && <span className="ml-1 text-red-500" aria-hidden="true">\*<\/span>/,
  'required contract fields must render a visible red marker',
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
  /Modelos de Contrato MoveFlex/,
  'contract template manager must expose MoveFlex branding',
);
assert.doesNotMatch(templateModal, /buildMoveFlexBaseContractPdf/, 'standard contract manager must not generate a reconstructed base PDF');
assert.doesNotMatch(templateModal, /Baixar modelo-base MoveFlex/, 'standard contract manager must not offer a derived base document');
assert.match(templateModal, /Arquivo mestre aprovado • imutável/, 'active standard template must be visibly locked to the approved master');
assert.match(templateModal, /Fonte antiga\/inválida — substituir por/, 'management must identify an invalid legacy standard source');
assert.match(templateModal, /Substituir pelo mestre aprovado/, 'management must allow replacing an invalid legacy standard source');
assert.match(templateModal, /AttachmentClient\.archive\(attachment\.id\)/, 'invalid legacy source must be archived before approved master upload');
assert.match(templateRoutes, /if \(!activeOnly\) return base/, 'management listing must retain invalid standards for repair');
assert.match(templateRoutes, /await approvedMasterSource\(tx, principal\.companyId, item, master\)/, 'operational listing must require the exact approved standard source');
assert.match(executionPanel, /availableIds\.has\(current\)/, 'execution panel must discard a stale invalid template selection');
assert.match(executionPanel, /operationalTemplateLabel\(item\)/, 'execution selector must use canonical standard labels');
assert.match(contractForm, /contractTemplateOptionLabel\(item\)/, 'contract form must use canonical standard labels');
assert.match(executionPanel, /VISUAL_FIXO aprovadas como fundo imutável/, 'execution UI must explain the immutable VISUAL_FIXO workflow');
assert.match(templateModal, /Carregar arquivo mestre/, 'pending standard template must request the approved master file');
assert.match(templateModal, /getMoveFlexApprovedContractMaster/, 'template manager must identify standard masters from the immutable registry');
assert.match(approvedMasterRegistry, /CONTRATO_01_MOVEFLEX_VISUAL_FIXO\.docx/, 'Contract 01 VISUAL_FIXO filename must be pinned');
assert.match(approvedMasterRegistry, /76bf2d51fef2679b7d47294c35800bbd9c807ab7e40cfd01c171a53a6d0a9b6c/, 'Contract 01 VISUAL_FIXO SHA-256 must be pinned');
assert.match(approvedMasterRegistry, /fileSize: 4331240/, 'Contract 01 VISUAL_FIXO size must be pinned');
assert.match(approvedMasterRegistry, /CONTRATO_02_MOVEFLEX_VISUAL_FIXO\.docx/, 'Contract 02 VISUAL_FIXO filename must be pinned');
assert.match(approvedMasterRegistry, /910636f745f16c8d3c8e08dec9dca112d3c3250bb282f1536e800ebc03258193/, 'Contract 02 VISUAL_FIXO SHA-256 must be pinned');
assert.match(approvedMasterRegistry, /fileSize: 6621021/, 'Contract 02 VISUAL_FIXO size must be pinned');
assert.match(approvedMasterRegistry, /'contrato-01': 'locacao-padrao'/, 'persisted Contract 01 alias must resolve to the approved rental master');
assert.match(approvedMasterRegistry, /'contrato-02': 'termo-multas-infracoes'/, 'persisted Contract 02 alias must resolve to the approved second master');
assert.match(visualFixedRenderer, /extractContractDocxPagePngs/, 'VISUAL_FIXO generation must use the immutable page images from the approved DOCX');
assert.match(visualFixedRenderer, /page\.drawImage\(image, \{ x: 0, y: 0, width: PDF_WIDTH, height: PDF_HEIGHT \}\)/, 'VISUAL_FIXO must render each exact page image as the PDF background');
assert.match(visualFixedRenderer, /expectedPageCount = master\.templateKey === 'locacao-padrao' \? 4 : 5/, 'VISUAL_FIXO must keep the approved 4-page and 5-page counts after alias canonicalization');
assert.match(templateRoutes, /MOVEFLEX_APPROVED_CONTRACT_MASTERS/, 'server bootstrap must prepare only checksum-pinned approved standard masters');
assert.match(templateRoutes, /ApprovedMasterLockedError/, 'server must lock approved standard template lifecycle');
assert.match(templateRoutes, /source\.checksum !== approvedMaster\.sha256/, 'standard promotion must reject any source whose SHA-256 differs from the approved master');
assert.match(attachmentRoutes, /checksum!==master\.sha256/, 'standard master upload must be rejected before storage when bytes differ');
assert.match(executionRoutes, /renderMoveFlexVisualFixedPdf/, 'contract execution must render standard documents only from the VISUAL_FIXO renderer');
assert.match(executionRoutes, /GENERATE_PDF_FROM_VISUAL_FIXED_MASTER/, 'VISUAL_FIXO generation must be explicitly audited');
assert.match(executionRoutes, /getMoveFlexVisualFixedMissingFields/, 'VISUAL_FIXO generation must preflight required source data before writing a PDF');
assert.match(executionRoutes, /Preencha os dados obrigatórios antes de gerar o contrato/, 'missing contract data must return an actionable Portuguese error instead of a generic validation message');
assert.match(executionRoutes, /getMoveFlexApprovedContractMaster\(template\.templateKey\)/, 'standard VISUAL_FIXO must be distinguished from custom templates server-side');
assert.match(contractForm, /O arquivo mestre aprovado do Contrato 01 ainda não está ativo/, 'new contract creation must fail closed until the approved master is active');
assert.match(
  templateModal,
  /dark:bg-slate-950\/50 dark:text-slate-200/,
  'template file input must have an explicit readable dark-mode surface',
);

assert.match(detailsModal, /Histórico e auditoria do contrato/, 'contract audit tab must identify the server audit view');
assert.match(detailsModal, /Responsável:/, 'contract audit tab must expose the responsible user');
assert.match(detailsModal, /Campos alterados:/, 'contract audit tab must summarize changed fields');
assert.match(detailsModal, /Valores brutos não são exibidos/, 'contract audit tab must avoid raw audit payload values');

console.log('Deferred contract modals regression: PASS');
