import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../AdministrationCenterView.tsx', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../../server/companyProfileRoutes.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../../db/schema.ts', import.meta.url), 'utf8');

assert.match(admin, /CompanyProfileClient\.get\(\)/, 'admin tenant tab must load official company profile from server');
assert.match(admin, /CompanyProfileClient\.update/, 'admin tenant tab must save official company profile to server');
assert.match(admin, /Representante Legal/, 'company profile UI must expose legal representative');
assert.match(routes, /app\.get\('\/api\/company-profile'/, 'company profile read route missing');
assert.match(routes, /app\.patch\('\/api\/company-profile'/, 'company profile update route missing');
assert.match(routes, /WRITE_ROLES = new Set\(\['ADMIN','MANAGER'\]\)/, 'company profile writes must remain restricted');
for (const field of ['tradeName','email','phone','whatsapp','addressStreet','legalRepresentativeName','legalRepresentativeCpf']) {
  assert.ok(schema.includes(field), `company profile schema field missing: ${field}`);
}
console.log('Company profile contract authority regression: PASS');
