import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VehicleRepository } from '../../persistence/repositories/serverReadModelRepositories';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const vite = read('vite.config.ts');
assert.match(vite, /serverReadModelRepositories\.ts/, 'Vite must route browser legacy repository imports to the server read-model adapter');
assert.match(vite, /productionSeedStub\.ts/, 'Vite must disable browser seed authority');
assert.match(vite, /localRepositories/, 'The compatibility alias must explicitly match the historical repository import');

const adapter = read('src/persistence/repositories/serverReadModelRepositories.ts');
assert.doesNotMatch(adapter, /StorageAdapter/, 'Server read-model adapter must never import StorageAdapter');
assert.doesNotMatch(adapter, /indexedDB/i, 'Server read-model adapter must never use IndexedDB');
assert.doesNotMatch(adapter, /localStorage/i, 'Server read-model adapter must never use localStorage');
assert.match(adapter, /VehicleClient\.list\(\)/, 'Vehicle reads must use the authenticated server client');
assert.match(adapter, /FinanceObligationClient\.listReceivables\(\)/, 'Receivable reads must use the authenticated server client');
assert.match(adapter, /MaintenanceClient\.listWorkOrders\(\)/, 'Maintenance reads must use the authenticated server client');
assert.match(adapter, /DocumentClient\.list/, 'Document reads must use the authenticated server client');
assert.match(adapter, /BROWSER_WRITE_DISABLED_SERVER_AUTHORITY_REQUIRED/, 'Legacy browser writes must fail closed');

const seedStub = read('src/persistence/seed/productionSeedStub.ts');
assert.doesNotMatch(seedStub, /StorageAdapter|indexedDB|localStorage/i, 'Production seed stub must have no browser persistence path');
assert.match(seedStub, /BROWSER_SEED_RESET_DISABLED_SERVER_AUTHORITY_REQUIRED/, 'Browser reset must fail closed');

const header = read('src/components/layout/Header.tsx');
assert.doesNotMatch(header, /Reset Seed/, 'Production header must not expose Reset Seed');
assert.doesNotMatch(header, /Carlos Silva|Gestor de Operações/, 'Production header must not contain a simulated operator identity');
assert.match(header, /useAuth\(\)/, 'Header identity must come from the authenticated session');

await assert.rejects(
  () => new VehicleRepository().create({} as never),
  /BROWSER_WRITE_DISABLED_SERVER_AUTHORITY_REQUIRED/,
  'Legacy repository writes must be rejected before any browser persistence can run'
);

console.log('SECURITY-2N runtime read-model authority: PASS');
