import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../TrafficTicketsManagement.tsx', import.meta.url), 'utf8');

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

console.log('Deferred traffic-ticket modals regression: PASS');
