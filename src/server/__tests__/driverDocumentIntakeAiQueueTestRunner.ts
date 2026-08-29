import assert from 'node:assert/strict';
import { driverDocumentIntakeExtractionKey } from '../driverDocumentIntakeAiQueue';

const checksum = 'a'.repeat(64);
const key = driverDocumentIntakeExtractionKey('intake-1', checksum);
assert.equal(key, `driver-intake:intake-1:${checksum}`);
assert.equal(driverDocumentIntakeExtractionKey('intake-1', checksum), key);
assert.notEqual(driverDocumentIntakeExtractionKey('intake-2', checksum), key);
assert.notEqual(driverDocumentIntakeExtractionKey('intake-1', 'b'.repeat(64)), key);

console.log('Driver intake DOC-AI enqueue idempotency checks passed.');
