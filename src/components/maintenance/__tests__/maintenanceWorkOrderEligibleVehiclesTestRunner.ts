import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../MaintenanceManagement.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /!\['SOLD','INACTIVE','ARCHIVED'\]\.includes\(String\(item\.status\)\)/,
  'maintenance UI must hide vehicles rejected by server lifecycle policy',
);
assert.match(
  source,
  /\{error&&<div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700/,
  'work-order modal must show command errors inside the modal',
);
assert.match(
  source,
  /\{error && !newWoOpen &&/,
  'page-level error must avoid duplicating the modal error while the work-order form is open',
);

console.log('Maintenance work-order eligible vehicles UX PASS');
