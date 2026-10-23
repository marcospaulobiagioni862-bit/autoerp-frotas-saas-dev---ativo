import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildResidenceDraftFromExtraction, resolveResidenceDraft, type DriverResidenceDraft } from '../../../api/driverResidencePrefill';
import type { DocumentAiExtraction } from '../../../api/documentAiClient';
import type { FileAttachment } from '../../../types/entities';

const formSource = readFileSync(new URL('../DriverFormModal.tsx', import.meta.url), 'utf8');
const detailsSource = readFileSync(new URL('../DriverDetailsModal.tsx', import.meta.url), 'utf8');
const managementSource = readFileSync(new URL('../DriversManagement.tsx', import.meta.url), 'utf8');
const prefillBtnSource = readFileSync(new URL('../DriverResidencePrefillButton.tsx', import.meta.url), 'utf8');

// 1. Static AST / Code Assertions for PH-090
console.log('--- 1. Checking DriverFormModal for complete driver editing ---');

// Photo section must be visible during edit (no !driverToEdit guard hiding it)
assert.doesNotMatch(
  formSource,
  /!driverToEdit\s*&&\s*<div[^>]*>[\s\S]*?Foto do motorista \(opcional\)/,
  'Photo section must not be hidden behind !driverToEdit guard',
);
assert.match(
  formSource,
  /Foto do motorista \(opcional\)[\s\S]*?profilePhotoPreviewUrl\s*\|\|\s*existingPhotoUrl/,
  'Photo section must support existing photo and new selection previews',
);

// Section 4 (Saúde e Contato de Emergência) must be rendered on edit
assert.match(
  formSource,
  /\(requiresCompleteProfile\s*\|\|\s*!*!*driverToEdit\)\s*&&\s*<div[^>]*>[\s\S]*?4\.\s*Saúde e Contato de Emergência/,
  'Section 4 (Saúde e Contato de Emergência) must be visible when editing an existing driver',
);

// Loading previous health data via DriverHealthClient
assert.match(
  formSource,
  /DriverHealthClient\.get\(driverToEdit\.id\)/,
  'DriverFormModal must load prior health data on edit using DriverHealthClient.get',
);

// Persisting health data on edit
assert.match(
  formSource,
  /driverToEdit\s*&&\s*hasHealthData/,
  'DriverFormModal must construct and send health payload when editing existing driver',
);

// Section 3 (Endereço) must have DriverResidencePrefillButton
assert.match(
  formSource,
  /<DriverResidencePrefillButton\s+driverId=\{driverToEdit\.id\}\s+onApply=\{applyResidenceDraft\}\s*\/>/,
  'Section 3 must render DriverResidencePrefillButton for existing drivers',
);

console.log('--- 2. Checking DriverDetailsModal & DriversManagement header button ---');
assert.match(
  detailsSource,
  /id="btn-edit-driver-details"/,
  'DriverDetailsModal must render an explicit Editar Cadastro button with id btn-edit-driver-details',
);
assert.match(
  detailsSource,
  /onEditDriver\s*&&\s*\([\s\S]*?onClick=\{\(\)\s*=>\s*onEditDriver\(driver\)\}/,
  'Editar Cadastro button must trigger onEditDriver with the loaded driver entity',
);
assert.match(
  managementSource,
  /onEditDriver=\{handleOpenEditFromDetails\}/,
  'DriversManagement must link DriverDetailsModal to handleOpenEditFromDetails',
);

console.log('--- 3. Testing Address Draft Extraction from Residence Proof ---');
const dummyExtraction: DocumentAiExtraction = {
  id: 'ext-res-1',
  companyId: 'comp-1',
  attachmentId: 'att-res-1',
  attachmentChecksum: 'abc',
  status: 'APPROVED',
  requestedBy: 'user-1',
  attemptCount: 1,
  failureCode: null,
  provider: 'GEMINI',
  model: 'gemini-1.5-flash',
  modelVersion: '1',
  detectedDocumentType: 'RESIDENCE_PROOF',
  proposedFields: {
    cep: '18075-350',
    logradouro: 'Avenida Brasil',
    numero: '1234',
    complemento: 'Apto 42',
    bairro: 'Jardim América',
    cidade: 'Sorocaba',
    uf: 'SP',
    tipoResidencia: 'APARTMENT',
  },
  fieldConfidence: {},
  reviewedBy: 'reviewer-1',
  reviewedAt: '2026-10-22T20:00:00Z',
  corrections: null,
  reviewNotes: null,
  approvedAt: '2026-10-22T20:00:00Z',
  createdAt: '2026-10-22T19:50:00Z',
  updatedAt: '2026-10-22T20:00:00Z',
};

const extractedDraft = buildResidenceDraftFromExtraction(dummyExtraction);
assert.ok(extractedDraft, 'Draft must be successfully created from extraction');
assert.equal(extractedDraft.zipCode, '18075350');
assert.equal(extractedDraft.street, 'Avenida Brasil');
assert.equal(extractedDraft.number, '1234');
assert.equal(extractedDraft.complement, 'Apto 42');
assert.equal(extractedDraft.neighborhood, 'Jardim América');
assert.equal(extractedDraft.city, 'Sorocaba');
assert.equal(extractedDraft.state, 'SP');
assert.equal(extractedDraft.residenceType, 'APARTMENT');

const dummyAttachments: FileAttachment[] = [
  {
    id: 'att-res-1',
    companyId: 'comp-1',
    entityType: 'Driver',
    entityId: 'drv-1',
    documentType: 'Comprovante de Residência',
    fileName: 'comprovante_conta_luz.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storageKey: 'key-1',
    isArchived: false,
    createdAt: '2026-10-22T19:40:00Z',
  },
];

const resolved = await resolveResidenceDraft([dummyExtraction], dummyAttachments);
assert.ok(resolved, 'resolveResidenceDraft must find matching residence attachment and draft');
assert.equal(resolved.street, 'Avenida Brasil');
assert.equal(resolved.city, 'Sorocaba');

console.log('--- 4. Mutation Testing: Invariant Failures ---');
const mutatedMissingBtn = detailsSource.replace(/id="btn-edit-driver-details"/, '');
assert.throws(() => {
  assert.match(mutatedMissingBtn, /id="btn-edit-driver-details"/);
}, /AssertionError/);

const mutatedHiddenHealth = formSource.replace(/requiresCompleteProfile \|\| !*!*driverToEdit/, 'requiresCompleteProfile');
assert.throws(() => {
  assert.match(mutatedHiddenHealth, /\(requiresCompleteProfile\s*\|\|\s*!*!*driverToEdit\)\s*&&\s*<div[^>]*>[\s\S]*?4\.\s*Saúde e Contato de Emergência/);
}, /AssertionError/);

console.log('Driver edit complete profile regression (PH-090): PASS');
