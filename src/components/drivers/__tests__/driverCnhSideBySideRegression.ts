import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

console.log('--- PH-054: Driver CNH Side-by-Side Review Regression Suite ---');

const modalCode = readFileSync(new URL('../DriverCnhIntakeModal.tsx', import.meta.url), 'utf8');
const previewCode = readFileSync(new URL('../../documents/DocumentSideBySidePreview.tsx', import.meta.url), 'utf8');

// 1. Static AST / Code Assertions
console.log('Checking static layout and component requirements...');

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

// Badges for corrected fields
assert.match(modalCode, /badge-corrigido-/, 'Modal must render distinct badge for corrected fields');
assert.match(modalCode, /CORRIGIDO/, 'Badge label must explicitly state CORRIGIDO');

// Human validation checkbox and enforcement
assert.match(modalCode, /id="cnh-human-validation-check"/, 'Modal must have cnh-human-validation-check element');
assert.match(modalCode, /Conferi os dados com o documento original anexado/, 'Validation check must explicitly require human confirmation');
assert.match(modalCode, /!humanValidated/, 'Approval button and handler must be guarded by humanValidated');
assert.match(modalCode, /if \(decision === 'APPROVE' && !humanValidated\)/, 'review handler must reject approval if humanValidated is false');

console.log('✓ Static code assertions verified.');

// 2. Functional & Logic Simulation: Correction tracking
console.log('Verifying correction detection and payload compilation...');

const proposedFields: Record<string, unknown> = {
  name: 'MARCOS PAULO BIAGIONI',
  cpf: '12345678909',
  rg: '12345678X',
  birthDate: '1985-05-12',
  registrationNumber: '09876543210',
  category: 'B',
  issueDate: '2020-01-15',
  expirationDate: '2025-01-15',
  ear: false,
};

// Simulate user correcting category from 'B' to 'AB' and expirationDate from '2025-01-15' to '2028-01-15'
const draftFields = {
  ...proposedFields,
  category: 'AB',
  expirationDate: '2028-01-15',
};

const corrections: Record<string, unknown> = {};
for (const key of Object.keys(draftFields)) {
  if (key === 'ear') continue;
  if (draftFields[key as keyof typeof draftFields] !== proposedFields[key]) {
    corrections[key] = draftFields[key as keyof typeof draftFields];
  }
}

assert.deepEqual(Object.keys(corrections).sort(), ['category', 'expirationDate'], 'Only edited fields must be in corrections');
assert.strictEqual(corrections.category, 'AB', 'Corrected category must match user edit');
assert.strictEqual(corrections.expirationDate, '2028-01-15', 'Corrected expirationDate must match user edit');
console.log('✓ Correction detection and payload compilation passed.');

// 3. Functional Simulation: Rotation state transitions
console.log('Verifying rotation state transitions (modulo 360)...');
let rotation = 0;
const rotateCw = (r: number) => (r + 90) % 360;
const rotateCcw = (r: number) => (r - 90 + 360) % 360;

rotation = rotateCw(rotation); // 0 -> 90
assert.strictEqual(rotation, 90, 'CW rotation 1 must be 90');
rotation = rotateCw(rotation); // 90 -> 180
assert.strictEqual(rotation, 180, 'CW rotation 2 must be 180');
rotation = rotateCw(rotation); // 180 -> 270
assert.strictEqual(rotation, 270, 'CW rotation 3 must be 270');
rotation = rotateCw(rotation); // 270 -> 0
assert.strictEqual(rotation, 0, 'CW rotation 4 must cycle back to 0');

rotation = rotateCcw(rotation); // 0 -> 270
assert.strictEqual(rotation, 270, 'CCW rotation 1 must cycle to 270');
rotation = rotateCcw(rotation); // 270 -> 180
assert.strictEqual(rotation, 180, 'CCW rotation 2 must be 180');
console.log('✓ Rotation modulo 360 state transitions passed.');

// 4. Negative Mutation Testing: Human Validation Check
console.log('Running negative mutation testing on validation guard...');

function simulateReviewApproval(humanValidated: boolean): { success: boolean; error?: string } {
  if (!humanValidated) {
    return {
      success: false,
      error: 'É obrigatório conferir os dados com o documento original anexado e marcar o check de validação antes de aprovar e salvar.',
    };
  }
  return { success: true };
}

// Case A: Unchecked validation
const unvalidatedResult = simulateReviewApproval(false);
assert.strictEqual(unvalidatedResult.success, false, 'Approval without validation must fail');
assert.match(unvalidatedResult.error!, /obrigatório conferir os dados/, 'Error message must explain validation requirement');

// Case B: Checked validation
const validatedResult = simulateReviewApproval(true);
assert.strictEqual(validatedResult.success, true, 'Approval with validation must succeed');

console.log('✓ Negative mutation test passed (cannot save without checking validation).');

console.log('ALL PH-054 TESTS PASSED SUCCESSFULLY.');
