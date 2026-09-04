import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildVehicleChangesFromReviewedCrlv,
  parseVehicleCrlvSelectedFields,
} from '../../../server/vehicleCrlvApplyAuthority';

const source = readFileSync(new URL('../VehicleDetailsModal.tsx', import.meta.url), 'utf8');
const crlvSource = readFileSync(new URL('../VehicleCrlvImportPanel.tsx', import.meta.url), 'utf8');
const crlvRouteSource = readFileSync(new URL('../../../server/vehicleCrlvApplyRoutes.ts', import.meta.url), 'utf8');
const vehicleClientSource = readFileSync(new URL('../../../api/vehicleClient.ts', import.meta.url), 'utf8');
const attachmentModalSource = readFileSync(new URL('../../documents/AttachmentModal.tsx', import.meta.url), 'utf8');
const maintenanceHandoffSource = readFileSync(new URL('../../maintenance/MaintenanceCrlvHandoffPanel.tsx', import.meta.url), 'utf8');
const vehicleIntakeRoutesSource = readFileSync(new URL('../../../server/vehicleDocumentIntakeRoutes.ts', import.meta.url), 'utf8');
const attachmentRoutesSource = readFileSync(new URL('../../../server/attachmentRoutes.ts', import.meta.url), 'utf8');
const vehicleIntakeClientSource = readFileSync(new URL('../../../api/vehicleDocumentIntakeClient.ts', import.meta.url), 'utf8');
const vehicleIntakeMigrationSource = readFileSync(new URL('../../../../drizzle/0056_vehicle_document_intake_authority.sql', import.meta.url), 'utf8');
const inspectionPanelSource = readFileSync(new URL('../VehicleInspectionPanel.tsx', import.meta.url), 'utf8');
const inspectionRoutesSource = readFileSync(new URL('../../../server/vehicleInspectionRoutes.ts', import.meta.url), 'utf8');
const inspectionMigrationSource = readFileSync(new URL('../../../../drizzle/0059_vehicle_inspections.sql', import.meta.url), 'utf8');
const fileUploadSource = readFileSync(new URL('../../documents/FileUpload.tsx', import.meta.url), 'utf8');

