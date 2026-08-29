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
    fullName: ' Motorista Sintético ',
    cpf: '123.456.789-09',
    rg: '12.345.678-9',
    birthDate: '1990-01-02',
    cnhNumber: '12345678900',
    cnhCategory: 'b',
    cnhExpiration: '2030-05-10',
    companyId: 'forbidden-browser-authority',
  },
  fieldConfidence: {},
  reviewedBy: 'reviewer-server',
  reviewedAt: '2026-08-28T23:00:00.000Z',
  corrections: { fullName: 'Motorista Revisado', cnhCategory: 'AB', status: 'BLOCKED' },
  reviewNotes: null,
  approvedAt: '2026-08-28T23:01:00.000Z',
  createdAt: '2026-08-28T22:50:00.000Z',
  updatedAt: '2026-08-28T23:01:00.000Z',
};

const allowed = new Set(['attachment-driver-1']);
const draft = buildApprovedCnhDriverDraft(base, allowed);
assert(draft !== null, 'approved CNH from driver attachment was rejected');
assert(draft.fullName === 'Motorista Revisado', 'human correction did not win');
assert(draft.cpf === '12345678909', 'CPF was not normalized');
assert(draft.cnhCategory === 'AB', 'CNH category was not normalized');
assert(!('companyId' in draft) && !('status' in draft), 'unexpected authority field leaked into driver draft');

assert(buildApprovedCnhDriverDraft({ ...base, status: 'REVIEW_REQUIRED' }, allowed) === null, 'unapproved extraction was applied');
assert(buildApprovedCnhDriverDraft({ ...base, detectedDocumentType: 'CRLV' }, allowed) === null, 'non-CNH extraction was applied');
assert(buildApprovedCnhDriverDraft(base, new Set(['another-attachment'])) === null, 'foreign attachment was applied');

const malformed = buildApprovedCnhDriverDraft({
  ...base,
  proposedFields: {
    cpf: '123',
    birthDate: '2026-02-31',
    cnhCategory: 'ZZ',
    cnhExpiration: 'not-a-date',
  },
  corrections: null,
}, allowed);
assert(malformed === null, 'malformed fields must fail closed');

const older = { ...base, id: 'older', approvedAt: '2026-08-28T20:00:00.000Z', corrections: { fullName: 'Antigo' } };
const newer = { ...base, id: 'newer', approvedAt: '2026-08-28T21:00:00.000Z', corrections: { fullName: 'Novo' } };
const latest = chooseLatestApprovedCnhDraft([older, newer], allowed);
assert(latest?.fullName === 'Novo', 'latest approved CNH was not selected');

console.log('Driver CNH prefill tests PASS');
