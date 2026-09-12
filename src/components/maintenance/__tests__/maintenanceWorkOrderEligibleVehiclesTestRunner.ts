import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../MaintenanceManagement.tsx', import.meta.url), 'utf8');
const repositorySource = readFileSync(new URL('../../../db/repositories/postgresMaintenanceRepository.ts', import.meta.url), 'utf8');

assert.match(source, /setVehicleLabels\(Object\.fromEntries\(veh\.map/, 'maintenance history must keep labels for vehicles outside the eligible work-order list');
assert.match(source, /const vehicleLabel = \(id: string\) => vehicleLabels\[id\] \|\| id;/, 'maintenance history must resolve vehicle plate/model before falling back to an internal id');
assert.doesNotMatch(repositorySource, /const \[partsResult, servicesResult, laborResult, financeResult\] = await Promise\.all/, 'work-order hydration must not execute concurrent queries on one transaction client');
assert.doesNotMatch(repositorySource, /return await Promise\.all\(rows\(result\)\.map\(\(row\) => this\.hydrate\(row\)\)\)/, 'work-order list hydration must not fan out concurrent queries on one transaction client');

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
assert.match(source, /<span>Serviços<\/span>[\s\S]*<span>Mão de obra<\/span>/, 'work-order cost summary must separate service and labor values');

assert.match(
  source,
  /max-h-\[calc\(100dvh-2rem\)\] flex-col overflow-hidden/,
  'new work-order modal shell must remain constrained to the viewport without scrolling the footer',
);
assert.match(
  source,
  /min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 pb-4/,
  'new work-order fields must scroll independently from the modal actions',
);
assert.match(
  source,
  /shrink-0 border-t[\s\S]*flex justify-end gap-2/,
  'new work-order actions must remain visible without overlapping form fields',
);
assert.doesNotMatch(
  source,
  /sticky bottom-0 z-10 border-t/,
  'new work-order footer must not overlay the lower financial fields',
);
assert.match(
  source,
  /MAINTENANCE_INVOICE[\s\S]*MAINTENANCE_PART_PHOTO[\s\S]*MAINTENANCE_DOCUMENT/,
  'work-order attachments must remain classified as invoice, part photo, or other maintenance evidence',
);

assert.match(source, /useState<WorkOrderView>\('ACTIVE'\)/, 'maintenance must default to the current operational work-order queue');
assert.match(source, /workOrderView==='ACTIVE'&&!historicalVehicle&&!\['COMPLETED','CANCELLED'\]\.includes\(wo\.status\)/, 'default queue must omit closed orders and orders from historical vehicles');
assert.match(source, /<option value="HISTORICAL">Veículos vendidos\/baixados<\/option>/, 'historical vehicle work orders must remain explicitly searchable');
assert.match(source, /<option value="ALL">Todas<\/option>/, 'operators must retain access to the complete work-order history');
assert.match(source, /setVehicleLifecycle\(Object\.fromEntries\(veh\.map/, 'historical filtering must derive vehicle lifecycle from the authorized vehicle payload');

console.log('Maintenance work-order eligible vehicles UX PASS');
