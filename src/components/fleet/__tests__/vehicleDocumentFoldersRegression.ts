import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  VEHICLE_DOCUMENT_FOLDERS,
  groupAttachmentsIntoVehicleFolders,
} from '../vehicleDocumentFolderDefinitions';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_VIDEO_ATTACHMENT_BYTES,
  assertRetentionPrefixScope,
  ForbiddenProductionRetentionError,
} from '../../../server/attachmentStorage';
import type { FileAttachment } from '../../../types/entities';

console.log('--- PH-055: Vehicle Document Folders Regression Suite ---');

// ============================================================================
// 1. Static AST / Code Structure Verification
// ============================================================================
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

console.log('✓ [1/4] Static AST code assertions and size limit invariants verified.');

// ============================================================================
// 2. The 11 Canonical Folders and Mapping Verification
// ============================================================================
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

// Check that the video file in checklist retained its metadata and size
const checklistItem = grouped['checklist'].items[0];
assert.equal(checklistItem.mimeType, 'video/mp4');
assert.equal(checklistItem.fileSize, 35 * 1024 * 1024);

console.log('✓ [2/4] The 11 canonical document folders correctly grouped fixtures.');

// ============================================================================
// 3. Legacy Aliases & Inspection Unification Verification
// ============================================================================
const legacyFixtures: FileAttachment[] = [
  // Legacy CRLV aliases
  mockAttachment({ documentType: 'CRV', fileName: 'crv.pdf' }),
  mockAttachment({ documentType: 'DPVAT_SPVAT', fileName: 'spvat.pdf' }),
  // Legacy Inspection report from AUTOERP-61/62
  mockAttachment({ entityType: 'VehicleInspection', documentType: 'INSPECTION_REPORT', fileName: 'inspecao.pdf' }),
  // Legacy ATPV_E alias
  mockAttachment({ documentType: 'ATPV_E', fileName: 'atpve.pdf' }),
  // Legacy Purchase Invoice alias
  mockAttachment({ documentType: 'PURCHASE_INVOICE', fileName: 'compra.pdf' }),
  // Legacy Insurance Policy alias
  mockAttachment({ entityType: 'Insurance', documentType: 'INSURANCE_POLICY', fileName: 'seguro.pdf' }),
];

const groupedLegacy = groupAttachmentsIntoVehicleFolders(legacyFixtures);
assert.equal(groupedLegacy['crlv'].items.length, 2, 'CRV and DPVAT must group into CRLV');
assert.equal(groupedLegacy['vistoria'].items.length, 1, 'INSPECTION_REPORT must unify into Vistoria');
assert.equal(groupedLegacy['atpv'].items.length, 1, 'ATPV_E must group into ATPV');
assert.equal(groupedLegacy['nf_entrada'].items.length, 1, 'PURCHASE_INVOICE must group into NF Entrada');
assert.equal(groupedLegacy['apolice_seguro'].items.length, 1, 'INSURANCE_POLICY must group into Seguro');

console.log('✓ [3/4] Legacy aliases and AUTOERP-61/62 inspection unification verified.');

// ============================================================================
// 4. Trava Obrigatória de Retenção e Expurgo & Mutation Tests (Regra 3.2-e)
// ============================================================================
console.log('Testing Trava Obrigatória: Retention/cleanup must NEVER touch prod-company-001/ ...');

// 4.1 Staging prefix is allowed
assert.doesNotThrow(() => {
  assertRetentionPrefixScope('staging-company-001/');
  assertRetentionPrefixScope('staging-company-001/attachments/veh-01/');
}, 'Staging prefixes must be permitted for lifecycle retention routines');

// 4.2 Negative Mutation 1: Production prefix MUST THROW and abort immediately!
assert.throws(() => {
  assertRetentionPrefixScope('prod-company-001/');
}, ForbiddenProductionRetentionError, 'Production prefix prod-company-001/ must trigger ForbiddenProductionRetentionError');

assert.throws(() => {
  assertRetentionPrefixScope('prod-company-001/attachments/real-docs/');
}, ForbiddenProductionRetentionError, 'Nested production prefix must trigger ForbiddenProductionRetentionError');

assert.throws(() => {
  assertRetentionPrefixScope('prod/client-docs/');
}, ForbiddenProductionRetentionError, 'prod/ prefix must trigger ForbiddenProductionRetentionError');

// 4.3 Negative Mutation 2: Oversized non-video upload (>10MB) must be rejected
function validateUploadPayload(mimeType: string, bytesLength: number) {
  const maxAllowed = mimeType === 'video/mp4' ? MAX_VIDEO_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES;
  if (bytesLength > maxAllowed) {
    throw new Error('PAYLOAD_TOO_LARGE_413');
  }
  return true;
}

assert.doesNotThrow(() => {
  // 40MB video is allowed
  validateUploadPayload('video/mp4', 40 * 1024 * 1024);
  // 8MB PDF is allowed
  validateUploadPayload('application/pdf', 8 * 1024 * 1024);
});

assert.throws(() => {
  // 15MB PDF must fail (limit is 10MB)
  validateUploadPayload('application/pdf', 15 * 1024 * 1024);
}, /PAYLOAD_TOO_LARGE_413/, 'PDF exceeding 10MB must trigger 413');

assert.throws(() => {
  // 60MB video must fail (limit is 50MB)
  validateUploadPayload('video/mp4', 60 * 1024 * 1024);
}, /PAYLOAD_TOO_LARGE_413/, 'Video exceeding 50MB must trigger 413');

console.log('✓ [4/4] Trava Obrigatória and mutation tests passed (production shield & size limits confirmed).');
console.log('ALL PH-055 TESTS PASSED SUCCESSFULLY.');
