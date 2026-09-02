import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../VehicleDetailsModal.tsx', import.meta.url), 'utf8');
const crlvSource = readFileSync(new URL('../VehicleCrlvImportPanel.tsx', import.meta.url), 'utf8');

assert.ok(source.includes('Últimas 5 leituras de KM'), 'overview must label the bounded KM summary');
assert.ok(source.includes('summary.kmRecords.slice(0,5).map'), 'overview must render no more than five authorized readings');
assert.ok(source.includes("setActiveTab('km')"), 'overview must link to the complete odometer history');
assert.ok(source.includes('Nenhuma leitura de KM registrada.'), 'overview must preserve an explicit empty state');
assert.equal((source.match(/VehicleClient\.listKm\(/g) ?? []).length, 1, 'summary must reuse the existing server request');
assert.ok(source.includes("activeTab==='km'"), 'complete odometer tab must remain available');
assert.ok(source.includes('summary.kmRecords.map'), 'complete odometer tab must keep the full authorized history');

assert.ok(crlvSource.includes("DocumentAiClient.list('APPROVED')"), 'CRLV comparison must use approved extractions only');
assert.ok(crlvSource.includes("attachment.documentType === 'CRLV'"), 'CRLV comparison must be restricted to vehicle CRLV attachments');
assert.ok(crlvSource.includes("extraction.detectedDocumentType === 'CRLV'"), 'CRLV comparison must reject another detected document type');
assert.ok(crlvSource.includes('...(approvedExtraction.corrections || {})'), 'human corrections must override provider proposals');
assert.ok(crlvSource.includes('Valor atual') && crlvSource.includes('Valor lido'), 'CRLV review must show current versus reviewed values');
assert.ok(crlvSource.includes('type="checkbox"'), 'review fields must support explicit operator selection');
assert.ok(crlvSource.includes('disabled'), 'apply action must stay disabled until server-side authority exists');
assert.ok(!crlvSource.includes('VehicleClient.update'), 'CRLV review must not mutate the vehicle from browser-derived values');

console.log('Vehicle latest KM and CRLV review regressions: PASS');