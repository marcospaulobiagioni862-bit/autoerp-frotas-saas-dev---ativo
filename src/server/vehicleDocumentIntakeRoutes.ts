import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction, VEHICLE_CATEGORIES, VehicleStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import {
  VehicleDocumentIntakeAiConflictError,
  VehicleDocumentIntakeAiNotFoundError,
  enqueueVehicleDocumentIntake,
} from './vehicleDocumentIntakeAiQueue';
import {
  dispatchDocumentAiExtractionFromEnvironment,
  isDocumentAiRuntimeAvailableFromEnvironment,
} from './documentAiRuntime';

type Action = 'VIEW_VEHICLE' | 'CREATE_VEHICLE' | 'PROCESS_DOCUMENT_AI';
const ROLES = new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','FINANCIAL','OPERATIONAL','READONLY']);
const WRITE_ROLES = new Set(['ADMIN','MANAGER','OPERATIONAL_MANAGER','OPERATIONAL']);
const DOCUMENT_TYPES = new Set(['CRLV','CRV','ATPV_E']);
const VEHICLE_CATEGORY_VALUES = new Set<string>(VEHICLE_CATEGORIES);
const TTL_MS = 24 * 60 * 60 * 1000;
const APPROVED_DRAFT_FIELDS = new Set([
  'plate','renavam','chassis','brand','model','manufactureYear','modelYear','fuel','ownerName',
]);
const MATERIALIZATION_FIELDS = new Set([
  'color','category','currentKm','nextMaintenanceKm','acquisitionValue','currentValue','rentalValueBase','version','notes',
]);

