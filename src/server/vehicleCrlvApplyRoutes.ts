import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { documentAiExtractions, fileAttachments, vehicles } from '../db/schema';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import {
  buildVehicleChangesFromReviewedCrlv,
  parseVehicleCrlvSelectedFields,
  VehicleCrlvApplyValidationError,
} from './vehicleCrlvApplyAuthority';

const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const CRLV_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

class VehicleCrlvNotFoundError extends Error {}
class VehicleCrlvConflictError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requireEditPrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  const allowed = Boolean(principal.userId && principal.companyId) && (
    permissions.includes('*') || permissions.includes('EDIT_VEHICLE') || WRITE_ROLES.has(role)
  );
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function parseBody(value: unknown): { extractionId: string; fields: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new VehicleCrlvApplyValidationError('Invalid CRLV apply request');
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (keys.join(',') !== 'extractionId,fields') {
    throw new VehicleCrlvApplyValidationError('Invalid CRLV apply request');
  }
  const extractionId = typeof body.extractionId === 'string' ? body.extractionId.trim() : '';
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(extractionId)) {
    throw new VehicleCrlvApplyValidationError('Invalid extractionId');
  }
  return { extractionId, fields: body.fields };
}

function parseMaintenanceHandoffBody(value: unknown): { workOrderId: string; attachmentId: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new VehicleCrlvApplyValidationError('Invalid CRLV maintenance handoff request');
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (keys.join(',') !== 'attachmentId,workOrderId') {
    throw new VehicleCrlvApplyValidationError('Invalid CRLV maintenance handoff request');
  }
  const workOrderId = typeof body.workOrderId === 'string' ? body.workOrderId.trim() : '';
  const attachmentId = typeof body.attachmentId === 'string' ? body.attachmentId.trim() : '';
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(workOrderId) || !/^[A-Za-z0-9._:-]{1,120}$/.test(attachmentId)) {
    throw new VehicleCrlvApplyValidationError('Invalid CRLV maintenance handoff request');
  }
  return { workOrderId, attachmentId };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof VehicleCrlvApplyValidationError) {
    res.status(400).json({ error: 'Invalid CRLV apply request' });
    return;
  }
  if (error instanceof VehicleCrlvNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof VehicleCrlvConflictError) {
    res.status(409).json({ error: 'Vehicle conflict' });
    return;
  }
  console.error('AUTOERP_VEHICLE_CRLV_APPLY_FAILURE', error);
  res.status(500).json({ error: 'CRLV apply failed' });
}

