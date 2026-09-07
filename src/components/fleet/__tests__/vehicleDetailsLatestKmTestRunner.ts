import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildVehicleChangesFromReviewedCrlv,
  parseVehicleCrlvSelectedFields,
} from '../../../server/vehicleCrlvApplyAuthority';

const source = readFileSync(new URL('../VehicleDetailsModal.tsx', import.meta.url), 'utf8');
const vehicleDetailsBridgeSource = readFileSync(new URL('../../../domain/services/VehicleLegacyDetailsBridge.ts', import.meta.url), 'utf8');
const crlvSource = readFileSync(new URL('../VehicleCrlvImportPanel.tsx', import.meta.url), 'utf8');
const crlvRouteSource = readFileSync(new URL('../../../server/vehicleCrlvApplyRoutes.ts', import.meta.url), 'utf8');
const vehicleClientSource = readFileSync(new URL('../../../api/vehicleClient.ts', import.meta.url), 'utf8');
const attachmentModalSource = readFileSync(new URL('../../documents/AttachmentModal.tsx', import.meta.url), 'utf8');
const maintenanceHandoffSource = readFileSync(new URL('../../maintenance/MaintenanceCrlvHandoffPanel.tsx', import.meta.url), 'utf8');
const vehicleRoutesSource = readFileSync(new URL('../../../server/vehicleRoutes.ts', import.meta.url), 'utf8');
const vehicleIntakeRoutesSource = readFileSync(new URL('../../../server/vehicleDocumentIntakeRoutes.ts', import.meta.url), 'utf8');
const attachmentRoutesSource = readFileSync(new URL('../../../server/attachmentRoutes.ts', import.meta.url), 'utf8');
const vehicleIntakeClientSource = readFileSync(new URL('../../../api/vehicleDocumentIntakeClient.ts', import.meta.url), 'utf8');
const vehicleIntakeMigrationSource = readFileSync(new URL('../../../../drizzle/0056_vehicle_document_intake_authority.sql', import.meta.url), 'utf8');
const inspectionPanelSource = readFileSync(new URL('../VehicleInspectionPanel.tsx', import.meta.url), 'utf8');
const inspectionRoutesSource = readFileSync(new URL('../../../server/vehicleInspectionRoutes.ts', import.meta.url), 'utf8');
const inspectionMigrationSource = readFileSync(new URL('../../../../drizzle/0059_vehicle_inspections.sql', import.meta.url), 'utf8');
const fileUploadSource = readFileSync(new URL('../../documents/FileUpload.tsx', import.meta.url), 'utf8');
const fleetManagementSource = readFileSync(new URL('../FleetManagement.tsx', import.meta.url), 'utf8');
const vehicleIntakeModalSource = readFileSync(new URL('../VehicleDocumentIntakeModal.tsx', import.meta.url), 'utf8');
const vehicleIntakeAiQueueSource = readFileSync(new URL('../../../server/vehicleDocumentIntakeAiQueue.ts', import.meta.url), 'utf8');
const vehicleIntakeWorkerSyncSource = readFileSync(new URL('../../../server/vehicleDocumentIntakeAiWorkerSync.ts', import.meta.url), 'utf8');
const vehicleIntakeReviewSyncSource = readFileSync(new URL('../../../server/vehicleDocumentIntakeAiReviewSync.ts', import.meta.url), 'utf8');
const documentAiProcessorSource = readFileSync(new URL('../../../server/documentAiProcessor.ts', import.meta.url), 'utf8');
const geminiSource = readFileSync(new URL('../../../server/geminiDocumentAiProvider.ts', import.meta.url), 'utf8');
const documentAiQueueSource = readFileSync(new URL('../../../server/documentAiQueue.ts', import.meta.url), 'utf8');
const documentAiRoutesSource = readFileSync(new URL('../../../server/documentAiRoutes.ts', import.meta.url), 'utf8');

