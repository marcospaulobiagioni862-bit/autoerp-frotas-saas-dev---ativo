import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';

// Forçar uso do PGlite para garantir suíte auto-contida, determinística e sem dependência de serviços externos
process.env.USE_PGLITE = 'true';
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

import {
  VEHICLE_DOCUMENT_FOLDERS,
  groupAttachmentsIntoVehicleFolders,
} from '../vehicleDocumentFolderDefinitions';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_VIDEO_ATTACHMENT_BYTES,
  assertRetentionPrefixScope,
  ForbiddenProductionRetentionError,
  AttachmentStorageNotFoundError,
  type AttachmentByteStorage,
  type AttachmentStorageConfiguration,
  type StoredAttachmentBytes,
} from '../../../server/attachmentStorage';
import type { FileAttachment } from '../../../types/entities';

console.log('--- PH-055: Vehicle Document Folders Real Integration & Regression Suite ---');

// ============================================================================
// 1. Static AST / Code Structure Verification
// ============================================================================
console.log('1. Checking static layout and UI requirements...');
const vehicleDetailsCode = readFileSync(new URL('../VehicleDetailsModal.tsx', import.meta.url), 'utf8');
const fileUploadCode = readFileSync(new URL('../../documents/FileUpload.tsx', import.meta.url), 'utf8');
const attachmentRoutesCode = readFileSync(new URL('../../../server/attachmentRoutes.ts', import.meta.url), 'utf8');
const attachmentStorageCode = readFileSync(new URL('../../../server/attachmentStorage.ts', import.meta.url), 'utf8');

// VehicleDetailsModal checks
assert.match(vehicleDetailsCode, /VehicleDocumentFoldersModal/, 'VehicleDetailsModal must import VehicleDocumentFoldersModal');
assert.match(vehicleDetailsCode, /setFoldersModalOpen\(true\)/, 'VehicleDetailsModal must have button to open document folders');
assert.match(vehicleDetailsCode, /<VehicleDocumentFoldersModal/, 'VehicleDetailsModal must render VehicleDocumentFoldersModal');

// FileUpload checks
assert.match(fileUploadCode, /CANONICAL_VEHICLE_DOCUMENT_TYPES/, 'FileUpload must export CANONICAL_VEHICLE_DOCUMENT_TYPES');
assert.match(fileUploadCode, /isChecklist = effectiveDocumentType === 'CHECKLIST'/, 'FileUpload must detect CHECKLIST document type');
assert.match(fileUploadCode, /video\/mp4/, 'FileUpload must support video/mp4 for checklist');
assert.match(fileUploadCode, /Math\.max\(maxSizeMB,\s*50\)/, 'FileUpload must allow 50MB for checklist');

// Server attachmentRoutes checks
assert.match(attachmentRoutesCode, /MAX_VIDEO_ATTACHMENT_BYTES/, 'attachmentRoutes must import MAX_VIDEO_ATTACHMENT_BYTES');
assert.match(attachmentRoutesCode, /limit:MAX_VIDEO_ATTACHMENT_BYTES/, 'attachmentRoutes express.raw limit must use MAX_VIDEO_ATTACHMENT_BYTES');
assert.match(attachmentRoutesCode, /canonicalMimeType\(mimeType\)==='video\/mp4'\)\?MAX_VIDEO_ATTACHMENT_BYTES:MAX_ATTACHMENT_BYTES/, 'attachmentRoutes must enforce 50MB limit only for videos and 10MB for others');

// Server attachmentStorage checks
assert.equal(MAX_ATTACHMENT_BYTES, 10 * 1024 * 1024, 'MAX_ATTACHMENT_BYTES must be 10MB');
assert.equal(MAX_VIDEO_ATTACHMENT_BYTES, 50 * 1024 * 1024, 'MAX_VIDEO_ATTACHMENT_BYTES must be 50MB');

