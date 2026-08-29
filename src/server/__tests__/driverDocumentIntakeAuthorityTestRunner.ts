import {
  approveDriverDocumentIntake,
  archiveDriverDocumentIntake,
  attachDriverDocument,
  consumeDriverDocumentIntake,
  failDriverDocumentIntake,
  requireDriverDocumentReview,
  startDriverDocumentExtraction,
  type DriverDocumentIntakeState,
} from '../driverDocumentIntakeAuthority';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mustReject(run: () => unknown, message: string): void {
  let rejected = false;
  try {
    run();
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(message);
}

const base: DriverDocumentIntakeState = {
  id: 'intake-1',
  companyId: 'company-a',
  createdBy: 'user-a',
  status: 'DRAFT',
  idempotencyKey: 'driver-cnh:user-a:1',
  expiresAt: '2026-08-30T00:00:00.000Z',
  createdAt: '2026-08-28T23:00:00.000Z',
  updatedAt: '2026-08-28T23:00:00.000Z',
};

const uploaded = attachDriverDocument(base, 'attachment-1', '2026-08-28T23:01:00.000Z');
assert(uploaded.status === 'DOCUMENT_UPLOADED' && uploaded.attachmentId === 'attachment-1', 'document attach failed');

const extracting = startDriverDocumentExtraction(uploaded, '2026-08-28T23:02:00.000Z');
assert(extracting.status === 'EXTRACTING', 'extraction start failed');

const review = requireDriverDocumentReview(extracting, '2026-08-28T23:03:00.000Z');
assert(review.status === 'REVIEW_REQUIRED', 'review transition failed');

const approved = approveDriverDocumentIntake(review, 'extraction-1', '2026-08-28T23:04:00.000Z');
assert(approved.status === 'APPROVED' && approved.approvedExtractionId === 'extraction-1', 'approval failed');

const consumed = consumeDriverDocumentIntake(approved, 'driver-1', '2026-08-28T23:05:00.000Z');
assert(consumed.status === 'CONSUMED' && consumed.driverId === 'driver-1' && Boolean(consumed.consumedAt), 'consume failed');

mustReject(() => consumeDriverDocumentIntake(review, 'driver-1', '2026-08-28T23:05:00.000Z'), 'unapproved intake was consumed');
mustReject(() => consumeDriverDocumentIntake(approved, '', '2026-08-28T23:05:00.000Z'), 'empty driver id was consumed');
mustReject(() => attachDriverDocument(uploaded, 'attachment-2', '2026-08-28T23:05:00.000Z'), 'second attachment replaced intake authority');
mustReject(() => approveDriverDocumentIntake(extracting, 'extraction-1', '2026-08-28T23:05:00.000Z'), 'extraction skipped human review');
mustReject(() => archiveDriverDocumentIntake(consumed, '2026-08-28T23:06:00.000Z'), 'consumed intake was archived');
mustReject(() => failDriverDocumentIntake(consumed, '2026-08-28T23:06:00.000Z'), 'consumed intake was failed');
mustReject(
  () => attachDriverDocument({ ...base, expiresAt: '2026-08-28T22:00:00.000Z' }, 'attachment-1', '2026-08-28T23:01:00.000Z'),
  'expired intake accepted document',
);

const archived = archiveDriverDocumentIntake(review, '2026-08-28T23:06:00.000Z');
assert(archived.status === 'ARCHIVED' && Boolean(archived.archivedAt), 'archive failed');

console.log('Driver document intake authority tests PASS');
