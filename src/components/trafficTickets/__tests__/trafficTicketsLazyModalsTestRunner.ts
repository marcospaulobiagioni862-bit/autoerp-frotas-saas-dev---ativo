import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../TrafficTicketsManagement.tsx', import.meta.url), 'utf8');
const tollSource = readFileSync(new URL('../../tolls/TollPassagesManagement.tsx', import.meta.url), 'utf8');
const tollClient = readFileSync(new URL('../../../api/tollPassageClient.ts', import.meta.url), 'utf8');
const tollAuthority = readFileSync(new URL('../../../server/tollPassageAuthority.ts', import.meta.url), 'utf8');
const tollFinance = readFileSync(new URL('../../../server/tollPassageFinanceAuthority.ts', import.meta.url), 'utf8');
const tollRoutes = readFileSync(new URL('../../../server/tollPassageRoutes.ts', import.meta.url), 'utf8');
const tollAlerts = readFileSync(new URL('../../../server/tollPassageAlerts.ts', import.meta.url), 'utf8');
const recurringAlerts = readFileSync(new URL('../../../server/insuranceAlerts.ts', import.meta.url), 'utf8');
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
const createInputEnd=tollClient.indexOf('export interface TollPassageListFilters',createInputStart);
assert.ok(createInputStart>=0&&createInputEnd>createInputStart,'toll create DTO must be explicit');
const createInput=tollClient.slice(createInputStart,createInputEnd);
assert.doesNotMatch(createInput, /companyId|driverId|contractId|idempotencyKey/, 'toll create DTO must not accept protected authority fields');

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

