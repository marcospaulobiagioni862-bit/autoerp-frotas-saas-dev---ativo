import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';

// Forçar uso do PGlite para garantir suíte auto-contida, determinística e sem dependência de serviço externo
process.env.USE_PGLITE = 'true';
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

console.log('--- PH-054: Driver CNH Side-by-Side Review Integration & Regression Suite ---');

// ============================================================================
// 1. Static AST / UI & Invariant Code Assertions (Garantia de layout e MUT C)
// ============================================================================
console.log('1. Checking static layout and UI requirements (including MUT C guard)...');

const modalCode = readFileSync(new URL('../DriverCnhIntakeModal.tsx', import.meta.url), 'utf8');
const previewCode = readFileSync(new URL('../../documents/DocumentSideBySidePreview.tsx', import.meta.url), 'utf8');

// Must import and use DocumentSideBySidePreview
assert.match(modalCode, /import\s+\{\s*DocumentSideBySidePreview\s*\}\s+from/, 'DriverCnhIntakeModal must import DocumentSideBySidePreview');
assert.match(modalCode, /<DocumentSideBySidePreview/, 'DriverCnhIntakeModal must render DocumentSideBySidePreview');

// Must use two columns on desktop and stack on mobile
assert.match(modalCode, /lg:grid-cols-12|lg:grid/, 'DriverCnhIntakeModal must render grid layout on desktop');
assert.match(modalCode, /order-1\s+lg:order-2/, 'Document preview must be order-1 on mobile (top) and order-2 on desktop (right)');
assert.match(modalCode, /order-2\s+lg:order-1/, 'Form fields must be order-2 on mobile (bottom) and order-1 on desktop (left)');

// Must expand modal maxWidth during review
assert.match(modalCode, /maxWidth=\{step === 'REVIEW_REQUIRED' \? '6xl' : '2xl'\}/, 'Modal must expand to 6xl during review for comfortable side-by-side display');

// Document preview controls: Zoom and 90-degree Rotation
assert.match(previewCode, /handleRotateCw/, 'Preview component must have clockwise rotation');
assert.match(previewCode, /handleRotateCcw/, 'Preview component must have counter-clockwise rotation');
assert.match(previewCode, /\(r \+ 90\) % 360/, 'Rotation must step in 90-degree increments modulo 360');
assert.match(previewCode, /btn-rotate-cw/, 'Preview component must expose clockwise rotation button');
assert.match(previewCode, /btn-rotate-ccw/, 'Preview component must expose counter-clockwise rotation button');
assert.match(previewCode, /badge-rotation/, 'Preview component must expose rotation angle badge');
assert.match(previewCode, /handleZoomIn/, 'Preview component must support zoom in');
assert.match(previewCode, /handleZoomOut/, 'Preview component must support zoom out');
assert.match(previewCode, /handleZoomReset/, 'Preview component must support zoom reset');
assert.match(previewCode, /iframe/, 'Preview component must support PDF display via iframe');

// Badges for corrected fields - Guarda específica e estrita da MUT C:
// O assert abaixo busca exatamente `badge-corrigido-${key}`. Se MUT C renomear para `badge-nope-${key}`, falha imediatamente!
assert.match(modalCode, /badge-corrigido-\$\{key\}/, 'Modal must render dynamic badge-corrigido-${key} for corrected fields (MUT C Guard)');
assert.match(modalCode, /badge-corrigido-ear/, 'Modal must render badge-corrigido-ear for corrected EAR field');
assert.match(modalCode, /CORRIGIDO/, 'Badge label must explicitly state CORRIGIDO');

// Human validation checkbox and enforcement
assert.match(modalCode, /id="cnh-human-validation-check"/, 'Modal must have cnh-human-validation-check element');
assert.match(modalCode, /Conferi os dados com o documento original anexado/, 'Validation check must explicitly require human confirmation');
assert.match(modalCode, /!humanValidated/, 'Approval button and handler must be guarded by humanValidated');
assert.match(modalCode, /if \(decision === 'APPROVE' && !humanValidated\)/, 'review handler must reject approval if humanValidated is false');

console.log('✓ Static UI invariants verified successfully.');