class ValidationError extends Error {}
class NotFoundError extends Error {}
class ConflictError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}
function requirePrincipal(req: Request, res: Response, action: Action): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) { res.status(401).json({ error: 'Unauthorized: Authentication required' }); return null; }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  const allowed = !!principal.userId && !!principal.companyId && ROLES.has(role) &&
    (permissions.includes('*') || permissions.includes(action) || action === 'VIEW_VEHICLE' || WRITE_ROLES.has(role));
  if (!allowed) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return principal;
}
function documentType(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase().replace(/[-/ ]/g, '_') : '';
  if (!DOCUMENT_TYPES.has(normalized)) throw new ValidationError();
  return normalized;
}
function map(row: any) {
  return {
    id: String(row.id), companyId: String(row.company_id), createdBy: String(row.created_by),
    status: String(row.status), idempotencyKey: String(row.idempotency_key),
    documentType: String(row.document_type), attachmentId: row.attachment_id ? String(row.attachment_id) : undefined,
    approvedExtractionId: row.approved_extraction_id ? String(row.approved_extraction_id) : undefined,
    vehicleId: row.vehicle_id ? String(row.vehicle_id) : undefined,
    expiresAt: new Date(row.expires_at).toISOString(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : undefined,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
function requireEmptyBody(body: unknown): void {
  if (body === undefined || body === null) return;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body as Record<string, unknown>).length !== 0) throw new ValidationError();
}
function sanitizeExtraction(item: any) {
  return {
    id:String(item.id),
    attachmentId:String(item.attachmentId),
    attachmentChecksum:String(item.attachmentChecksum),
    status:String(item.status),
    createdAt:new Date(item.createdAt).toISOString(),
    updatedAt:new Date(item.updatedAt).toISOString(),
  };
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function normalizePlate(value: unknown): string {
  const plate = text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) throw new ConflictError();
  return plate;
}
function requiredNonNegative(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new ValidationError();
  return parsed;
}
function optionalNonNegative(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredNonNegative(value);
}
function optionalYear(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9999) throw new ConflictError();
  return parsed;
}
function projectApprovedVehicleDraft(proposedFields: unknown, corrections: unknown): Record<string, string | number> {
  const merged = { ...record(proposedFields), ...record(corrections) };
  const projected: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!APPROVED_DRAFT_FIELDS.has(key)) continue;
    if (typeof value === 'string') {
      const clean = value.trim();
      if (clean) projected[key] = clean;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      projected[key] = value;
    }
  }
  return projected;
}
function parseMaterialization(body: unknown) {
  const input = record(body);
  const keys = Object.keys(input);
  if (keys.some((key) => !MATERIALIZATION_FIELDS.has(key))) throw new ValidationError();
  const color = text(input.color);
  const category = text(input.category);
  if (!color || !VEHICLE_CATEGORY_VALUES.has(category)) throw new ValidationError();
  const currentKm = requiredNonNegative(input.currentKm);
  if (!Number.isInteger(currentKm)) throw new ValidationError();
  const nextMaintenanceKm = optionalNonNegative(input.nextMaintenanceKm);
  if (nextMaintenanceKm !== undefined && !Number.isInteger(nextMaintenanceKm)) throw new ValidationError();
  return {
    color,
    category,
    currentKm,
    nextMaintenanceKm,
    acquisitionValue: requiredNonNegative(input.acquisitionValue),
    currentValue: requiredNonNegative(input.currentValue),
    rentalValueBase: requiredNonNegative(input.rentalValueBase),
    version: text(input.version) || undefined,
    notes: text(input.notes) || undefined,
  };
}
async function loadApprovedVehicleDraft(context: any, principal: AuthenticatedPrincipal, intakeId: string) {
  const tx = context.getRawTransaction?.(); if (!tx) throw new Error('Raw tenant transaction unavailable');
  const result: any = await tx.execute(sql`
    SELECT
      intake.status AS intake_status,
      intake.document_type,
      intake.attachment_id,
      intake.approved_extraction_id,
      extraction.id AS extraction_id,
      extraction.attachment_id AS extraction_attachment_id,
      extraction.status AS extraction_status,
      extraction.detected_document_type,
      extraction.proposed_fields,
      extraction.corrections
    FROM vehicle_document_intakes intake
    JOIN document_ai_extractions extraction
      ON extraction.company_id = intake.company_id
     AND extraction.id = intake.approved_extraction_id
    WHERE intake.company_id = ${principal.companyId}
      AND intake.id = ${intakeId}
      AND intake.created_by = ${principal.userId}
    LIMIT 1
  `);
  const row = result.rows?.[0];
  if (!row) throw new NotFoundError();
  const expectedType = String(row.document_type || '').toUpperCase();
  if (
    String(row.intake_status) !== 'APPROVED' ||
    !row.attachment_id || !row.approved_extraction_id ||
    String(row.approved_extraction_id) !== String(row.extraction_id) ||
    String(row.attachment_id) !== String(row.extraction_attachment_id) ||
    String(row.extraction_status) !== 'APPROVED' ||
    String(row.detected_document_type || '').toUpperCase().replace(/[-/ ]/g, '_') !== expectedType
  ) throw new ConflictError();
  const fields = projectApprovedVehicleDraft(row.proposed_fields, row.corrections);
  if (Object.keys(fields).length === 0) throw new ConflictError();
  return { documentType: expectedType, fields };
}
async function materializeApprovedVehicleIntake(
  context: any,
  principal: AuthenticatedPrincipal,
  intakeId: string,
  input: ReturnType<typeof parseMaterialization>,
) {
  const tx = context.getRawTransaction?.(); if (!tx) throw new Error('Raw tenant transaction unavailable');
  const result: any = await tx.execute(sql`
    SELECT
      intake.status AS intake_status,
      intake.document_type,
      intake.attachment_id,
      intake.approved_extraction_id,
      intake.vehicle_id,
      intake.expires_at,
      intake.consumed_at,
      extraction.id AS extraction_id,
      extraction.attachment_id AS extraction_attachment_id,
      extraction.status AS extraction_status,
      extraction.detected_document_type,
      extraction.proposed_fields,
      extraction.corrections,
      attachment.entity_type,
      attachment.entity_id,
      attachment.document_type AS attachment_document_type,
      attachment.content_state,
      attachment.is_archived
    FROM vehicle_document_intakes intake
    JOIN document_ai_extractions extraction
      ON extraction.company_id = intake.company_id
     AND extraction.id = intake.approved_extraction_id
    JOIN file_attachments attachment
      ON attachment.company_id = intake.company_id
     AND attachment.id = intake.attachment_id
    WHERE intake.company_id = ${principal.companyId}
      AND intake.id = ${intakeId}
      AND intake.created_by = ${principal.userId}
    LIMIT 1
    FOR UPDATE OF intake, attachment
  `);
  const row = result.rows?.[0];
  if (!row) throw new NotFoundError();

  const attachmentId = text(row.attachment_id);
  const approvedExtractionId = text(row.approved_extraction_id);
  const expectedType = text(row.document_type).toUpperCase();
  const detectedType = text(row.detected_document_type).toUpperCase().replace(/[-/ ]/g, '_');
  if (
    !attachmentId || !approvedExtractionId ||
    approvedExtractionId !== text(row.extraction_id) ||
    attachmentId !== text(row.extraction_attachment_id) ||
    text(row.extraction_status) !== 'APPROVED' ||
    detectedType !== expectedType
  ) throw new ConflictError();

  if (text(row.intake_status) === 'CONSUMED') {
    const vehicleId = text(row.vehicle_id);
    if (!vehicleId || !row.consumed_at || text(row.entity_type) !== 'Vehicle' || text(row.entity_id) !== vehicleId) throw new ConflictError();
    const existing = await context.getVehicleRepo().findByIdForCompany(principal.companyId, vehicleId);
    if (!existing) throw new NotFoundError();
    return { vehicleId, attachmentId, created: false };
  }

  const expiresAt = new Date(String(row.expires_at)).getTime();
  if (
    text(row.intake_status) !== 'APPROVED' ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
    text(row.entity_type) !== 'VehicleDocumentIntake' || text(row.entity_id) !== intakeId ||
    text(row.attachment_document_type).toUpperCase().replace(/[-/ ]/g, '_') !== expectedType ||
    text(row.content_state) !== 'AVAILABLE' || row.is_archived === true ||
    row.vehicle_id || row.consumed_at
  ) throw new ConflictError();

  const fields = projectApprovedVehicleDraft(row.proposed_fields, row.corrections);
  const plate = normalizePlate(fields.plate);
  const renavam = text(fields.renavam);
  const brand = text(fields.brand);
  const model = text(fields.model);
  if (!renavam || !brand || !model) throw new ConflictError();

  const repo = context.getVehicleRepo();
  if (await repo.findByPlate(principal.companyId, plate)) throw new ConflictError();
  if (await repo.findByRenavam(principal.companyId, renavam)) throw new ConflictError();

  const now = new Date().toISOString();
  const vehicleId = randomUUID();
  const vehicle = await repo.create({
    id: vehicleId,
    companyId: principal.companyId,
    plate,
    renavam,
    brand,
    model,
    version: input.version,
    yearFabrication: optionalYear(fields.manufactureYear),
    yearModel: optionalYear(fields.modelYear),
    color: input.color,
    chassis: text(fields.chassis).toUpperCase(),
    currentKm: input.currentKm,
    nextMaintenanceKm: input.nextMaintenanceKm,
    fuelType: text(fields.fuel) || 'Flex',
    category: input.category,
    acquisitionValue: input.acquisitionValue,
    currentValue: input.currentValue,
    rentalValueBase: input.rentalValueBase,
    status: VehicleStatus.AVAILABLE,
    notes: input.notes,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });

  await context.getKmRecordRepo().create({
    id: randomUUID(), companyId: principal.companyId, vehicleId: vehicle.id,
    kmValue: input.currentKm, recordDate: now.split('T')[0], readingType: 'PERIODIC',
    notes: 'Cadastro inicial do veículo via documento aprovado', createdAt: now,
  });
  await context.getAuditLogRepo().create({
    id: randomUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: vehicle.id,
    action: AuditAction.CREATE, newState: JSON.stringify({ ...vehicle, source: 'VehicleDocumentIntake', intakeId }),
    userId: principal.userId, userName: principal.name, timestamp: now,
  });

  const attachmentUpdate: any = await tx.execute(sql`
    UPDATE file_attachments
    SET entity_name='Vehicle', entity_type='Vehicle', entity_id=${vehicle.id}
    WHERE company_id=${principal.companyId}
      AND id=${attachmentId}
      AND entity_type='VehicleDocumentIntake'
      AND entity_id=${intakeId}
      AND content_state='AVAILABLE'
      AND is_archived=false
    RETURNING id
  `);
  if (attachmentUpdate.rows?.length !== 1) throw new ConflictError();
  await context.getAuditLogRepo().create({
    id: randomUUID(), companyId: principal.companyId, entityName: 'FileAttachment', entityId: attachmentId,
    action: AuditAction.UPDATE,
    previousState: JSON.stringify({ entityType: 'VehicleDocumentIntake', entityId: intakeId }),
    newState: JSON.stringify({ event: 'PROMOTE_TO_VEHICLE', entityType: 'Vehicle', entityId: vehicle.id }),
    userId: principal.userId, userName: principal.name, timestamp: now,
  });

  const intakeUpdate: any = await tx.execute(sql`
    UPDATE vehicle_document_intakes
    SET status='CONSUMED', vehicle_id=${vehicle.id}, consumed_at=${now}, updated_at=${now}
    WHERE company_id=${principal.companyId}
      AND id=${intakeId}
      AND created_by=${principal.userId}
      AND status='APPROVED'
      AND attachment_id=${attachmentId}
      AND approved_extraction_id=${approvedExtractionId}
      AND vehicle_id IS NULL
      AND consumed_at IS NULL
    RETURNING id
  `);
  if (intakeUpdate.rows?.length !== 1) throw new ConflictError();
  await context.getAuditLogRepo().create({
    id: randomUUID(), companyId: principal.companyId, entityName: 'VehicleDocumentIntake', entityId: intakeId,
    action: AuditAction.UPDATE,
    previousState: JSON.stringify({ status: 'APPROVED' }),
    newState: JSON.stringify({ event: 'MATERIALIZE_VEHICLE', status: 'CONSUMED', vehicleId: vehicle.id, attachmentId }),
    userId: principal.userId, userName: principal.name, timestamp: now,
  });

  return { vehicleId: vehicle.id, attachmentId, created: true };
}
function scheduleDocumentAiExtraction(companyId:string,extractionId:string):void {
  setImmediate(()=>{
    void dispatchDocumentAiExtractionFromEnvironment(companyId,extractionId,`vehicle-intake-${extractionId}`).catch(()=>{
      console.error('AUTOERP_VEHICLE_DOCUMENT_AI_DISPATCH_FAILURE');
    });
  });
}
function sendError(res: Response, error: unknown): void {
  if (error instanceof ValidationError) { res.status(400).json({ error: 'Invalid vehicle document intake request' }); return; }
  if (error instanceof NotFoundError || error instanceof VehicleDocumentIntakeAiNotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
  if (error instanceof ConflictError || error instanceof VehicleDocumentIntakeAiConflictError) { res.status(409).json({ error: 'Vehicle document intake conflict' }); return; }
  console.error('AUTOERP_VEHICLE_DOCUMENT_INTAKE_FAILURE', error);
  res.status(500).json({ error: 'Vehicle document intake operation failed' });
}

export function registerVehicleDocumentIntakeRoutes(app: Express): void {
  app.post('/api/vehicle-document-intakes', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'CREATE_VEHICLE'); if (!principal) return;
    const key = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    if (!key || key.length > 200) { sendError(res, new ValidationError()); return; }
    let type: string; try { type = documentType(req.body?.documentType); } catch (error) { sendError(res, error); return; }
    try {
      const result = await UnitOfWork.run(principal.companyId, async (context) => {
        const tx = context.getRawTransaction?.(); if (!tx) throw new Error('Raw tenant transaction unavailable');
        const existingResult: any = await tx.execute(sql`
          SELECT * FROM vehicle_document_intakes
          WHERE company_id=${principal.companyId} AND idempotency_key=${key}
          LIMIT 1
        `);
        const existing = existingResult.rows?.[0];
        if (existing) {
          if (String(existing.created_by) !== principal.userId || String(existing.document_type) !== type) throw new ConflictError();
          return { item: map(existing), created: false };
        }
        const id = randomUUID(), now = new Date(), expiresAt = new Date(now.getTime() + TTL_MS);
        const insertedResult: any = await tx.execute(sql`
          INSERT INTO vehicle_document_intakes
            (id,company_id,created_by,status,idempotency_key,document_type,expires_at,created_at,updated_at)
          VALUES
            (${id},${principal.companyId},${principal.userId},'DRAFT',${key},${type},${expiresAt.toISOString()},${now.toISOString()},${now.toISOString()})
          ON CONFLICT (company_id,idempotency_key) DO NOTHING
          RETURNING *
        `);
        const row = insertedResult.rows?.[0];
        if (!row) throw new ConflictError();
        const item = map(row);
        await context.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'VehicleDocumentIntake', entityId: item.id,
          action: AuditAction.CREATE, newState: JSON.stringify({ event: 'CREATE', status: item.status, documentType: item.documentType }),
          userId: principal.userId, userName: principal.name, timestamp: now.toISOString(),
        });
        return { item, created: true };
      });
      res.status(result.created ? 201 : 200).json({ item: result.item });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/vehicle-document-intakes/:id/document-ai', async (req: Request, res: Response) => {
    const principal=requirePrincipal(req,res,'PROCESS_DOCUMENT_AI'); if(!principal) return;
    try{
      requireEmptyBody(req.body);
      if(!isDocumentAiRuntimeAvailableFromEnvironment()){
        res.status(503).json({error:'Análise automática de documento veicular indisponível neste ambiente.',code:'DOCUMENT_AI_RUNTIME_UNAVAILABLE'});
        return;
      }
      const intakeId=String(req.params.id||'').trim();
      if(!intakeId) throw new ValidationError();
      const result=await UnitOfWork.run(principal.companyId,async context=>enqueueVehicleDocumentIntake(context,principal,intakeId));
      scheduleDocumentAiExtraction(principal.companyId,String(result.item.id));
      res.status(result.created?201:200).json({item:sanitizeExtraction(result.item),created:result.created});
    }catch(error){sendError(res,error);}
  });

  app.get('/api/vehicle-document-intakes/:id/approved-draft', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_VEHICLE'); if (!principal) return;
    try {
      const intakeId = String(req.params.id || '').trim();
      if (!intakeId) throw new ValidationError();
      const draft = await UnitOfWork.run(principal.companyId, async (context) => loadApprovedVehicleDraft(context, principal, intakeId));
      res.json({ draft });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/vehicle-document-intakes/:id/materialize-vehicle', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'CREATE_VEHICLE'); if (!principal) return;
    try {
      const intakeId = String(req.params.id || '').trim();
      if (!intakeId) throw new ValidationError();
      const input = parseMaterialization(req.body);
      const result = await UnitOfWork.run(principal.companyId, async (context) => materializeApprovedVehicleIntake(context, principal, intakeId, input));
      res.status(result.created ? 201 : 200).json({ item: result });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/vehicle-document-intakes/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_VEHICLE'); if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (context) => {
        const tx = context.getRawTransaction?.(); if (!tx) throw new Error('Raw tenant transaction unavailable');
        const result: any = await tx.execute(sql`
          SELECT * FROM vehicle_document_intakes
          WHERE company_id=${principal.companyId} AND id=${req.params.id} AND created_by=${principal.userId}
          LIMIT 1
        `);
        if (!result.rows?.[0]) throw new NotFoundError();
        return map(result.rows[0]);
      });
      res.json({ item });
    } catch (error) { sendError(res, error); }
  });
}
