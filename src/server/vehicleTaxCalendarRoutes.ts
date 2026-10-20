import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { VehicleTaxCalendarAuthority, VehicleTaxCalendarValidationError } from './vehicleTaxCalendarAuthority';

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const actor = principal(req);
  if (!actor) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  return actor;
}

function fail(res: Response, error: unknown): void {
  if (error instanceof VehicleTaxCalendarValidationError) { res.status(400).json({ error: 'VEHICLE_TAX_CALENDAR_INVALID' }); return; }
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}

export function registerVehicleTaxCalendarRoutes(app: Express): void {
  app.get('/api/vehicle-tax-calendar', async (req, res) => {
    const actor = requirePrincipal(req, res); if (!actor) return;
    try {
      const uf = typeof req.query.uf === 'string' ? req.query.uf : undefined;
      const year = req.query.referenceYear ? Number(req.query.referenceYear) : undefined;
      res.json({ items: await VehicleTaxCalendarAuthority.list(actor.companyId, { uf, referenceYear: year }) });
    } catch (error) { fail(res, error); }
  });

  // Vencimentos de um veiculo no ano, derivados do ultimo digito da placa.
  app.get('/api/vehicle-tax-calendar/vehicle', async (req, res) => {
    const actor = requirePrincipal(req, res); if (!actor) return;
    try {
      const plate = String(req.query.plate || '');
      const uf = String(req.query.uf || '');
      const year = Number(req.query.referenceYear || new Date().getFullYear());
      if (!plate || !uf) throw new VehicleTaxCalendarValidationError();
      res.json(await VehicleTaxCalendarAuthority.forVehicle(actor.companyId, { plate, uf, referenceYear: year }));
    } catch (error) { fail(res, error); }
  });

  app.post('/api/vehicle-tax-calendar', async (req, res) => {
    const actor = requirePrincipal(req, res); if (!actor) return;
    try {
      const item = await VehicleTaxCalendarAuthority.upsert(actor.companyId, actor.userId, req.body || {});
      res.status(201).json({ item });
    } catch (error) { fail(res, error); }
  });
}
