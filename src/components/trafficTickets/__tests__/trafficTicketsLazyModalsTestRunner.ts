import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../TrafficTicketsManagement.tsx', import.meta.url), 'utf8');
const tollAuthority = readFileSync(new URL('../../../server/tollPassageAuthority.ts', import.meta.url), 'utf8');
const tollRoutes = readFileSync(new URL('../../../server/tollPassageRoutes.ts', import.meta.url), 'utf8');
const tollMigration = readFileSync(new URL('../../../../drizzle/0054_toll_passage_authority.sql', import.meta.url), 'utf8');

for (const modal of ['TrafficTicketFormModal', 'TrafficTicketDetailsModal']) {
  assert.equal(
    new RegExp(`import\\s+\\{\\s*${modal}\\s*\\}\\s+from`).test(source),
    false,
    `${modal} must not remain a static import`,
  );
  assert.match(
    source,
    new RegExp(`const\\s+${modal}=lazy\\(\\(\\)=>import\\('\\./${modal}'\\)`),
    `${modal} must be loaded through React.lazy`,
  );
}
assert.equal(
  (source.match(/=lazy\(\(\)=>import\('\.\/TrafficTicket(?:Form|Details)Modal'/g) ?? []).length,
  2,
  'traffic tickets must define exactly two lazy modal loaders',
);
assert.match(source, /\{isFormOpen&&<TrafficTicketFormModal/, 'ticket form must render only when open');
assert.match(
  source,
  /\{selectedTicketId&&<TrafficTicketDetailsModal/,
  'ticket details must render only with a selected server id',
);
assert.match(
  source,
  /<LazyModuleErrorBoundary resetKey=\{ticketModalResetKey\} onRetry=\{\(\)=>window\.location\.reload\(\)\}>/,
  'ticket modal recovery must reset between modal targets',
);
assert.match(source, /Carregando dados da multa\.\.\./, 'ticket loading must remain neutral');
assert.doesNotMatch(
  source,
  /error\.(?:message|stack)|String\(error\)/,
  'ticket modal fallback must not expose raw errors',
);

assert.match(tollMigration, /FORCE ROW LEVEL SECURITY/, 'toll passages must enforce tenant RLS');
assert.match(tollMigration, /UNIQUE \(company_id, idempotency_key\)/, 'toll idempotency must remain tenant-scoped');
assert.match(tollAuthority, /resolveVehicle\(rawTx,principal\.companyId/, 'toll vehicle identity must come from server tenant authority');
assert.match(tollAuthority, /start_date<=\$\{occurredDate\}/, 'toll contract resolution must use the passage date');
assert.match(tollAuthority, /matches\.length!==1\)return \{\}/, 'ambiguous contract resolution must not guess a contract');
assert.match(tollAuthority, /input\.vehicleId[\s\S]*normalizedIdentity\(input\.concessionaire\)[\s\S]*input\.sourceReference/, 'external references must be scoped by vehicle and concessionaire');
assert.match(tollAuthority, /replayOrConflict\(existing,canonical\)/, 'idempotent replay must verify canonical payload');
assert.match(tollAuthority, /throw new TollPassageConflictError/, 'divergent replay must fail closed');
assert.match(tollRoutes, /TollPassageConflictError[\s\S]*res\.status\(409\)/, 'divergent external-reference replay must return HTTP 409');
assert.doesNotMatch(tollAuthority, /Payable|Receivable|FinancialTransaction|getPayableRepo|getReceivableRepo|getTransactionRepo/, 'TOLL-1A must not mutate finance');

console.log('Deferred traffic-ticket modals and toll authority regression: PASS');
