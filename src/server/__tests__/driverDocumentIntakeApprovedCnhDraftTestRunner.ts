import assert from 'node:assert/strict';
import { projectApprovedCnhDriverDraft } from '../driverDocumentIntakeApprovedCnhDraft';

const proposed = {
  name: 'Nome Proposto',
  cpf: '123.456.789-01',
  rg: '12.345.678-9',
  registrationNumber: '12345678901',
  category: 'b',
  birthDate: '1990-01-02',
  expirationDate: '2030-12-31',
};

assert.deepEqual(projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CNH',
  proposedFields: proposed,
  corrections: { name: 'Nome Corrigido', rg: 'MG-99.888.777', category: 'AB' },
}), {
  fullName: 'Nome Corrigido',
  cpf: '12345678901',
  rg: 'MG-99.888.777',
  birthDate: '1990-01-02',
  cnhNumber: '12345678901',
  cnhCategory: 'AB',
  cnhExpiration: '2030-12-31',
});

assert.deepEqual(projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CNH',
  proposedFields: {
    ...proposed,
    birthDate: '27/05/2003',
    expirationDate: '10/09/2031',
  },
}), {
  fullName: 'Nome Proposto',
  cpf: '12345678901',
  rg: '12.345.678-9',
  birthDate: '2003-05-27',
  cnhNumber: '12345678901',
  cnhCategory: 'B',
  cnhExpiration: '2031-09-10',
});

assert.deepEqual(projectApprovedCnhDriverDraft({
  status: 'REVIEW_REQUIRED',
  detectedDocumentType: 'CNH',
  proposedFields: proposed,
}), {});
assert.deepEqual(projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CRLV',
  proposedFields: proposed,
}), {});

assert.deepEqual(projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CNH',
  proposedFields: {
    ...proposed,
    cpf: '123',
    rg: 'R'.repeat(33),
    registrationNumber: 'bad',
    category: 'Z',
    birthDate: '31/02/2026',
    expirationDate: 'not-a-date',
    unexpectedAuthorityField: 'ignored',
  },
}), { fullName: 'Nome Proposto' });

assert.deepEqual(projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CNH',
  proposedFields: { name: 'Legacy Name', registrationNumber: '12345678901', expirationDate: '2031-01-01' },
  corrections: { fullName: 'Correção Canônica', cnhNumber: '10987654321', cnhExpiration: '02/02/2032' },
}), {
  fullName: 'Correção Canônica',
  cnhNumber: '10987654321',
  cnhExpiration: '2032-02-02',
});

console.log('Driver intake approved CNH draft checks passed.');
