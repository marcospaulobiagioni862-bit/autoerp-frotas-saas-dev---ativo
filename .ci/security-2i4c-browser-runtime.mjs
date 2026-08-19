import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseURL = 'http://127.0.0.1:3000';
const companyId = process.env.BROWSER_COMPANY_ID;
const userId = process.env.BROWSER_USER_ID;
const vehicleId = process.env.BROWSER_VEHICLE_ID;
const driverId = process.env.BROWSER_DRIVER_ID;
const out = '/tmp/i4c-browser';
let stage = 'BOOT';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function saveJson(name, value) {
  await writeFile(`${out}/${name}`, JSON.stringify(value, null, 2));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  extraHTTPHeaders: {
    'x-company-id': companyId,
    'x-user-id': userId,
  },
});
const page = await context.newPage();
const blockingConsole = [];
const pageErrors = [];
const serverErrors = [];

page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (/websocket|\[vite\].*connect/i.test(text)) return;
  blockingConsole.push(text);
});
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('response', (response) => {
  if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
});

async function api(path, init = {}) {
  return await page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, init);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
  }, { path, init });
}

async function currentContract() {
  const result = await api('/api/contracts');
  assert(result.status === 200, `contract list status ${result.status}`);
  const item = result.body.items.find((candidate) => candidate.contractNumber === 'BROWSER-I4C-001');
  assert(item, 'browser contract not found');
  return item;
}

async function currentGenerated(contractId) {
  const result = await api(`/api/contracts/${encodeURIComponent(contractId)}/artifacts`);
  assert(result.status === 200, `artifact list status ${result.status}`);
  return result.body.items.find((item) => item.artifactType === 'GENERATED_PDF' && item.isCurrent && !item.isArchived);
}

