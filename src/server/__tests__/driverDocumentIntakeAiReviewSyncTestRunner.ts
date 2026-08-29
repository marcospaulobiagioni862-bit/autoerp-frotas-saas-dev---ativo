import assert from 'node:assert/strict';
import {
  DriverDocumentIntakeReviewSyncError,
  resolveDriverDocumentIntakeReviewTransition,
} from '../driverDocumentIntakeAiReviewSync';

assert.deepEqual(resolveDriverDocumentIntakeReviewTransition({
  entityType: 'DriverDocumentIntake',
  intakeStatus: 'REVIEW_REQUIRED',
  extractionStatus: 'APPROVED',
  detectedDocumentType: 'CNH',
  extractionId: 'ext-1',
}), { status: 'APPROVED', approvedExtractionId: 'ext-1' });

assert.deepEqual(resolveDriverDocumentIntakeReviewTransition({
  entityType: 'DriverDocumentIntake',
  intakeStatus: 'REVIEW_REQUIRED',
  extractionStatus: 'REJECTED',
  detectedDocumentType: 'CNH',
  extractionId: 'ext-1',
}), { status: 'FAILED', approvedExtractionId: null });

assert.equal(resolveDriverDocumentIntakeReviewTransition({
  entityType: 'Driver',
  intakeStatus: 'REVIEW_REQUIRED',
  extractionStatus: 'APPROVED',
  detectedDocumentType: 'CNH',
  extractionId: 'ext-1',
}), null);

assert.deepEqual(resolveDriverDocumentIntakeReviewTransition({
  entityType: 'DriverDocumentIntake',
  intakeStatus: 'APPROVED',
  extractionStatus: 'APPROVED',
  detectedDocumentType: 'CNH',
  approvedExtractionId: 'ext-1',
  extractionId: 'ext-1',
}), { status: 'APPROVED', approvedExtractionId: 'ext-1' });

for (const input of [
  {
    entityType: 'DriverDocumentIntake', intakeStatus: 'REVIEW_REQUIRED', extractionStatus: 'APPROVED' as const,
    detectedDocumentType: 'CRLV', extractionId: 'ext-1',
  },
  {
    entityType: 'DriverDocumentIntake', intakeStatus: 'APPROVED', extractionStatus: 'APPROVED' as const,
    detectedDocumentType: 'CNH', approvedExtractionId: 'ext-2', extractionId: 'ext-1',
  },
]) {
  let rejected = false;
  try {
    resolveDriverDocumentIntakeReviewTransition(input);
  } catch (error) {
    rejected = error instanceof DriverDocumentIntakeReviewSyncError;
  }
  assert.equal(rejected, true, 'invalid intake human-review transition must fail closed');
}

console.log('Driver intake DOC-AI human review sync checks passed.');
