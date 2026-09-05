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
type VehicleMaterializationInput = {
  color:string; category:string; currentKm:number; acquisitionValue:number; currentValue:number; rentalValueBase:number;
  version?:string; nextMaintenanceKm?:number; notes?:string;
};
function materializationInput(body: unknown): VehicleMaterializationInput {
  const input=record(body);
  const allowed=new Set(['color','category','currentKm','acquisitionValue','currentValue','rentalValueBase','version','nextMaintenanceKm','notes']);
  if(!Object.keys(input).every(key=>allowed.has(key))) throw new ValidationError();
  const text=(key:string,required=false,max=500):string|undefined=>{
    const value=input[key];
    if(value===undefined||value===null||value===''){if(required)throw new ValidationError();return undefined;}
    if(typeof value!=='string')throw new ValidationError();
    const clean=value.trim(); if((required&&!clean)||clean.length>max)throw new ValidationError(); return clean||undefined;
  };
  const number=(key:string,required=false,positive=false):number|undefined=>{
    const raw=input[key];
    if(raw===undefined||raw===null||raw===''){if(required)throw new ValidationError();return undefined;}
    if(typeof raw!=='number'||!Number.isFinite(raw)||raw<0||(positive&&raw<=0))throw new ValidationError();
    return raw;
  };
  const currentKm=number('currentKm',true)!;
  const nextMaintenanceKm=number('nextMaintenanceKm');
  if(nextMaintenanceKm!==undefined&&nextMaintenanceKm<currentKm)throw new ValidationError();
  const category=text('category',true,120)!;
  if(!VEHICLE_CATEGORY_VALUES.has(category))throw new ValidationError();
  return {
    color:text('color',true,80)!, category,
    currentKm, acquisitionValue:number('acquisitionValue',true,true)!, currentValue:number('currentValue',true,true)!,
    rentalValueBase:number('rentalValueBase',true,true)!, version:text('version',false,200),
    nextMaintenanceKm, notes:text('notes',false,2000),
  };
}
function sanitizeExtraction(item: any) {
  return {
    id:String(item.id), attachmentId:String(item.attachmentId), attachmentChecksum:String(item.attachmentChecksum),
    status:String(item.status), createdAt:new Date(item.createdAt).toISOString(), updatedAt:new Date(item.updatedAt).toISOString(),
  };
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function projectApprovedVehicleDraft(proposedFields: unknown, corrections: unknown): Record<string, string | number> {
  const merged = { ...record(proposedFields), ...record(corrections) };
  const projected: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!APPROVED_DRAFT_FIELDS.has(key)) continue;
    if (typeof value === 'string') {
      const clean = value.trim();
      if (clean) projected[key] = clean;
    } else if (typeof value === 'number' && Number.isFinite(value)) projected[key] = value;
  }
  return projected;
}
function requiredDraftText(fields: Record<string, string | number>, key: string): string {
  const value = fields[key];
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) throw new ConflictError();
  return clean;
}
function normalizedDraftPlate(fields: Record<string, string | number>): string {
  const plate = requiredDraftText(fields, 'plate').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) throw new ConflictError();
  return plate;
}
function draftYear(fields: Record<string, string | number>, key: string): number {
  const raw = fields[key];
  if (raw === undefined) throw new ConflictError();
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1900 || value > 2200) throw new ConflictError();
  return value;
}
async function loadApprovedVehicleDraft(context: any, principal: AuthenticatedPrincipal, intakeId: string) {
  const tx = context.getRawTransaction?.(); if (!tx) throw new Error('Raw tenant transaction unavailable');
  const result: any = await tx.execute(sql`
    SELECT intake.status AS intake_status, intake.document_type, intake.attachment_id, intake.approved_extraction_id,
      extraction.id AS extraction_id, extraction.attachment_id AS extraction_attachment_id,
      extraction.status AS extraction_status, extraction.detected_document_type,
      extraction.proposed_fields, extraction.corrections
    FROM vehicle_document_intakes intake
    JOIN document_ai_extractions extraction ON extraction.company_id = intake.company_id AND extraction.id = intake.approved_extraction_id
    WHERE intake.company_id = ${principal.companyId} AND intake.id = ${intakeId} AND intake.created_by = ${principal.userId}
    LIMIT 1
  `);
  const row = result.rows?.[0];
  if (!row) throw new NotFoundError();
  const expectedType = String(row.document_type || '').toUpperCase();
  if (String(row.intake_status) !== 'APPROVED' || !row.attachment_id || !row.approved_extraction_id ||
    String(row.approved_extraction_id) !== String(row.extraction_id) ||
    String(row.attachment_id) !== String(row.extraction_attachment_id) || String(row.extraction_status) !== 'APPROVED' ||
    String(row.detected_document_type || '').toUpperCase().replace(/[-/ ]/g, '_') !== expectedType) throw new ConflictError();
  const fields = projectApprovedVehicleDraft(row.proposed_fields, row.corrections);
  if (Object.keys(fields).length === 0) throw new ConflictError();
  return { documentType: expectedType, fields };
}
function scheduleDocumentAiExtraction(companyId:string,extractionId:string):void {
  setImmediate(()=>{ void dispatchDocumentAiExtractionFromEnvironment(companyId,extractionId,`vehicle-intake-${extractionId}`).catch(()=>{
    console.error('AUTOERP_VEHICLE_DOCUMENT_AI_DISPATCH_FAILURE');
  }); });
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
        const existingResult: any = await tx.execute(sql`SELECT * FROM vehicle_document_intakes WHERE company_id=${principal.companyId} AND idempotency_key=${key} LIMIT 1`);
        const existing = existingResult.rows?.[0];
        if (existing) {
          if (String(existing.created_by) !== principal.userId || String(existing.document_type) !== type) throw new ConflictError();
          return { item: map(existing), created: false };
        }
        const id = randomUUID(), now = new Date(), expiresAt = new Date(now.getTime() + TTL_MS);
        const insertedResult: any = await tx.execute(sql`
          INSERT INTO vehicle_document_intakes (id,company_id,created_by,status,idempotency_key,document_type,expires_at,created_at,updated_at)
          VALUES (${id},${principal.companyId},${principal.userId},'DRAFT',${key},${type},${expiresAt.toISOString()},${now.toISOString()},${now.toISOString()})
          ON CONFLICT (company_id,idempotency_key) DO NOTHING RETURNING *
        `);
        const row = insertedResult.rows?.[0]; if (!row) throw new ConflictError();
        const item = map(row);
        await context.getAuditLogRepo().create({ id: randomUUID(), companyId: principal.companyId, entityName: 'VehicleDocumentIntake', entityId: item.id,
          action: AuditAction.CREATE, newState: JSON.stringify({ event: 'CREATE', status: item.status, documentType: item.documentType }),
          userId: principal.userId, userName: principal.name, timestamp: now.toISOString() });
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
        res.status(503).json({error:'Análise automática de documento veicular indisponível neste ambiente.',code:'DOCUMENT_AI_RUNTIME_UNAVAILABLE'}); return;
      }
      const intakeId=String(req.params.id||'').trim(); if(!intakeId) throw new ValidationError();
      const result=await UnitOfWork.run(principal.companyId,async context=>enqueueVehicleDocumentIntake(context,principal,intakeId));
      scheduleDocumentAiExtraction(principal.companyId,String(result.item.id));
      res.status(result.created?201:200).json({item:sanitizeExtraction(result.item),created:result.created});
    }catch(error){sendError(res,error);}
  });

  app.get('/api/vehicle-document-intakes/:id/approved-draft', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_VEHICLE'); if (!principal) return;
    try {
      const intakeId = String(req.params.id || '').trim(); if (!intakeId) throw new ValidationError();
      const draft = await UnitOfWork.run(principal.companyId, async (context) => loadApprovedVehicleDraft(context, principal, intakeId));
      res.json({ draft });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/vehicle-document-intakes/:id/materialize', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'CREATE_VEHICLE'); if (!principal) return;
    try {
      const completion=materializationInput(req.body);
      const intakeId = String(req.params.id || '').trim(); if (!intakeId) throw new ValidationError();
      const result = await UnitOfWork.run(principal.companyId, async (context) => {
        const tx = context.getRawTransaction?.(); if (!tx) throw new Error('Raw tenant transaction unavailable');
        const locked: any = await tx.execute(sql`
          SELECT intake.*, extraction.id AS extraction_id, extraction.attachment_id AS extraction_attachment_id,
            extraction.status AS extraction_status, extraction.detected_document_type,
            extraction.proposed_fields, extraction.corrections
          FROM vehicle_document_intakes intake
          LEFT JOIN document_ai_extractions extraction ON extraction.company_id=intake.company_id AND extraction.id=intake.approved_extraction_id
          WHERE intake.company_id=${principal.companyId} AND intake.id=${intakeId} AND intake.created_by=${principal.userId}
          LIMIT 1 FOR UPDATE OF intake
        `);
        const row = locked.rows?.[0]; if (!row) throw new NotFoundError();
        const vehicleRepo = context.getVehicleRepo();
        if (row.consumed_at || row.vehicle_id) {
          if (!row.consumed_at || !row.vehicle_id) throw new ConflictError();
          const existing = await vehicleRepo.findByIdForCompany(principal.companyId, String(row.vehicle_id));
          if (!existing || existing.isArchived) throw new ConflictError();
          return { item: existing, reused: true };
        }
        const expectedType = String(row.document_type || '').toUpperCase();
        if (String(row.status) !== 'APPROVED' || !row.attachment_id || !row.approved_extraction_id ||
          String(row.approved_extraction_id) !== String(row.extraction_id) || String(row.attachment_id) !== String(row.extraction_attachment_id) ||
          String(row.extraction_status) !== 'APPROVED' || String(row.detected_document_type || '').toUpperCase().replace(/[-/ ]/g, '_') !== expectedType) throw new ConflictError();
        const fields = projectApprovedVehicleDraft(row.proposed_fields, row.corrections);
        const plate = normalizedDraftPlate(fields);
        const renavam = requiredDraftText(fields, 'renavam');
        const brand = requiredDraftText(fields, 'brand');
        const model = requiredDraftText(fields, 'model');
        const chassis = requiredDraftText(fields, 'chassis').toUpperCase();
        const fuelType = requiredDraftText(fields, 'fuel');
        if (await vehicleRepo.findByPlate(principal.companyId, plate) || await vehicleRepo.findByRenavam(principal.companyId, renavam)) throw new ConflictError();
        if (chassis) {
          const duplicateChassis: any = await tx.execute(sql`SELECT id FROM vehicles WHERE company_id=${principal.companyId} AND chassis=${chassis} AND is_archived=false LIMIT 1`);
          if (duplicateChassis.rows?.[0]) throw new ConflictError();
        }
        const attachmentRepo = context.getAttachmentRepo();
        const source = await attachmentRepo.findByIdForCompany(principal.companyId, String(row.attachment_id));
        if (!source || source.isArchived || source.entityType !== 'VehicleDocumentIntake' || source.entityId !== intakeId ||
          source.contentState !== 'AVAILABLE' || !source.storageKey || !source.checksum ||
          (source.storageProvider !== 'SERVER_FS' && source.storageProvider !== 'R2')) throw new ConflictError();
        const now = new Date().toISOString();
        const created = await vehicleRepo.create({
          id: randomUUID(), companyId: principal.companyId, plate, brand, model, version: completion.version,
          yearFabrication: draftYear(fields, 'manufactureYear'), yearModel: draftYear(fields, 'modelYear'),
          color: completion.color, renavam, chassis, currentKm: completion.currentKm, nextMaintenanceKm: completion.nextMaintenanceKm,
          fuelType, category: completion.category, acquisitionValue: completion.acquisitionValue, currentValue: completion.currentValue,
          rentalValueBase: completion.rentalValueBase, status: VehicleStatus.AVAILABLE,
          notes: [typeof fields.ownerName === 'string' && fields.ownerName.trim() ? `Titular no documento: ${fields.ownerName.trim()}` : '', completion.notes||''].filter(Boolean).join(' | ')||undefined,
          isArchived: false, createdAt: now, updatedAt: now,
        });
        const promoted = await attachmentRepo.create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityType: 'Vehicle', entityId: created.id,
          documentType: expectedType, fileName: source.fileName, fileSize: source.fileSize, mimeType: source.mimeType,
          uploadedBy: principal.name, storageProvider: source.storageProvider, storageKey: source.storageKey, checksum: source.checksum,
          createdBy: principal.userId, isArchived: false, contentState: 'AVAILABLE', description: `Documento promovido do intake ${intakeId}; sourceAttachmentId=${source.id}`,
          issueDate: source.issueDate, expirationDate: source.expirationDate, createdAt: now,
        });
        await context.getKmRecordRepo().create({ id: randomUUID(), companyId: principal.companyId, vehicleId: created.id, kmValue: completion.currentKm,
          recordDate: now.split('T')[0], readingType: 'PERIODIC', notes: 'Cadastro inicial do veículo por documento aprovado e complementação humana', createdAt: now });
        const consumed: any = await tx.execute(sql`
          UPDATE vehicle_document_intakes SET vehicle_id=${created.id}, consumed_at=${now}, updated_at=${now}
          WHERE company_id=${principal.companyId} AND id=${intakeId} AND status='APPROVED' AND consumed_at IS NULL AND vehicle_id IS NULL
          RETURNING id
        `);
        if (!consumed.rows?.[0]) throw new ConflictError();
        await context.getAuditLogRepo().create({ id: randomUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: created.id,
          action: AuditAction.CREATE, newState: JSON.stringify({ ...created, source: 'VEHICLE_DOCUMENT_INTAKE', intakeId, attachmentId: promoted.id }),
          userId: principal.userId, userName: principal.name, timestamp: now });
        await context.getAuditLogRepo().create({ id: randomUUID(), companyId: principal.companyId, entityName: 'FileAttachment', entityId: promoted.id,
          action: AuditAction.CREATE, newState: JSON.stringify({ event: 'VEHICLE_INTAKE_PROMOTION', intakeId, vehicleId: created.id, sourceAttachmentId: source.id }),
          userId: principal.userId, userName: principal.name, timestamp: now });
        await context.getAuditLogRepo().create({ id: randomUUID(), companyId: principal.companyId, entityName: 'VehicleDocumentIntake', entityId: intakeId,
          action: AuditAction.UPDATE, newState: JSON.stringify({ event: 'MATERIALIZED', vehicleId: created.id, consumedAt: now }),
          userId: principal.userId, userName: principal.name, timestamp: now });
        return { item: created, reused: false };
      });
      res.status(result.reused ? 200 : 201).json(result);
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/vehicle-document-intakes/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_VEHICLE'); if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (context) => {
        const tx = context.getRawTransaction?.(); if (!tx) throw new Error('Raw tenant transaction unavailable');
        const result: any = await tx.execute(sql`SELECT * FROM vehicle_document_intakes WHERE company_id=${principal.companyId} AND id=${req.params.id} AND created_by=${principal.userId} LIMIT 1`);
        if (!result.rows?.[0]) throw new NotFoundError(); return map(result.rows[0]);
      });
      res.json({ item });
    } catch (error) { sendError(res, error); }
  });
}
