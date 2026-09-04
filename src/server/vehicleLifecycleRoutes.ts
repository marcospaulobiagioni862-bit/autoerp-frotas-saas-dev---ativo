import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { canManuallyTransitionVehicleStatus } from '../domain/fleet/vehicleStatusPolicy';
import { AuditAction, VehicleStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

type VehicleLifecycleAction = 'SOLD' | 'ARCHIVED';

class VehicleLifecycleValidationError extends Error {}
class VehicleLifecycleConflictError extends Error {}
class VehicleLifecycleNotFoundError extends Error {}

const READ_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requireReadPrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal?.userId || !principal.companyId) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!READ_ROLES.has(role) && !permissions.includes('*') && !permissions.includes('VIEW_VEHICLE')) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function requireWritePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal?.userId || !principal.companyId) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!WRITE_ROLES.has(role) && !permissions.includes('*') && !permissions.includes('CHANGE_VEHICLE_STATUS')) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function requiredText(value: unknown, field: string): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) throw new VehicleLifecycleValidationError(`Missing ${field}`);
  return clean;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

function requiredDate(value: unknown, field: string): string {
  const clean = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T00:00:00Z`))) {
    throw new VehicleLifecycleValidationError(`Invalid ${field}`);
  }
  return clean;
}

function requiredMoney(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new VehicleLifecycleValidationError('Invalid saleValue');
  return amount;
}

function requiredKm(value: unknown): number {
  const km = Number(value);
  if (!Number.isInteger(km) || km < 0) throw new VehicleLifecycleValidationError('Invalid finalKm');
  return km;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof VehicleLifecycleValidationError) {
    res.status(400).json({ error: 'Invalid vehicle lifecycle request' });
    return;
  }
  if (error instanceof VehicleLifecycleConflictError) {
    res.status(409).json({ error: 'Vehicle lifecycle conflict' });
    return;
  }
  if (error instanceof VehicleLifecycleNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  console.error('AUTOERP_VEHICLE_LIFECYCLE_FAILURE', error);
  res.status(500).json({ error: 'Vehicle lifecycle operation failed' });
}

async function loadLifecycleRows(txContext: any, companyId: string, vehicleId: string) {
  const raw = txContext.getRawTransaction();
  const result: any = await raw.execute(sql`
    SELECT id, action, effective_date, reason, disposal_type, sale_value,
           buyer_name, buyer_document, final_km, notes, created_by, created_at
    FROM vehicle_lifecycle_events
    WHERE company_id=${companyId} AND vehicle_id=${vehicleId}
    ORDER BY created_at DESC, id DESC
  `);
  return (result.rows || []).map((row: any) => ({
    id: String(row.id),
    action: String(row.action),
    effectiveDate: String(row.effective_date),
    reason: String(row.reason),
    disposalType: row.disposal_type == null ? undefined : String(row.disposal_type),
    saleValue: row.sale_value == null ? undefined : Number(row.sale_value),
    buyerName: row.buyer_name == null ? undefined : String(row.buyer_name),
    buyerDocument: row.buyer_document == null ? undefined : String(row.buyer_document),
    finalKm: row.final_km == null ? undefined : Number(row.final_km),
    notes: row.notes == null ? undefined : String(row.notes),
    createdBy: String(row.created_by),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export function registerVehicleLifecycleRoutes(app: Express): void {
  app.get('/api/fleet/vehicles/archived', async (req: Request, res: Response) => {
    const principal = requireReadPrincipal(req, res);
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>
        (await txContext.getVehicleRepo().findAllByCompany(principal.companyId)).filter((item: any) => item.isArchived)
      );
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/fleet/vehicles/:id/lifecycle', async (req: Request, res: Response) => {
    const principal = requireReadPrincipal(req, res);
    if (!principal) return;
    try {
      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const item = await txContext.getVehicleRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!item) throw new VehicleLifecycleNotFoundError();
        return { item, lifecycle: await loadLifecycleRows(txContext, principal.companyId, item.id) };
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/fleet/vehicles/:id/sale', async (req: Request, res: Response) => {
    const principal = requireWritePrincipal(req, res);
    if (!principal) return;

    let saleDate: string;
    let reason: string;
    let disposalType: string;
    let saleValue: number;
    let finalKm: number;
    let notes: string;
    try {
      saleDate = requiredDate(req.body?.saleDate, 'saleDate');
      reason = requiredText(req.body?.reason, 'reason');
      disposalType = requiredText(req.body?.disposalType, 'disposalType');
      saleValue = requiredMoney(req.body?.saleValue);
      finalKm = requiredKm(req.body?.finalKm);
      notes = requiredText(req.body?.notes, 'notes');
    } catch (error) {
      sendError(res, error);
      return;
    }

    try {
      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const vehicleRepo = txContext.getVehicleRepo();
        const existing = await vehicleRepo.findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!existing || existing.isArchived) throw new VehicleLifecycleNotFoundError();
        if (existing.status === VehicleStatus.SOLD) throw new VehicleLifecycleConflictError('Vehicle already sold');
        if (finalKm < existing.currentKm) throw new VehicleLifecycleValidationError('finalKm below currentKm');

        const activeContract = await txContext.getContractRepo().findActiveByVehicle(principal.companyId, existing.id);
        const hasBlockingMaintenance = await txContext.getWorkOrderRepo().hasBlockingWorkOrder(principal.companyId, existing.id, '');
        const hasCurrentBinding = Boolean(activeContract || existing.currentContractId || existing.currentDriverId);
        if (!canManuallyTransitionVehicleStatus(existing.status, VehicleStatus.SOLD, {
          hasActiveContract: hasCurrentBinding,
          hasBlockingMaintenance,
        })) throw new VehicleLifecycleConflictError('Sale blocked by vehicle lifecycle policy');

        const now = new Date().toISOString();
        if (finalKm > existing.currentKm) {
          await txContext.getKmRecordRepo().create({
            id: randomUUID(), companyId: principal.companyId, vehicleId: existing.id,
            kmValue: finalKm, recordDate: saleDate, readingType: 'PERIODIC',
            notes: 'KM final registrado na venda do veículo', createdAt: now,
          });
        }

        const updated = await vehicleRepo.updateForCompany(principal.companyId, existing.id, {
          status: VehicleStatus.SOLD, currentKm: finalKm, updatedAt: now,
        });
        if (!updated) throw new VehicleLifecycleNotFoundError();

        const lifecycleId = randomUUID();
        const action: VehicleLifecycleAction = 'SOLD';
        const buyerName = optionalText(req.body?.buyerName);
        const buyerDocument = optionalText(req.body?.buyerDocument);
        const raw = txContext.getRawTransaction();
        await raw.execute(sql`
          INSERT INTO vehicle_lifecycle_events (
            id, company_id, vehicle_id, action, effective_date, reason, disposal_type,
            sale_value, buyer_name, buyer_document, final_km, notes, created_by, created_at
          ) VALUES (
            ${lifecycleId}, ${principal.companyId}, ${existing.id}, ${action}, ${saleDate}, ${reason}, ${disposalType},
            ${String(saleValue)}, ${buyerName ?? null}, ${buyerDocument ?? null}, ${finalKm}, ${notes}, ${principal.userId}, ${now}
          )
        `);

        await txContext.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: existing.id,
          action: AuditAction.UPDATE,
          previousState: JSON.stringify({ status: existing.status, currentKm: existing.currentKm }),
          newState: JSON.stringify({ status: VehicleStatus.SOLD, currentKm: finalKm, saleDate, reason, disposalType, saleValue, buyerName, buyerDocument, notes, lifecycleEventId: lifecycleId }),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });

        return {
          item: updated,
          lifecycle: { id: lifecycleId, action, effectiveDate: saleDate, reason, disposalType, saleValue, buyerName, buyerDocument, finalKm, notes, createdAt: now },
        };
      });
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/fleet/vehicles/:id/archive', async (req: Request, res: Response) => {
    const principal = requireWritePrincipal(req, res);
    if (!principal) return;

    let archiveDate: string;
    let reason: string;
    try {
      archiveDate = requiredDate(req.body?.archiveDate, 'archiveDate');
      reason = requiredText(req.body?.reason, 'reason');
    } catch (error) {
      sendError(res, error);
      return;
    }

    try {
      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const vehicleRepo = txContext.getVehicleRepo();
        const existing = await vehicleRepo.findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!existing) throw new VehicleLifecycleNotFoundError();
        if (existing.isArchived || existing.status === VehicleStatus.ARCHIVED) throw new VehicleLifecycleConflictError('Vehicle already archived');

        const activeContract = await txContext.getContractRepo().findActiveByVehicle(principal.companyId, existing.id);
        const hasBlockingMaintenance = await txContext.getWorkOrderRepo().hasBlockingWorkOrder(principal.companyId, existing.id, '');
        const hasCurrentBinding = Boolean(activeContract || existing.currentContractId || existing.currentDriverId);
        if (!canManuallyTransitionVehicleStatus(existing.status, VehicleStatus.ARCHIVED, {
          hasActiveContract: hasCurrentBinding,
          hasBlockingMaintenance,
        })) throw new VehicleLifecycleConflictError('Archive blocked by vehicle lifecycle policy');

        const now = new Date().toISOString();
        const updated = await vehicleRepo.updateForCompany(principal.companyId, existing.id, {
          status: VehicleStatus.ARCHIVED,
          isArchived: true,
          updatedAt: now,
        });
        if (!updated) throw new VehicleLifecycleNotFoundError();

        const lifecycleId = randomUUID();
        const action: VehicleLifecycleAction = 'ARCHIVED';
        const raw = txContext.getRawTransaction();
        await raw.execute(sql`
          INSERT INTO vehicle_lifecycle_events (
            id, company_id, vehicle_id, action, effective_date, reason, created_by, created_at
          ) VALUES (
            ${lifecycleId}, ${principal.companyId}, ${existing.id}, ${action}, ${archiveDate}, ${reason}, ${principal.userId}, ${now}
          )
        `);

        await txContext.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: existing.id,
          action: AuditAction.UPDATE,
          previousState: JSON.stringify({ status: existing.status, isArchived: existing.isArchived }),
          newState: JSON.stringify({ status: VehicleStatus.ARCHIVED, isArchived: true, archiveDate, reason, lifecycleEventId: lifecycleId }),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });

        return { item: updated, lifecycle: { id: lifecycleId, action, effectiveDate: archiveDate, reason, createdAt: now } };
      });
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });
}
