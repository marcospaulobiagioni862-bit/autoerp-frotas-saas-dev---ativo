import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { registerAttachmentRoutes } from '../attachmentRoutes';
import { registerContractTemplateRoutes } from '../contractTemplateRoutes';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: globalThis.Response): Promise<any> {
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export async function runContractTemplateFileSourceRegression(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  const companyA = `contract-template-file-company-a-${suffix}`;
  const companyB = `contract-template-file-company-b-${suffix}`;
  const adminAId = `contract-template-file-admin-a-${suffix}`;
  const adminBId = `contract-template-file-admin-b-${suffix}`;
  const operationalAId = `contract-template-file-operational-a-${suffix}`;
  const originalStorageDir = process.env.ATTACHMENT_STORAGE_DIR;
  const originalDurable = process.env.ATTACHMENT_STORAGE_DURABLE;
  const storageDir = await mkdtemp(join(tmpdir(), 'autoerp-contract-template-file-'));
  process.env.ATTACHMENT_STORAGE_DIR = storageDir;
  process.env.ATTACHMENT_STORAGE_DURABLE = 'false';

  await db.execute(sql`
    INSERT INTO companies (id, document, name, status, created_at, updated_at) VALUES
      (${companyA}, ${`CTF-A-${suffix}`}, 'Contract Template File A', 'ACTIVE', NOW(), NOW()),
      (${companyB}, ${`CTF-B-${suffix}`}, 'Contract Template File B', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, status='ACTIVE', updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
      (${adminAId}, ${companyA}, 'Template Admin A', ${`template-admin-a-${suffix}@example.test`}, 'ADMIN', true, NOW(), NOW()),
      (${adminBId}, ${companyB}, 'Template Admin B', ${`template-admin-b-${suffix}@example.test`}, 'ADMIN', true, NOW(), NOW()),
      (${operationalAId}, ${companyA}, 'Template Operational A', ${`template-operational-a-${suffix}@example.test`}, 'OPERATIONAL', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const companyId = typeof req.headers['x-company-id'] === 'string' ? req.headers['x-company-id'] : '';
    const role = typeof req.headers['x-role'] === 'string' ? req.headers['x-role'] : '';
    const userId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : '';
    if (companyId && role && userId) {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
        companyId, userId, name: `${role} Contract Template File`, role, permissions: [],
      };
    }
    next();
  });
  registerContractTemplateRoutes(app);
  registerAttachmentRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'contract template file regression server unavailable');
  const base = `http://127.0.0.1:${address.port}`;
  const adminA = { companyId: companyA, role: 'ADMIN', userId: adminAId };
  const adminB = { companyId: companyB, role: 'ADMIN', userId: adminBId };
  const operationalA = { companyId: companyA, role: 'OPERATIONAL', userId: operationalAId };

  const request = async (
    path: string,
    options: RequestInit = {},
    principal?: { companyId: string; role: string; userId: string },
  ): Promise<globalThis.Response> => {
    const headers = new Headers(options.headers);
    if (options.body && typeof options.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (principal) {
      headers.set('x-company-id', principal.companyId);
      headers.set('x-role', principal.role);
      headers.set('x-user-id', principal.userId);
    }
    return await fetch(`${base}${path}`, { ...options, headers });
  };

  const uploadHeaders = (entityId: string, fileName: string, mimeType: string): Headers => new Headers({
    'content-type': mimeType,
    'x-autoerp-entity-type': 'ContractTemplate',
    'x-autoerp-entity-id': entityId,
    'x-autoerp-document-type': 'CONTRACT_TEMPLATE_SOURCE',
    'x-autoerp-file-name': fileName,
  });

  try {
    let response = await request('/api/contract-templates', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Contrato salvo automático A',
        contentMarkdown: 'Contrato {{contract.number}} para {{driver.name}} no veículo {{vehicle.plate}}.',
      }),
    }, adminA);
    assert(response.status === 201, `auto-numbered saved template A expected 201, got ${response.status}`);
    const autoSavedA = (await json(response)).item;
    const autoMatchA = /^modelo-contrato-(\d+)$/.exec(String(autoSavedA.templateKey));
    assert(Boolean(autoMatchA), 'saved template must receive a server-generated sequential key');

    response = await request('/api/contract-templates', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Contrato salvo automático B',
        contentMarkdown: 'Contrato {{contract.number}} para {{driver.name}} no veículo {{vehicle.plate}}.',
      }),
    }, adminA);
    assert(response.status === 201, `auto-numbered saved template B expected 201, got ${response.status}`);
    const autoSavedB = (await json(response)).item;
    const autoMatchB = /^modelo-contrato-(\d+)$/.exec(String(autoSavedB.templateKey));
    assert(Boolean(autoMatchB), 'second saved template must receive a server-generated sequential key');
    assert(Number(autoMatchB?.[1]) === Number(autoMatchA?.[1]) + 1, 'saved template sequence must advance exactly by one');

    response = await request('/api/contract-templates', {
      method: 'POST',
      body: JSON.stringify({
        templateKey: `markdown-${suffix}`,
        title: 'Modelo Markdown',
        contentMarkdown: 'Contrato {{contract.number}} para {{driver.name}} no veículo {{vehicle.plate}}.',
      }),
    }, adminA);
    assert(response.status === 201, `markdown template expected 201, got ${response.status}`);
    const markdownV1 = (await json(response)).item;
    assert(markdownV1.isCurrent === true && markdownV1.isActive === true, 'existing markdown behavior changed');

    response = await request(`/api/contract-templates/${markdownV1.id}/versions`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Modelo por arquivo', sourceMode: 'FILE' }),
    }, adminA);
    assert(response.status === 201, `file version create expected 201, got ${response.status}`);
    const fileV2 = (await json(response)).item;
    assert(fileV2.versionNumber === 2, 'file version number mismatch');
    assert(fileV2.contentMarkdown === '' && fileV2.isCurrent === false && fileV2.isActive === false, 'file version must wait inactive/non-current for source upload');

    response = await request(`/api/contract-templates/${fileV2.id}/promote-file-source`, { method: 'POST', body: '{}' }, adminA);
    assert(response.status === 409, `file promotion without source expected 409, got ${response.status}`);

    response = await request(`/api/contract-templates/${markdownV1.id}/versions`, {}, adminA);
    assert(response.status === 200, `versions before upload expected 200, got ${response.status}`);
    let versions = (await json(response)).items;
    assert(versions.find((item: any) => item.id === markdownV1.id)?.isCurrent === true, 'failed file preparation displaced current markdown template');

    const pdfBytes = Buffer.from('%PDF-1.4\n% AutoERP contract template source\n%%EOF\n', 'ascii');
    response = await request('/api/attachments', {
      method: 'POST',
      headers: uploadHeaders(fileV2.id, 'modelo-locacao.pdf', 'application/pdf'),
      body: pdfBytes,
    }, operationalA);
    assert(response.status === 403, `OPERATIONAL template source upload expected 403, got ${response.status}`);

    response = await request('/api/attachments', {
      method: 'POST',
      headers: uploadHeaders(fileV2.id, 'modelo-locacao.pdf', 'application/pdf'),
      body: pdfBytes,
    }, adminA);
    assert(response.status === 201, `PDF template source upload expected 201, got ${response.status}`);
    const pdfAttachment = (await json(response)).item;
    assert(pdfAttachment.entityType === 'ContractTemplate' && pdfAttachment.documentType === 'CONTRACT_TEMPLATE_SOURCE', 'template source attachment metadata mismatch');

    response = await request('/api/attachments', {
      method: 'POST',
      headers: uploadHeaders(fileV2.id, 'duplicado.pdf', 'application/pdf'),
      body: pdfBytes,
    }, adminA);
    assert(response.status === 403, `duplicate source expected 403, got ${response.status}`);

    response = await request(`/api/contract-templates/${fileV2.id}/promote-file-source`, { method: 'POST', body: '{}' }, adminA);
    assert(response.status === 200, `file promotion expected 200, got ${response.status}`);
    const promoted = (await json(response)).item;
    assert(promoted.isCurrent === true && promoted.isActive === false, 'file-backed current template must remain inactive for automatic generation');

    response = await request(`/api/contract-templates/${fileV2.id}/promote-file-source`, { method: 'POST', body: '{}' }, adminA);
    assert(response.status === 200, `file promotion replay expected 200, got ${response.status}`);

    response = await request(`/api/contract-templates/${fileV2.id}/versions`, {}, adminA);
    versions = (await json(response)).items;
    assert(versions.find((item: any) => item.id === markdownV1.id)?.isCurrent === false, 'old markdown version was not demoted after successful file promotion');
    assert(versions.find((item: any) => item.id === fileV2.id)?.isCurrent === true, 'file version was not promoted');

    response = await request(`/api/attachments/${pdfAttachment.id}/content`, {}, adminA);
    assert(response.status === 200, `PDF template source download expected 200, got ${response.status}`);
    const downloadedPdf = Buffer.from(await response.arrayBuffer());
    assert(downloadedPdf.equals(pdfBytes), 'PDF template source bytes changed');

    response = await request(`/api/attachments?entityType=ContractTemplate&entityId=${encodeURIComponent(fileV2.id)}`, {}, adminB);
    assert(response.status === 404, `cross-tenant template source list expected 404, got ${response.status}`);

    response = await request('/api/contract-templates', {
      method: 'POST',
      body: JSON.stringify({ templateKey: `docx-${suffix}`, title: 'Modelo DOCX', sourceMode: 'FILE' }),
    }, adminA);
    assert(response.status === 201, `DOCX file template expected 201, got ${response.status}`);
    const docxTemplate = (await json(response)).item;
    assert(docxTemplate.isCurrent === true && docxTemplate.isActive === false, 'new DOCX file template must be current but inactive');

    const docxBytes = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('synthetic [Content_Types].xml synthetic word/document.xml', 'latin1'),
    ]);
    response = await request('/api/attachments', {
      method: 'POST',
      headers: uploadHeaders(docxTemplate.id, 'modelo-locacao.docx', DOCX_MIME),
      body: docxBytes,
    }, adminA);
    assert(response.status === 201, `DOCX template source upload expected 201, got ${response.status}`);

    const invalidDocxHeaders = new Headers({
      'content-type': DOCX_MIME,
      'x-autoerp-entity-type': 'Vehicle',
      'x-autoerp-entity-id': 'not-used',
      'x-autoerp-document-type': 'OTHER',
      'x-autoerp-file-name': 'nao-permitido.docx',
    });
    response = await request('/api/attachments', { method: 'POST', headers: invalidDocxHeaders, body: docxBytes }, adminA);
    assert(response.status === 400, `DOCX outside ContractTemplate expected 400, got ${response.status}`);


    // Legacy standard aliases may exist as active records with an old source.
    // They must remain visible to management but never be selectable operationally.
    const invalidAliasId = `legacy-contract-02-${suffix}`;
    const invalidAliasAttachmentId = `legacy-contract-02-source-${suffix}`;
    await db.execute(sql`
      INSERT INTO contract_templates (
        id, company_id, template_key, title, content_markdown, version_number,
        is_current, is_active, is_archived, created_by, created_at, updated_at
      ) VALUES (
        ${invalidAliasId}, ${companyA}, 'contrato-02', 'Contrato de Locação de Veículo', '', 1,
        true, true, false, ${adminAId}, NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO file_attachments (
        id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
        size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
      ) VALUES (
        ${invalidAliasAttachmentId}, ${companyA}, 'ContractTemplate', 'ContractTemplate', ${invalidAliasId},
        'CONTRACT_TEMPLATE_SOURCE', 'contrato-02-antigo.docx', ${DOCX_MIME}, 'attachment://legacy-contract-02',
        123, 123, 'SERVER_FS', 'legacy/contract-02', repeat('f',64), ${adminAId}, false, 'AVAILABLE', NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);

    response = await request('/api/contract-templates', {}, adminA);
    assert(response.status === 200, `operational template list expected 200, got ${response.status}`);
    let listed = (await json(response)).items;
    assert(!listed.some((item: any) => item.id === invalidAliasId), 'invalid approved alias leaked into operational selector');

    response = await request('/api/contract-templates?activeOnly=false', {}, adminA);
    assert(response.status === 200, `management template list expected 200, got ${response.status}`);
    listed = (await json(response)).items;
    assert(listed.some((item: any) => item.id === invalidAliasId), 'invalid approved alias must remain visible for management repair');

    // Approved MoveFlex standards are now checksum-pinned file authorities.
    response = await request('/api/contract-templates/ensure-moveflex-default', { method: 'POST', body: '{}' }, adminA);
    assert([200, 201].includes(response.status), `approved master bootstrap expected 200/201, got ${response.status}`);
    const firstBootstrap = await json(response);
    const moveFlexPending = firstBootstrap.item;
    assert(
      moveFlexPending.templateKey === 'locacao-padrao' &&
      moveFlexPending.contentMarkdown === '' &&
      moveFlexPending.isCurrent === true &&
      moveFlexPending.isActive === false,
      'approved MoveFlex standard must be a pending FILE record until the exact master is loaded'
    );

    const firstVersions = await request(`/api/contract-templates/${moveFlexPending.id}/versions`, {}, adminA);
    assert(firstVersions.status === 200, `approved master versions expected 200, got ${firstVersions.status}`);
    const versionCount = (await json(firstVersions)).items.length;

    response = await request('/api/contract-templates/ensure-moveflex-default', { method: 'POST', body: '{}' }, adminA);
    assert(response.status === 200, `approved master bootstrap replay expected 200, got ${response.status}`);
    const replayed = await json(response);
    assert(replayed.item.id === moveFlexPending.id, 'approved master bootstrap must reuse the same pending record');

    response = await request(`/api/contract-templates/${moveFlexPending.id}/versions`, {}, adminA);
    assert(response.status === 200, `approved master versions replay expected 200, got ${response.status}`);
    assert((await json(response)).items.length === versionCount, 'approved master bootstrap replay must not create extra versions');

    response = await request(`/api/contract-templates/${moveFlexPending.id}/versions`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Tentativa de alterar padrão', sourceMode: 'MARKDOWN', contentMarkdown: 'Outro contrato {{driver.name}}' }),
    }, adminA);
    assert(response.status === 409, `approved master manual version expected 409, got ${response.status}`);

    response = await request(`/api/contract-templates/${moveFlexPending.id}/archive`, { method: 'POST', body: '{}' }, adminA);
    assert(response.status === 409, `approved master archive expected 409, got ${response.status}`);

    response = await request('/api/attachments', {
      method: 'POST',
      headers: uploadHeaders(moveFlexPending.id, 'arquivo-alterado.docx', DOCX_MIME),
      body: docxBytes,
    }, adminA);
    assert(response.status === 400, `altered standard DOCX expected 400, got ${response.status}`);
    const mismatch = await json(response);
    assert(
      String(mismatch?.error || '').includes('arquivo mestre aprovado'),
      'altered standard DOCX must explain that only the approved master is accepted'
    );

    response = await request(`/api/contract-templates/${moveFlexPending.id}/promote-file-source`, { method: 'POST', body: '{}' }, adminA);
    assert(response.status === 409, `approved master promotion without exact source expected 409, got ${response.status}`);

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(storageDir, { recursive: true, force: true });
    if (originalStorageDir === undefined) delete process.env.ATTACHMENT_STORAGE_DIR;
    else process.env.ATTACHMENT_STORAGE_DIR = originalStorageDir;
    if (originalDurable === undefined) delete process.env.ATTACHMENT_STORAGE_DURABLE;
    else process.env.ATTACHMENT_STORAGE_DURABLE = originalDurable;
  }
}

if (process.argv[1]?.includes('contractTemplateFileSourceRegression')) {
  runContractTemplateFileSourceRegression()
    .then(() => console.log('Contract template file source regression PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
