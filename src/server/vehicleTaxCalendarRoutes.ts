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

function requireAdmin(req: Request, res: Response): AuthenticatedPrincipal | null {
  const actor = requirePrincipal(req, res);
  if (!actor) return null;
  const role = String(actor.role || '').toUpperCase();
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  if (role !== 'ADMIN' && !permissions.includes('*')) {
    res.status(403).json({ error: 'FORBIDDEN' });
    return null;
  }
  return actor;
}

function requirePayableCreator(req: Request, res: Response): AuthenticatedPrincipal | null {
  const actor = requirePrincipal(req, res);
  if (!actor) return null;
  const role = String(actor.role || '').toUpperCase();
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  if (role !== 'ADMIN' && !permissions.includes('*') && !permissions.includes('PAYABLE_MUTATE') && !permissions.includes('PAYABLE_CREATE')) {
    res.status(403).json({ error: 'FORBIDDEN' });
    return null;
  }
  return actor;
}

function fail(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'FORBIDDEN', message });
    return;
  }
  if (error instanceof VehicleTaxCalendarValidationError) {
    res.status(400).json({ error: error.message || 'VEHICLE_TAX_CALENDAR_INVALID' });
    return;
  }
  if (error instanceof Error) {
    if (error.message === 'DUPLICATE_TAX_PAYABLES') {
      res.status(409).json({ error: 'Já existem títulos de IPVA gerados para este veículo no ano informado.' });
      return;
    }
    if (error.message === 'VEHICLE_NOT_FOUND') {
      res.status(404).json({ error: 'Veículo não encontrado' });
      return;
    }
  }
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

  // PH-091: Guarda 403 Forbidden para não-ADMIN no cadastro manual do calendário
  app.post('/api/vehicle-tax-calendar', async (req, res) => {
    const actor = requireAdmin(req, res); if (!actor) return;
    try {
      const item = await VehicleTaxCalendarAuthority.upsert(actor.companyId, actor.userId, req.body || {});
      res.status(201).json({ item });
    } catch (error) { fail(res, error); }
  });

  // PH-091: Aplicação em lote da tabela oficial de SP (homologada por ano com fonte oficial)
  app.post('/api/vehicle-tax-calendar/preset', async (req, res) => {
    const actor = requireAdmin(req, res); if (!actor) return;
    try {
      const uf = String(req.body?.uf || 'SP').trim().toUpperCase();
      if (uf !== 'SP') {
        res.status(400).json({ error: 'Atualmente o preset oficial é suportado apenas para UF = SP' });
        return;
      }
      const year = Number(req.body?.referenceYear || new Date().getFullYear());
      const result = await VehicleTaxCalendarAuthority.applyOfficialSpPreset(actor.companyId, actor.userId, year);
      res.status(201).json(result);
    } catch (error) { fail(res, error); }
  });

  // PH-091: Geração de contas a pagar de IPVA (Cota Única ou Parcelado) a partir do calendário oficial
  app.post('/api/vehicle-tax-calendar/vehicle/:vehicleId/generate-payables', async (req, res) => {
    const actor = requirePayableCreator(req, res); if (!actor) return;
    try {
      const vehicleId = String(req.params.vehicleId || '');
      const referenceYear = Number(req.body?.referenceYear);
      const taxType = req.body?.taxType;
      const totalAmount = Number(req.body?.totalAmount);

      const result = await VehicleTaxCalendarAuthority.generatePayablesForVehicle(actor.companyId, actor, {
        vehicleId,
        referenceYear,
        taxType,
        totalAmount,
      });
      res.status(201).json(result);
    } catch (error) { fail(res, error); }
  });
}