assert.ok(source.includes('Últimas 5 leituras de KM'), 'overview must label the bounded KM summary');
assert.ok(source.includes('summary.kmRecords.slice(0,5).map'), 'overview must render no more than five authorized readings');
assert.ok(source.includes("setActiveTab('km')"), 'overview must link to the complete odometer history');
assert.ok(source.includes('Nenhuma leitura de KM registrada.'), 'overview must preserve an explicit empty state');
assert.equal((source.match(/VehicleClient\.listKm\(/g) ?? []).length, 1, 'summary must reuse the existing server request');
assert.ok(source.includes("activeTab==='km'"), 'complete odometer tab must remain available');
assert.ok(source.includes('summary.kmRecords.map'), 'complete odometer tab must keep the full authorized history');

assert.ok(crlvSource.includes("DocumentAiClient.list('APPROVED')"), 'CRLV comparison must use approved extractions only');
assert.ok(crlvSource.includes("attachment.documentType === 'CRLV'"), 'CRLV comparison must be restricted to vehicle CRLV attachments');
assert.ok(crlvSource.includes("extraction.detectedDocumentType === 'CRLV'"), 'CRLV comparison must reject another detected document type');
assert.ok(crlvSource.includes('...(approvedExtraction.corrections || {})'), 'human corrections must override provider proposals in the comparison');
assert.ok(crlvSource.includes('Valor atual') && crlvSource.includes('Valor lido'), 'CRLV review must show current versus reviewed values');
assert.ok(crlvSource.includes('type="checkbox"'), 'review fields must support explicit operator selection');
assert.ok(crlvSource.includes('VehicleClient.applyApprovedCrlv('), 'selected CRLV fields must use the dedicated authoritative endpoint');
assert.ok(crlvSource.includes('disabled={applying || selectedFields.size === 0}'), 'apply must require an explicit non-empty selection');
assert.ok(!crlvSource.includes('VehicleClient.update'), 'CRLV UI must not write browser-derived field values through the generic vehicle update');
assert.ok(vehicleClientSource.includes('JSON.stringify({ extractionId, fields })'), 'CRLV client must send identifiers and selected field names only');

assert.ok(attachmentModalSource.includes("entityType === 'MaintenanceWorkOrder'"), 'maintenance attachment modal must expose the dedicated CRLV handoff only for work orders');
assert.ok(attachmentModalSource.includes('MaintenanceCrlvHandoffPanel'), 'maintenance attachment modal must render the isolated handoff panel');
assert.ok(maintenanceHandoffSource.includes('Usar este CRLV para revisar dados do veículo'), 'maintenance operator must receive an explicit CRLV review action');
assert.ok(maintenanceHandoffSource.includes("entityType: 'MaintenanceWorkOrder'"), 'handoff panel must read attachments under maintenance authority');
assert.ok(maintenanceHandoffSource.includes('VehicleClient.reuseMaintenanceCrlv(workOrderId, attachment.id)'), 'handoff must send only work order and attachment identifiers');
assert.ok(!maintenanceHandoffSource.includes('AttachmentClient.upload'), 'handoff must never perform a second upload');
assert.ok(vehicleClientSource.includes("'/api/fleet/vehicles/crlv-from-maintenance'"), 'handoff client must use the dedicated authoritative endpoint');
assert.ok(vehicleClientSource.includes('JSON.stringify({ workOrderId, attachmentId })'), 'handoff client must not send browser-derived vehicle identity or storage data');

const selected = parseVehicleCrlvSelectedFields(['plate', 'renavam', 'chassis', 'brand', 'manufactureYear']);
const changes = buildVehicleChangesFromReviewedCrlv(
  {
    plate: 'abc-1d23',
    renavam: '12345678901',
    chassis: '9BWZZZ377VT004251',
    brand: 'VW',
    manufactureYear: 2024,
  },
  { brand: 'Volkswagen' },
  selected,
);
assert.equal(changes.plate, 'ABC1D23', 'reviewed plate must be normalized on the server');
assert.equal(changes.renavam, '12345678901', 'reviewed RENAVAM must be validated and normalized');
assert.equal(changes.chassis, '9BWZZZ377VT004251', 'reviewed chassis must be strongly validated');
assert.equal(changes.brand, 'Volkswagen', 'human correction must override the provider proposal on apply');
assert.equal(changes.yearFabrication, 2024, 'manufactureYear must map to vehicle yearFabrication');
assert.throws(() => parseVehicleCrlvSelectedFields(['ownerName']), 'non-mappable CRLV fields must be rejected');
assert.throws(() => parseVehicleCrlvSelectedFields(['plate', 'plate']), 'duplicate selections must be rejected');
assert.throws(() => buildVehicleChangesFromReviewedCrlv({ plate: 'INVALID' }, {}, ['plate']), 'invalid plate must fail closed');
assert.throws(() => buildVehicleChangesFromReviewedCrlv({ renavam: '123' }, {}, ['renavam']), 'invalid RENAVAM must fail closed');
assert.throws(() => buildVehicleChangesFromReviewedCrlv({ chassis: 'ABC' }, {}, ['chassis']), 'invalid chassis must fail closed');

for (const invariant of [
  "eq(documentAiExtractions.companyId, principal.companyId)",
  "extraction.status !== 'APPROVED'",
  "extraction.detectedDocumentType !== 'CRLV'",
  "eq(fileAttachments.entityType, 'Vehicle')",
  'eq(fileAttachments.entityId, existing.id)',
  "eq(fileAttachments.documentType, 'CRLV')",
  'extraction.proposedFields',
  'extraction.corrections',
  'getAuditLogRepo().create',
]) {
  assert.ok(crlvRouteSource.includes(invariant), `CRLV authority invariant missing: ${invariant}`);
}
for (const invariant of [
  "source.entityType !== 'MaintenanceWorkOrder'",
  'source.entityId !== workOrder.id',
  "source.contentState !== 'AVAILABLE'",
  "source.storageProvider !== 'SERVER_FS'",
  "source.storageProvider !== 'R2'",
  "documentType: 'CRLV'",
  "entityType: 'Vehicle'",
  'source.storageKey',
  'source.checksum',
  "event: 'CRLV_MAINTENANCE_HANDOFF'",
]) {
  assert.ok(crlvRouteSource.includes(invariant), `maintenance CRLV handoff invariant missing: ${invariant}`);
}
assert.ok(crlvRouteSource.includes("attachmentRepo.findByEntity(principal.companyId, 'Vehicle', vehicle.id)"), 'handoff must be idempotent against an existing Vehicle CRLV reference');
assert.ok(!crlvRouteSource.includes('req.body?.plate'), 'server must not accept browser-supplied CRLV field values');

for (const invariant of [
  'vehicle_document_intakes',
  "document_type IN ('CRLV','CRV','ATPV_E')",
  'ENABLE ROW LEVEL SECURITY',
  'FORCE ROW LEVEL SECURITY',
  "company_id = current_setting('app.current_tenant', true)",
]) {
  assert.ok(vehicleIntakeMigrationSource.includes(invariant), `vehicle intake migration invariant missing: ${invariant}`);
}
assert.ok(vehicleIntakeRoutesSource.includes("app.post('/api/vehicle-document-intakes'"), 'vehicle intake must exist before Vehicle creation');
assert.ok(vehicleIntakeRoutesSource.includes('action: AuditAction.CREATE'), 'vehicle intake creation must be audited');
assert.ok(vehicleIntakeRoutesSource.includes('created_by=${principal.userId}'), 'vehicle intake reads must remain actor scoped');
assert.ok(attachmentRoutesSource.includes("entityType==='VehicleDocumentIntake'"), 'attachment authority must recognize pre-vehicle intake');
assert.ok(attachmentRoutesSource.includes("status='DOCUMENT_UPLOADED'"), 'vehicle intake upload must advance intake state');
assert.ok(attachmentRoutesSource.includes("['CRLV','CRV','ATPV_E']"), 'pre-vehicle intake must only accept approved vehicle document classes');
assert.ok(vehicleIntakeClientSource.includes("VehicleIntakeDocumentType = 'CRLV' | 'CRV' | 'ATPV_E'"), 'client must expose only approved initial vehicle document classes');
assert.ok(!vehicleIntakeRoutesSource.includes('getVehicleRepo().create'), 'intake foundation must never create a Vehicle automatically');
assert.ok(source.includes("{id:'inspections',label:'Vistorias'"), 'vehicle details must expose a dedicated inspections tab');
assert.ok(source.includes("<VehicleInspectionPanel vehicleId={vehicle.id} currentKm={vehicle.currentKm}/>"), 'vehicle inspection tab must be linked to the current vehicle');
assert.ok(inspectionPanelSource.includes("setType('ENTRY')") && inspectionPanelSource.includes("setType('EXIT')"), 'inspection UI must distinguish only entry versus exit type');
assert.equal((inspectionPanelSource.match(/const ITEMS=/g) ?? []).length, 1, 'entry and exit inspections must share one checklist definition');
for (const key of ['keyMain','keySpare','crlvPrinted','phoneHolder','jack','triangle','wheelWrench','spareTire','seatCover','ownerManual','floorMats','multimedia']) {
  assert.ok(inspectionPanelSource.includes(`'${key}'`), `inspection checklist item missing: ${key}`);
}
assert.ok(inspectionPanelSource.includes("entityType=\"VehicleInspection\""), 'inspection media must attach to the inspection itself');
assert.ok(inspectionPanelSource.includes("'video/mp4'"), 'inspection UI must permit MP4 video evidence');
assert.ok(fileUploadSource.includes("'VehicleInspection'"), 'shared uploader must recognize inspection authority');
assert.ok(inspectionRoutesSource.includes("inspectionType:type"), 'server must persist the explicit inspection type');
assert.ok(inspectionRoutesSource.includes("readingType:type==='ENTRY'?'CHECK_IN':'CHECK_OUT'"), 'inspection KM must integrate with odometer history');
assert.ok(inspectionRoutesSource.includes("if(odometer<vehicle.currentKm)"), 'inspection must reject KM regression');
assert.ok(inspectionMigrationSource.includes("inspection_type IN ('ENTRY','EXIT')"), 'database must restrict inspections to entry or exit');
assert.ok(inspectionMigrationSource.includes('ENABLE ROW LEVEL SECURITY') && inspectionMigrationSource.includes('FORCE ROW LEVEL SECURITY'), 'inspection table must remain tenant isolated');


console.log('Vehicle latest KM, authoritative CRLV, pre-create intake and maintenance handoff regressions: PASS');