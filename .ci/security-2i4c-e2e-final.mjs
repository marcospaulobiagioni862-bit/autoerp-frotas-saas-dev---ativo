import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseURL = 'http://127.0.0.1:3000';
const companyId = process.env.BROWSER_COMPANY_ID;
const userId = process.env.BROWSER_USER_ID;
const vehicleId = process.env.BROWSER_VEHICLE_ID;
const driverId = process.env.BROWSER_DRIVER_ID;
const candidate = process.env.CANDIDATE_SHA;
const out = '/tmp/i4c-e2e-final';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  extraHTTPHeaders: {
    'x-company-id': companyId,
    'x-user-id': userId,
  },
});
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const serverErrors = [];
const failedRequests = [];

page.on('pageerror', (error) => pageErrors.push(error.stack || String(error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/websocket|\[vite\].*connect/i.test(text)) return;
  consoleErrors.push(text);
});
page.on('response', (response) => {
  if (response.status() >= 500) {
    serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  }
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`);
});

async function api(path, init = {}) {
  return await page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, init);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body, type: response.headers.get('content-type') };
  }, { path, init });
}

async function currentContract() {
  const result = await api('/api/contracts');
  assert(result.status === 200, `contract list status ${result.status}`);
  const item = result.body.items.find((candidate) => candidate.contractNumber === 'BROWSER-I4C-001');
  assert(item, 'browser contract not found');
  return item;
}

async function artifacts(contractId) {
  const result = await api(`/api/contracts/${encodeURIComponent(contractId)}/artifacts`);
  assert(result.status === 200, `artifact list status ${result.status}`);
  return result.body.items;
}

async function writeResult(extra = {}) {
  await writeFile(`${out}/result.json`, JSON.stringify({
    candidate,
    pageErrors,
    consoleErrors,
    serverErrors,
    failedRequests,
    ...extra,
  }, null, 2));
}

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('Visão Geral', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });
  assert(await page.getByText('Acesso ao sistema', { exact: true }).count() === 0, 'frontend did not restore authenticated E2E principal');

  await page.getByText('Contratos', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Contratos' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.screenshot({ path: `${out}/01-contracts.png`, fullPage: true });

  // ContractTemplate UI: create v1 and then v2.
  await page.getByRole('button', { name: /Modelos de Contrato/ }).click();
  const templateHeading = page.getByRole('heading', { name: 'Modelos de Contrato' });
  await templateHeading.waitFor({ timeout: 15000 });
  await page.getByLabel('Chave do modelo').fill('browser-locacao');
  await page.getByLabel('Título').fill('Contrato Browser I4C');
  await page.getByLabel('Conteúdo Markdown').fill(
    '# CONTRATO DE LOCAÇÃO {{contract.number}}\n' +
    'LOCADORA: {{company.name}} Documento: {{company.document}}\n' +
    'MOTORISTA: {{driver.name}} CPF: {{driver.cpf}} CNH: {{driver.cnh}}\n' +
    'VEÍCULO: {{vehicle.brand}} {{vehicle.model}} Placa: {{vehicle.plate}} RENAVAM: {{vehicle.renavam}}\n' +
    'VALOR: {{contract.rentalAmount}}\n' +
    'FRANQUIA: {{contract.franchiseKm}} km\n' +
    'KM EXCEDENTE: {{contract.excessKmRate}}'
  );
  const createTemplateWait = page.waitForResponse((response) => response.url().includes('/api/contract-templates') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Criar modelo' }).click();
  assert((await createTemplateWait).status() === 201, 'template v1 create did not return 201');
  await page.getByText('Modelo criado com sucesso.', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('v1', { exact: true }).waitFor();

  await page.getByRole('button', { name: /Nova versão/ }).first().click();
  const templateContent = page.getByLabel('Conteúdo Markdown');
  await templateContent.fill((await templateContent.inputValue()) + '\nVersão 2 — homologação browser.');
  const createVersionWait = page.waitForResponse((response) => response.url().includes('/versions') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Criar nova versão' }).click();
  assert((await createVersionWait).status() === 201, 'template v2 create did not return 201');
  await page.getByText('Nova versão v2 criada.', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('v2', { exact: true }).waitFor();

  const templateList = await api('/api/contract-templates?currentOnly=false&activeOnly=false&includeArchived=true');
  assert(templateList.status === 200, `template history list status ${templateList.status}`);
  const versions = templateList.body.items.filter((item) => item.templateKey === 'browser-locacao');
  assert(versions.some((item) => item.versionNumber === 1 && item.isCurrent === false), 'template v1 history missing');
  const templateV2 = versions.find((item) => item.versionNumber === 2 && item.isCurrent === true && item.isActive === true);
  assert(templateV2, 'template v2 current missing');
  await page.screenshot({ path: `${out}/02-template-v2.png`, fullPage: true });

  // Close template modal using its header hierarchy.
  await templateHeading.locator('xpath=../following-sibling::button').click();
  await templateHeading.waitFor({ state: 'hidden' });

  // Create new contract through the real form UI.
  await page.getByRole('button', { name: 'Novo Contrato' }).click();
  const formHeading = page.getByRole('heading', { name: 'Novo Contrato' });
  await formHeading.waitFor({ timeout: 15000 });
  await page.getByLabel('Número do contrato').fill('BROWSER-I4C-001');
  await page.getByLabel('Modelo de contrato').selectOption(templateV2.id);
  await page.getByLabel('Veículo').selectOption(vehicleId);
  await page.getByLabel('Motorista').selectOption(driverId);
  await page.getByLabel('Data inicial').fill('2026-08-19');
  await page.getByLabel('Aluguel').fill('800');
  await page.getByLabel('Caução').fill('1000');
  await page.getByLabel('Franquia KM').fill('1500');
  await page.getByLabel('KM excedente').fill('0.60');
  assert(await page.getByText('Ativar após salvar', { exact: false }).count() === 0, 'new signature-required contract exposed immediate activation');
  const createContractWait = page.waitForResponse((response) => response.url().endsWith('/api/contracts') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  assert((await createContractWait).status() === 201, 'contract create did not return 201');
  await formHeading.waitFor({ state: 'hidden', timeout: 15000 });

  const row = page.getByRole('row').filter({ hasText: 'BROWSER-I4C-001' });
  await row.waitFor({ state: 'visible', timeout: 15000 });
  assert(await row.getByRole('button', { name: 'PDF / Assinatura' }).count() === 1, 'PDF/signature action absent');
  assert(await row.getByRole('button', { name: /^Ativar/ }).count() === 0, 'new contract row exposed activation before evidence');
  await page.screenshot({ path: `${out}/03-contract-created.png`, fullPage: true });
  await row.getByRole('button', { name: 'PDF / Assinatura' }).click();

  const detailsHeading = page.getByRole('heading', { name: 'BROWSER-I4C-001' });
  await detailsHeading.waitFor({ timeout: 15000 });
  await page.getByText('PDF NÃO GERADO', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Ativar legado' }).count() === 0, 'new contract exposed legacy activation');
  const contractBeforePdf = await currentContract();
  assert(contractBeforePdf.signatureRequired === true, 'new contract signatureRequired != true');
  assert(contractBeforePdf.status === 'DRAFT', `expected DRAFT, got ${contractBeforePdf.status}`);
  assert(contractBeforePdf.templateId === templateV2.id, 'contract template binding mismatch');

  // Generate official server PDF from UI.
  const generateWait = page.waitForResponse((response) => response.url().includes(`/api/contracts/${contractBeforePdf.id}/generate-pdf`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Gerar PDF oficial' }).click();
  assert((await generateWait).status() === 201, 'first PDF generation did not return 201');
  await page.getByText('AGUARDANDO ASSINATURA', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Snapshot SHA-256', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Abrir PDF gerado' }).waitFor();

  const generatedArtifacts1 = await artifacts(contractBeforePdf.id);
  const firstGenerated = generatedArtifacts1.find((item) => item.artifactType === 'GENERATED_PDF' && item.isCurrent && !item.isArchived);
  assert(firstGenerated, 'current generated artifact missing');
  assert(/^[0-9a-f]{64}$/.test(firstGenerated.snapshotHash), 'generated snapshot hash invalid');
  const snapshot = JSON.parse(firstGenerated.snapshotJson);
  assert(snapshot.contract.number === 'BROWSER-I4C-001', 'PDF snapshot contract number mismatch');
  assert(snapshot.contract.rentalAmount === 800, 'PDF snapshot rental mismatch');
  assert(snapshot.driver.id === driverId && snapshot.driver.name === 'Browser Driver I4C', 'PDF snapshot driver mismatch');
  assert(snapshot.vehicle.id === vehicleId && snapshot.vehicle.plate === 'BRW1A01', 'PDF snapshot vehicle mismatch');
  assert(snapshot.template.id === templateV2.id && snapshot.template.versionNumber === 2, 'PDF snapshot template mismatch');

  const pdfCheck = await page.evaluate(async (attachmentId) => {
    const response = await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}/content`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status,
      prefix: String.fromCharCode(...bytes.slice(0, 5)),
      type: response.headers.get('content-type'),
      size: bytes.length,
    };
  }, firstGenerated.attachmentId);
  assert(pdfCheck.status === 200 && pdfCheck.prefix === '%PDF-', `generated bytes are not PDF: ${JSON.stringify(pdfCheck)}`);
  assert((pdfCheck.type || '').includes('application/pdf') && pdfCheck.size > 100, 'generated PDF metadata invalid');
  const popupPromise = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.getByRole('button', { name: 'Abrir PDF gerado' }).click();
  const popup = await popupPromise;
  if (popup) await popup.close().catch(() => {});
  await page.screenshot({ path: `${out}/04-pdf-generated.png`, fullPage: true });

  // Terms must be locked after PDF generation.
  const mutationAttempt = await api(`/api/contracts/${encodeURIComponent(contractBeforePdf.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rentalAmount: 999 }),
  });
  assert(mutationAttempt.status === 409, `post-PDF term lock expected 409, got ${mutationAttempt.status}`);
  assert((await currentContract()).rentalAmount === 800, 'term lock allowed rental amount mutation');

  // Regeneration is permitted before signature evidence.
  const regenerateWait = page.waitForResponse((response) => response.url().includes(`/api/contracts/${contractBeforePdf.id}/generate-pdf`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Regenerar PDF oficial' }).click();
  assert((await regenerateWait).status() === 201, 'PDF regeneration did not return 201');
  const generatedArtifacts2 = await artifacts(contractBeforePdf.id);
  const regenerated = generatedArtifacts2.find((item) => item.artifactType === 'GENERATED_PDF' && item.isCurrent && !item.isArchived);
  assert(regenerated && regenerated.id !== firstGenerated.id, 'regeneration did not replace current generated artifact');
  assert(generatedArtifacts2.some((item) => item.id === firstGenerated.id && item.isCurrent === false), 'old generated artifact was not preserved as history');

  // Generic contract attachment must not become signature evidence.
  const genericHeading = page.getByText('Arquivos e anexos do contrato', { exact: true });
  await genericHeading.waitFor();
  const genericSection = genericHeading.locator('xpath=..');
  const genericUploadWait = page.waitForResponse((response) => response.url().includes('/api/attachments') && response.request().method() === 'POST');
  await genericSection.locator('input[type="file"]').setInputFiles('/tmp/i4c-e2e-final/generic-browser.pdf');
  assert((await genericUploadWait).status() === 201, 'generic attachment upload did not return 201');
  const afterGeneric = await artifacts(contractBeforePdf.id);
  assert(!afterGeneric.some((item) => item.artifactType === 'SIGNED_EVIDENCE' && item.isCurrent && !item.isArchived), 'generic attachment became signed evidence');

  // Upload signed PDF and explicitly register it as evidence.
  const signedHeading = page.getByText('Evidência do assinado', { exact: true });
  const signedSection = signedHeading.locator('xpath=../..');
  const signedUploadWait = page.waitForResponse((response) => response.url().includes('/api/attachments') && response.request().method() === 'POST');
  await signedSection.locator('input[type="file"]').setInputFiles('/tmp/i4c-e2e-final/signed-browser.pdf');
  assert((await signedUploadWait).status() === 201, 'signed PDF upload did not return 201');
  await page.getByText('Arquivo pronto:', { exact: false }).waitFor({ timeout: 15000 });
  await page.getByPlaceholder('Nome de quem assinou').fill('Browser Driver I4C');
  await signedSection.locator('input[type="date"]').fill('2026-08-19');
  const evidenceWait = page.waitForResponse((response) => response.url().includes(`/api/contracts/${contractBeforePdf.id}/signature-evidence`) && response.request().method() === 'POST');
  await signedSection.getByRole('button', { name: 'Registrar evidência assinada' }).click();
  assert((await evidenceWait).status() === 201, 'signature evidence registration did not return 201');
  await page.getByText('ASSINADO / EVIDÊNCIA', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Evidência registrada', { exact: true }).waitFor();
  await page.getByText('Checksum do PDF assinado', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Abrir PDF assinado' }).waitFor();
  assert(await page.getByRole('button', { name: 'Regenerar PDF oficial' }).count() === 0, 'regeneration remained available after signed evidence');
  await page.getByText('Contrato apto para ativação', { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/05-signed-evidence.png`, fullPage: true });

  const signedArtifacts = await artifacts(contractBeforePdf.id);
  const signedArtifact = signedArtifacts.find((item) => item.artifactType === 'SIGNED_EVIDENCE' && item.isCurrent && !item.isArchived);
  assert(signedArtifact, 'signed evidence artifact missing');
  assert(signedArtifact.sourceArtifactId === regenerated.id, 'signed evidence is not bound to current generated PDF');
  assert(/^[0-9a-f]{64}$/.test(signedArtifact.snapshotHash), 'signed evidence checksum invalid');
  assert(signedArtifact.signedByName === 'Browser Driver I4C', 'signed-by evidence mismatch');

  // Activation must succeed only after evidence, bind entities, and create one initial receivable.
  const activateWait = page.waitForResponse((response) => response.url().includes(`/api/contracts/${contractBeforePdf.id}/activate`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Ativar contrato' }).click();
  assert((await activateWait).status() === 200, 'signed contract activation did not return 200');
  await page.getByText('Contrato ativado com assinatura, vínculo e cobrança confirmados.', { exact: true }).waitFor({ timeout: 15000 });
  const activeContract = await currentContract();
  assert(activeContract.status === 'ACTIVE', `contract activation status ${activeContract.status}`);

  const vehicleResult = await api(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}`);
  assert(vehicleResult.status === 200, `vehicle read status ${vehicleResult.status}`);
  assert(vehicleResult.body.item.status === 'RENTED', `vehicle status ${vehicleResult.body.item.status}`);
  assert(vehicleResult.body.item.currentContractId === activeContract.id, 'vehicle contract binding mismatch');
  assert(vehicleResult.body.item.currentDriverId === driverId, 'vehicle driver binding mismatch');

  const driverResult = await api(`/api/drivers/${encodeURIComponent(driverId)}`);
  assert(driverResult.status === 200, `driver read status ${driverResult.status}`);
  assert(driverResult.body.item.currentContractId === activeContract.id, 'driver contract binding mismatch');
  assert(driverResult.body.item.currentVehicleId === vehicleId, 'driver vehicle binding mismatch');

  const receivableResult = await api('/api/finance/receivables');
  assert(receivableResult.status === 200, `receivable list status ${receivableResult.status}`);
  const contractReceivables = receivableResult.body.items.filter((item) => item.contractId === activeContract.id);
  assert(contractReceivables.length === 1, `expected exactly 1 initial receivable, got ${contractReceivables.length}`);
  await page.screenshot({ path: `${out}/06-active-contract.png`, fullPage: true });

  // Close contract details and smoke-test server-side Document Center.
  await detailsHeading.locator('xpath=../../following-sibling::button').click();
  await detailsHeading.waitFor({ state: 'hidden' });
  await page.getByText('Central de Documentos', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Central de Documentos' }).waitFor({ timeout: 15000 });
  await page.getByText('Resultados (', { exact: false }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${out}/07-document-center.png`, fullPage: true });

  await writeResult({
    finalVerdict: 'PASS',
    contractId: activeContract.id,
    generatedArtifactId: regenerated.id,
    signedArtifactId: signedArtifact.id,
    finalContractStatus: activeContract.status,
    finalVehicleStatus: vehicleResult.body.item.status,
    initialReceivableCount: contractReceivables.length,
    templateVersions: versions.map((item) => ({ id: item.id, versionNumber: item.versionNumber, isCurrent: item.isCurrent })),
  });

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  assert(serverErrors.length === 0, `HTTP 5xx responses: ${serverErrors.join(' | ')}`);
  console.log('SECURITY-2I4C_FINAL_BROWSER_E2E_PASS');
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${out}/body.txt`, await page.locator('body').innerText().catch(() => '')).catch(() => {});
  await writeResult({ finalVerdict: 'FAIL', failure: error instanceof Error ? (error.stack || error.message) : String(error) }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
