import assert from 'node:assert/strict';
import { DRIVER_DOCUMENT_TYPES, isDriverDocumentType } from '../driverDocumentTypes';

assert.deepEqual(DRIVER_DOCUMENT_TYPES.slice(0, 3), ['CNH', 'RG', 'CPF']);
assert.equal(isDriverDocumentType('CNH'), true);
assert.equal(isDriverDocumentType('RG'), true);
assert.equal(isDriverDocumentType('CPF'), true);
assert.equal(isDriverDocumentType('Outro Documento'), true);
assert.equal(isDriverDocumentType('CRLV'), false);

console.log('Driver document taxonomy checks passed.');