export function registerVehicleCrlvApplyRoutes(app: Express): void {
  app.post('/api/fleet/vehicles/crlv-from-maintenance', async (req: Request, res: Response) => {
    const principal = requireEditPrincipal(req, res);
    if (!principal) return;

    try {
      const body = parseMaintenanceHandoffBody(req.body);
      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const workOrder = await txContext.getWorkOrderRepo().findByIdForCompany(principal.companyId, body.workOrderId);
        if (!workOrder) throw new VehicleCrlvNotFoundError();

        const vehicle = await txContext.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId, workOrder.vehicleId);
        if (!vehicle || vehicle.isArchived) throw new VehicleCrlvNotFoundError();

        const attachmentRepo = txContext.getAttachmentRepo();
        const source = await attachmentRepo.findByIdForCompany(principal.companyId, body.attachmentId);
        if (
          !source ||
          source.isArchived ||
          source.entityType !== 'MaintenanceWorkOrder' ||
          source.entityId !== workOrder.id ||
          source.contentState !== 'AVAILABLE' ||
          (source.storageProvider !== 'SERVER_FS' && source.storageProvider !== 'R2') ||
          !source.storageKey ||
          !source.checksum ||
          !/^[a-f0-9]{64}$/i.test(source.checksum) ||
          !Number.isFinite(source.fileSize) ||
          source.fileSize <= 0 ||
          !CRLV_MIME_TYPES.has(source.mimeType)
        ) {
          throw new VehicleCrlvNotFoundError();
        }

        const current = await attachmentRepo.findByEntity(principal.companyId, 'Vehicle', vehicle.id);
        const existing = current.find((candidate) =>
          !candidate.isArchived &&
          candidate.documentType === 'CRLV' &&
          candidate.contentState === 'AVAILABLE' &&
          candidate.storageProvider === source.storageProvider &&
          candidate.storageKey === source.storageKey &&
          candidate.checksum === source.checksum
        );
        if (existing) {
          return { vehicleId: vehicle.id, attachmentId: existing.id, reused: true };
        }

        const now = new Date().toISOString();
        const created = await attachmentRepo.create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Vehicle',
          entityType: 'Vehicle',
          entityId: vehicle.id,
          documentType: 'CRLV',
          fileName: source.fileName,
          fileSize: source.fileSize,
          mimeType: source.mimeType,
          uploadedBy: principal.name,
          storageProvider: source.storageProvider,
          storageKey: source.storageKey,
          checksum: source.checksum,
          createdBy: principal.userId,
          isArchived: false,
          contentState: 'AVAILABLE',
          description: `CRLV reutilizado da OS ${workOrder.number}; sourceAttachmentId=${source.id}`,
          issueDate: source.issueDate,
          expirationDate: source.expirationDate,
          createdAt: now,
        });

        await txContext.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'FileAttachment',
          entityId: created.id,
          action: AuditAction.CREATE,
          newState: JSON.stringify({
            event: 'CRLV_MAINTENANCE_HANDOFF',
            vehicleId: vehicle.id,
            workOrderId: workOrder.id,
            sourceAttachmentId: source.id,
            attachmentId: created.id,
            storageProvider: created.storageProvider,
            checksum: created.checksum,
          }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });

        return { vehicleId: vehicle.id, attachmentId: created.id, reused: false };
      });

      res.status(result.reused ? 200 : 201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/fleet/vehicles/:id/crlv-apply', async (req: Request, res: Response) => {
    const principal = requireEditPrincipal(req, res);
    if (!principal) return;

    try {
      const body = parseBody(req.body);
      const selectedFields = parseVehicleCrlvSelectedFields(body.fields);
      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const vehicleRepo = txContext.getVehicleRepo();
        const existing = await vehicleRepo.findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!existing || existing.isArchived) throw new VehicleCrlvNotFoundError();

        const tx = txContext.getRawTransaction();
        const extractionRows = await tx.select().from(documentAiExtractions).where(and(
          eq(documentAiExtractions.companyId, principal.companyId),
          eq(documentAiExtractions.id, body.extractionId),
        )).limit(1);
        const extraction = extractionRows[0];
        if (
          !extraction ||
          extraction.status !== 'APPROVED' ||
          extraction.detectedDocumentType !== 'CRLV' ||
          !extraction.approvedAt
        ) {
          throw new VehicleCrlvNotFoundError();
        }

        const attachmentRows = await tx.select().from(fileAttachments).where(and(
          eq(fileAttachments.companyId, principal.companyId),
          eq(fileAttachments.id, extraction.attachmentId),
          eq(fileAttachments.entityType, 'Vehicle'),
          eq(fileAttachments.entityId, existing.id),
          eq(fileAttachments.documentType, 'CRLV'),
          eq(fileAttachments.isArchived, false),
        )).limit(1);
        if (!attachmentRows[0]) throw new VehicleCrlvNotFoundError();

        const changes = buildVehicleChangesFromReviewedCrlv(
          extraction.proposedFields,
          extraction.corrections,
          selectedFields,
        );

        if (changes.plate !== undefined) {
          const duplicate = await vehicleRepo.findByPlate(principal.companyId, changes.plate);
          if (duplicate && duplicate.id !== existing.id) throw new VehicleCrlvConflictError();
        }
        if (changes.renavam !== undefined) {
          const duplicate = await vehicleRepo.findByRenavam(principal.companyId, changes.renavam);
          if (duplicate && duplicate.id !== existing.id) throw new VehicleCrlvConflictError();
        }
        if (changes.chassis !== undefined) {
          const duplicateChassis = await tx.select({ id: vehicles.id }).from(vehicles).where(and(
            eq(vehicles.companyId, principal.companyId),
            eq(vehicles.chassis, changes.chassis),
            eq(vehicles.isArchived, false),
          )).limit(1);
          if (duplicateChassis[0] && duplicateChassis[0].id !== existing.id) throw new VehicleCrlvConflictError();
        }

        const now = new Date().toISOString();
        const updated = await vehicleRepo.updateForCompany(principal.companyId, existing.id, {
          ...changes,
          updatedAt: now,
        });
        if (!updated) throw new VehicleCrlvNotFoundError();

        await txContext.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Vehicle',
          entityId: existing.id,
          action: AuditAction.UPDATE,
          previousState: JSON.stringify(existing),
          newState: JSON.stringify({
            ...updated,
            crlvApply: { extractionId: extraction.id, fields: selectedFields },
          }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });

        return { item: updated, appliedFields: selectedFields };
      });

      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });
}