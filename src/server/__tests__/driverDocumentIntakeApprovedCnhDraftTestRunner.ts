import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectApprovedCnhDriverDraft } from '../driverDocumentIntakeApprovedCnhDraft';

const proposed = {
  name: 'Nome Proposto',
  cpf: '123.456.789-01',
  rg: '12.345.678-9',
  registrationNumber: '12345678901',
  category: 'b',
  birthDate: '1990-01-02',
  issueDate: '2026-01-15',
  expirationDate: '2030-12-31',
  ear: true,
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
  cnhIssueDate: '2026-01-15',
  cnhExpiration: '2030-12-31',
  cnhEar: true,
});

assert.deepEqual(projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CNH',
  proposedFields: {
    ...proposed,
    birthDate: '27/05/2003',
    issueDate: '15/01/2026',
    expirationDate: '10/09/2031',
  },
}), {
  fullName: 'Nome Proposto',
  cpf: '12345678901',
  rg: '12.345.678-9',
  birthDate: '2003-05-27',
  cnhNumber: '12345678901',
  cnhCategory: 'B',
  cnhIssueDate: '2026-01-15',
  cnhExpiration: '2031-09-10',
  cnhEar: true,
});

const distinctDates = projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CNH',
  proposedFields: {
    ...proposed,
    issueDate: '15/01/2026',
    expirationDate: '13/01/2036',
  },
});
assert.equal(distinctDates.cnhIssueDate, '2026-01-15', 'data de emissão deve permanecer separada');
assert.equal(distinctDates.cnhExpiration, '2036-01-13', 'validade deve vir exclusivamente de expirationDate');
assert.notEqual(distinctDates.cnhIssueDate, distinctDates.cnhExpiration, 'emissão nunca deve substituir a validade');

const pendingEar = projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CNH',
  proposedFields: {
    name: proposed.name,
    cpf: proposed.cpf,
    rg: proposed.rg,
    registrationNumber: proposed.registrationNumber,
    category: proposed.category,
    birthDate: proposed.birthDate,
    issueDate: proposed.issueDate,
    expirationDate: proposed.expirationDate,
  },
});
assert.equal(Object.prototype.hasOwnProperty.call(pendingEar, 'cnhEar'), false, 'EAR ausente deve permanecer pendente');

assert.equal(projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CNH',
  proposedFields: { ...proposed, ear: true },
  corrections: { ear: false },
}).cnhEar, false, 'revisão humana deve poder confirmar EAR como Não');

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
    issueDate: 'not-a-date',
    expirationDate: 'not-a-date',
    ear: 'desconhecido',
    unexpectedAuthorityField: 'ignored',
  },
}), { fullName: 'Nome Proposto' });

assert.deepEqual(projectApprovedCnhDriverDraft({
  status: 'APPROVED',
  detectedDocumentType: 'CNH',
  proposedFields: { name: 'Legacy Name', registrationNumber: '12345678901', issueDate: '2030-01-01', expirationDate: '2031-01-01' },
  corrections: { fullName: 'Correção Canônica', cnhNumber: '10987654321', cnhIssueDate: '01/02/2031', cnhExpiration: '02/02/2032', cnhEar: false },
}), {
  fullName: 'Correção Canônica',
  cnhNumber: '10987654321',
  cnhIssueDate: '2031-02-01',
  cnhExpiration: '2032-02-02',
  cnhEar: false,
});

const modalSource = readFileSync(new URL('../../components/drivers/DriverCnhIntakeModal.tsx', import.meta.url), 'utf8');
const approvedDraftRead = modalSource.indexOf('const approved = await DriverDocumentIntakeClient.getApprovedCnhDraft(intakeId);');
const materialization = modalSource.indexOf('const materialized = await DriverDocumentIntakeClient.materializeApprovedCnh(intakeId);');
assert.ok(approvedDraftRead >= 0, 'CNH flow must fetch the server-authoritative approved draft');
assert.ok(materialization > approvedDraftRead, 'approved draft must be captured before materialization consumes the intake');
assert.match(modalSource, /\['issueDate', 'Data de emissão da CNH'\]/, 'revisão deve exibir data de emissão');
assert.match(modalSource, /\['expirationDate', 'Validade da CNH'\]/, 'revisão deve exibir validade separadamente');
assert.match(modalSource, /issueDate: valueText\(item\.proposedFields\.issueDate\)/, 'emissão deve vir de issueDate');
assert.match(modalSource, /expirationDate: valueText\(item\.proposedFields\.expirationDate\)/, 'validade deve vir de expirationDate');

const completionStart = modalSource.indexOf('const useApprovedDraft = () => {');
const completionEnd = modalSource.indexOf('const progress = progressFor(step);', completionStart);
assert.ok(completionStart >= 0 && completionEnd > completionStart, 'completion handler must remain discoverable');
const completionBody = modalSource.slice(completionStart, completionEnd);
assert.equal(completionBody.includes('getApprovedCnhDraft'), false, 'completion must not re-read an already consumed intake');
assert.match(modalSource, /PROVIDER_RATE_LIMITED/);
assert.match(modalSource, /não envie o documento novamente agora/);
assert.match(modalSource, /const retryRateLimited = async \(\) =>/);
const retryStart = modalSource.indexOf('const retryRateLimited = async () => {');
const retryEnd = modalSource.indexOf("const review = async (decision: 'APPROVE' | 'REJECT') => {", retryStart);
assert.ok(retryStart >= 0 && retryEnd > retryStart, 'rate-limit retry handler must remain discoverable');
const retryBody = modalSource.slice(retryStart, retryEnd);
assert.match(retryBody, /DocumentAiClient\.retry\(extractionId\)/, 'retry must reuse the existing extraction');
assert.equal(retryBody.includes('AttachmentClient.upload'), false, 'retry must not upload the CNH again');
assert.equal(retryBody.includes('DriverDocumentIntakeClient.create'), false, 'retry must not create another intake');
assert.match(modalSource, /Tentar novamente com esta CNH/);

console.log('Driver intake approved CNH draft checks passed.');
