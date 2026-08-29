import type { DocumentAiExtraction } from '../documentAiClient';
import { buildApprovedCnhDriverDraft, chooseLatestApprovedCnhDraft } from '../driverCnhPrefill';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const base: DocumentAiExtraction = {
  id: 'extract-1',
  companyId: 'company-server',
  attachmentId: 'attachment-driver-1',
  attachmentChecksum: 'a'.repeat(64),
  status: 'APPROVED',
  requestedBy: 'server-user',
  attemptCount: 1,
  failureCode: null,
  provider: 'synthetic',
  model: 'synthetic-v1',
  modelVersion: null,
  detectedDocumentType: 'CNH',
  proposedFields: {
    name: ' Motorista Sintético ',
    cpf: '123.456.789-09',
    birthDate: '1990-01-02',
    registrationNumber: '12345678900',
    category: 'b',
    expirationDate: '2030-05-10',
    companyId: 'forbidden-browser-authority',
  },
  fieldConfidence: {},
  reviewedBy: 'reviewer-server',
  reviewedAt: '2026-08-28T23:00:00.000Z',
  corrections: { name: 'Motorista Revisado', category: 'AB', status: 'BLOCKED' },
  reviewNotes: null,
  approvedAt: '2026-08-28T23:01:00.000Z',
  createdAt: '2026-08-28T22:50:00.000Z',
  updatedAt: '2026-08-28T23:01:00.000Z',
};

const allowed = new Set(['attachment-driver-1']);
const draft = buildApprovedCnhDriverDraft(base, allowed);
assert(draft !== null, 'approved CNH from driver attachment was rejected');
assert(draft.fullName === 'Motorista Revisado', 'canonical human name correction did not win');
assert(draft.cpf === '12345678909', 'CPF was not normalized');
assert(draft.cnhNumber === '12345678900', 'canonical registrationNumber was not mapped to CNH number');
assert(draft.cnhCategory === 'AB', 'canonical CNH category was not normalized');
assert(draft.cnhExpiration === '2030-05-10', 'canonical expirationDate was not mapped to CNH expiration');
assert(!('companyId' in draft) && !('status' in draft), 'unexpected authority field leaked into driver draft');

const aliasCompatibility = buildApprovedCnhDriverDraft({
  ...base,
  proposedFields: {
    fullName: 'Alias Antigo',
    cnhNumber: '99999999999',
    cnhCategory: 'B',
    cnhExpiration: '2031-01-01',
  },
  corrections: { name: 'Correção Canônica', registrationNumber: '88888888888' },
}, allowed);
assert(aliasCompatibility?.fullName === 'Correção Canônica', 'canonical human correction must beat legacy proposed alias');
assert(aliasCompatibility?.cnhNumber === '88888888888', 'canonical registration correction must beat legacy proposed alias');

assert(buildApprovedCnhDriverDraft({ ...base, status: 'REVIEW_REQUIRED' }, allowed) === null, 'unapproved extraction was applied');
assert(buildApprovedCnhDriverDraft({ ...base, detectedDocumentType: 'CRLV' }, allowed) === null, 'non-CNH extraction was applied');
assert(buildApprovedCnhDriverDraft(base, new Set(['another-attachment'])) === null, 'foreign attachment was applied');

const malformed = buildApprovedCnhDriverDraft({
  ...base,
  proposedFields: {
    cpf: '123',
    birthDate: '2026-02-31',
    category: 'ZZ',
    expirationDate: 'not-a-date',
  },
  corrections: null,
}, allowed);
assert(malformed === null, 'malformed fields must fail closed');

const older = { ...base, id: 'older', approvedAt: '2026-08-28T20:00:00.000Z', corrections: { name: 'Antigo' } };
const newer = { ...base, id: 'newer', approvedAt: '2026-08-28T21:00:00.000Z', corrections: { name: 'Novo' } };
const latest = chooseLatestApprovedCnhDraft([older, newer], allowed);
assert(latest?.fullName === 'Novo', 'latest approved CNH was not selected');

console.log('Driver CNH prefill tests PASS');
