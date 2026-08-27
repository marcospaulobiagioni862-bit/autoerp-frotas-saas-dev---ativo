import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../VehicleDetailsModal.tsx', import.meta.url), 'utf8');

assert.ok(source.includes('Últimas 5 leituras de KM'), 'overview must label the bounded KM summary');
assert.ok(source.includes('summary.kmRecords.slice(0,5).map'), 'overview must render no more than five authorized readings');
assert.ok(source.includes("setActiveTab('km')"), 'overview must link to the complete odometer history');
assert.ok(source.includes('Nenhuma leitura de KM registrada.'), 'overview must preserve an explicit empty state');
assert.equal((source.match(/VehicleClient\.listKm\(/g) ?? []).length, 1, 'summary must reuse the existing server request');
assert.ok(source.includes("activeTab==='km'"), 'complete odometer tab must remain available');
assert.ok(source.includes('summary.kmRecords.map'), 'complete odometer tab must keep the full authorized history');

console.log('Vehicle latest KM summary regression: PASS');