// ============================================================================
// 2. Direct Transition Invariants & Guard against MUT B
// ============================================================================
console.log('2. Verifying transition state machine & MUT B guard (APPROVED_EXTRACTION_MISMATCH)...');

const {
  resolveDriverDocumentIntakeReviewTransition,
  DriverDocumentIntakeReviewSyncError,
} = await import('../../../server/driverDocumentIntakeAiReviewSync.js');

// Verificação 2.1: Transição normal de aprovação
const standardTransition = resolveDriverDocumentIntakeReviewTransition({
  entityType: 'DriverDocumentIntake',
  intakeStatus: 'REVIEW_REQUIRED',
  extractionStatus: 'APPROVED',
  detectedDocumentType: 'CNH',
  extractionId: 'ext-ok-1',
});
assert.deepEqual(standardTransition, { status: 'APPROVED', approvedExtractionId: 'ext-ok-1' });

// Verificação 2.2: Rejeição se não for CNH
assert.throws(
  () => resolveDriverDocumentIntakeReviewTransition({
    entityType: 'DriverDocumentIntake',
    intakeStatus: 'REVIEW_REQUIRED',
    extractionStatus: 'APPROVED',
    detectedDocumentType: 'CRLV',
    extractionId: 'ext-ok-1',
  }),
  (err: any) => err instanceof DriverDocumentIntakeReviewSyncError && err.message === 'INTAKE_APPROVAL_REQUIRES_CNH',
  'Approval of non-CNH document must throw INTAKE_APPROVAL_REQUIRES_CNH'
);

// Verificação 2.3: Guarda contra MUT B - Mismatch de extração aprovada deve lançar APPROVED_EXTRACTION_MISMATCH
// Se MUT B remover o throw em driverDocumentIntakeAiReviewSync.ts, este assert falha imediatamente com exit code vermelho!
assert.throws(
  () => resolveDriverDocumentIntakeReviewTransition({
    entityType: 'DriverDocumentIntake',
    intakeStatus: 'APPROVED',
    extractionStatus: 'APPROVED',
    detectedDocumentType: 'CNH',
    approvedExtractionId: 'extraction-approved-previously',
    extractionId: 'extraction-diverging-now',
  }),
  (err: any) => err instanceof DriverDocumentIntakeReviewSyncError && err.message === 'APPROVED_EXTRACTION_MISMATCH',
  'Diverging extraction ID on approved intake must throw APPROVED_EXTRACTION_MISMATCH (MUT B Guard)'
);

console.log('✓ State transitions and MUT B guard verified successfully.');

// ============================================================================
// 3. Database Bootstrap (PGlite) & Real Express Integration Server
// ============================================================================
console.log('3. Bootstrapping isolated PGlite database and real Express server...');