async function snap(name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

try {
  stage = 'PREVIEW_BOOT';
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('Visão Geral', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });

  stage = 'CONTRACTS_OPEN';
  await page.getByText('Contratos', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Contratos' }).waitFor({ state: 'visible', timeout: 15000 });
  await snap('01-contracts');

  stage = 'TEMPLATE_V1';
  await page.getByRole('button', { name: /Modelos de Contrato/ }).click();
  await page.getByRole('heading', { name: 'Modelos de Contrato' }).waitFor();
  await page.getByLabel('Chave do modelo').fill('browser-locacao');
  await page.getByLabel('Título').fill('Contrato Browser I4C');
  await page.getByLabel('Conteúdo Markdown').fill(
    '# Contrato {{contract.number}}\n' +
    'Locadora: {{company.name}} - {{company.document}}\n' +
    'Motorista: {{driver.name}} CPF {{driver.cpf}} CNH {{driver.cnh}}\n' +
    'Veículo: {{vehicle.brand}} {{vehicle.model}} placa {{vehicle.plate}} RENAVAM {{vehicle.renavam}}\n' +
    'Aluguel: {{contract.rentalAmount}} - franquia {{contract.franchiseKm}} km - excedente {{contract.excessKmRate}}.'
  );
  await page.getByRole('button', { name: 'Criar modelo' }).click();
  await page.getByText('Modelo criado com sucesso.', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('v1', { exact: true }).waitFor();

  stage = 'TEMPLATE_V2';
  await page.getByRole('button', { name: /Nova versão/ }).first().click();
  const templateContent = page.getByLabel('Conteúdo Markdown');
  await templateContent.fill((await templateContent.inputValue()) + '\nVersão 2 homologação browser.');
  await page.getByRole('button', { name: 'Criar nova versão' }).click();
  await page.getByText('Nova versão v2 criada.', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('v2', { exact: true }).waitFor();
  await snap('02-template-v2');

  const templateHeading = page.getByRole('heading', { name: 'Modelos de Contrato' });
  await templateHeading.locator('xpath=../following-sibling::button').click();
  await templateHeading.waitFor({ state: 'hidden' });

  stage = 'NEW_CONTRACT';
  await page.getByRole('button', { name: 'Novo Contrato' }).click();
  await page.getByRole('heading', { name: 'Novo Contrato' }).waitFor();
  await page.getByLabel('Número do contrato').fill('BROWSER-I4C-001');
  await page.getByLabel('Modelo de contrato').selectOption({ label: 'Contrato Browser I4C • v2' });
  await page.getByLabel('Veículo').selectOption(vehicleId);
  await page.getByLabel('Motorista').selectOption(driverId);
  await page.getByLabel('Data inicial').fill('2026-09-01');
  await page.getByLabel('Aluguel').fill('800');
  await page.getByLabel('Caução').fill('1000');
  await page.getByLabel('Franquia KM').fill('1500');
  await page.getByLabel('KM excedente').fill('0.6');
  assert(await page.getByText('Ativar após salvar', { exact: false }).count() === 0, 'new contract exposed immediate activation');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('heading', { name: 'Novo Contrato' }).waitFor({ state: 'hidden', timeout: 15000 });

  const row = page.getByRole('row').filter({ hasText: 'BROWSER-I4C-001' });
  await row.waitFor({ state: 'visible', timeout: 15000 });
  assert(await row.getByRole('button', { name: 'PDF / Assinatura' }).count() === 1, 'signed flow action absent');
  assert(await row.getByRole('button', { name: /^Ativar/ }).count() === 0, 'signature-required row exposed activation');
  await snap('03-contract-created');
  await row.getByRole('button', { name: 'PDF / Assinatura' }).click();

  stage = 'PRE_PDF_GATE';
  await page.getByRole('heading', { name: 'BROWSER-I4C-001' }).waitFor({ timeout: 15000 });
  await page.getByText('PDF NÃO GERADO', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Ativar legado' }).count() === 0, 'details exposed legacy activation for new contract');

  const contractBeforePdf = await currentContract();
  assert(contractBeforePdf.signatureRequired === true, 'new contract signatureRequired is not true');
  assert(contractBeforePdf.status === 'DRAFT', `expected DRAFT, got ${contractBeforePdf.status}`);

  stage = 'GENERATE_PDF';
  const genResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/contracts/${contractBeforePdf.id}/generate-pdf`) && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Gerar PDF oficial' }).click();
  const genResponse = await genResponsePromise;
  assert(genResponse.status() === 201, `first PDF generation status ${genResponse.status()}`);
  await page.getByText('AGUARDANDO ASSINATURA', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Snapshot SHA-256', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Abrir PDF gerado' }).waitFor();

  const firstGenerated = await currentGenerated(contractBeforePdf.id);
  assert(firstGenerated && /^[0-9a-f]{64}$/.test(firstGenerated.snapshotHash), 'generated snapshot hash invalid');
  const pdfCheck = await page.evaluate(async (attachmentId) => {
    const response = await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}/content`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, prefix: String.fromCharCode(...bytes.slice(0, 5)), type: response.headers.get('content-type') };
  }, firstGenerated.attachmentId);
  assert(pdfCheck.status === 200 && pdfCheck.prefix === '%PDF-', `generated file is not PDF: ${JSON.stringify(pdfCheck)}`);
  assert((pdfCheck.type || '').includes('application/pdf'), `generated PDF mime mismatch ${pdfCheck.type}`);

  const popupPromise = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.getByRole('button', { name: 'Abrir PDF gerado' }).click();
  const popup = await popupPromise;
  if (popup) await popup.close().catch(() => {});
  await snap('04-pdf-generated');

  stage = 'TERM_LOCK';
  const mutationAttempt = await api(`/api/contracts/${encodeURIComponent(contractBeforePdf.id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rentalAmount: 999 })
  });
  assert(mutationAttempt.status === 409, `post-PDF term lock expected 409, got ${mutationAttempt.status}`);

  stage = 'REGENERATE_UNSIGNED';
  const regenResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/contracts/${contractBeforePdf.id}/generate-pdf`) && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Regenerar PDF oficial' }).click();
  const regenResponse = await regenResponsePromise;
  assert(regenResponse.status() === 201, `PDF regeneration status ${regenResponse.status()}`);
  const regenerated = await currentGenerated(contractBeforePdf.id);
  assert(regenerated && regenerated.id !== firstGenerated.id, 'PDF regeneration did not replace current artifact');

  stage = 'GENERIC_ATTACHMENT_SEPARATION';
  const genericHeading = page.getByText('Arquivos e anexos do contrato', { exact: true });
  const genericSection = genericHeading.locator('xpath=..');
  await genericSection.locator('input[type="file"]').setInputFiles('/tmp/i4c-browser/generic-browser.pdf');
  await page.getByText('generic-browser.pdf', { exact: false }).last().waitFor({ timeout: 15000 });
  const artifactsAfterGeneric = await api(`/api/contracts/${encodeURIComponent(contractBeforePdf.id)}/artifacts`);
  assert(!artifactsAfterGeneric.body.items.some((item) => item.artifactType === 'SIGNED_EVIDENCE' && item.isCurrent && !item.isArchived), 'generic attachment became signature evidence');

  stage = 'SIGNED_EVIDENCE';
  const signedHeading = page.getByText('Evidência do assinado', { exact: true });
  const signedSection = signedHeading.locator('xpath=../..');
  await signedSection.locator('input[type="file"]').setInputFiles('/tmp/i4c-browser/signed-browser.pdf');
  await page.getByText('Arquivo pronto:', { exact: false }).waitFor({ timeout: 15000 });
  await page.getByPlaceholder('Nome de quem assinou').fill('Browser Driver I4C');
  await signedSection.locator('input[type="date"]').fill('2026-08-19');
  await signedSection.getByRole('button', { name: 'Registrar evidência assinada' }).click();
  await page.getByText('ASSINADO / EVIDÊNCIA', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Evidência registrada', { exact: true }).waitFor();
  await page.getByText('Assinado por:', { exact: false }).waitFor();
  await page.getByText('Checksum do PDF assinado', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Abrir PDF assinado' }).waitFor();
  assert(await page.getByRole('button', { name: 'Regenerar PDF oficial' }).count() === 0, 'regeneration remained available after signed evidence');
  await page.getByText('Contrato apto para ativação', { exact: true }).waitFor();
  await snap('05-signed-evidence');

  const signedArtifacts = await api(`/api/contracts/${encodeURIComponent(contractBeforePdf.id)}/artifacts`);
  const signedArtifact = signedArtifacts.body.items.find((item) => item.artifactType === 'SIGNED_EVIDENCE' && item.isCurrent && !item.isArchived);
  assert(signedArtifact, 'signed evidence artifact missing');
  assert(signedArtifact.sourceArtifactId === regenerated.id, 'signed evidence is not bound to current generated PDF');
  assert(/^[0-9a-f]{64}$/.test(signedArtifact.snapshotHash), 'signed evidence checksum invalid');

  stage = 'ACTIVATION';
  await page.getByRole('button', { name: 'Ativar contrato' }).click();
  await page.getByText('Contrato ativado com assinatura, vínculo e cobrança confirmados.', { exact: true }).waitFor({ timeout: 15000 });
  const activeContract = await currentContract();
  assert(activeContract.status === 'ACTIVE', `contract activation status ${activeContract.status}`);

  const vehicleResult = await api(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}`);
  assert(vehicleResult.status === 200, `vehicle read status ${vehicleResult.status}`);
  assert(vehicleResult.body.item.status === 'RENTED', `vehicle status ${vehicleResult.body.item.status}`);
  assert(vehicleResult.body.item.currentContractId === activeContract.id, 'vehicle contract binding mismatch');
  assert(vehicleResult.body.item.currentDriverId === driverId, 'vehicle driver binding mismatch');

  const receivableResult = await api('/api/finance/receivables');
  assert(receivableResult.status === 200, `receivable list status ${receivableResult.status}`);
  assert(receivableResult.body.items.some((item) => item.contractId === activeContract.id), 'initial contract receivable missing');
  await snap('06-active-contract');

  stage = 'DOCUMENT_CENTER';
  const detailsHeading = page.getByRole('heading', { name: 'BROWSER-I4C-001' });
  await detailsHeading.locator('xpath=../following-sibling::button').click();
  await detailsHeading.waitFor({ state: 'hidden' });
  await page.getByText('Central de Documentos', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Central de Documentos' }).waitFor({ timeout: 15000 });
  await page.getByText('Resultados (', { exact: false }).waitFor({ timeout: 15000 });
  await snap('07-document-center');

  stage = 'FINAL_ASSERTIONS';
  const result = {
    candidate: process.env.CANDIDATE_SHA,
    contractId: activeContract.id,
    generatedArtifactId: regenerated.id,
    signedArtifactId: signedArtifact.id,
    consoleErrors: blockingConsole,
    pageErrors,
    serverErrors,
    finalContractStatus: activeContract.status,
    finalVehicleStatus: vehicleResult.body.item.status,
  };
  await saveJson('result.json', result);

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  assert(serverErrors.length === 0, `HTTP 5xx responses: ${serverErrors.join(' | ')}`);
  assert(blockingConsole.length === 0, `blocking console errors: ${blockingConsole.join(' | ')}`);
  console.log('SECURITY-2I4C BROWSER RUNTIME CHECKPOINT PASS');
} catch (error) {
  await snap('FAILURE').catch(() => {});
  await saveJson('failure.json', {
    stage,
    error: String(error?.stack || error),
    consoleErrors: blockingConsole,
    pageErrors,
    serverErrors,
    url: page.url(),
  }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
