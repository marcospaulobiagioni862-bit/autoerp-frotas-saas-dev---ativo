import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const loaderSource = readFileSync(new URL('../navigationBadgeLoader.ts', import.meta.url), 'utf8');

const forbiddenStaticImports = [
  'serverReadModelRepositories',
  'TrackerClient',
  'ObligationStatus',
  'generateOperationalPendings',
];

for (const marker of forbiddenStaticImports) {
  assert.equal(
    appSource.includes(marker),
    false,
    `App.tsx must not retain the static badge dependency: ${marker}`,
  );
}

assert.match(
  appSource,
  /await import\('\.\/app\/navigationBadgeLoader'\)/,
  'authenticated badge refresh must load its dependency graph dynamically',
);
assert.match(
  appSource,
  /if\(!requestStillCurrent\(\)\)return;/,
  'App must reject a stale request after the dynamic module resolves',
);
assert.match(
  appSource,
  /if\(!counts\|\|!requestStillCurrent\(\)\)return;/,
  'App must reject stale or cancelled badge results before updating state',
);

for (const marker of [
  'findAllForCompany(companyId)',
  'TrackerClient.list()',
  'generateOperationalPendings({',
  'ObligationStatus.PENDING',
  'ObligationStatus.PARTIALLY_PAID',
]) {
  assert.equal(
    loaderSource.includes(marker),
    true,
    `navigation badge loader must preserve the canonical rule: ${marker}`,
  );
}

assert.equal(
  loaderSource.match(/if \(!requestStillCurrent\(\)\) return null;/g)?.length,
  2,
  'loader must reject stale requests before and after the operational projection',
);

console.log('PASS: deferred navigation badge graph and stale-request guards');
