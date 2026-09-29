import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../VehicleSaleModal.tsx', import.meta.url), 'utf8');
const restoreModal = readFileSync(new URL('../VehicleRestoreModal.tsx', import.meta.url), 'utf8');
const fleet = readFileSync(new URL('../FleetManagement.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../../api/vehicleClient.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../../server/vehicleLifecycleRoutes.ts', import.meta.url), 'utf8');
const historyModal = readFileSync(new URL('../ArchivedVehicleHistoryModal.tsx', import.meta.url), 'utf8');
const lifecycleMigration = readFileSync(new URL('../../../../drizzle/0053_vehicle_lifecycle_events.sql', import.meta.url), 'utf8');

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

assert.match(historyModal, /CPF\/CNPJ do comprador:/, 'sold vehicle history must display buyer document');
assert.match(historyModal, /Valor da venda:/, 'sold vehicle history must display sale value');
assert.match(historyModal, /KM na venda:/, 'sold vehicle history must display final sale km');
assert.match(historyModal, /Tipo da baixa:/, 'sold vehicle history must display disposal type');
assert.match(historyModal, /Registrado por:/, 'sold vehicle history must display the sale author');
assert.match(routes, /creator\.name AS created_by_name/, 'lifecycle read model must resolve the author name server-side');
assert.match(client, /createdByName\?: string;/, 'lifecycle client must expose the resolved author name');

// Reentry is a dedicated audited lifecycle action. Generic SOLD -> AVAILABLE remains blocked elsewhere.
assert.match(lifecycleMigration, /'RESTORED'/, 'existing lifecycle schema must already allow RESTORED without a new migration');
assert.match(routes, /app\.post\('\/api\/fleet\/vehicles\/:id\/restore'/, 'sold vehicle reentry must use a dedicated server route');
assert.match(routes, /findByIdForCompanyWithLock/, 'reentry must lock the authoritative vehicle row');
assert.match(routes, /existing\.status !== VehicleStatus\.SOLD \|\| existing\.isArchived/, 'reentry must accept only sold, non-archived vehicles');
assert.match(routes, /findActiveByVehicle/, 'reentry must derive active contract state server-side');
assert.match(routes, /hasBlockingWorkOrder/, 'reentry must derive blocking maintenance server-side');
assert.match(routes, /status: VehicleStatus\.AVAILABLE,[\s\S]*isArchived: false/, 'reentry must restore the same vehicle row to available inventory');
assert.match(routes, /const action: VehicleLifecycleAction = 'RESTORED'/, 'reentry must append a RESTORED lifecycle event');
assert.match(routes, /restoredVehicleId: existing\.id/, 'audit must prove the original vehicle identity was reused');
assert.doesNotMatch(routes, /restore[\s\S]{0,2500}(createReceivable|createPayable|createContract)/, 'reentry must not auto-create finance or contracts');
assert.match(client, /action: 'SOLD' \| 'ARCHIVED' \| 'RESTORED'/, 'client history parser must accept RESTORED lifecycle events');
assert.match(client, /static async restore\(/, 'client must expose dedicated reentry action');
assert.match(fleet, /Retornar ao estoque/, 'historical fleet UI must expose explicit reentry for sold vehicles');
assert.match(restoreModal, /Data da reentrada \*/, 'reentry modal must require an effective date');
assert.match(restoreModal, /Motivo da reentrada \/ recompra \*/, 'reentry modal must require a reason');
assert.match(restoreModal, /mesmo ID/, 'reentry UI must explain identity preservation');
assert.match(restoreModal, /não cria nem altera contrato ou título financeiro automaticamente/, 'reentry UI must disclose absence of automatic side effects');

console.log('Vehicle sale buyer-required and reentry regression: PASS');