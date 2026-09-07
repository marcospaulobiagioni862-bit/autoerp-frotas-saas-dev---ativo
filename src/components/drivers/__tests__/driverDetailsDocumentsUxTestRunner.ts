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
assert.match(attachmentList, /<Archive className="h-4 w-4" \/>/, 'attachment archive action must remain distinct from permanent delete');
assert.match(attachmentList, /Excluir definitivamente/, 'attachment list must expose permanent delete for authorized users');
assert.match(attachmentList, /AttachmentClient\.deletePermanently\(targetId\)/, 'permanent delete must use the authoritative attachment endpoint');
assert.match(attachmentList, /excludeAttachmentIds\?: string\[\]/, 'attachment list must expose opt-in visual deduplication');
assert.match(attachmentList, /excludedAttachmentIds\.has\(item\.id\)/, 'excluded attachment ids must be removed from the visible list only');
assert.match(driverDetails, /excludeAttachmentIds=\{summary\.documents\.map/, 'driver details must hide attachments already represented by document records');
assert.match(driverDetails, /Histórico e auditoria do motorista/, 'driver history must identify the server audit view');
assert.match(driverDetails, /Responsável:/, 'driver history must expose the responsible user');
assert.match(driverDetails, /Campos alterados:/, 'driver history must summarize changed fields');
assert.match(driverDetails, /Valores brutos não são exibidos/, 'driver history must avoid exposing raw audit payload values');


console.log('Driver details document UX regression PASS');
