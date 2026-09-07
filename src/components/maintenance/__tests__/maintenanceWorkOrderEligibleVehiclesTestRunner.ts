import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../MaintenanceManagement.tsx', import.meta.url), 'utf8');
const financeFields = readFileSync(new URL('../WorkOrderFinanceFields.tsx', import.meta.url), 'utf8');
const financeDefaultsMigration = readFileSync(new URL('../../../../drizzle/0067_finance_operational_defaults.sql', import.meta.url), 'utf8');

assert.match(
  source,
  /!\['SOLD','INACTIVE','ARCHIVED'\]\.includes\(String\(item\.status\)\)/,
  'maintenance UI must hide vehicles rejected by server lifecycle policy',
);
assert.match(
  source,
  /\{error&&<div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700/,
  'work-order modal must show command errors inside the modal',
);
assert.match(
  source,
  /\{error && !newWoOpen &&/,
  'page-level error must avoid duplicating the modal error while the work-order form is open',
);

assert.match(
  source,
  /!woVehicleId\|\|!woSupplierId\|\|!woServiceDate/,
  'new work orders must require a supplier or workshop before creation',
);
assert.match(
  source,
  /setWoParts\(\(current\)=>/,
  'new work orders must support accumulating multiple catalog parts',
);
assert.match(
  source,
  /parts:woParts\.map\(\(item\)=>\(\{partId:item\.partId,quantity:item\.quantity\}\)\)/,
  'all selected parts must be sent to the server-authoritative work-order create command',
);
assert.match(
  source,
  /Total estimado da OS/,
  'work-order form must preview its operational cost before creation',
);
assert.match(source, /WorkOrderFinanceFields/, 'new work orders must expose financial payment details before save');
assert.match(source, /laborAmount=\{woLaborGross\}/, 'labor payment must be configured separately from service payment');
assert.match(source, /Salvar OS/, 'new work-order footer must use an explicit save action');
assert.match(source, /Contas a Pagar na criação da OS/, 'completed flow must recognize finance generated at creation');
assert.match(financeFields, /Nenhuma categoria financeira de despesa está ativa/, 'empty maintenance category selector must explain how to resolve missing master data');
assert.match(financeFields, /Nenhuma forma de pagamento está ativa/, 'empty maintenance payment-method selector must explain how to resolve missing master data');
assert.match(financeDefaultsMigration, /'Manutenção'[\\s\\S]*'EXPENSE'/, 'operational defaults must seed the maintenance expense category');
for (const paymentName of ['PIX','Transferência','Dinheiro','Boleto','Cartão']) {
  assert.match(financeDefaultsMigration, new RegExp(`'${paymentName}'`), `operational defaults must seed payment method ${paymentName}`);
}
assert.match(source, /<span>Serviços<\/span>[\s\S]*<span>Mão de obra<\/span>/, 'work-order cost summary must separate service and labor values');

assert.match(
  source,
  /max-h-\[calc\(100dvh-2rem\)\] overflow-y-auto overscroll-contain/,
  'new work-order modal must remain vertically scrollable inside the viewport',
);
assert.match(
  source,
  /sticky bottom-0 z-10 border-t[\s\S]*flex justify-end gap-2/,
  'new work-order modal actions must remain reachable while the form scrolls',
);
assert.match(
  source,
  /MAINTENANCE_INVOICE[\s\S]*MAINTENANCE_PART_PHOTO[\s\S]*MAINTENANCE_DOCUMENT/,
  'work-order attachments must remain classified as invoice, part photo, or other maintenance evidence',
);

console.log('Maintenance work-order eligible vehicles UX PASS');
