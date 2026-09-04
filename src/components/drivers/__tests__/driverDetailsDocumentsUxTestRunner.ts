import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const driverDetails = readFileSync(new URL('../DriverDetailsModal.tsx', import.meta.url), 'utf8');
const attachmentList = readFileSync(new URL('../../documents/AttachmentList.tsx', import.meta.url), 'utf8');

assert.match(driverDetails, /maxWidth="4xl"/, 'driver details must use the larger supported modal width');
assert.doesNotMatch(driverDetails, /overflow-x-auto gap-1/, 'driver tabs must not depend on horizontal scrolling');
assert.match(driverDetails, /showPdfActions/, 'driver document attachments must enable PDF actions');
assert.match(attachmentList, /Imprimir PDF/, 'attachment list must expose print action for PDFs');
assert.match(attachmentList, /Enviar PDF/, 'attachment list must expose send/share action for PDFs');
assert.match(attachmentList, /showPdfActions && att\.mimeType === 'application\/pdf'/, 'PDF actions must remain opt-in and PDF-only');
assert.match(attachmentList, /flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between/, 'document rows must stack safely on narrow layouts');
assert.match(attachmentList, /flex flex-wrap items-center justify-end gap-1/, 'document action controls must wrap instead of forcing horizontal overflow');


console.log('Driver details document UX regression PASS');
