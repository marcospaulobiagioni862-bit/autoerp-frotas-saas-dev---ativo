import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authority = readFileSync(new URL('../tollPassageDriverReceivableAuthority.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../tollPassageRoutes.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../drizzle/0055_toll_contract_pass_through.sql', import.meta.url), 'utf8');

assert.match(migration, /pass_through_enabled boolean NOT NULL DEFAULT false/);
assert.match(migration, /PRIMARY KEY \(company_id, contract_id\)/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
assert.match(authority, /WHERE company_id=\$\{principal\.companyId\} AND id=\$\{passageId\}/);
assert.match(authority, /if \(!passage\.contract_id \|\| !passage\.driver_id\)/);
assert.match(authority, /if \(!policy\?\.pass_through_enabled\)/);
assert.match(authority, /\['INCOME', 'BOTH'\]\.includes/);
assert.match(authority, /ReceivableService\.create/);
assert.match(authority, /originType: TOLL_PASSAGE_DRIVER_ORIGIN/);
assert.doesNotMatch(authority, /FinancialTransaction|SettlementService/);
assert.match(routes, /\/api\/toll-contract-policies\/:contractId/);
assert.match(routes, /\/api\/toll-passages\/:id\/driver-receivable/);

console.log('Toll passage driver receivable boundary: PASS');
