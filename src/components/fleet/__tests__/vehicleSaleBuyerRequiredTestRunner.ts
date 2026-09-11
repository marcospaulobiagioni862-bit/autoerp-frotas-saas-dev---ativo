import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../VehicleSaleModal.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../../api/vehicleClient.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../../server/vehicleLifecycleRoutes.ts', import.meta.url), 'utf8');

assert.match(modal, /label="Comprador \*" required/, 'buyer name must be required in the sale modal');
assert.match(modal, /label="Documento do comprador \*" required/, 'buyer document must be required in the sale modal');
assert.match(modal, /if \(!buyerName\.trim\(\)\)/, 'sale modal must block empty buyer name');
assert.match(modal, /if \(!buyerDocument\.trim\(\)\)/, 'sale modal must block empty buyer document');
assert.match(client, /buyerName: string;/, 'sale client contract must require buyerName');
assert.match(client, /buyerDocument: string;/, 'sale client contract must require buyerDocument');
assert.match(routes, /buyerName = requiredText\(req\.body\?\.buyerName, 'buyerName'\)/, 'server must require buyerName');
assert.match(routes, /buyerDocument = requiredText\(req\.body\?\.buyerDocument, 'buyerDocument'\)/, 'server must require buyerDocument');
assert.doesNotMatch(routes, /const buyerName = optionalText\(req\.body\?\.buyerName\)/, 'server must not accept optional buyer name');
assert.doesNotMatch(routes, /const buyerDocument = optionalText\(req\.body\?\.buyerDocument\)/, 'server must not accept optional buyer document');

// Buyer identity became mandatory after legacy SOLD events already existed in staging.
// Keep the new-sale write boundary strict while allowing those historical rows to be read.
assert.match(client, /backward-compatible with legacy SOLD rows/, 'history parser must document legacy compatibility');
assert.doesNotMatch(
  client,
  /typeof item\.buyerName !== 'string' \|\| !item\.buyerName\.trim\(\)/,
  'legacy SOLD history must not require buyerName'
);
assert.doesNotMatch(
  client,
  /typeof item\.buyerDocument !== 'string' \|\| !item\.buyerDocument\.trim\(\)/,
  'legacy SOLD history must not require buyerDocument'
);
assert.match(
  client,
  /item\.buyerName !== undefined && typeof item\.buyerName !== 'string'/,
  'history must still reject malformed non-string buyerName'
);
assert.match(
  client,
  /item\.buyerDocument !== undefined && typeof item\.buyerDocument !== 'string'/,
  'history must still reject malformed non-string buyerDocument'
);

console.log('Vehicle sale buyer-required regression: PASS');
