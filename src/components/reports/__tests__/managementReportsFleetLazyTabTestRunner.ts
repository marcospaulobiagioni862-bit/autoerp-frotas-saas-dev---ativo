import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../ManagementReportsView.tsx', import.meta.url), 'utf8');
const fleetPanel = readFileSync(new URL('../ManagementReportsFleetTab.tsx', import.meta.url), 'utf8');
const fleetBoundary = source.slice(
  source.indexOf('TAB 2: FLEET SITUATION'),
  source.indexOf('TAB 3: CONTRACTS'),
);

assert.doesNotMatch(source, /import\s+\{\s*ManagementReportsFleetTab\s*\}\s+from/, 'fleet report tab must not be statically imported');
assert.match(source, /const ManagementReportsFleetTab = lazy\(\(\) =>/, 'fleet report tab must use React.lazy');
assert.match(source, /import\('\.\/ManagementReportsFleetTab'\)/, 'fleet report tab must have its own chunk boundary');
assert.match(fleetBoundary, /activeSubTab === 'fleet'/, 'fleet panel must render only when selected');
assert.match(fleetBoundary, /<ManagementReportsFleetTab fleet=\{fleet\} \/>/, 'authorized report projection must be passed unchanged');
assert.match(fleetBoundary, /<LazyModuleErrorBoundary resetKey=\{activeSubTab\}/, 'fleet loading failure must reset when navigation changes');
assert.match(fleetBoundary, /Carregando situação da frota\.\.\./, 'loading fallback must remain neutral');
assert.doesNotMatch(fleetBoundary, /error\.(?:message|stack)|String\(error\)/, 'fleet fallback must not expose raw errors');
assert.match(fleetPanel, /ManagementReportData\['fleet'\]/, 'child must consume the canonical report projection type');
assert.doesNotMatch(fleetPanel, /Repository|fetch\(|\/api\//, 'child must remain presentation-only');
assert.match(fleetPanel, /fleet\.totalVehicles > 0/, 'zero-vehicle percentage guard must be preserved');

console.log('Deferred management report fleet tab regression: PASS');
