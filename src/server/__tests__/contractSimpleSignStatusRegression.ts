import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync('src/components/contracts/ContractExecutionPanel.tsx', 'utf8');
const routes = readFileSync('src/server/contractSimpleSignRoutes.ts', 'utf8');
const client = readFileSync('src/api/contractExecutionClient.ts', 'utf8');

assert(panel.includes("'ASSINADO'"), 'panel must expose simple signed state');
assert(panel.includes("'NÃO ASSINADO'"), 'panel must expose simple unsigned state');
assert(!panel.includes('Método de assinatura'), 'panel must not request a signature method');
assert(!panel.includes('SIGNED_CONTRACT'), 'panel must not require signed PDF upload');
assert(!panel.includes('GOV_BR'), 'panel must not expose GOV.BR');
assert(routes.includes("/api/contracts/:id/sign-status"), 'server must expose simple sign-status endpoint');
assert(routes.includes("signatureMethod: 'MANUAL_CONFIRMATION'"), 'manual confirmation must be explicit in audit artifact');
assert(routes.includes("event: 'MANUAL_SIGN_STATUS'"), 'manual confirmation must create a server-side audit event');
assert(client.includes('setManualSignStatus'), 'client must use the simple sign-status endpoint');

console.log('contract simple sign status regression: ok');
