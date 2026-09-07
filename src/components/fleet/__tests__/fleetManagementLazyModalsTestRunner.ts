import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatCurrencyInputBRL, parseCurrencyInput } from '../../../shared/utils/currency';

const source = readFileSync(new URL('../FleetManagement.tsx', import.meta.url), 'utf8');
const intakeSource = readFileSync(new URL('../VehicleDocumentIntakeModal.tsx', import.meta.url), 'utf8');
const vehicleFormSource = readFileSync(new URL('../VehicleFormModal.tsx', import.meta.url), 'utf8');
const statusPresentationSource = readFileSync(new URL('../vehicleStatusPresentation.ts', import.meta.url), 'utf8');
const productionSidebarSource = readFileSync(new URL('../../layout/ProductionSidebar.tsx', import.meta.url), 'utf8');
const kmBatchSource = readFileSync(new URL('../VehicleKmBatchModal.tsx', import.meta.url), 'utf8');
const kmBatchAuthoritySource = readFileSync(new URL('../../../server/vehicleKmReadingAuthority.ts', import.meta.url), 'utf8');
const kmBatchRoutesSource = readFileSync(new URL('../../../server/vehicleKmReadingRoutes.ts', import.meta.url), 'utf8');
const vehicleRoutesSource = readFileSync(new URL('../../../server/vehicleRoutes.ts', import.meta.url), 'utf8');
const vehicleIdentityGuardSource = readFileSync(new URL('../../../server/vehicleIdentityGuard.ts', import.meta.url), 'utf8');
const vehicleIdentityMigrationSource = readFileSync(new URL('../../../../drizzle/0065_vehicle_normalized_identity_guard.sql', import.meta.url), 'utf8');
const kmBatchMigrationSource = readFileSync(new URL('../../../../drizzle/0064_vehicle_km_batch_schedule.sql', import.meta.url), 'utf8');
const kmAlertAuthoritySource = readFileSync(new URL('../../../server/vehicleKmAlertAuthority.ts', import.meta.url), 'utf8');
const kmAlertMigrationSource = readFileSync(new URL('../../../../drizzle/0066_vehicle_km_whatsapp_alerts.sql', import.meta.url), 'utf8');
const pendingCenterSource = readFileSync(new URL('../../operations/PendingCenterView.tsx', import.meta.url), 'utf8');
const overviewDashboardSource = readFileSync(new URL('../../dashboard/OverviewDashboard.tsx', import.meta.url), 'utf8');
const operationalPendingSource = readFileSync(new URL('../../../domain/operations/serverOperationalPendingProjection.ts', import.meta.url), 'utf8');

const modals = ['VehicleFormModal', 'VehicleDetailsModal', 'RecordKmModal'] as const;

