import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { registerAttachmentRoutes } from '../attachmentRoutes';
import { registerContractRoutes } from '../contractRoutes';
import { registerContractTemplateRoutes } from '../contractTemplateRoutes';
import { registerContractExecutionRoutes } from '../contractExecutionRoutes';
import type { AuthenticatedPrincipal } from '../auth';
import { RecurringFrequency, VehicleStatus } from '../../types/enums';

const companyA = 'security-2i4c-company-a';
const companyB = 'security-2i4c-company-b';
const adminAId = 'security-2i4c-admin-a';
const adminBId = 'security-2i4c-admin-b';
const readonlyAId = 'security-2i4c-readonly-a';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: globalThis.Response): Promise<any> {
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function syntheticContractDocx(): Buffer {
  const entries = [
    { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
    {
      name: 'word/document.xml',
      content: Buffer.from(
        '<w:document xmlns:w="urn:test"><w:body><w:p>' +
        '<w:r><w:t>Contrato {{contract.number}} - {{driver.</w:t></w:r>' +
        '<w:r><w:t>name}} - {{vehicle.plate}} - {{company.name}}</w:t></w:r>' +
        '</w:p></w:body></w:document>'
      ),
    },
  ];
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const checksum = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.content.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, entry.content);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.content.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.content.length;
  }
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

export class ContractExecutionAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    const previousAttachmentStorageDir = process.env.ATTACHMENT_STORAGE_DIR;
    const testAttachmentStorageDir = await mkdtemp(join(tmpdir(), 'autoerp-contract-execution-'));
    process.env.ATTACHMENT_STORAGE_DIR = testAttachmentStorageDir;
    await db.execute(sql`
      INSERT INTO companies (id, document, name, status, created_at, updated_at) VALUES
        (${companyA}, 'I4C-A', 'I4C Company A', 'ACTIVE', NOW(), NOW()),
        (${companyB}, 'I4C-B', 'I4C Company B', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET document=EXCLUDED.document, name=EXCLUDED.name, status='ACTIVE'
    `);
    await db.execute(sql`
      INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
        (${adminAId}, ${companyA}, 'I4C Admin A', 'i4c-admin-a@example.test', 'ADMIN', true, NOW(), NOW()),
        (${adminBId}, ${companyB}, 'I4C Admin B', 'i4c-admin-b@example.test', 'ADMIN', true, NOW(), NOW()),
        (${readonlyAId}, ${companyA}, 'I4C Readonly A', 'i4c-readonly-a@example.test', 'READONLY', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO vehicles (id, company_id, plate, renavam, brand, model, status, created_at, updated_at) VALUES
        ('i4c-veh-a1', ${companyA}, 'I4C1A01', 'I4C-REN-A1', 'Toyota', 'Yaris', 'AVAILABLE', NOW(), NOW()),
        ('i4c-veh-a2', ${companyA}, 'I4C2A02', 'I4C-REN-A2', 'Hyundai', 'HB20', 'AVAILABLE', NOW(), NOW()),
        ('i4c-veh-b1', ${companyB}, 'I4C1B01', 'I4C-REN-B1', 'Fiat', 'Argo', 'AVAILABLE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO drivers (
        id, company_id, name, cpf, cnh, active, cnh_expiration, status, app_platforms, is_archived, created_at, updated_at
      ) VALUES
        ('i4c-drv-a1', ${companyA}, 'Driver I4C A1', '52998224725', 'I4C-CNH-A1', true, '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()),
        ('i4c-drv-a2', ${companyA}, 'Driver I4C A2', '11144477735', 'I4C-CNH-A2', true, '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()),
        ('i4c-drv-b1', ${companyB}, 'Driver I4C B1', '39053344705', 'I4C-CNH-B1', true, '2035-01-01', 'ACTIVE', ARRAY['99'], false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO file_attachments (
        id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
        size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
      ) VALUES
        ('i4c-att-a1', ${companyA}, 'Vehicle', 'Vehicle', 'i4c-veh-a1', 'CRLV', 'i4c-a1.pdf', 'application/pdf', 'attachment://i4c-a1', 10, 10, 'SERVER_FS', 'i4c/a1', repeat('a',64), ${adminAId}, false, 'AVAILABLE', NOW()),
        ('i4c-att-a2', ${companyA}, 'Vehicle', 'Vehicle', 'i4c-veh-a2', 'CRLV', 'i4c-a2.pdf', 'application/pdf', 'attachment://i4c-a2', 10, 10, 'SERVER_FS', 'i4c/a2', repeat('b',64), ${adminAId}, false, 'AVAILABLE', NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO documents (
        id, company_id, subject_type, subject_id, document_type, reference_year, expiration_date, attachment_id,
        version_number, is_current, is_archived, cost, created_by, created_at, updated_at
      ) VALUES
        ('i4c-doc-a1-ipva', ${companyA}, 'VEHICLE', 'i4c-veh-a1', 'IPVA', 2026, '2035-01-01', 'i4c-att-a1', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i4c-doc-a1-crlv', ${companyA}, 'VEHICLE', 'i4c-veh-a1', 'CRLV', 2026, '2035-01-01', 'i4c-att-a1', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i4c-doc-a1-lic', ${companyA}, 'VEHICLE', 'i4c-veh-a1', 'LICENCIAMENTO', 2026, '2035-01-01', 'i4c-att-a1', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i4c-doc-a2-ipva', ${companyA}, 'VEHICLE', 'i4c-veh-a2', 'IPVA', 2026, '2035-01-01', 'i4c-att-a2', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i4c-doc-a2-crlv', ${companyA}, 'VEHICLE', 'i4c-veh-a2', 'CRLV', 2026, '2035-01-01', 'i4c-att-a2', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i4c-doc-a2-lic', ${companyA}, 'VEHICLE', 'i4c-veh-a2', 'LICENCIAMENTO', 2026, '2035-01-01', 'i4c-att-a2', 1, true, false, 0, ${adminAId}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET is_current=true, is_archived=false, expiration_date='2035-01-01', updated_at=NOW()
    `);
    await db.execute(sql`
      INSERT INTO insurances (
        id, company_id, vehicle_id, insurance_company, policy_number, coverage_details,
        deductible_amount, total_premium_amount, installments_count, start_date, end_date, status,
        account_payable_ids, created_by, created_at, updated_at
      ) VALUES
        ('i4c-ins-a1', ${companyA}, 'i4c-veh-a1', 'Seguradora I4C', 'I4C-A1', 'Cobertura teste', 0, 0, 1, '2026-01-01', '2035-01-01', 'ACTIVE', '[]'::jsonb, ${adminAId}, NOW(), NOW()),
        ('i4c-ins-a2', ${companyA}, 'i4c-veh-a2', 'Seguradora I4C', 'I4C-A2', 'Cobertura teste', 0, 0, 1, '2026-01-01', '2035-01-01', 'ACTIVE', '[]'::jsonb, ${adminAId}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET status='ACTIVE', start_date='2026-01-01', end_date='2035-01-01', updated_at=NOW()
    `);

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
      const companyId = typeof req.headers['x-company-id'] === 'string' ? req.headers['x-company-id'] : '';
      const role = typeof req.headers['x-role'] === 'string' ? req.headers['x-role'] : '';
      const userId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : '';
      if (companyId && role && userId) {
        (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
          companyId, userId, name: `${role} I4C Integration`, role, permissions: [],
        };
      }
      next();
    });
    registerContractTemplateRoutes(app);
    registerContractExecutionRoutes(app);
    registerAttachmentRoutes(app);
    registerContractRoutes(app);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address === 'object', 'integration server unavailable');
    const base = `http://127.0.0.1:${address.port}`;

    const adminA = { companyId: companyA, role: 'ADMIN', userId: adminAId };
    const adminB = { companyId: companyB, role: 'ADMIN', userId: adminBId };
    const readonlyA = { companyId: companyA, role: 'READONLY', userId: readonlyAId };

    const request = async (
      path: string,
      options: RequestInit = {},
      principal?: { companyId: string; role: string; userId: string }
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

    try {
      let response = await request('/api/contract-templates');
      assert(response.status === 401, `template no-session expected 401, got ${response.status}`);

      response = await request('/api/contract-templates', {
        method: 'POST', body: JSON.stringify({ templateKey: 'rental', title: 'Contrato', contentMarkdown: 'Contrato {{unknown.value}} inválido' }),
      }, adminA);
      assert(response.status === 400, `unknown placeholder expected 400, got ${response.status}`);

      response = await request('/api/contract-templates', {
        method: 'POST', body: JSON.stringify({ templateKey: 'rental', title: 'Contrato', contentMarkdown: 'Contrato {{contract.number}} para {{driver.name}} no veículo {{vehicle.plate}}. Valor {{contract.rentalAmount}}.' }),
      }, readonlyA);
      assert(response.status === 403, `READONLY template create expected 403, got ${response.status}`);

      response = await request('/api/contract-templates', {
        method: 'POST', body: JSON.stringify({
          templateKey: 'rental', title: 'Contrato de Locação',
          contentMarkdown: '# Contrato {{contract.number}}\nLocadora: {{company.name}} - {{company.document}}\nMotorista: {{driver.name}} CPF {{driver.cpf}} CNH {{driver.cnh}}\nVeículo: {{vehicle.brand}} {{vehicle.model}} placa {{vehicle.plate}} RENAVAM {{vehicle.renavam}}\nAluguel: {{contract.rentalAmount}} - franquia {{contract.franchiseKm}} km.',
          companyId: companyB,
        }),
      }, adminA);
      assert(response.status === 400, `forged template authority expected 400, got ${response.status}`);

      response = await request('/api/contract-templates', {
        method: 'POST', body: JSON.stringify({
          templateKey: 'rental', title: 'Contrato de Locação',
          contentMarkdown: '# Contrato {{contract.number}}\nLocadora: {{company.name}} - {{company.document}}\nMotorista: {{driver.name}} CPF {{driver.cpf}} CNH {{driver.cnh}}\nVeículo: {{vehicle.brand}} {{vehicle.model}} placa {{vehicle.plate}} RENAVAM {{vehicle.renavam}}\nAluguel: {{contract.rentalAmount}} - franquia {{contract.franchiseKm}} km.',
        }),
      }, adminA);
      assert(response.status === 201, `template create expected 201, got ${response.status}`);
      const template = (await json(response)).item;
      assert(template.companyId === companyA && template.versionNumber === 1 && template.isCurrent, 'template authority mismatch');

      response = await request('/api/contract-templates', {
        method: 'POST', body: JSON.stringify({ templateKey: 'version-test', title: 'Version test', contentMarkdown: 'Versão 1 do contrato {{contract.number}} para {{driver.name}}.' }),
      }, adminA);
      assert(response.status === 201, `version template create expected 201, got ${response.status}`);
      const versionOne = (await json(response)).item;
      response = await request(`/api/contract-templates/${versionOne.id}/versions`, {
        method: 'POST', body: JSON.stringify({ contentMarkdown: 'Versão 2 do contrato {{contract.number}} para {{driver.name}}.' }),
      }, adminA);
      assert(response.status === 201, `template v2 expected 201, got ${response.status}`);
      const versionTwo = (await json(response)).item;
      assert(versionTwo.versionNumber === 2 && versionTwo.supersedesTemplateId === versionOne.id, 'template version chain mismatch');
      response = await request(`/api/contract-templates/${versionTwo.id}/versions`, {}, adminA);
      assert(response.status === 200 && (await json(response)).items.length === 2, 'template history not preserved');

      response = await request('/api/contract-templates', {
        method: 'POST', body: JSON.stringify({ templateKey: 'rental', title: 'Tenant B', contentMarkdown: 'Contrato {{contract.number}} de {{driver.name}} em {{vehicle.plate}}.' }),
      }, adminB);
      assert(response.status === 201, `cross-tenant same template key expected 201, got ${response.status}`);

      response = await request('/api/contract-templates', {
        method: 'POST', body: JSON.stringify({
          templateKey: 'rental-docx', title: 'Contrato DOCX', sourceMode: 'FILE',
        }),
      }, adminA);
      assert(response.status === 201, `DOCX template create expected 201, got ${response.status}`);
      const docxTemplate = (await json(response)).item;
      assert(docxTemplate.isCurrent === true && docxTemplate.isActive === false, 'DOCX template initial state mismatch');

      const docxSource = syntheticContractDocx();
      const docxHeaders = new Headers({
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'x-autoerp-entity-type': 'ContractTemplate',
        'x-autoerp-entity-id': docxTemplate.id,
        'x-autoerp-document-type': 'CONTRACT_TEMPLATE_SOURCE',
        'x-autoerp-file-name': 'modelo-locacao.docx',
      });
      response = await request('/api/attachments', { method: 'POST', headers: docxHeaders, body: docxSource }, adminA);
      assert(response.status === 201, `DOCX source upload expected 201, got ${response.status}`);
      response = await request(`/api/contract-templates/${docxTemplate.id}/promote-file-source`, {
        method: 'POST', body: '{}',
      }, adminA);
      assert(response.status === 200, `DOCX source promotion expected 200, got ${response.status}`);
      assert((await json(response)).item.isActive === true, 'valid DOCX source was not activated');

      const contractInput = {
        contractNumber: 'CNT-I4C-A-001', driverId: 'i4c-drv-a1', vehicleId: 'i4c-veh-a1', startDate: '2026-09-01',
        rentalAmount: 800, billingPeriodicity: RecurringFrequency.WEEKLY, billingDueDayOfWeek: 1, billingDueDayOfMonth: 1,
        securityDepositAmount: 1000, franchiseKm: 1500, excessKmRate: 0.6, templateId: template.id,
      };
      response = await request('/api/contracts', { method: 'POST', body: JSON.stringify(contractInput) }, adminA);
      assert(response.status === 201, `new I4C contract expected 201, got ${response.status}`);
      const contract = (await json(response)).item;
      assert(contract.signatureRequired === true, 'new contract must require signature');

      response = await request(`/api/contracts/${contract.id}/activate`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 409, `activation without signed evidence expected 409, got ${response.status}`);
      let row = await scalar(sql`SELECT status, current_contract_id FROM vehicles WHERE id='i4c-veh-a1'`);
      assert(row?.status === VehicleStatus.AVAILABLE && !row?.current_contract_id, 'failed signature gate mutated vehicle');
      row = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE contract_id=${contract.id}`);
      assert(Number(row?.count) === 0, 'failed signature gate created receivable');

      response = await request(`/api/contracts/${contract.id}/generate-pdf`, {
        method: 'POST', body: JSON.stringify({ templateId: template.id }),
      }, readonlyA);
      assert(response.status === 403, `READONLY generate expected 403, got ${response.status}`);

      response = await request(`/api/contracts/${contract.id}/generate-pdf`, {
        method: 'POST', body: JSON.stringify({ templateId: template.id }),
      }, adminA);
      assert(response.status === 201, `generate PDF expected 201, got ${response.status}`);
      const generated = await json(response);
      assert(generated.artifact.artifactType === 'GENERATED_PDF' && /^[0-9a-f]{64}$/.test(generated.artifact.snapshotHash), 'generated artifact invalid');
      assert(generated.attachment.mimeType === 'application/pdf' && generated.attachment.storageProvider === 'SERVER_FS', 'generated attachment invalid');
      assert(Array.isArray(generated.receivables) && generated.receivables.length === 1, 'PDF generation must create the first rental receivable');
      const generatedReceivableId = generated.receivables[0].id;
      row = await scalar(sql`
        SELECT count(*)::int AS count, min(status) AS status, min(original_amount)::numeric AS amount
        FROM account_receivables WHERE contract_id=${contract.id}
      `);
      assert(Number(row?.count) === 1 && row?.status === 'PENDING' && Number(row?.amount) === 800, 'generated contract receivable mismatch');

      response = await request(`/api/attachments/${generated.attachment.id}/content`, {}, adminA);
      assert(response.status === 200, `generated PDF content expected 200, got ${response.status}`);
      const generatedPdfBytes = new Uint8Array(await response.arrayBuffer());
      assert(new TextDecoder('ascii').decode(generatedPdfBytes.slice(0, 5)) === '%PDF-', 'generated content is not a real PDF');

      response = await request(`/api/contracts/${contract.id}/generate-docx`, {
        method: 'POST', body: JSON.stringify({ templateId: docxTemplate.id }),
      }, readonlyA);
      assert(response.status === 403, `READONLY DOCX generate expected 403, got ${response.status}`);

      response = await request(`/api/contracts/${contract.id}/generate-docx`, {
        method: 'POST', body: JSON.stringify({ templateId: docxTemplate.id }),
      }, adminA);
      assert(response.status === 409, `mismatched browser DOCX template expected 409, got ${response.status}`);
      row = await scalar(sql`
        SELECT count(*)::int AS count FROM contract_artifacts
        WHERE contract_id=${contract.id} AND artifact_type='GENERATED_DOCX'
      `);
      assert(Number(row?.count) === 0, 'mismatched browser templateId created a DOCX artifact');
      row = await scalar(sql`SELECT count(*)::int AS count, min(id) AS id FROM account_receivables WHERE contract_id=${contract.id} AND status<>'CANCELLED'`);
      assert(Number(row?.count) === 1 && row?.id === generatedReceivableId, 'rejected DOCX generation mutated the rental receivable');
      const currentPdf = await scalar(sql`
        SELECT is_current, is_archived FROM contract_artifacts WHERE id=${generated.artifact.id}
      `);
      assert(currentPdf?.is_current === true && currentPdf?.is_archived === false, 'rejected DOCX generation mutated prior PDF');

      response = await request(`/api/contracts/${contract.id}`, {
        method: 'PATCH', body: JSON.stringify({ rentalAmount: 999 }),
      }, adminA);
      assert(response.status === 409, `term mutation after PDF expected 409, got ${response.status}`);

      const finalHeaders = new Headers({
        'content-type': 'application/pdf',
        'x-autoerp-entity-type': 'Contract',
        'x-autoerp-entity-id': contract.id,
        'x-autoerp-document-type': 'CONTRACT_FINAL_PDF',
        'x-autoerp-file-name': 'contrato-final-revisado.pdf',
      });
      response = await request('/api/attachments', { method: 'POST', headers: finalHeaders, body: generatedPdfBytes }, adminA);
      assert(response.status === 201, `reviewed final upload expected 201, got ${response.status}`);
      const reviewedAttachment = (await json(response)).item;

      response = await request(`/api/contracts/${contract.id}/reviewed-final-pdf`, {
        method: 'POST', body: JSON.stringify({ attachmentId: reviewedAttachment.id }),
      }, readonlyA);
      assert(response.status === 403, `READONLY reviewed final registration expected 403, got ${response.status}`);

      response = await request(`/api/contracts/${contract.id}/reviewed-final-pdf`, {
        method: 'POST', body: JSON.stringify({ attachmentId: reviewedAttachment.id }),
      }, adminA);
      assert(response.status === 201, `reviewed final registration expected 201, got ${response.status}`);
      const reviewedArtifact = (await json(response)).artifact;
      assert(
        reviewedArtifact.artifactType === 'REVIEWED_FINAL_PDF' &&
        reviewedArtifact.sourceArtifactId === generated.artifact.id &&
        reviewedArtifact.attachmentId === reviewedAttachment.id,
        'reviewed final artifact link mismatch',
      );

      const signedHeaders = new Headers({
        'content-type': 'application/pdf',
        'x-autoerp-entity-type': 'Contract',
        'x-autoerp-entity-id': contract.id,
        'x-autoerp-document-type': 'SIGNED_CONTRACT',
        'x-autoerp-file-name': 'contrato-assinado.pdf',
      });
      response = await request('/api/attachments', { method: 'POST', headers: signedHeaders, body: generatedPdfBytes }, adminA);
      assert(response.status === 201, `signed attachment upload expected 201, got ${response.status}`);
      const signedAttachment = (await json(response)).item;
      assert(signedAttachment.id !== generated.attachment.id, 'signed evidence reused generated attachment id');

      response = await request(`/api/contracts/${contract.id}/signature-evidence`, {
        method: 'POST', body: JSON.stringify({
          attachmentId: signedAttachment.id,
          signedByName: 'Motorista Teste',
          signatureMethod: 'INVALID_METHOD',
        }),
      }, adminA);
      assert(response.status === 400, `invalid signatureMethod expected 400, got ${response.status}`);

      response = await request(`/api/contracts/${contract.id}/signature-evidence`, {
        method: 'POST', body: JSON.stringify({
          attachmentId: signedAttachment.id,
          signedByName: 'Motorista Teste',
          signatureMethod: 'GOV_BR',
        }),
      }, adminA);
      assert(response.status === 201, `signature evidence expected 201, got ${response.status}`);
      const signedArtifact = (await json(response)).artifact;
      assert(
        signedArtifact.artifactType === 'SIGNED_EVIDENCE' &&
        signedArtifact.sourceArtifactId === reviewedArtifact.id &&
        signedArtifact.signatureMethod === 'GOV_BR',
        'signed GOV.br artifact link/method mismatch'
      );

      response = await request(`/api/contracts/${contract.id}/generate-pdf`, {
        method: 'POST', body: JSON.stringify({ templateId: template.id }),
      }, adminA);
      assert(response.status === 409, `regenerate after signature expected 409, got ${response.status}`);

      response = await request(`/api/contracts/${contract.id}/artifacts`, {}, adminB);
      assert(response.status === 404, `cross-tenant artifact read expected 404, got ${response.status}`);

      response = await request(`/api/contracts/${contract.id}/activate`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 200, `activation with signed evidence expected 200, got ${response.status}`);
      const activated = await json(response);
      assert(activated.item.status === 'ACTIVE' && activated.receivables.length === 2, 'signed activation result mismatch');
      const activatedRent = activated.receivables.find((item: any) => item.originType === 'CONTRACT_RENT');
      const activatedDeposit = activated.receivables.find((item: any) => item.originType === 'SECURITY_DEPOSIT');
      assert(activatedRent?.id === generatedReceivableId, 'activation must reuse the receivable created at document generation');
      assert(Number(activatedDeposit?.originalAmount) === 1000, 'activation must create the agreed security-deposit receivable');
      row = await scalar(sql`
        SELECT
          count(*)::int AS count,
          count(*) FILTER (WHERE origin_type='CONTRACT_RENT')::int AS rent_count,
          count(*) FILTER (WHERE origin_type='SECURITY_DEPOSIT')::int AS deposit_count,
          max(original_amount) FILTER (WHERE origin_type='SECURITY_DEPOSIT')::numeric AS deposit_amount
        FROM account_receivables
        WHERE contract_id=${contract.id} AND status<>'CANCELLED'
      `);
      assert(
        Number(row?.count) === 2 && Number(row?.rent_count) === 1 && Number(row?.deposit_count) === 1 && Number(row?.deposit_amount) === 1000,
        'activation must preserve one rental receivable and create one security-deposit receivable',
      );
      row = await scalar(sql`SELECT status, current_contract_id FROM vehicles WHERE id='i4c-veh-a1'`);
      assert(row?.status === VehicleStatus.RENTED && row?.current_contract_id === contract.id, 'signed activation vehicle binding mismatch');

      const cancelInput = { ...contractInput, contractNumber: 'CNT-I4C-CANCEL', driverId: 'i4c-drv-a2', vehicleId: 'i4c-veh-a2' };
      response = await request('/api/contracts', { method: 'POST', body: JSON.stringify(cancelInput) }, adminA);
      assert(response.status === 201, `cancel fixture contract create expected 201, got ${response.status}`);
      const cancellable = (await json(response)).item;
      response = await request(`/api/contracts/${cancellable.id}/generate-pdf`, {
        method: 'POST', body: JSON.stringify({ templateId: template.id }),
      }, adminA);
      assert(response.status === 201, `cancel fixture PDF generation expected 201, got ${response.status}`);
      row = await scalar(sql`SELECT count(*)::int AS count, min(status) AS status FROM account_receivables WHERE contract_id=${cancellable.id}`);
      assert(Number(row?.count) === 1 && row?.status === 'PENDING', 'cancel fixture did not create pending receivable');

      // Simulate a contract whose official document predates the document-generation receivable rule.
      await db.execute(sql`DELETE FROM account_receivables WHERE contract_id=${cancellable.id}`);
      row = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE contract_id=${cancellable.id}`);
      assert(Number(row?.count) === 0, 'legacy reconciliation fixture must start without receivable');

      response = await request(`/api/contracts/${cancellable.id}/reconcile-initial-receivable`, { method: 'POST', body: '{}' }, readonlyA);
      assert(response.status === 403, `readonly legacy reconciliation expected 403, got ${response.status}`);

      response = await request(`/api/contracts/${cancellable.id}/reconcile-initial-receivable`, { method: 'POST', body: '{}' }, adminB);
      assert(response.status === 404, `cross-tenant legacy reconciliation expected 404, got ${response.status}`);

      response = await request(`/api/contracts/${cancellable.id}/reconcile-initial-receivable`, {
        method: 'POST', body: JSON.stringify({ force: true }),
      }, adminA);
      assert(response.status === 400, `legacy reconciliation authority-field injection expected 400, got ${response.status}`);

      response = await request(`/api/contracts/${cancellable.id}/reconcile-initial-receivable`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 201, `legacy reconciliation expected 201, got ${response.status}`);
      const reconciledReceivable = (await json(response)).receivable;
      assert(reconciledReceivable?.contractId === cancellable.id, 'legacy reconciliation receivable contract link mismatch');
      row = await scalar(sql`
        SELECT count(*)::int AS count, min(status) AS status, min(origin_type) AS origin_type
        FROM account_receivables WHERE contract_id=${cancellable.id}
      `);
      assert(Number(row?.count) === 1 && row?.status === 'PENDING' && row?.origin_type === 'CONTRACT_RENT', 'legacy reconciliation must create exactly one pending CONTRACT_RENT receivable');

      response = await request(`/api/contracts/${cancellable.id}/reconcile-initial-receivable`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 200, `legacy reconciliation replay expected 200, got ${response.status}`);
      const replayedReceivable = (await json(response)).receivable;
      assert(replayedReceivable?.id === reconciledReceivable.id, 'legacy reconciliation replay must reuse the same receivable');
      row = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE contract_id=${cancellable.id}`);
      assert(Number(row?.count) === 1, 'legacy reconciliation replay duplicated receivable');

      response = await request(`/api/contracts/${cancellable.id}/cancel`, {
        method: 'POST', body: JSON.stringify({ reason: 'Motorista desistiu antes da ativação' }),
      }, adminA);
      assert(response.status === 200, `cancel generated contract expected 200, got ${response.status}`);
      row = await scalar(sql`SELECT count(*)::int AS count, min(status) AS status, min(cancel_reason) AS reason FROM account_receivables WHERE contract_id=${cancellable.id}`);
      assert(Number(row?.count) === 1 && row?.status === 'CANCELLED' && String(row?.reason || '').includes('Contrato cancelado'), 'contract cancellation did not cancel unpaid reconciled receivable');

      await db.execute(sql`UPDATE contracts SET status='ARCHIVED', is_archived=true, updated_at=NOW() WHERE id=${cancellable.id}`);
      response = await request(`/api/contracts/${cancellable.id}/reconcile-initial-receivable`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 404, `archived legacy reconciliation expected 404, got ${response.status}`);

      const legacyInput = { ...contractInput, contractNumber: 'CNT-I4C-LEGACY', driverId: 'i4c-drv-a2', vehicleId: 'i4c-veh-a2', templateId: undefined };
      response = await request('/api/contracts', { method: 'POST', body: JSON.stringify(legacyInput) }, adminA);
      assert(response.status === 201, `legacy fixture contract create expected 201, got ${response.status}`);
      const legacy = (await json(response)).item;
      await UnitOfWork.run(companyA, async (tx) => {
        const saved = await tx.getContractRepo().updateForCompany(companyA, legacy.id, { signatureRequired: false, updatedAt: new Date().toISOString() });
        assert(saved?.signatureRequired === false, 'legacy signatureRequired fixture failed');
      });
      response = await request(`/api/contracts/${legacy.id}/activate`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 200, `legacy signatureRequired=false activation expected 200, got ${response.status}`);

      console.log('SECURITY-2I4C_CONTRACT_EXECUTION_INTEGRATION_PASS');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(testAttachmentStorageDir, { recursive: true, force: true });
      if (previousAttachmentStorageDir === undefined) delete process.env.ATTACHMENT_STORAGE_DIR;
      else process.env.ATTACHMENT_STORAGE_DIR = previousAttachmentStorageDir;
    }
  }
}

if (process.argv[1]?.includes('contractExecutionAuthorityIntegration')) {
  ContractExecutionAuthorityIntegrationRunner.runAllTests()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
}