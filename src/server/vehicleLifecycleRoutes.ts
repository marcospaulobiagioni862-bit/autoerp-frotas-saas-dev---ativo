import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { canManuallyTransitionVehicleStatus } from '../domain/fleet/vehicleStatusPolicy';
import { AuditAction, VehicleStatus } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';

type VehicleLifecycleAction = 'SOLD';

class VehicleLifecycleValidationError extends Error {}
class VehicleLifecycleConflictError extends Error {}
class VehicleLifecycleNotFoundError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal?.userId || !principal.companyId) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  const allowedRole = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']).has(role);
  if (!allowedRole && !permissions.includes('*') && !permissions.includes('CHANGE_VEHICLE_STATUS')) {
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

function requiredDate(value: unknown): string {
  const clean = requiredText(value, 'saleDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T00:00:00Z`))) {
    throw new VehicleLifecycleValidationError('Invalid saleDate');
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
    res.status(400).json({ error: 'Invalid vehicle sale request' });
    return;
  }
  if (error instanceof VehicleLifecycleConflictError) {
    res.status(409).json({ error: 'Vehicle sale conflict' });
    return;
  }
  if (error instanceof VehicleLifecycleNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  console.error('AUTOERP_VEHICLE_LIFECYCLE_FAILURE', error);
  res.status(500).json({ error: 'Vehicle lifecycle operation failed' });
}

export function registerVehicleLifecycleRoutes(app: Express): void {
  app.post('/api/fleet/vehicles/:id/sale', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;

    let saleDate: string;
    let reason: string;
    let disposalType: string;
    let saleValue: number;
    let finalKm: number;
    let notes: string;
    try {
      saleDate = requiredDate(req.body?.saleDate);
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

        const [activeContract, hasBlockingMaintenance] = await Promise.all([
          txContext.getContractRepo().findActiveByVehicle(principal.companyId, existing.id),
          txContext.getWorkOrderRepo().hasBlockingWorkOrder(principal.companyId, existing.id, ''),
        ]);
        const hasCurrentBinding = Boolean(activeContract || existing.currentContractId || existing.currentDriverId);
        if (!canManuallyTransitionVehicleStatus(existing.status, VehicleStatus.SOLD, {
          hasActiveContract: hasCurrentBinding,
          hasBlockingMaintenance,
        })) {
          throw new VehicleLifecycleConflictError('Sale blocked by vehicle lifecycle policy');
        }

        const now = new Date().toISOString();
        if (finalKm > existing.currentKm) {
          await txContext.getKmRecordRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            vehicleId: existing.id,
            kmValue: finalKm,
            recordDate: saleDate,
            readingType: 'PERIODIC',
            notes: 'KM final registrado na venda do veículo',
            createdAt: now,
          });
        }

        const updated = await vehicleRepo.updateForCompany(principal.companyId, existing.id, {
          status: VehicleStatus.SOLD,
          currentKm: finalKm,
          updatedAt: now,
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
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Vehicle',
          entityId: existing.id,
          action: AuditAction.UPDATE,
          previousState: JSON.stringify({ status: existing.status, currentKm: existing.currentKm }),
          newState: JSON.stringify({
            status: VehicleStatus.SOLD,
            currentKm: finalKm,
            saleDate,
            reason,
            disposalType,
            saleValue,
            buyerName,
            buyerDocument,
            notes,
            lifecycleEventId: lifecycleId,
          }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });

        return {
          item: updated,
          lifecycle: {
            id: lifecycleId,
            action,
            effectiveDate: saleDate,
            reason,
            disposalType,
            saleValue,
            buyerName,
            buyerDocument,
            finalKm,
            notes,
            createdAt: now,
          },
        };
      });
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });
}
