import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import type { AuthenticatedPrincipal } from './auth';
import { MaintenancePlanTemplateAuthority, MaintenanceTemplateNotFoundError } from './maintenancePlanTemplateAuthority';

const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL']);

function principal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const item = (req as Request & { principal?: AuthenticatedPrincipal }).principal;
  if (!item) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const permissions = Array.isArray(item.permissions) ? item.permissions : [];
  const role = String(item.role || '').toUpperCase();
  if (!permissions.includes('*') && !permissions.includes('MUTATE_MAINTENANCE') && !WRITE_ROLES.has(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return item;
}

function requestScope(body: unknown): { vehicleId: string; templateId?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_PAYLOAD');
  const payload = body as Record<string, unknown>;
  if (Object.keys(payload).some(key => key !== 'vehicleId' && key !== 'templateId')) throw new Error('INVALID_PAYLOAD');
  const vehicleId = typeof payload.vehicleId === 'string' ? payload.vehicleId.trim() : '';
  const templateId = payload.templateId === undefined ? undefined : typeof payload.templateId === 'string' ? payload.templateId.trim() : '';
  if (!vehicleId || vehicleId.length > 200 || templateId === '' || (templateId && templateId.length > 200)) throw new Error('INVALID_PAYLOAD');
  return { vehicleId, templateId };
}

export function registerMaintenanceTemplateVehicleRoutes(app: Express): void {
  app.post('/api/maintenance/templates/apply-vehicle', async (req, res) => {
    const actor = principal(req, res);
    if (!actor) return;
    try {
      const { vehicleId: requestedVehicleId, templateId: requestedTemplateId } = requestScope(req.body);
      const plansCreated = await UnitOfWork.run(actor.companyId, async context => {
        const tx = context.getRawTransaction?.();
        if (!tx) throw new Error('PERSISTENCE_UNAVAILABLE');
        const result = await tx.execute(sql`
          SELECT id, current_km
          FROM vehicles
          WHERE company_id = ${actor.companyId}
            AND id = ${requestedVehicleId}
            AND is_archived = false
            AND status NOT IN ('SOLD', 'ARCHIVED')
          LIMIT 1
        `);
        const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : undefined;
        if (!row) throw new Error('VEHICLE_NOT_FOUND');
        return MaintenancePlanTemplateAuthority.applyToVehicleContext(context, actor, {
          id: String(row.id),
          currentKm: Number(row.current_km),
        }, requestedTemplateId);
      });
      res.json({ vehicleId: requestedVehicleId, templateId: requestedTemplateId, plansCreated });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'INVALID_PAYLOAD') {
        res.status(400).json({ error: 'Invalid preventive maintenance request' });
        return;
      }
      if (message === 'VEHICLE_NOT_FOUND') {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (error instanceof MaintenanceTemplateNotFoundError) {
        res.status(404).json({ error: 'Preventive maintenance template not found or inactive' });
        return;
      }
      console.error('AUTOERP_PREVENTIVE_VEHICLE_TEMPLATE_FAILURE', error);
      res.status(500).json({ error: 'Preventive maintenance operation failed' });
    }
  });
}