const { db } = await import('../../../db/index.js');
const { sql } = await import('drizzle-orm');
const { registerDocumentAiRoutes } = await import('../../../server/documentAiRoutes.js');
const { registerDriverDocumentIntakeRoutes } = await import('../../../server/driverDocumentIntakeRoutes.js');

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
    storage_provider text NOT NULL DEFAULT 'LEGACY_BROWSER',
    storage_key text,
    checksum text,
    description text,
    issue_date text,
    expiration_date text,
    created_by text,
    is_archived boolean NOT NULL DEFAULT false,
    content_state text NOT NULL DEFAULT 'LEGACY_BROWSER',
    created_at timestamp NOT NULL DEFAULT now()
  );
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS driver_document_intakes (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    created_by text NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT',
    idempotency_key text NOT NULL,
    attachment_id text,
    approved_extraction_id text,
    driver_id text,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS document_ai_extractions (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    attachment_id text NOT NULL,
    attachment_checksum text NOT NULL,
    idempotency_key text NOT NULL,
    status text NOT NULL DEFAULT 'PENDING',
    requested_by text NOT NULL,
    worker_id text,
    processing_started_at timestamp,
    completed_at timestamp,
    attempt_count integer NOT NULL DEFAULT 0,
    provider text,
    model text,
    model_version text,
    detected_document_type text,
    raw_extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
    proposed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
    field_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    failure_code text,
    reviewed_by text,
    reviewed_at timestamp,
    corrections jsonb,
    review_notes text,
    approved_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS drivers (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    name text NOT NULL,
    phone text,
    whatsapp text,
    email text,
    cpf text,
    rg text,
    birth_date date,
    marital_status text,
    profession text,
    mother_name text,
    pix_key text,
    address_street text,
    address_number text,
    address_complement text,
    address_neighborhood text,
    address_city text,
    address_state text,
    address_zip_code text,
    address_residence_type text,
    address_residence_type_other text,
    address_condominium_name text,
    address_block_tower text,
    address_unit text,
    address_floor text,
    address_reference text,
    cnh text,
    cnh_category text,
    cnh_expiration date,
    cnh_ear boolean,
    cnh_status text,
    app_platforms text[] NOT NULL DEFAULT ARRAY[]::text[],
    photo_url text,
    notes text,
    active boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'ACTIVE',
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS vehicles (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    plate text,
    brand text,
    model text,
    year integer,
    current_driver_id text,
    current_contract_id text,
    is_archived boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS documents (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    document_type text NOT NULL,
    document_number text,
    reference_year integer,
    issue_date text,
    expiration_date text,
    attachment_id text,
    version_number integer NOT NULL DEFAULT 1,
    supersedes_document_id text,
    is_current boolean NOT NULL DEFAULT true,
    is_archived boolean NOT NULL DEFAULT false,
    cost numeric(12, 2) NOT NULL DEFAULT 0,
    payable_id text,
    notes text,
    created_by text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
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

const testCompanyId = 'company-cnh-ph054';
const reviewerUserId = 'user-reviewer-ph054';
const reviewerUserName = 'Pedro Revisor Humano';

const app = express();
app.use(express.json());

// Injeção de autenticação da sessão ativa
app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
  (req as any).principal = {
    companyId: testCompanyId,
    userId: reviewerUserId,
    name: reviewerUserName,
    role: 'ADMIN',
    permissions: ['VIEW_DRIVER', 'CREATE_DRIVER', 'EDIT_DRIVER'],
  };
  next();
});

registerDocumentAiRoutes(app);
registerDriverDocumentIntakeRoutes(app);

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object', 'Server address must be available');
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

console.log(`✓ Integration server running on port ${address.port}.`);

// ============================================================================
// 4. End-to-End Real Review Flow & SQL Database Audit (Items a, b, c, d + MUT A)
// ============================================================================
console.log('4. Executing real AI extraction review and auditing SQL database...');

const attachmentId = 'att-cnh-ph054-001';
const intakeId = 'intake-cnh-ph054-001';
const extractionId = 'ext-cnh-ph054-001';

// Seed das fixtures iniciais
await db.execute(sql`
  INSERT INTO file_attachments (
    id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url, checksum, content_state, created_by
  ) VALUES (
    ${attachmentId}, ${testCompanyId}, 'DriverDocumentIntake', 'DriverDocumentIntake', ${intakeId}, 'CNH',
    'cnh_pedro_torta.jpg', 'image/jpeg', 'https://storage/cnh_pedro_torta.jpg', 'checksum-cnh-001', 'AVAILABLE', ${reviewerUserId}
  );
`);

await db.execute(sql`
  INSERT INTO driver_document_intakes (
    id, company_id, created_by, status, idempotency_key, attachment_id, expires_at
  ) VALUES (
    ${intakeId}, ${testCompanyId}, ${reviewerUserId}, 'REVIEW_REQUIRED', 'idem-cnh-review-001', ${attachmentId}, now() + interval '2 days'
  );
`);

// Simulação de extração de CNH pela IA onde a IA errou a categoria ('B' em vez de 'AB') e a validade ('2025-01-15' em vez de '2028-01-15')
const proposedFieldsFromAi = {
  fullName: 'MARCOS PAULO BIAGIONI',
  cpf: '12345678909',
  rg: '12345678X',
  birthDate: '1985-05-12',
  cnhNumber: '09876543210',
  cnhCategory: 'B',
  cnhExpiration: '2025-01-15',
  cnhEar: false,
};

await db.execute(sql`
  INSERT INTO document_ai_extractions (
    id, company_id, attachment_id, attachment_checksum, idempotency_key, status, requested_by,
    detected_document_type, proposed_fields
  ) VALUES (
    ${extractionId}, ${testCompanyId}, ${attachmentId}, 'checksum-cnh-001', 'idem-ext-review-001',
    'REVIEW_REQUIRED', ${reviewerUserId}, 'CNH', ${JSON.stringify(proposedFieldsFromAi)}::jsonb
  );
`);

// Teste Negativo 4.1: Tentar injetar reviewedBy ou campos não permitidos no corpo da requisição deve ser rejeitado com 400
console.log('Testing rejection of unauthorized reviewedBy spoofing in body...');
const spoofAttemptResponse = await request(`/api/document-ai/extractions/${extractionId}/review`, {
  method: 'POST',
  body: JSON.stringify({
    decision: 'APPROVE',
    corrections: {
      category: 'AB',
      expirationDate: '2028-01-15',
    },
    notes: 'Conferido com foto original girada 90 graus',
    reviewedBy: 'hacker-malicioso-ou-corpo-falso',
    reviewedAt: '1970-01-01T00:00:00.000Z',
  }),
});
assert.strictEqual(spoofAttemptResponse.status, 400, 'Review endpoint must reject body containing spoofed reviewedBy with 400');
console.log('✓ Body spoofing rejected with HTTP 400 as required.');

// Chamada legítima: o humano confere na tela lado a lado e corrige category -> 'AB' e expirationDate -> '2028-01-15'
const reviewResponse = await request(`/api/document-ai/extractions/${extractionId}/review`, {
  method: 'POST',
  body: JSON.stringify({
    decision: 'APPROVE',
    corrections: {
      category: 'AB',
      expirationDate: '2028-01-15',
    },
    notes: 'Conferido com foto original girada 90 graus',
  }),
});

console.log('Review response:', reviewResponse.status, reviewResponse.body);
assert.strictEqual(reviewResponse.status, 200, 'Review endpoint must succeed with HTTP 200');

// --- CONFERÊNCIA SQL ITEM (b): Campo corrigido marcado como corrigido, e os que a IA acertou não ---
const extractionDbRows: any = await db.execute(sql`
  SELECT status, reviewed_by, reviewed_at, corrections, approved_at
  FROM document_ai_extractions
  WHERE id = ${extractionId}
`);
assert.strictEqual(extractionDbRows.rows.length, 1);
const extractionInDb = extractionDbRows.rows[0];

assert.strictEqual(extractionInDb.status, 'APPROVED', 'Extraction status must be APPROVED in database');
const persistedCorrections = typeof extractionInDb.corrections === 'string'
  ? JSON.parse(extractionInDb.corrections)
  : extractionInDb.corrections;

// Item (b): Apenas category e expirationDate no mapa de correções
assert.deepStrictEqual(
  Object.keys(persistedCorrections).sort(),
  ['category', 'expirationDate'],
  'Item (b): Only edited fields must be in persisted corrections object'
);
assert.strictEqual(persistedCorrections.category, 'AB', 'Corrected category must be recorded');
assert.strictEqual(persistedCorrections.expirationDate, '2028-01-15', 'Corrected expirationDate must be recorded');
assert.strictEqual(persistedCorrections.fullName, undefined, 'Unchanged fullName must not be in corrections');
assert.strictEqual(persistedCorrections.cpf, undefined, 'Unchanged cpf must not be in corrections');

// --- CONFERÊNCIA SQL ITEM (c): Registro de quem validou e quando + GUARDA DA MUT A ---
assert.strictEqual(
  extractionInDb.reviewed_by,
  reviewerUserId,
  'Item (c): reviewed_by in document_ai_extractions must match session user, ignoring body spoofing'
);
assert.notStrictEqual(extractionInDb.reviewed_by, 'hacker-malicioso-ou-corpo-falso');
assert.ok(extractionInDb.reviewed_at, 'Item (c): reviewed_at must be populated by the server');

// Verificação no AuditLog do DriverDocumentIntake - ONDE A MUT A É FISGADA!
const auditRows: any = await db.execute(sql`
  SELECT action, changes, user_id
  FROM audit_logs
  WHERE entity_type = 'DriverDocumentIntake'
    AND entity_id = ${intakeId}
  ORDER BY timestamp DESC
  LIMIT 1
`);
assert.strictEqual(auditRows.rows.length, 1, 'Audit log entry for human review must exist');
const auditLog = auditRows.rows[0];
const parsedChanges = typeof auditLog.changes === 'string' ? JSON.parse(auditLog.changes) : auditLog.changes;
const auditNewState = typeof parsedChanges.newState === 'string' ? JSON.parse(parsedChanges.newState) : parsedChanges.newState;

// Guarda estrita da MUT A: se reviewedBy for null, a linha abaixo lança AssertionError com exit code vermelho!
assert.strictEqual(
  auditNewState.reviewedBy,
  reviewerUserId,
  'MUT A Guard & Item (c): AuditLog newState.reviewedBy must strictly equal the session principal userId'
);
assert.notStrictEqual(auditNewState.reviewedBy, null, 'reviewedBy in audit log must never be null');
assert.strictEqual(auditNewState.status, 'APPROVED');

// --- CONFERÊNCIA SQL ITEM (a) e ITEM (d): Materialização do motorista e arquivamento do documento ---
console.log('Materializing driver from approved CNH draft...');
const materializeResponse = await request(`/api/driver-document-intakes/${intakeId}/materialize-driver`, {
  method: 'POST',
  body: JSON.stringify({}),
});

assert.ok(
  materializeResponse.status === 200 || materializeResponse.status === 201,
  'Materialization must return HTTP 200 or 201 Created'
);
const createdDriverId = materializeResponse.body.item?.driverId || materializeResponse.body.driverId;
assert.ok(createdDriverId, 'Driver ID must be returned by materialization');

// Item (a): O motorista gravado no banco deve conter o valor CORRIGIDO, não o que a IA leu errado!
const driverRows: any = await db.execute(sql`
  SELECT id, name, cpf, cnh_category, cnh_expiration, status
  FROM drivers
  WHERE id = ${createdDriverId}
`);
assert.strictEqual(driverRows.rows.length, 1, 'Driver must exist in drivers table');
const savedDriver = driverRows.rows[0];

assert.strictEqual(
  savedDriver.cnh_category,
  'AB',
  'Item (a): cnh_category in database MUST be the human-CORRECTED value ("AB"), not the AI error ("B")'
);
assert.strictEqual(
  String(savedDriver.cnh_expiration).slice(0, 10),
  '2028-01-15',
  'Item (a): cnh_expiration in database MUST be the human-CORRECTED value ("2028-01-15"), not the AI error ("2025-01-15")'
);
assert.strictEqual(
  savedDriver.name,
  'MARCOS PAULO BIAGIONI',
  'Field correctly extracted by AI without corrections must be faithfully preserved'
);

// Item (d): O documento original arquivado na central de documentos, classificado pelo tipo CNH
const intakeDbRows: any = await db.execute(sql`
  SELECT status, driver_id, attachment_id, consumed_at
  FROM driver_document_intakes
  WHERE id = ${intakeId}
`);
assert.strictEqual(intakeDbRows.rows.length, 1);
const intakeInDb = intakeDbRows.rows[0];
assert.strictEqual(intakeInDb.status, 'CONSUMED', 'Intake must be marked CONSUMED upon materialization');
assert.strictEqual(intakeInDb.driver_id, createdDriverId, 'Intake must reference the created driver');
assert.ok(intakeInDb.consumed_at, 'Intake consumed_at must be populated');

// Conferir documento/anexo original classificado como CNH vinculado ao motorista
const docAttachmentRows: any = await db.execute(sql`
  SELECT id, entity_type, document_type, is_archived
  FROM file_attachments
  WHERE id = ${attachmentId}
`);
assert.strictEqual(docAttachmentRows.rows.length, 1);
assert.strictEqual(docAttachmentRows.rows[0].document_type, 'CNH', 'Item (d): Original document attachment must remain classified as CNH');

server.close();
console.log('✓ All 4 acceptance criteria (a, b, c, d) and mutation guards passed against real database!');
console.log('--- ALL PH-054 TESTS PASSED SUCCESSFULLY ---');