assert.ok(source.includes('Últimas 5 leituras de KM'), 'overview must label the bounded KM summary');
assert.ok(source.includes('summary.kmRecords.slice(0,5).map'), 'overview must render no more than five authorized readings');
assert.ok(source.includes("setActiveTab('km')"), 'overview must link to the complete odometer history');
assert.ok(source.includes('Nenhuma leitura de KM registrada.'), 'overview must preserve an explicit empty state');
assert.ok(source.includes('Foto do motorista') && source.includes('Rastreador') && source.includes('Origem'), 'KM history must expose source provenance');
assert.equal((source.match(/VehicleClient\.listKm\(/g) ?? []).length, 1, 'summary must reuse the existing server request');
assert.ok(source.includes("activeTab==='km'"), 'complete odometer tab must remain available');
assert.ok(source.includes('summary.kmRecords.map'), 'complete odometer tab must keep the full authorized history');

assert.ok(source.includes("Histórico / Auditoria"), 'vehicle details must expose a dedicated audit tab');
assert.ok(source.includes("Histórico e auditoria do veículo"), 'vehicle audit tab must explain the server-authoritative history');
assert.ok(source.includes("Responsável: {log.userName}"), 'vehicle audit must show the responsible user');
assert.ok(source.includes("Campos alterados:"), 'vehicle audit must summarize changed fields');
assert.ok(source.includes("Transição de status:"), 'vehicle audit must expose status transitions when present');
assert.ok(source.includes("Valores brutos não são exibidos nesta visão."), 'vehicle audit must not expose raw state payloads');
assert.ok(source.includes("Nenhum evento de auditoria registrado."), 'vehicle audit must preserve an explicit empty state');

assert.ok(vehicleDetailsBridgeSource.includes('MaintenanceClient.listSuppliers()'), 'vehicle maintenance history must resolve suppliers from the authorized catalog');
assert.ok(vehicleDetailsBridgeSource.includes('supplierNames.get(item.supplierId)'), 'maintenance history must project supplier names without exposing only internal ids');
assert.ok(vehicleDetailsBridgeSource.includes('MaintenancePreventiveClient.listOilChanges(vehicleId)'), 'vehicle maintenance history must include authoritative oil changes');
assert.ok(vehicleDetailsBridgeSource.includes('MaintenancePreventiveClient.listTires(vehicleId)'), 'vehicle maintenance history must include authoritative tire records and rotations');
assert.ok(vehicleDetailsBridgeSource.includes("type:'OIL_CHANGE'"), 'oil changes must retain a filterable history type');
assert.ok(vehicleDetailsBridgeSource.includes("type:'TIRE'"), 'tire events must retain a filterable history type');
assert.ok(source.includes("[maintenanceType,setMaintenanceType]=useState('ALL')"), 'maintenance history must expose an independent type filter');
assert.ok(source.includes("maintenanceType!=='ALL'&&m.type!==maintenanceType"), 'maintenance type must participate in the visible/report dataset');
assert.ok(source.includes('Pneu / rodízio') && source.includes('Troca de óleo'), 'maintenance type labels must be operator-readable');
assert.ok(source.includes('Oficina / fornecedor') && source.includes('m.supplierName'), 'vehicle maintenance history and reports must show the resolved workshop or supplier');
assert.ok(source.includes("setMaintenanceType('ALL')"), 'clearing filters must also reset maintenance type');
assert.ok(source.includes('<AttachmentList entityType="MaintenanceWorkOrder" entityId={m.id}/>'), 'internal work-order history must expose authorized invoice and part evidence');
assert.ok(source.includes("printMaintenanceHistory('INTERNAL')") && source.includes("printMaintenanceHistory('SALE')"), 'internal and sale maintenance reports must remain separate');

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
for (const key of ['tires','glassMirrors','bodyPaint','interior','dashboard','lighting','brakes','suspension','steering','engine','transmission','safety']) {
  assert.ok(inspectionPanelSource.includes(`'${key}'`), `technical inspection item missing: ${key}`);
}
for (const status of ['OK','ATTENTION','FAILED','NOT_APPLICABLE']) {
  assert.ok(inspectionPanelSource.includes(`'${status}'`), `technical inspection status missing: ${status}`);
}
assert.ok(inspectionPanelSource.includes('Bloqueado para locação'), 'inspection UI must expose the terminal operational result');
assert.ok(inspectionPanelSource.includes('Avalie todos os itens da vistoria técnica antes de salvar.'), 'technical inspection must be complete before submit');
assert.ok(inspectionRoutesSource.includes("CRITICAL_TECHNICAL_KEYS=new Set(['tires','brakes','steering','safety'])"), 'critical technical systems must be explicit server-side');
assert.ok(inspectionRoutesSource.includes("return 'BLOCKED_FOR_RENTAL'"), 'critical failure must derive blocked-for-rental result server-side');
assert.ok(inspectionRoutesSource.includes("status:VehicleStatus.BLOCKED"), 'blocked-for-rental result must block the vehicle server-side');
assert.ok(inspectionRoutesSource.includes("vehicle.status===VehicleStatus.SOLD||vehicle.status===VehicleStatus.ARCHIVED"), 'terminal vehicles must reject new inspections');
assert.ok(inspectionRoutesSource.includes("reason:'INSPECTION_CRITICAL_FAILURE'"), 'automatic block must be auditable');
assert.ok(!inspectionRoutesSource.includes("status:VehicleStatus.AVAILABLE"), 'inspection flow must never auto-unblock a vehicle');

assert.ok(vehicleIntakeRoutesSource.includes("/api/vehicle-document-intakes/:id/document-ai"), 'vehicle intake must expose a dedicated Document AI queue action');
assert.ok(vehicleIntakeRoutesSource.includes('enqueueVehicleDocumentIntake'), 'vehicle intake route must queue through server authority');
assert.ok(vehicleIntakeRoutesSource.includes('dispatchDocumentAiExtractionFromEnvironment'), 'vehicle intake must dispatch through the configured Document AI runtime');
assert.ok(vehicleIntakeAiQueueSource.includes("source:'VEHICLE_DOCUMENT_INTAKE'"), 'vehicle AI queue must audit its intake source');
assert.ok(vehicleIntakeAiQueueSource.includes("String(attachment.entityType)!=='VehicleDocumentIntake'"), 'vehicle AI queue must reject attachments outside the intake');
assert.ok(vehicleIntakeWorkerSyncSource.includes("status='EXTRACTING'"), 'worker result may transition only an extracting vehicle intake');
assert.ok(vehicleIntakeReviewSyncSource.includes('detected!==expectedType'), 'human approval must reject a mismatched detected document type');
assert.ok(vehicleIntakeReviewSyncSource.includes('businessMutationApplied:false'), 'human review must not create or mutate a Vehicle');
assert.ok(documentAiProcessorSource.includes('CRV: new Set') && documentAiProcessorSource.includes('ATPV_E: new Set'), 'Document AI processor must recognize CRV and ATPV-e');
assert.ok(geminiSource.includes("CRV: ['plate'") && geminiSource.includes("ATPV_E: ['plate'"), 'Gemini schema must recognize CRV and ATPV-e');
assert.ok(documentAiQueueSource.includes('syncVehicleDocumentIntakeWorkerResult'), 'shared Document AI worker must synchronize vehicle intake state');
assert.ok(documentAiRoutesSource.includes('syncVehicleDocumentIntakeHumanReview'), 'shared Document AI review must synchronize vehicle intake state');
assert.ok(vehicleIntakeClientSource.includes('static async analyze'), 'vehicle intake client must expose the Document AI action');
assert.ok(vehicleIntakeClientSource.includes('static async materialize'), 'vehicle intake client must expose approved materialization');
assert.ok(vehicleIntakeRoutesSource.includes('LEFT JOIN document_ai_extractions extraction'), 'materialization must keep the approved extraction join');
assert.ok(vehicleIntakeRoutesSource.includes('FOR UPDATE OF intake'), 'materialization must lock only the intake row when using an outer join');
assert.ok(!vehicleIntakeRoutesSource.includes('LIMIT 1 FOR UPDATE\n'), 'materialization must not use unqualified FOR UPDATE with the outer join');
assert.ok(fileUploadSource.includes("'VehicleDocumentIntake'"), 'shared uploader must accept pre-vehicle intake authority');
assert.ok(fleetManagementSource.includes('Cadastrar por documento com IA'), 'fleet page must expose the AI vehicle intake action');
assert.ok(fleetManagementSource.includes('<VehicleDocumentIntakeModal'), 'fleet page must render the AI intake modal');
assert.ok(vehicleIntakeModalSource.includes("VehicleDocumentIntakeClient.create"), 'AI vehicle flow must create a server-authoritative intake first');
assert.ok(vehicleIntakeModalSource.includes('VehicleDocumentIntakeClient.analyze'), 'AI vehicle flow must request Gemini analysis');
assert.ok(vehicleIntakeModalSource.includes("DocumentAiClient.review"), 'AI vehicle flow must require explicit human review');
assert.ok(vehicleIntakeModalSource.includes('VehicleClient.checkIdentityConflict(plate,renavam)'), 'AI vehicle flow must pre-check duplicate identity on the approved review screen');
assert.ok(vehicleIntakeModalSource.includes('Verificando Placa e RENAVAM antes do cadastro'), 'approved AI review screen must show identity verification before save');
assert.ok(vehicleIntakeModalSource.includes('Veículo já cadastrado — novo cadastro bloqueado'), 'approved AI review screen must surface the duplicate before materialization');
assert.ok(vehicleIntakeModalSource.includes('duplicateCheckPending||Boolean(duplicateVehicle)'), 'AI vehicle save button must stay disabled while duplicate check is pending or conflicted');
assert.ok(vehicleRoutesSource.includes("app.get('/api/fleet/vehicles/identity-conflict'"), 'vehicle authority must expose tenant-scoped identity pre-check before save');
assert.ok(vehicleIntakeModalSource.includes("VehicleDocumentIntakeClient.materialize"), 'AI vehicle flow must create the Vehicle only after approval');
assert.ok(vehicleIntakeModalSource.includes('Completar cadastro do veículo'), 'approved document must require post-CRLV completion before creation');
for (const requiredLabel of ['Cor *','Categoria *','KM Atual *','Valor de Compra (R$) *','Valor Comercial Atual (R$) *','Aluguel Semanal (R$) *']) {
  assert.ok(vehicleIntakeModalSource.includes(requiredLabel), `post-CRLV completion field missing: ${requiredLabel}`);
}
assert.ok(vehicleIntakeModalSource.includes('Nenhum valor financeiro é preenchido automaticamente pela IA.'), 'AI flow must not imply synthetic financial defaults');
assert.ok(vehicleIntakeClientSource.includes('body:JSON.stringify(input)'), 'materialization client must submit reviewed human completion data');
for (const invariant of [
  "materializationInput(req.body)",
  "color:text('color',true",
  "const category=text('category',true,120)!",
  "VEHICLE_CATEGORY_VALUES.has(category)",
  "currentKm=number('currentKm',true)",
  "acquisitionValue:number('acquisitionValue',true,true)",
  "currentValue:number('currentValue',true,true)",
  "rentalValueBase:number('rentalValueBase',true,true)",
  "kmValue: completion.currentKm",
]) {
  assert.ok(vehicleIntakeRoutesSource.includes(invariant), `post-CRLV server invariant missing: ${invariant}`);
}
assert.ok(vehicleIntakeRoutesSource.includes('new Set<string>(VEHICLE_CATEGORIES)'), 'post-CRLV category validation must reuse the canonical vehicle category catalog');
assert.match(readFileSync(new URL('../VehicleDocumentIntakeModal.tsx', import.meta.url), 'utf8'), /setInterval\(\(\)=>\{if\(!busy\)void refresh\(\);\},4000\)/, 'vehicle document AI must auto-refresh while processing');
assert.match(vehicleRoutesSource, /applyToVehicleContext[\s\S]*updateForCompany\(principal\.companyId, created\.id, \{ status: VehicleStatus\.AVAILABLE/, 'manual vehicle creation must finish as AVAILABLE after post-create integrations');
assert.match(vehicleIntakeRoutesSource, /applyToVehicleContext[\s\S]*updateForCompany\(principal\.companyId, created\.id, \{ status: VehicleStatus\.AVAILABLE/, 'vehicle AI materialization must finish as AVAILABLE after post-create integrations');
assert.ok(!vehicleIntakeRoutesSource.includes('acquisitionValue: 0, currentValue: 0, rentalValueBase: 0'), 'materialization must not persist zero financial defaults');
assert.ok(!vehicleIntakeRoutesSource.includes("category: DEFAULT_VEHICLE_CATEGORY"), 'materialization must not invent a generic vehicle category');
assert.ok(vehicleIntakeModalSource.includes('a IA apenas propõe os dados'), 'UI must explain that AI does not create the vehicle automatically');
assert.ok(vehicleIntakeModalSource.includes('Progresso estimado da análise documental'), 'vehicle AI flow must expose an accessible estimated progress bar');
assert.ok(vehicleIntakeModalSource.includes('Percentual estimado por etapa'), 'vehicle AI flow must label progress as estimated rather than provider telemetry');
assert.ok(vehicleIntakeModalSource.includes("status==='PROCESSING')return 70"), 'PROCESSING must map to a deterministic estimated percentage');
assert.ok(vehicleIntakeModalSource.includes('role="progressbar"'), 'vehicle AI progress must use progressbar semantics');
assert.ok(vehicleIntakeModalSource.includes("CRLV") && vehicleIntakeModalSource.includes("CRV") && vehicleIntakeModalSource.includes("ATPV-e"), 'AI vehicle flow must expose all approved initial document classes');



console.log('Vehicle latest KM, authoritative CRLV, pre-create intake and maintenance handoff regressions: PASS');