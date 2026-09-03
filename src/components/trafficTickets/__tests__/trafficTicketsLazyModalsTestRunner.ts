import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../TrafficTicketsManagement.tsx', import.meta.url), 'utf8');
const tollSource = readFileSync(new URL('../../tolls/TollPassagesManagement.tsx', import.meta.url), 'utf8');
const tollClient = readFileSync(new URL('../../../api/tollPassageClient.ts', import.meta.url), 'utf8');

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

assert.match(
  source,
  /const TollPassagesManagement=lazy\(\(\)=>import\('\.\.\/tolls\/TollPassagesManagement'\)/,
  'Free Flow management must remain lazy-loaded from traffic operations',
);
assert.match(source, /Pedágios \/ Free Flow/, 'traffic operations must expose the Free Flow entry');
assert.match(tollSource, /Nenhuma cobrança financeira é criada nesta etapa\./, 'Free Flow UI must disclose the no-finance boundary');
assert.match(tollSource, /Motorista, contrato, tenant e chave de idempotência não são enviados pelo formulário/, 'browser must not claim authority over derived toll links');
assert.match(tollClient, /JSON\.stringify\(input\)/, 'toll client must use the explicit create DTO');
const createInputStart=tollClient.indexOf('export interface CreateTollPassageInput');
const createInputEnd=tollClient.indexOf('type JsonRecord',createInputStart);
assert.ok(createInputStart>=0&&createInputEnd>createInputStart,'toll create DTO must be explicit');
const createInput=tollClient.slice(createInputStart,createInputEnd);
assert.doesNotMatch(createInput, /companyId|driverId|contractId|idempotencyKey/, 'toll create DTO must not accept protected authority fields');

console.log('Deferred traffic-ticket modals and Free Flow regression: PASS');
