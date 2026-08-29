import assert from 'node:assert/strict';
import {
  DriverDocumentIntakeWorkerSyncError,
  resolveDriverDocumentIntakeWorkerTransition,
} from '../driverDocumentIntakeAiWorkerSync';

assert.equal(
  resolveDriverDocumentIntakeWorkerTransition('DriverDocumentIntake', 'EXTRACTING', 'REVIEW_REQUIRED'),
  'REVIEW_REQUIRED',
);
assert.equal(
  resolveDriverDocumentIntakeWorkerTransition('DriverDocumentIntake', 'EXTRACTING', 'FAILED'),
  'FAILED',
);
assert.equal(resolveDriverDocumentIntakeWorkerTransition('Driver', 'EXTRACTING', 'REVIEW_REQUIRED'), null);
assert.equal(resolveDriverDocumentIntakeWorkerTransition('Vehicle', 'EXTRACTING', 'FAILED'), null);

let mismatchRejected = false;
try {
  resolveDriverDocumentIntakeWorkerTransition('DriverDocumentIntake', 'DOCUMENT_UPLOADED', 'REVIEW_REQUIRED');
} catch (error) {
  mismatchRejected = error instanceof DriverDocumentIntakeWorkerSyncError;
}
assert.equal(mismatchRejected, true, 'intake worker sync must fail closed outside EXTRACTING');

console.log('Driver intake DOC-AI worker sync policy checks passed.');