assert.match(tollClient, /interface TollPassageListFilters\{[^}]*vehicleId\?:string;driverId\?:string;contractId\?:string;status\?:TollPassageStatus;concessionaire\?:string;occurredFrom\?:string;occurredTo\?:string;/, 'toll client must expose the accepted history filters');
assert.match(tollRoutes, /optionalDate\(req\.query\.occurredFrom\)/, 'history start date must be validated server-side');
assert.match(tollRoutes, /occurredFrom&&occurredTo&&occurredFrom>occurredTo/, 'invalid history date ranges must fail closed');
assert.match(tollAuthority, /LOWER\(concessionaire\)=LOWER\(/, 'concessionaire filtering must remain server-side');
assert.match(tollAuthority, /occurred_at>=/, 'history lower date boundary must be applied by the authority');
assert.match(tollAuthority, /occurred_at<\(/, 'history upper date boundary must include the whole selected day');
assert.match(tollSource, /Todos os veículos/, 'Free Flow history must expose a vehicle filter');
assert.match(tollSource, /Todos os motoristas/, 'Free Flow history must expose a driver filter');
assert.match(tollSource, /Filtrar por concessionária/, 'Free Flow history must expose a concessionaire filter');
assert.match(tollSource, /Aplicar filtros/, 'Free Flow filters must require an explicit server refresh');

assert.match(createInput, /source:TollPassageSource/, 'strict toll DTO must explicitly allow only known passage sources');
assert.match(tollSource, /accept="\.csv,text\/csv"/, 'Free Flow must expose a CSV-only file picker');
assert.match(tollSource, /lines\.length-1>500/, 'CSV import must cap rows before sending');
assert.match(tollSource, /file\.size>2_000_000/, 'CSV import must cap file size before parsing');
assert.match(tollSource, /CSV contém cabeçalho não permitido/, 'CSV import must reject unexpected columns');
assert.match(tollSource, /const rows=parseCsv\(await file\.text\(\)\)/, 'CSV must be fully parsed before the first create request');
assert.match(tollSource, /source:'CSV'/, 'CSV rows must be explicitly tagged as CSV origin');
assert.match(tollSource, /for\(const row of rows\)\{const result=await TollPassageClient\.create\(row\)/, 'validated CSV rows must reuse authoritative create semantics');
assert.match(tollSource, /Tenant, contrato, motorista e chave de idempotência continuam sob autoridade do servidor/, 'CSV UI must disclose protected server authority');
const csvParserStart=tollSource.indexOf('function parseCsv');
const csvParserEnd=tollSource.indexOf('\n\nexport const TollPassagesManagement',csvParserStart);
const csvImportStart=tollSource.indexOf('const importCsv=');
const csvImportEnd=tollSource.indexOf('return <div',csvImportStart);
assert.ok(csvParserStart>=0&&csvParserEnd>csvParserStart&&csvImportStart>=0&&csvImportEnd>csvImportStart,'CSV write path must be identifiable');
const csvWritePath=`${tollSource.slice(csvParserStart,csvParserEnd)}\n${tollSource.slice(csvImportStart,csvImportEnd)}`;
assert.doesNotMatch(csvWritePath, /companyId\s*:|driverId\s*:|contractId\s*:|idempotencyKey\s*:/, 'CSV/browser import must not send protected authority fields');

assert.match(tollAlerts, /p\.status IN \('PENDING','OVERDUE'\)/, 'toll alerts must only materialize for unpaid states');
assert.match(tollAlerts, /p\.due_date IS NOT NULL/, 'toll alerts require an authoritative due date');
assert.match(tollAlerts, /alertStageForDays\(days\)/, 'toll alerts must reuse the canonical expiration stages');
assert.match(tollAlerts, /TOLL_PASSAGE_ALERT:\$\{passage\.id\}:\$\{stage\}/, 'toll alerts must deduplicate by passage and stage');
assert.match(tollAlerts, /ON CONFLICT\(company_id,user_id,dedup_key\) DO NOTHING/, 'toll alerts must remain idempotent per tenant user');
assert.match(tollAlerts, /trustedSystemActor:'RECURRING'/, 'toll alerts must run only through the trusted recurring authority');
assert.match(recurringAlerts, /await materializeTollPassageAlerts\(companyId,today\)/, 'toll alerts must reuse the existing compliance sweep');
assert.doesNotMatch(tollAlerts, /Payable|Receivable|FinancialTransaction|getPayableRepo|getReceivableRepo|getTransactionRepo/, 'TOLL-1C alerts must not mutate finance');
assert.doesNotMatch(tollAlerts, /UPDATE toll_passages/, 'alert materialization must not rewrite passage state');

assert.match(tollRoutes, /\/api\/toll-passages\/:id\/company-payable/, 'TOLL-1F must expose an explicit company-payable action');
assert.match(tollRoutes, /new Set\(\['expenseCategoryId'\]\)/, 'company payable route must accept only the financial category input');
assert.match(tollFinance, /WHERE company_id=\$\{principal\.companyId\} AND id=\$\{passageId\}/, 'company payable lookup must remain tenant-scoped');
assert.match(tollFinance, /\['PENDING', 'OVERDUE'\]\.includes/, 'only unpaid toll states may create the company payable');
assert.match(tollFinance, /if \(!passage\.due_date\)/, 'company payable requires an authoritative toll due date');
assert.match(tollFinance, /financial_categories[\s\S]*company_id=\$\{companyId\}/, 'expense category validation must remain tenant-scoped');
assert.match(tollFinance, /PayableService\.create/, 'TOLL-1F must reuse the canonical payable service');
assert.match(tollFinance, /originType: TOLL_PASSAGE_COMPANY_ORIGIN/, 'toll company obligation must have a dedicated origin identity');
assert.match(tollFinance, /vehicleId:[\s\S]*driverId:[\s\S]*contractId:/, 'company payable must preserve derived vehicle, driver and contract traceability');
assert.doesNotMatch(tollFinance, /ReceivableService|FinancialTransaction/, 'TOLL-1F must not create driver receivables or settlements');

console.log('Deferred traffic-ticket modals and Free Flow regression: PASS');
