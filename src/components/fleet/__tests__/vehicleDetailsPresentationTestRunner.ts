import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vehicleContractStartDate, vehicleContractStatus, vehicleDisplayName } from '../vehicleDetailsPresentation';

assert.equal(vehicleContractStartDate('2026-09-22'), '22/09/2026');
assert.equal(vehicleContractStartDate('2026-09-22T15:00:00Z'), new Date('2026-09-22T15:00:00Z').toLocaleDateString('pt-BR'));
assert.equal(vehicleContractStatus('ACTIVE'), 'Ativo');
assert.equal(vehicleDisplayName('HONDA', 'CG 160 FAN', 'FAN 160'), 'HONDA CG 160 FAN');
assert.equal(vehicleDisplayName('HONDA', 'CG 160 FAN', 'ABS'), 'HONDA CG 160 FAN ABS');

const modal = readFileSync(new URL('../VehicleDetailsModal.tsx', import.meta.url), 'utf8');
assert.match(modal, /vehicleContractStartDate\(summary\.activeContract\.startDate\)/);
assert.match(modal, /<strong>\{vehicleContractStatus\(summary\.activeContract\.status\)\}<\/strong>/);
assert.match(modal, /vehicleDisplayName\(vehicle\.brand, vehicle\.model, vehicle\.version\)/);
assert.match(modal, /bg-graphite-50 rounded-xl border dark:border-graphite-700 dark:bg-graphite-900/);
assert.match(modal, /bg-graphite-50 space-y-3 dark:border-graphite-700 dark:bg-graphite-900/);
// AUTOERP-91 fase 5: o bloco informativo passou a usar o token semantico
// (bg-info-bg), que ja troca sozinho no modo escuro - por isso sumiram os dark:.
assert.match(modal, /bg-info-bg rounded-xl space-y-3/);

console.log('Vehicle details presentation: OK');