console.log('✓ [1/5] Static AST code assertions and size limit invariants verified.');

// ============================================================================
// 2. The 11 Canonical Folders and Mapping Verification
// ============================================================================
console.log('2. Verifying the 11 canonical folder keys and grouping logic...');
assert.equal(VEHICLE_DOCUMENT_FOLDERS.length, 12, 'Must have 11 canonical folders + 1 fallback folder (OUTROS)');

const folderKeys = VEHICLE_DOCUMENT_FOLDERS.map((f) => f.key);
const expectedKeys = [
  'crlv',
  'vistoria',
  'vistoria_cautelar',
  'checklist',
  'nf_entrada',
  'nf_saida',
  'atpv',
  'rastreador',
  'apolice_seguro',
  'nf_pecas',
  'nf_servico',
  'outros',
];
assert.deepEqual(folderKeys, expectedKeys, 'The 11 canonical folder keys must match Marcos requirements');

function mockAttachment(overrides: Partial<FileAttachment>): FileAttachment {
  return {
    id: `att-${Math.random().toString(36).slice(2, 9)}`,
    companyId: 'company-001',
    entityName: 'Vehicle',
    entityType: 'Vehicle',
    entityId: 'veh-001',
    fileName: 'document.pdf',
    fileSize: 1024 * 100,
    mimeType: 'application/pdf',
    uploadedBy: 'user-001',
    storageProvider: 'R2',
    contentState: 'AVAILABLE',
    isArchived: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// 2.1 Test 1 file for each of the 11 canonical types
const testFixtures: FileAttachment[] = [
  mockAttachment({ documentType: 'CRLV', fileName: 'crlv_2026.pdf' }),
  mockAttachment({ documentType: 'VISTORIA', fileName: 'vistoria_detran.pdf', entityType: 'VehicleInspection' }),
  mockAttachment({ documentType: 'VISTORIA_CAUTELAR', fileName: 'laudo_cautelar_dekra.pdf' }),
  mockAttachment({ documentType: 'CHECKLIST', fileName: 'volta_veiculo_checkin.mp4', mimeType: 'video/mp4', fileSize: 35 * 1024 * 1024 }),
  mockAttachment({ documentType: 'NOTA_FISCAL_ENTRADA', fileName: 'nf_compra_concessionaria.pdf' }),
  mockAttachment({ documentType: 'NOTA_FISCAL_SAIDA', fileName: 'nf_venda_comprador.pdf' }),
  mockAttachment({ documentType: 'ATPV', fileName: 'recibo_atpv_assinado.pdf' }),
  mockAttachment({ documentType: 'RASTREADOR', fileName: 'termo_instalacao_sascar.pdf', entityType: 'Tracker' }),
  mockAttachment({ documentType: 'APOLICE_SEGURO', fileName: 'apolice_porto_seguro.pdf', entityType: 'Insurance' }),
  mockAttachment({ documentType: 'NOTA_FISCAL_PECAS', fileName: 'nf_jogo_pneus_michelin.pdf' }),
  mockAttachment({ documentType: 'NOTA_FISCAL_SERVICO', fileName: 'nf_revisao_suspensao.pdf', entityType: 'MaintenanceWorkOrder' }),
  mockAttachment({ documentType: 'OUTROS', fileName: 'manual_proprietario.pdf' }),
];

const grouped = groupAttachmentsIntoVehicleFolders(testFixtures);

for (const key of expectedKeys) {
  assert.equal(grouped[key].items.length, 1, `Folder "${key}" must contain exactly 1 item`);
}

const checklistItem = grouped['checklist'].items[0];
assert.equal(checklistItem.mimeType, 'video/mp4');
assert.equal(checklistItem.fileSize, 35 * 1024 * 1024);

console.log('✓ [2/5] The 11 canonical document folders correctly grouped fixtures.');

// ============================================================================
// 3. Legacy Aliases & Inspection Unification Verification
// ============================================================================
console.log('3. Verifying legacy aliases and inspection report unification...');
const legacyFixtures: FileAttachment[] = [
  mockAttachment({ documentType: 'CRV', fileName: 'crv.pdf' }),
  mockAttachment({ documentType: 'DPVAT_SPVAT', fileName: 'spvat.pdf' }),
  mockAttachment({ entityType: 'VehicleInspection', documentType: 'INSPECTION_REPORT', fileName: 'inspecao.pdf' }),
  mockAttachment({ documentType: 'ATPV_E', fileName: 'atpve.pdf' }),
  mockAttachment({ documentType: 'PURCHASE_INVOICE', fileName: 'compra.pdf' }),
  mockAttachment({ entityType: 'Insurance', documentType: 'INSURANCE_POLICY', fileName: 'seguro.pdf' }),
];

const groupedLegacy = groupAttachmentsIntoVehicleFolders(legacyFixtures);
assert.equal(groupedLegacy['crlv'].items.length, 2, 'CRV and DPVAT must group into CRLV');
assert.equal(groupedLegacy['vistoria'].items.length, 1, 'INSPECTION_REPORT must unify into Vistoria');
assert.equal(groupedLegacy['atpv'].items.length, 1, 'ATPV_E must group into ATPV');
assert.equal(groupedLegacy['nf_entrada'].items.length, 1, 'PURCHASE_INVOICE must group into NF Entrada');
assert.equal(groupedLegacy['apolice_seguro'].items.length, 1, 'INSURANCE_POLICY must group into Seguro');

console.log('✓ [3/5] Legacy aliases and AUTOERP-61/62 inspection unification verified.');

// ============================================================================
// 4. Trava Obrigatória de Retenção e Expurgo (Regra 3.2-e)
// ============================================================================
console.log('4. Testing Trava Obrigatória: Retention/cleanup must NEVER touch prod-company-001/ ...');

// Staging prefix is allowed
assert.doesNotThrow(() => {
  assertRetentionPrefixScope('staging-company-001/');
  assertRetentionPrefixScope('staging-company-001/attachments/veh-01/');
}, 'Staging prefixes must be permitted for lifecycle retention routines');

// Negative Mutation: Production prefix MUST THROW and abort immediately!
assert.throws(() => {
  assertRetentionPrefixScope('prod-company-001/');
}, ForbiddenProductionRetentionError, 'Production prefix prod-company-001/ must trigger ForbiddenProductionRetentionError');

assert.throws(() => {
  assertRetentionPrefixScope('prod-company-001/attachments/real-docs/');
}, ForbiddenProductionRetentionError, 'Nested production prefix must trigger ForbiddenProductionRetentionError');

assert.throws(() => {
  assertRetentionPrefixScope('prod/client-docs/');
}, ForbiddenProductionRetentionError, 'prod/ prefix must trigger ForbiddenProductionRetentionError');

console.log('✓ [4/5] Trava Obrigatória (production shield) confirmed.');

// ============================================================================
// 5. Database Bootstrap (PGlite) & Real Express Integration Server
// ============================================================================
console.log('5. Bootstrapping isolated PGlite database and real Express server with R2 memory storage...');

const { db } = await import('../../../db/index.js');
const { sql } = await import('drizzle-orm');
const { registerAttachmentRoutes } = await import('../../../server/attachmentRoutes.js');

// Bootstrap tables in isolated PGlite
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS companies (
    id text PRIMARY KEY,
    name text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  );
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    user_id text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    changes text,
    timestamp timestamp NOT NULL DEFAULT now(),
    correlation_id text,
    ip_address text
  );
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS vehicles (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    plate text NOT NULL,
    renavam text NOT NULL,
    brand text NOT NULL DEFAULT '',
    model text NOT NULL DEFAULT '',
    version text,
    year_fabrication integer NOT NULL DEFAULT 2024,
    year_model integer NOT NULL DEFAULT 2024,
    color text NOT NULL DEFAULT 'Prata',
    chassis text NOT NULL DEFAULT '',
    current_km integer NOT NULL DEFAULT 15000,
    next_maintenance_km integer,
    fuel_type text NOT NULL DEFAULT 'Flex',
    category text NOT NULL DEFAULT 'Padrão',
    acquisition_value numeric(12,2) NOT NULL DEFAULT 85000.00,
    current_value numeric(12,2) NOT NULL DEFAULT 82000.00,
    rental_value_base numeric(12,2) NOT NULL DEFAULT 650.00,
    owner_type text NOT NULL DEFAULT 'COMPANY',
    owner_name text,
    owner_document text,
    possession_type text NOT NULL DEFAULT 'PROPRIO',
    financial_restriction text NOT NULL DEFAULT 'NONE',
    financial_institution text,
    crlv_exercise_year integer,
    registration_city text,
    registration_state text,
    cla_security_code text,
    sne_coverage_status text NOT NULL DEFAULT 'NAO_ADERIDO',
    status text NOT NULL DEFAULT 'DISPONIVEL',
    notes text,
    current_driver_id text,
    current_contract_id text,
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS file_attachments (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    entity_type text NOT NULL,
    entity_name text NOT NULL,
    entity_id text NOT NULL,
    document_type text,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    url text NOT NULL,
    size integer,
    file_size integer NOT NULL DEFAULT 0,
    storage_provider text NOT NULL DEFAULT 'R2',
    storage_key text,
    checksum text,
    description text,
    issue_date text,
    expiration_date text,
    created_by text,
    is_archived boolean NOT NULL DEFAULT false,
    content_state text NOT NULL DEFAULT 'AVAILABLE',
    created_at timestamp NOT NULL DEFAULT now()
  );
`);

// Memory implementation of AttachmentByteStorage satisfying all requirements
class MemoryAttachmentStorage implements AttachmentByteStorage {
  readonly provider = 'R2' as const;
  private map = new Map<string, Buffer>();

  getConfiguration(): AttachmentStorageConfiguration {
    return {
      provider: 'R2',
      configured: true,
      durableRequested: true,
      durable: true,
      ephemeralPath: false,
      maxBytes: MAX_ATTACHMENT_BYTES,
    };
  }

  async write(companyId: string, attachmentId: string, bytes: Buffer): Promise<StoredAttachmentBytes> {
    const key = `staging-${companyId}/attachments/${attachmentId}`;
    this.map.set(key, bytes);
    return {
      storageKey: key,
      fileSize: bytes.length,
      checksum: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  async read(companyId: string, storageKey: string): Promise<Buffer> {
    const b = this.map.get(storageKey);
    if (!b) throw new AttachmentStorageNotFoundError('Not found in memory storage');
    return b;
  }

  async remove(companyId: string, storageKey: string): Promise<void> {
    this.map.delete(storageKey);
  }

  async exists(companyId: string, storageKey: string): Promise<boolean> {
    return this.map.has(storageKey);
  }
}

const memoryStorage = new MemoryAttachmentStorage();

// Seed baseline company and vehicle
const TEST_COMPANY_ID = 'company-ph055-01';
const TEST_VEHICLE_ID = 'veh-ph055-01';
const TEST_USER_ID = 'user-ph055-marcos';

await db.execute(sql`
  INSERT INTO companies (id, name)
  VALUES (${TEST_COMPANY_ID}, 'Movida e MoveFlex Locações')
  ON CONFLICT (id) DO NOTHING;
`);

await db.execute(sql`
  INSERT INTO vehicles (id, company_id, plate, renavam, model, status, is_archived)
  VALUES (${TEST_VEHICLE_ID}, ${TEST_COMPANY_ID}, 'ABC1D23', '98765432100', 'Hyundai HB20 1.0 Flex', 'DISPONIVEL', false)
  ON CONFLICT (id) DO NOTHING;
`);

// Setup Express application
const app = express();
app.use((req: Request, res: ExpressResponse, next: NextFunction) => {
  (req as any).principal = {
    userId: TEST_USER_ID,
    name: 'Marcos Paulo Biagioni',
    companyId: TEST_COMPANY_ID,
    role: 'ADMIN',
    permissions: ['*'],
  };
  next();
});

registerAttachmentRoutes(app, memoryStorage);

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const baseUrl = `http://127.0.0.1:${port}`;
console.log(`✓ Real Express integration server running on port ${port}.`);

try {
  // Helper to generate minimal valid binary file payloads
  function createPdfPayload(label: string): Buffer {
    return Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'ascii'),
      Buffer.from(`\n% ${label} - Generated for PH-055 vehicle document test\n`, 'utf8'),
    ]);
  }

  function createMp4Payload(sizeBytes: number): Buffer {
    const header = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]); // ftypmp42
    const padding = Buffer.alloc(Math.max(0, sizeBytes - header.length));
    return Buffer.concat([header, padding]);
  }

  function createJpegPayload(): Buffer {
    return Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c,
      0xff, 0xd9,
    ]);
  }

  // ============================================================================
  // 5.1 Real HTTP Upload of 1 file for each of the 11 Canonical Types + OUTROS
  // ============================================================================
  console.log('Uploading 1 real document per canonical type via HTTP POST /api/attachments...');

  interface UploadSpec {
    docType: string;
    fileName: string;
    mimeType: string;
    payload: Buffer;
    expectedFolderKey: string;
  }

  const uploadSpecs: UploadSpec[] = [
    {
      docType: 'CRLV',
      fileName: 'crlv_exercicio_2026.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('CRLV Oficial 2026'),
      expectedFolderKey: 'crlv',
    },
    {
      docType: 'VISTORIA',
      fileName: 'vistoria_detran_sp.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('Laudo Vistoria Detran'),
      expectedFolderKey: 'vistoria',
    },
    {
      docType: 'VISTORIA_CAUTELAR',
      fileName: 'laudo_cautelar_dekra_aprovado.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('Vistoria Cautelar Estrutural'),
      expectedFolderKey: 'vistoria_cautelar',
    },
    {
      docType: 'CHECKLIST',
      fileName: 'video_checklist_entrega_marcos.mp4',
      mimeType: 'video/mp4',
      payload: createMp4Payload(5 * 1024 * 1024), // 5MB video (permitted for checklist)
      expectedFolderKey: 'checklist',
    },
    {
      docType: 'NOTA_FISCAL_ENTRADA',
      fileName: 'danfe_nf_entrada_concessionaria.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('Nota Fiscal Entrada'),
      expectedFolderKey: 'nf_entrada',
    },
    {
      docType: 'NOTA_FISCAL_SAIDA',
      fileName: 'danfe_nf_saida_desmobilizacao.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('Nota Fiscal Saída'),
      expectedFolderKey: 'nf_saida',
    },
    {
      docType: 'ATPV',
      fileName: 'atpv_recibo_transferencia.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('Autorização Transferência ATPV'),
      expectedFolderKey: 'atpv',
    },
    {
      docType: 'RASTREADOR',
      fileName: 'termo_comodato_rastreador_sascar.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('Rastreador Sascar Instalado'),
      expectedFolderKey: 'rastreador',
    },
    {
      docType: 'APOLICE_SEGURO',
      fileName: 'apolice_frota_porto_seguro_2026.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('Apólice Seguro Frota'),
      expectedFolderKey: 'apolice_seguro',
    },
    {
      docType: 'NOTA_FISCAL_PECAS',
      fileName: 'nf_compra_quatro_pneus_aro15.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('NF Peças de Reposição'),
      expectedFolderKey: 'nf_pecas',
    },
    {
      docType: 'NOTA_FISCAL_SERVICO',
      fileName: 'nf_servico_revisao_suspensao_freios.pdf',
      mimeType: 'application/pdf',
      payload: createPdfPayload('NF Serviço Oficina'),
      expectedFolderKey: 'nf_servico',
    },
    {
      docType: 'OUTROS',
      fileName: 'manual_fabricante_veiculo.jpg',
      mimeType: 'image/jpeg',
      payload: createJpegPayload(),
      expectedFolderKey: 'outros',
    },
  ];

  const uploadedIds: string[] = [];

  for (const spec of uploadSpecs) {
    const res = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: {
        'content-type': spec.mimeType,
        'x-autoerp-entity-type': 'Vehicle',
        'x-autoerp-entity-id': TEST_VEHICLE_ID,
        'x-autoerp-document-type': spec.docType,
        'x-autoerp-file-name': spec.fileName,
        'x-autoerp-description': `PH-055 fixture for ${spec.docType}`,
      },
      body: spec.payload,
    });

    assert.equal(res.status, 201, `Upload of ${spec.docType} (${spec.fileName}) must return HTTP 201 Created. Got: ${res.status}`);
    const json: any = await res.json();
    assert.ok(json.item?.id, `Upload of ${spec.docType} must return created item with id`);
    assert.equal(json.item.documentType, spec.docType);
    assert.equal(json.item.fileName, spec.fileName);
    assert.equal(json.item.contentState, 'AVAILABLE');
    uploadedIds.push(json.item.id);
  }

  console.log(`✓ All 12 canonical documents uploaded successfully via HTTP (IDs: ${uploadedIds.length}).`);

  // ============================================================================
  // 5.2 Size Limit Enforcement: 413 for oversized documents & videos
  // ============================================================================
  console.log('Testing size limit rejections (10MB for PDFs, 50MB for video/mp4)...');

  // Test 1: PDF exceeding 10MB (11MB) must fail with 413
  const oversizedPdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'ascii'),
    Buffer.alloc(11 * 1024 * 1024),
    Buffer.from('\n%%EOF\n', 'ascii'),
  ]);
  const resOversizedPdf = await fetch(`${baseUrl}/api/attachments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'x-autoerp-entity-type': 'Vehicle',
      'x-autoerp-entity-id': TEST_VEHICLE_ID,
      'x-autoerp-document-type': 'CRLV',
      'x-autoerp-file-name': 'crlv_gigante_invalido.pdf',
    },
    body: oversizedPdf,
  });
  assert.equal(resOversizedPdf.status, 413, 'PDF exceeding 10MB must be rejected with HTTP 413');

  // Test 2: Video exceeding 50MB (52MB) must fail with 413
  const oversizedVideo = createMp4Payload(52 * 1024 * 1024);
  const resOversizedVideo = await fetch(`${baseUrl}/api/attachments`, {
    method: 'POST',
    headers: {
      'content-type': 'video/mp4',
      'x-autoerp-entity-type': 'Vehicle',
      'x-autoerp-entity-id': TEST_VEHICLE_ID,
      'x-autoerp-document-type': 'CHECKLIST',
      'x-autoerp-file-name': 'checklist_gigante_invalido.mp4',
    },
    body: oversizedVideo,
  });
  assert.equal(resOversizedVideo.status, 413, 'Video exceeding 50MB must be rejected with HTTP 413');

  console.log('✓ Size limits strictly enforced by Express raw body limits (413 Payload Too Large verified).');

  // ============================================================================
  // 5.3 Database SQL Audit: Confirm all 12 rows are physically stored in PGlite
  // ============================================================================
  console.log('Executing direct SQL audit on PGlite database...');

  const dbAuditResult: any = await db.execute(sql`
    SELECT count(*)::int as total
    FROM file_attachments
    WHERE company_id = ${TEST_COMPANY_ID}
      AND entity_id = ${TEST_VEHICLE_ID}
      AND is_archived = false;
  `);

  const totalPersisted = dbAuditResult.rows?.[0]?.total;
  assert.equal(totalPersisted, 12, `Database must contain exactly 12 persisted attachments for vehicle. Found: ${totalPersisted}`);

  const typesQuery: any = await db.execute(sql`
    SELECT document_type, count(*)::int as count
    FROM file_attachments
    WHERE company_id = ${TEST_COMPANY_ID}
      AND entity_id = ${TEST_VEHICLE_ID}
    GROUP BY document_type
    ORDER BY document_type;
  `);

  const persistedTypes = new Set(typesQuery.rows.map((r: any) => r.document_type));
  for (const spec of uploadSpecs) {
    assert.ok(persistedTypes.has(spec.docType), `SQL database must have stored document_type "${spec.docType}"`);
  }
  console.log(`✓ SQL database audit confirmed 12 distinct rows across all expected document types.`);

  // ============================================================================
  // 5.4 Reloading / Fetching Attachments via API and Grouping into Folders
  // ============================================================================
  console.log('Testing GET /api/attachments?entityType=Vehicle and folder classification...');

  const fetchRes = await fetch(`${baseUrl}/api/attachments?entityType=Vehicle&entityId=${TEST_VEHICLE_ID}`);
  assert.equal(fetchRes.status, 200, 'GET /api/attachments must return HTTP 200');
  const fetchData: any = await fetchRes.json();
  assert.ok(Array.isArray(fetchData.items), 'Response must contain items array');
  assert.equal(fetchData.items.length, 12, 'Must return all 12 attachments for this vehicle');

  // Group returned API items using official folder mapping
  const serverGrouped = groupAttachmentsIntoVehicleFolders(fetchData.items);

  for (const spec of uploadSpecs) {
    const folder = serverGrouped[spec.expectedFolderKey];
    assert.ok(folder, `Folder "${spec.expectedFolderKey}" must exist in grouped results`);
    assert.equal(
      folder.items.length,
      1,
      `Folder "${spec.expectedFolderKey}" must contain exactly 1 document. Found: ${folder.items.length}`
    );
    assert.equal(
      folder.items[0].documentType,
      spec.docType,
      `Folder "${spec.expectedFolderKey}" item must have documentType "${spec.docType}"`
    );
  }

  // Ensure Checklist contains the video file and retains video metadata
  const serverChecklist = serverGrouped['checklist'].items[0];
  assert.equal(serverChecklist.mimeType, 'video/mp4');
  assert.ok(serverChecklist.fileSize > 0, 'Checklist video must have valid positive fileSize');

  console.log('✓ All 12 folders successfully classified with exactly 1 item each.');

  // ============================================================================
  // 5.5 Content Download: Verify storage retrieval works end-to-end
  // ============================================================================
  console.log('Verifying content download for checklist video and CRLV PDF...');

  const checklistAttachmentId = serverChecklist.id;
  const contentRes = await fetch(`${baseUrl}/api/attachments/${checklistAttachmentId}/content`);
  assert.equal(contentRes.status, 200, 'GET /api/attachments/:id/content must return HTTP 200');
  assert.equal(contentRes.headers.get('content-type'), 'video/mp4');
  const downloadedVideoBuffer = Buffer.from(await contentRes.arrayBuffer());
  assert.equal(downloadedVideoBuffer.length, 5 * 1024 * 1024, 'Downloaded video must have exact 5MB length');
  assert.equal(downloadedVideoBuffer.subarray(4, 8).toString('ascii'), 'ftyp', 'Downloaded video must have valid MP4 signature');

  console.log('✓ Content download verified with exact byte integrity.');

} finally {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log('--- ALL PH-055 REAL INTEGRATION & REGRESSION TESTS PASSED (100% GREEN) ---');
process.exit(0);
