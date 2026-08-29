import { DRIVER_DOCUMENT_TYPES, isDriverDocumentType } from '../driverDocumentTypes';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(new Set(DRIVER_DOCUMENT_TYPES).size === DRIVER_DOCUMENT_TYPES.length, 'driver document types must be unique');
for (const required of ['CNH', 'RG', 'CPF', 'Comprovante de Residência']) {
  assert(isDriverDocumentType(required), `missing required driver document type: ${required}`);
}
assert(!isDriverDocumentType('companyId'), 'authority field must not become a document type');
assert(!isDriverDocumentType(''), 'empty document type must fail closed');

console.log('Driver document type tests PASS');