for (const modal of modals) {
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
  (source.match(/=lazy\(\(\)=>import\('\.\/(?:VehicleFormModal|VehicleDetailsModal|RecordKmModal)'/g) ?? []).length,
  modals.length,
  'FleetManagement must define exactly three lazy modal loaders',
);
assert.match(source, /\{isFormOpen&&<VehicleFormModal/, 'vehicle form must render only when open');
assert.match(
  source,
  /\{selectedVehicleIdForDetails&&<VehicleDetailsModal/,
  'vehicle details must render only with a selected server id',
);
assert.match(
  source,
  /\{vehicleForKmRecord&&<RecordKmModal/,
  'KM recording must render only with its authorized vehicle',
);
assert.match(
  source,
  /<LazyModuleErrorBoundary resetKey=\{fleetModalResetKey\} onRetry=\{\(\)=>window\.location\.reload\(\)\}>/,
  'fleet modal recovery must reset between modal targets',
);
assert.match(
  source,
  /<Suspense fallback=\{<div role="status"[^>]*>.*Carregando dados do veículo\.\.\./,
  'fleet modals must expose a neutral loading state',
);
assert.doesNotMatch(
  source,
  /error\.(?:message|stack)|String\(error\)/,
  'fleet modal fallback must not expose raw errors',
);

assert.match(source, /Ações do veículo/, 'vehicle cards must expose an explicit lifecycle action area');
assert.match(source, /Histórico do veículo/, 'terminal vehicles must expose the read-only history action area');
assert.match(source, />O histórico não será apagado\.</, 'lifecycle actions must explain history preservation');
assert.match(
  source,
  /handleStatusChangeClick\(vehicle, VehicleStatus\.INACTIVE\)/,
  'out-of-use action must reuse the authoritative INACTIVE status transition',
);
assert.match(source, />\s*Fora de uso\s*</, 'out-of-use action must be visible without the generic status selector');
assert.match(
  source,
  /nextValue === '__SELL__'[\s\S]*setVehicleForSale\(vehicle\)/,
  'sold option in status selector must open the dedicated sale flow',
);
assert.match(
  source,
  /value: '__SELL__', label: 'Vender veículo\.\.\.'/,
  'eligible vehicle cards must expose Vender veículo in the status selector',
);
assert.match(
  source,
  /targetStatus === VehicleStatus\.INACTIVE[\s\S]*O histórico não será apagado\./,
  'out-of-use confirmation must preserve the explicit history warning',
);

assert.match(intakeSource, /const failed=extraction\?\.status==='FAILED';/, 'vehicle document intake must expose a failed analysis state');
assert.match(intakeSource, /Análise falhou/, 'failed analysis must have a visible status');
assert.match(intakeSource, /DocumentAiClient\.retry\(extraction\.id\)/, 'failed analysis must reuse the authoritative retry endpoint');
assert.match(intakeSource, /Tentar análise novamente/, 'failed analysis must expose an explicit retry action');
assert.match(intakeSource, /Cadastrar veículo manualmente/, 'failed analysis must allow a safe manual fallback');
assert.match(source, /onManualRequested=\{\(\) => \{ setIsVehicleAiOpen\(false\); setVehicleToEdit\(null\); setIsFormOpen\(true\); \}\}/, 'manual fallback must close the intake and open a blank vehicle form');

assert.match(intakeSource, /useRef\(false\)/, 'vehicle materialization must use a synchronous duplicate-submit lock');
assert.match(intakeSource, /VehicleClient\.list\(\)/, 'vehicle intake must pre-check authoritative fleet identifiers');
assert.match(intakeSource, /normalizedIdentifier\(vehicle\.plate\)===plate/, 'vehicle intake must detect duplicate plates');
assert.match(intakeSource, /normalizedIdentifier\(vehicle\.renavam\)===renavam/, 'vehicle intake must detect duplicate RENAVAM');
assert.match(intakeSource, /Este veículo já possui cadastro no sistema\./, 'vehicle intake must explain the duplicate vehicle conflict');
assert.match(intakeSource, /Abrir cadastro existente/, 'duplicate vehicle warning must offer direct access to the existing record');
assert.match(intakeSource, /disabled=\{busy\|\|materializingRef\.current\|\|Boolean\(duplicateVehicle\)\}/, 'vehicle materialization button must remain locked for duplicate or concurrent submission');

assert.equal(parseCurrencyInput('1.250,56'), 1250.56, 'BRL input must parse dot thousands and comma decimals');
assert.equal(parseCurrencyInput('1250.56'), 1250.56, 'canonical decimal values must remain compatible');
assert.equal(formatCurrencyInputBRL(1250.56), '1.250,56', 'BRL input must render Brazilian separators');
assert.match(vehicleFormSource, /CurrencyInput label="Valor de Aquisição \(R\$\) \*"/, 'manual vehicle monetary inputs must use BRL formatting');
assert.doesNotMatch(vehicleFormSource, /nextMaintenanceKm: 10000/, 'new vehicle form must not invent a 10,000 KM maintenance target');
assert.match(vehicleFormSource, /formData\.nextMaintenanceKm < formData\.currentKm/, 'manual form must reject maintenance KM below current KM');
assert.match(vehicleFormSource, /formData\.acquisitionValue <= 0/, 'manual form must reject non-positive financial values');
assert.match(vehicleFormSource, /VehicleClient\.list\(\)/, 'manual vehicle form must pre-check normalized identity');
assert.match(vehicleFormSource, /Este veículo já possui cadastro no sistema:/, 'manual vehicle form must explain duplicate identity');
assert.match(source, /Duplicidade cadastral detectada/, 'fleet must surface already-existing duplicate records');
assert.match(source, /normalizedVehicleIdentifier/, 'fleet duplicate warning must normalize Plate and RENAVAM');
assert.match(intakeSource, /CurrencyInput label="Valor de Compra \(R\$\) \*"/, 'AI vehicle monetary inputs must use BRL formatting');

assert.doesNotMatch(statusPresentationSource, /\{ id: VehicleStatus\.WAITING_MAINTENANCE,/, 'legacy waiting-maintenance status must not appear as a separate filter');
assert.match(source, /v\.status === VehicleStatus\.MAINTENANCE \|\| v\.status === VehicleStatus\.WAITING_MAINTENANCE/, 'legacy waiting-maintenance vehicles must count under Em manutenção');

assert.match(productionSidebarSource, /window\.matchMedia\('\(max-width: 767px\)'\)/, 'production sidebar must decide compact mode at runtime');
assert.match(productionSidebarSource, /data-testid="desktop-sidebar"/, 'desktop sidebar must have an explicit persistent render path');
assert.doesNotMatch(productionSidebarSource, /className="hidden md:block h-dvh/, 'desktop sidebar must not rely on a hidden Tailwind breakpoint');

assert.match(source, /Quilometragem em lote/, 'fleet must expose the KM batch action');
assert.match(source, /const VehicleKmBatchModal=lazy\(\(\)=>import\('\.\/VehicleKmBatchModal'\)/, 'KM batch modal must remain lazy-loaded');
assert.match(source, /\{isKmBatchOpen&&<VehicleKmBatchModal/, 'KM batch modal must render only when explicitly opened');
assert.match(kmBatchSource, /VehicleKmReadingClient\.recordBatch\(entries\)/, 'KM batch UI must use the authoritative batch endpoint');
assert.match(kmBatchSource, /documentType="KM_ODOMETER_PHOTO"/, 'driver odometer photo must use dedicated evidence classification');
assert.match(kmBatchSource, /VehicleKmReadingClient\.trackerCandidate\(vehicle\.id\)/, 'tracker KM must be resolved by the server before batch submit');
assert.match(kmBatchSource, /value: 'WEEKLY', label: 'Semanal'/, 'vehicle KM scheduling must support weekly frequency');
assert.match(kmBatchSource, /value: 'MONTHLY', label: 'Mensal'/, 'vehicle KM scheduling must support monthly frequency');
assert.match(kmBatchSource, /Dias 29–31 usam o último dia válido/, 'monthly scheduling must explain end-of-month clamping');
assert.match(kmBatchAuthoritySource, /findByIdForCompanyWithLock/, 'KM batch must lock each vehicle before changing odometer authority');
assert.match(kmBatchAuthoritySource, /input\.kmValue!==undefined[\s\S]*KM do rastreador deve ser derivado pelo servidor/, 'tracker KM must reject browser-supplied odometer values');
assert.match(kmBatchAuthoritySource, /sourceType==='DRIVER_PHOTO'[\s\S]*KM_ODOMETER_PHOTO/, 'photo readings must verify dedicated vehicle evidence');
assert.match(kmBatchAuthoritySource, /kmValue<vehicle\.currentKm/, 'KM batch must reject odometer regression');
assert.doesNotMatch(kmBatchAuthoritySource, /FinancialTransaction|PAYABLE|RECEIVABLE|SettlementService/, 'KM batch stage must not mutate finance');
assert.match(kmBatchRoutesSource, /new Set\(\['vehicleId','sourceType','kmValue','sourceAttachmentId'\]\)/, 'KM batch route must use a narrow browser payload');
assert.match(vehicleRoutesSource, /registerVehicleKmReadingRoutes\(app\)/, 'vehicle route composition must register KM batch endpoints');
assert.doesNotMatch(kmBatchRoutesSource, /(?:req\.body|body)\??\.(?:companyId|userId|userName)/, 'KM batch route body must not trust browser tenant or actor authority');
assert.match(kmBatchMigrationSource, /source_type IN \('MANUAL','DRIVER_PHOTO','TRACKER'\)/, 'KM persistence must restrict source classifications');
assert.match(kmBatchMigrationSource, /FORCE ROW LEVEL SECURITY/, 'KM schedule persistence must enforce tenant RLS');
assert.match(vehicleRoutesSource, /findVehicleIdentityConflict\(txContext, principal\.companyId, plate, renavam\)/, 'manual create must compare normalized Plate and RENAVAM');
assert.match(vehicleIdentityGuardSource, /regexp_replace\(upper\(trim\(coalesce\(plate,''\)\)\), '\[\^A-Z0-9\]'/, 'server identity lookup must normalize legacy plate formatting');
assert.match(vehicleIdentityMigrationSource, /pg_advisory_xact_lock/, 'database must serialize competing vehicle identity writes');
assert.match(vehicleIdentityMigrationSource, /vehicles_normalized_identity_unique/, 'database must guard normalized vehicle identities');

assert.match(kmBatchSource, /VehicleKmReadingClient\.prepareWhatsapp\(vehicleIds\)/, 'KM WhatsApp batch action must reuse selected vehicle rows');
assert.match(kmBatchSource, /O provedor continua desabilitado; nenhum envio externo foi realizado\./, 'KM WhatsApp batch UI must explain provider-disabled behavior');
assert.match(kmAlertAuthoritySource, /const ALERT_LEAD_DAYS=2;/, 'KM alerts must use the explicit near-due threshold');
assert.match(kmAlertAuthoritySource, /const TRACKER_FRESH_MS=24\*60\*60\*1000;/, 'KM alerts must define tracker freshness explicitly');
assert.match(kmAlertAuthoritySource, /if\(fresh\)return 'Rastreador possui leitura recente e confiável/, 'fresh tracker reading must suppress WhatsApp');
assert.match(kmAlertAuthoritySource, /referenceId=\`\$\{vehicleId\}:\$\{alert\.dueDate\}\`/, 'KM WhatsApp idempotency must bind to vehicle and reading cycle');
assert.match(kmAlertAuthoritySource, /'HELD_PROVIDER_DISABLED'/, 'KM WhatsApp must remain provider-disabled');
assert.doesNotMatch(kmAlertAuthoritySource, /axios|fetch\(|twilio|meta\.com|graph\.facebook|provider\.send/, 'KM WhatsApp authority must not call an external provider');
assert.match(kmAlertMigrationSource, /KM_READING_REQUEST/, 'KM WhatsApp template must be persisted in the catalog');
assert.match(kmAlertMigrationSource, /VEHICLE_KM_READING/, 'KM WhatsApp outbox must use a dedicated reference type');
assert.match(operationalPendingSource, /category: 'Quilometragem'/, 'operational projection must include KM reading alerts');
assert.match(operationalPendingSource, /actionKind: alert\.whatsappEligible \? 'REQUEST_KM_WHATSAPP'/, 'KM alert projection must expose WhatsApp action only when eligible');
assert.match(pendingCenterSource, /VehicleKmReadingClient\.listAlerts\(\)/, 'central alerts must load KM reading alerts');
assert.match(pendingCenterSource, /Preparar WhatsApp/, 'central alerts must expose KM WhatsApp action');
assert.match(pendingCenterSource, /\{ id: 'KM', label: 'Quilometragem' \}/, 'central alerts must expose a KM filter');
assert.match(overviewDashboardSource, /Leituras de KM aguardando atualização:/, 'dashboard must visibly expose KM reading alerts');
assert.match(overviewDashboardSource, /VehicleKmReadingClient\.prepareWhatsapp\(\[alert\.vehicleId\]\)/, 'dashboard must prepare KM WhatsApp from the alert');

console.log('Deferred fleet modals regression: PASS');
