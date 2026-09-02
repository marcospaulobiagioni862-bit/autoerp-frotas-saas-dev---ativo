import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { rm } from 'node:fs/promises';
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
        method: 'POST', body: JSON.stringify({
          templateKey: 'version-test', title: 'Version test', contentMarkdown: 'Versão 1 do contrato {{contract.number}} para {{driver.name}}.',
        }),
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
      assert(response.status === 201, `generate DOCX expected 201, got ${response.status}`);
      const generatedDocx = await json(response);
      assert(
        generatedDocx.artifact.artifactType === 'GENERATED_DOCX' &&
        /^[0-9a-f]{64}$/.test(generatedDocx.artifact.snapshotHash),
        'generated DOCX artifact invalid'
      );
      assert(
        generatedDocx.attachment.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        generatedDocx.attachment.storageProvider === 'SERVER_FS',
        'generated DOCX attachment invalid'
      );

      response = await request(`/api/contracts/${contract.id}/generate-docx`, {
        method: 'POST', body: JSON.stringify({ templateId: docxTemplate.id }),
      }, adminA);
      assert(response.status === 200, `DOCX replay expected 200, got ${response.status}`);
      const replayedDocx = await json(response);
      assert(
        replayedDocx.artifact.id === generatedDocx.artifact.id &&
        replayedDocx.attachment.id === generatedDocx.attachment.id,
        'DOCX replay created a different authority chain'
      );
      row = await scalar(sql`
        SELECT count(*)::int AS count FROM contract_artifacts
        WHERE contract_id=${contract.id} AND artifact_type='GENERATED_DOCX'
      `);
      assert(Number(row?.count) === 1, 'DOCX replay created an extra artifact');

      response = await request(`/api/attachments/${generatedDocx.attachment.id}/content`, {}, adminA);
      assert(response.status === 200, `generated DOCX content expected 200, got ${response.status}`);
      const generatedDocxBytes = new Uint8Array(await response.arrayBuffer());
      assert(new TextDecoder('ascii').decode(generatedDocxBytes.slice(0, 2)) === 'PK', 'generated content is not a DOCX ZIP');

      const supersededPdf = await scalar(sql`
        SELECT is_current, is_archived FROM contract_artifacts WHERE id=${generated.artifact.id}
      `);
      assert(supersededPdf?.is_current === false && supersededPdf?.is_archived === true, 'DOCX generation did not archive prior PDF');

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
        reviewedArtifact.sourceArtifactId === generatedDocx.artifact.id &&
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
        method: 'POST', body: JSON.stringify({ attachmentId: signedAttachment.id, signedByName: 'Motorista Teste', signedAt: '2026-08-19T17:00:00.000Z' }),
      }, adminA);
      assert(response.status === 201, `signature evidence expected 201, got ${response.status}`);
      const signedArtifact = (await json(response)).artifact;
      assert(signedArtifact.artifactType === 'SIGNED_EVIDENCE' && signedArtifact.sourceArtifactId === reviewedArtifact.id, 'signed artifact link mismatch');

      response = await request(`/api/contracts/${contract.id}/generate-pdf`, {
        method: 'POST', body: JSON.stringify({ templateId: template.id }),
      }, adminA);
      assert(response.status === 409, `regenerate after signature expected 409, got ${response.status}`);

      response = await request(`/api/contracts/${contract.id}/artifacts`, {}, adminB);
      assert(response.status === 404, `cross-tenant artifact read expected 404, got ${response.status}`);

      response = await request(`/api/contracts/${contract.id}/activate`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 200, `activation with signed evidence expected 200, got ${response.status}`);
      const activated = await json(response);
      assert(activated.item.status === 'ACTIVE' && activated.receivables.length === 1, 'signed activation result mismatch');
      row = await scalar(sql`SELECT status, current_contract_id FROM vehicles WHERE id='i4c-veh-a1'`);
      assert(row?.status === VehicleStatus.RENTED && row?.current_contract_id === contract.id, 'signed activation vehicle binding mismatch');

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
      if (process.env.ATTACHMENT_STORAGE_DIR) await rm(process.env.ATTACHMENT_STORAGE_DIR, { recursive: true, force: true });
    }
  }
}

if (process.argv[1]?.includes('contractExecutionAuthorityIntegration')) {
  ContractExecutionAuthorityIntegrationRunner.runAllTests()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
}
