from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# SECURITY-2I1A-v2 database migration. Preserve the existing tenant+plate and
# tenant+renavam unique constraints while expanding the persisted Vehicle core.
Path('drizzle/0008_vehicle_core_authority.sql').write_text(r'''-- SECURITY-2I1A-v2: Vehicle core server authority foundation.
-- I1B owns KM history/recordKm and the atomic Fleet UI switchover.

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS version text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS year_fabrication integer NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS year_model integer NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS chassis text NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_km integer NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS next_maintenance_km integer;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_type text NOT NULL DEFAULT 'Flex';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Padrão';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS acquisition_value numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_value numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rental_value_base numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_driver_id text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_contract_id text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_current_km_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_current_km_nonnegative CHECK (current_km >= 0);
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_next_maintenance_km_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_next_maintenance_km_nonnegative CHECK (next_maintenance_km IS NULL OR next_maintenance_km >= 0);
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_acquisition_value_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_acquisition_value_nonnegative CHECK (acquisition_value >= 0);
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_current_value_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_current_value_nonnegative CHECK (current_value >= 0);
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_rental_value_base_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_rental_value_base_nonnegative CHECK (rental_value_base >= 0);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_ve ON vehicles;
CREATE POLICY tenant_isolation_ve ON vehicles
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
''', encoding='utf-8')

# Journal registration after SECURITY-2H1 migration 0007.
p = Path('drizzle/meta/_journal.json')
data = json.loads(p.read_text(encoding='utf-8'))
if not any(e.get('tag') == '0008_vehicle_core_authority' for e in data['entries']):
    data['entries'].append({
        'idx': 8,
        'version': '7',
        'when': 1787106000000,
        'tag': '0008_vehicle_core_authority',
        'breakpoints': True,
    })
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

# Drizzle schema parity.
p = Path('src/db/schema.ts')
text = p.read_text(encoding='utf-8')
old = """export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  plate: text('plate').notNull(),
  renavam: text('renavam').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
"""
new = """export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  plate: text('plate').notNull(),
  renavam: text('renavam').notNull(),
  brand: text('brand').notNull().default(''),
  model: text('model').notNull().default(''),
  version: text('version'),
  yearFabrication: integer('year_fabrication').notNull().default(0),
  yearModel: integer('year_model').notNull().default(0),
  color: text('color').notNull().default(''),
  chassis: text('chassis').notNull().default(''),
  currentKm: integer('current_km').notNull().default(0),
  nextMaintenanceKm: integer('next_maintenance_km'),
  fuelType: text('fuel_type').notNull().default('Flex'),
  category: text('category').notNull().default('Padrão'),
  acquisitionValue: numeric('acquisition_value', { precision: 12, scale: 2 }).notNull().default('0'),
  currentValue: numeric('current_value', { precision: 12, scale: 2 }).notNull().default('0'),
  rentalValueBase: numeric('rental_value_base', { precision: 12, scale: 2 }).notNull().default('0'),
  status: text('status').notNull(),
  notes: text('notes'),
  currentDriverId: text('current_driver_id'),
  currentContractId: text('current_contract_id'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
"""
text = replace_once(text, old, new, 'vehicle schema')
p.write_text(text, encoding='utf-8')

# Transaction contract.
p = Path('src/domain/finance/ITransactionContext.ts')
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  DriverHealthAndEmergency,\n} from '../../types/entities';",
    "  DriverHealthAndEmergency,\n  Vehicle,\n} from '../../types/entities';",
    'vehicle type import',
)
vehicle_interface = """export interface ITransactionVehicleRepository {
  findByIdForCompany(companyId: string, id: string): Promise<Vehicle | null>;
  findAllByCompany(companyId: string): Promise<Vehicle[]>;
  findByPlate(companyId: string, plate: string): Promise<Vehicle | null>;
  findByRenavam(companyId: string, renavam: string): Promise<Vehicle | null>;
  create(item: Vehicle): Promise<Vehicle>;
  updateForCompany(companyId: string, id: string, item: Partial<Vehicle>): Promise<Vehicle | null>;
}

"""
if 'export interface ITransactionVehicleRepository' not in text:
    text = replace_once(text, 'export interface ITransactionReceivableRepository {', vehicle_interface + 'export interface ITransactionReceivableRepository {', 'vehicle repo interface')
text = replace_once(
    text,
    "export interface ITransactionContext {\n  getReceivableRepo(): ITransactionReceivableRepository;",
    "export interface ITransactionContext {\n  getVehicleRepo(): ITransactionVehicleRepository;\n  getReceivableRepo(): ITransactionReceivableRepository;",
    'vehicle context getter',
)
p.write_text(text, encoding='utf-8')

# PostgreSQL adapter with explicit tenant predicates in addition to RLS.
p = Path('src/db/repositories/postgresRepositories.ts')
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  securityDeposits, securityDepositMovements, driverHealthProfiles\n} from '../schema';",
    "  securityDeposits, securityDepositMovements, driverHealthProfiles, vehicles\n} from '../schema';",
    'vehicle table import',
)
text = replace_once(
    text,
    "import { AuditLog, SecurityDeposit, SecurityDepositMovement } from '../../types/entities';",
    "import { AuditLog, SecurityDeposit, SecurityDepositMovement, Vehicle } from '../../types/entities';",
    'vehicle entity import',
)
vehicle_class = r'''export class PostgresVehicleRepository {
  private tx: any;
  constructor(tx?: any) { this.tx = tx || db; }

  private map(row: any): Vehicle {
    return {
      id: row.id,
      companyId: row.companyId,
      plate: row.plate,
      brand: row.brand || '',
      model: row.model || '',
      version: row.version || undefined,
      yearFabrication: Number(row.yearFabrication || 0),
      yearModel: Number(row.yearModel || 0),
      color: row.color || '',
      renavam: row.renavam,
      chassis: row.chassis || '',
      currentKm: Number(row.currentKm || 0),
      nextMaintenanceKm: row.nextMaintenanceKm == null ? undefined : Number(row.nextMaintenanceKm),
      fuelType: row.fuelType || 'Flex',
      category: row.category || 'Padrão',
      acquisitionValue: Number(row.acquisitionValue || 0),
      currentValue: Number(row.currentValue || 0),
      rentalValueBase: Number(row.rentalValueBase || 0),
      status: row.status as Vehicle['status'],
      currentDriverId: row.currentDriverId || undefined,
      currentContractId: row.currentContractId || undefined,
      notes: row.notes || undefined,
      isArchived: Boolean(row.isArchived),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByIdForCompany(companyId: string, id: string): Promise<Vehicle | null> {
    const rows = await this.tx.select().from(vehicles).where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id))).limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findAllByCompany(companyId: string): Promise<Vehicle[]> {
    const rows = await this.tx.select().from(vehicles).where(eq(vehicles.companyId, companyId));
    return rows.map((row: any) => this.map(row));
  }

  async findByPlate(companyId: string, plate: string): Promise<Vehicle | null> {
    const rows = await this.tx.select().from(vehicles).where(and(eq(vehicles.companyId, companyId), eq(vehicles.plate, plate))).limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findByRenavam(companyId: string, renavam: string): Promise<Vehicle | null> {
    const rows = await this.tx.select().from(vehicles).where(and(eq(vehicles.companyId, companyId), eq(vehicles.renavam, renavam))).limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async create(item: Vehicle): Promise<Vehicle> {
    const rows = await this.tx.insert(vehicles).values({
      id: item.id,
      companyId: item.companyId,
      plate: item.plate,
      renavam: item.renavam,
      brand: item.brand,
      model: item.model,
      version: item.version || null,
      yearFabrication: item.yearFabrication,
      yearModel: item.yearModel,
      color: item.color,
      chassis: item.chassis,
      currentKm: item.currentKm,
      nextMaintenanceKm: item.nextMaintenanceKm ?? null,
      fuelType: item.fuelType,
      category: item.category,
      acquisitionValue: String(item.acquisitionValue),
      currentValue: String(item.currentValue),
      rentalValueBase: String(item.rentalValueBase),
      status: item.status,
      currentDriverId: item.currentDriverId || null,
      currentContractId: item.currentContractId || null,
      notes: item.notes || null,
      isArchived: Boolean(item.isArchived),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }).returning();
    return this.map(rows[0]);
  }

  async updateForCompany(companyId: string, id: string, item: Partial<Vehicle>): Promise<Vehicle | null> {
    const values: any = {};
    if (item.plate !== undefined) values.plate = item.plate;
    if (item.renavam !== undefined) values.renavam = item.renavam;
    if (item.brand !== undefined) values.brand = item.brand;
    if (item.model !== undefined) values.model = item.model;
    if (item.version !== undefined) values.version = item.version || null;
    if (item.yearFabrication !== undefined) values.yearFabrication = item.yearFabrication;
    if (item.yearModel !== undefined) values.yearModel = item.yearModel;
    if (item.color !== undefined) values.color = item.color;
    if (item.chassis !== undefined) values.chassis = item.chassis;
    if (item.currentKm !== undefined) values.currentKm = item.currentKm;
    if (item.nextMaintenanceKm !== undefined) values.nextMaintenanceKm = item.nextMaintenanceKm;
    if (item.fuelType !== undefined) values.fuelType = item.fuelType;
    if (item.category !== undefined) values.category = item.category;
    if (item.acquisitionValue !== undefined) values.acquisitionValue = String(item.acquisitionValue);
    if (item.currentValue !== undefined) values.currentValue = String(item.currentValue);
    if (item.rentalValueBase !== undefined) values.rentalValueBase = String(item.rentalValueBase);
    if (item.status !== undefined) values.status = item.status;
    if (item.currentDriverId !== undefined) values.currentDriverId = item.currentDriverId || null;
    if (item.currentContractId !== undefined) values.currentContractId = item.currentContractId || null;
    if (item.notes !== undefined) values.notes = item.notes || null;
    if (item.isArchived !== undefined) values.isArchived = item.isArchived;
    if (item.updatedAt !== undefined) values.updatedAt = item.updatedAt;
    const rows = await this.tx.update(vehicles)
      .set(values)
      .where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id)))
      .returning();
    return rows[0] ? this.map(rows[0]) : null;
  }
}

'''
if 'export class PostgresVehicleRepository' not in text:
    text = replace_once(text, 'export class PostgresUserRepository', vehicle_class + 'export class PostgresUserRepository', 'vehicle postgres adapter')
p.write_text(text, encoding='utf-8')

# UnitOfWork wiring.
p = Path('src/db/uow.ts')
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  PostgresSecurityDepositMovementRepository,\n  PostgresDriverHealthProfileRepository\n} from './repositories/postgresRepositories';",
    "  PostgresSecurityDepositMovementRepository,\n  PostgresDriverHealthProfileRepository,\n  PostgresVehicleRepository\n} from './repositories/postgresRepositories';",
    'uow vehicle import',
)
text = replace_once(
    text,
    "      const txContext: ITransactionContext = {\n        getReceivableRepo: () => new PostgresAccountReceivableRepository(tx),",
    "      const txContext: ITransactionContext = {\n        getVehicleRepo: () => new PostgresVehicleRepository(tx),\n        getReceivableRepo: () => new PostgresAccountReceivableRepository(tx),",
    'uow vehicle getter',
)
p.write_text(text, encoding='utf-8')

# Dedicated server route module keeps the server bootstrap minimally changed.
Path('src/server/vehicleRoutes.ts').write_text(r'''import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { AuditAction, VehicleStatus } from '../types/enums';
import type { Vehicle } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

type VehicleAction = 'VIEW_VEHICLE' | 'CREATE_VEHICLE' | 'EDIT_VEHICLE' | 'CHANGE_VEHICLE_STATUS';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const DEFAULT_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);

class VehicleValidationError extends Error {}
class VehicleConflictError extends Error {}
class VehicleNotFoundError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function hasVehiclePermission(principal: AuthenticatedPrincipal, action: VehicleAction): boolean {
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId || !principal.companyId || !CANONICAL_ROLES.has(role)) return false;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*') || permissions.includes(action)) return true;
  if (action === 'VIEW_VEHICLE') return true;
  return DEFAULT_WRITE_ROLES.has(role);
}

function requireVehiclePrincipal(req: Request, res: Response, action: VehicleAction): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  if (!hasVehiclePermission(principal, action)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function normalizePlate(value: unknown): string {
  const plate = typeof value === 'string' ? value.toUpperCase().trim().replace(/[^A-Z0-9]/g, '') : '';
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) {
    throw new VehicleValidationError('Invalid vehicle plate');
  }
  return plate;
}

function requiredText(value: unknown, field: string): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) throw new VehicleValidationError(`Missing ${field}`);
  return clean;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function requiredNonNegative(value: unknown, field: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) throw new VehicleValidationError(`Invalid ${field}`);
  return numberValue;
}

function optionalNonNegative(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredNonNegative(value, field);
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  const parsed = optionalNonNegative(value, field);
  if (parsed === undefined) return undefined;
  if (!Number.isInteger(parsed)) throw new VehicleValidationError(`Invalid ${field}`);
  return parsed;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}

function sendVehicleError(res: Response, error: unknown): void {
  if (error instanceof VehicleValidationError) {
    res.status(400).json({ error: 'Invalid vehicle request' });
    return;
  }
  if (error instanceof VehicleConflictError || isUniqueViolation(error)) {
    res.status(409).json({ error: 'Vehicle conflict' });
    return;
  }
  if (error instanceof VehicleNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  console.error('AUTOERP_VEHICLE_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Vehicle operation failed' });
}

function appendStatusReason(existing: Vehicle, reason?: string): string | undefined {
  if (!reason) return existing.notes;
  return `${existing.notes || ''}\n[Status]: ${reason}`.trim();
}

export function registerVehicleRoutes(app: Express): void {
  // SECURITY-2I1A-v2 foundation only. Fleet UI/KM switchover remains I1B.
  app.get('/api/fleet/vehicles', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'VIEW_VEHICLE');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await txContext.getVehicleRepo().findAllByCompany(principal.companyId)
      );
      res.json({ items: items.filter((item) => !item.isArchived) });
    } catch (error) {
      sendVehicleError(res, error);
    }
  });

  app.get('/api/fleet/vehicles/:id', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'VIEW_VEHICLE');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await txContext.getVehicleRepo().findByIdForCompany(principal.companyId, req.params.id)
      );
      if (!item || item.isArchived) throw new VehicleNotFoundError();
      res.json({ item });
    } catch (error) {
      sendVehicleError(res, error);
    }
  });

  app.post('/api/fleet/vehicles', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'CREATE_VEHICLE');
    if (!principal) return;
    try {
      const plate = normalizePlate(req.body?.plate);
      const renavam = requiredText(req.body?.renavam, 'renavam');
      const brand = requiredText(req.body?.brand, 'brand');
      const model = requiredText(req.body?.model, 'model');
      const currentKm = requiredNonNegative(req.body?.currentKm, 'currentKm');
      const acquisitionValue = requiredNonNegative(req.body?.acquisitionValue, 'acquisitionValue');
      const currentValue = requiredNonNegative(req.body?.currentValue, 'currentValue');
      const rentalValueBase = requiredNonNegative(req.body?.rentalValueBase, 'rentalValueBase');
      const nextMaintenanceKm = optionalNonNegative(req.body?.nextMaintenanceKm, 'nextMaintenanceKm');
      const yearFabrication = optionalNonNegativeInteger(req.body?.yearFabrication, 'yearFabrication') ?? 0;
      const yearModel = optionalNonNegativeInteger(req.body?.yearModel, 'yearModel') ?? 0;

      const item = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const repo = txContext.getVehicleRepo();
        if (await repo.findByPlate(principal.companyId, plate)) throw new VehicleConflictError();
        if (await repo.findByRenavam(principal.companyId, renavam)) throw new VehicleConflictError();
        const now = new Date().toISOString();
        const created = await repo.create({
          id: randomUUID(),
          companyId: principal.companyId,
          plate,
          brand,
          model,
          version: optionalText(req.body?.version),
          yearFabrication,
          yearModel,
          color: optionalText(req.body?.color) || '',
          renavam,
          chassis: (optionalText(req.body?.chassis) || '').toUpperCase(),
          currentKm,
          nextMaintenanceKm,
          fuelType: optionalText(req.body?.fuelType) || 'Flex',
          category: optionalText(req.body?.category) || 'Padrão',
          acquisitionValue,
          currentValue,
          rentalValueBase,
          status: VehicleStatus.AVAILABLE,
          notes: optionalText(req.body?.notes),
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        await txContext.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Vehicle',
          entityId: created.id,
          action: AuditAction.CREATE,
          newState: JSON.stringify(created),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });
        return created;
      });
      res.status(201).json({ item });
    } catch (error) {
      sendVehicleError(res, error);
    }
  });

  app.patch('/api/fleet/vehicles/:id', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'EDIT_VEHICLE');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const repo = txContext.getVehicleRepo();
        const existing = await repo.findByIdForCompany(principal.companyId, req.params.id);
        if (!existing || existing.isArchived) throw new VehicleNotFoundError();
        const changes: Partial<Vehicle> = { updatedAt: new Date().toISOString() };

        if (req.body?.plate !== undefined) {
          const plate = normalizePlate(req.body.plate);
          const duplicate = await repo.findByPlate(principal.companyId, plate);
          if (duplicate && duplicate.id !== existing.id) throw new VehicleConflictError();
          changes.plate = plate;
        }
        if (req.body?.renavam !== undefined) {
          const renavam = requiredText(req.body.renavam, 'renavam');
          const duplicate = await repo.findByRenavam(principal.companyId, renavam);
          if (duplicate && duplicate.id !== existing.id) throw new VehicleConflictError();
          changes.renavam = renavam;
        }
        if (req.body?.brand !== undefined) changes.brand = requiredText(req.body.brand, 'brand');
        if (req.body?.model !== undefined) changes.model = requiredText(req.body.model, 'model');
        if (req.body?.version !== undefined) changes.version = optionalText(req.body.version) || '';
        if (req.body?.color !== undefined) changes.color = optionalText(req.body.color) || '';
        if (req.body?.chassis !== undefined) changes.chassis = (optionalText(req.body.chassis) || '').toUpperCase();
        if (req.body?.fuelType !== undefined) changes.fuelType = requiredText(req.body.fuelType, 'fuelType');
        if (req.body?.category !== undefined) changes.category = requiredText(req.body.category, 'category');
        if (req.body?.notes !== undefined) changes.notes = optionalText(req.body.notes) || '';
        if (req.body?.yearFabrication !== undefined) changes.yearFabrication = optionalNonNegativeInteger(req.body.yearFabrication, 'yearFabrication')!;
        if (req.body?.yearModel !== undefined) changes.yearModel = optionalNonNegativeInteger(req.body.yearModel, 'yearModel')!;
        if (req.body?.currentKm !== undefined) changes.currentKm = requiredNonNegative(req.body.currentKm, 'currentKm');
        if (req.body?.nextMaintenanceKm !== undefined) changes.nextMaintenanceKm = requiredNonNegative(req.body.nextMaintenanceKm, 'nextMaintenanceKm');
        if (req.body?.acquisitionValue !== undefined) changes.acquisitionValue = requiredNonNegative(req.body.acquisitionValue, 'acquisitionValue');
        if (req.body?.currentValue !== undefined) changes.currentValue = requiredNonNegative(req.body.currentValue, 'currentValue');
        if (req.body?.rentalValueBase !== undefined) changes.rentalValueBase = requiredNonNegative(req.body.rentalValueBase, 'rentalValueBase');

        if (Object.keys(changes).length === 1) throw new VehicleValidationError('No editable fields');
        const updated = await repo.updateForCompany(principal.companyId, existing.id, changes);
        if (!updated) throw new VehicleNotFoundError();
        await txContext.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Vehicle',
          entityId: existing.id,
          action: AuditAction.UPDATE,
          previousState: JSON.stringify(existing),
          newState: JSON.stringify(updated),
          userId: principal.userId,
          userName: principal.name,
          timestamp: changes.updatedAt!,
        });
        return updated;
      });
      res.json({ item });
    } catch (error) {
      sendVehicleError(res, error);
    }
  });

  app.patch('/api/fleet/vehicles/:id/status', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'CHANGE_VEHICLE_STATUS');
    if (!principal) return;
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    if (!Object.values(VehicleStatus).includes(status as VehicleStatus)) {
      res.status(400).json({ error: 'Invalid vehicle status' });
      return;
    }
    try {
      const item = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const repo = txContext.getVehicleRepo();
        const existing = await repo.findByIdForCompany(principal.companyId, req.params.id);
        if (!existing) throw new VehicleNotFoundError();
        if (existing.status === status) return existing;
        const now = new Date().toISOString();
        const reason = optionalText(req.body?.reason);
        const updated = await repo.updateForCompany(principal.companyId, existing.id, {
          status: status as VehicleStatus,
          isArchived: status === VehicleStatus.ARCHIVED,
          notes: appendStatusReason(existing, reason),
          updatedAt: now,
        });
        if (!updated) throw new VehicleNotFoundError();
        await txContext.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Vehicle',
          entityId: existing.id,
          action: AuditAction.UPDATE,
          previousState: JSON.stringify({ status: existing.status, isArchived: existing.isArchived }),
          newState: JSON.stringify({ status: updated.status, isArchived: updated.isArchived, reason }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });
        return updated;
      });
      res.json({ item });
    } catch (error) {
      sendVehicleError(res, error);
    }
  });
}
''', encoding='utf-8')

# Minimal server bootstrap hook after authenticated session endpoint registration.
p = Path('server.ts')
text = p.read_text(encoding='utf-8')
if "import { registerVehicleRoutes } from './src/server/vehicleRoutes';" not in text:
    text = replace_once(
        text,
        "import { hasDriverHealthPermission } from './src/shared/security/driverHealthAuthorization';",
        "import { hasDriverHealthPermission } from './src/shared/security/driverHealthAuthorization';\nimport { registerVehicleRoutes } from './src/server/vehicleRoutes';",
        'vehicle route import',
    )
if 'registerVehicleRoutes(app);' not in text:
    text = replace_once(
        text,
        "  // SECURITY-2G7A: finance overview is server-authoritative and tenant-scoped.",
        "  registerVehicleRoutes(app);\n\n  // SECURITY-2G7A: finance overview is server-authoritative and tenant-scoped.",
        'vehicle route registration',
    )
p.write_text(text, encoding='utf-8')

# Browser client exists for I1B but is intentionally not wired to Fleet UI in I1A.
Path('src/api/vehicleClient.ts').write_text(r'''import type { Vehicle } from '../types/entities';
import { VehicleStatus } from '../types/enums';

export class VehicleApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'VehicleApiError';
  }
}

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid vehicle response');
  return value as JsonRecord;
}

function validateVehicle(value: unknown): Vehicle {
  const item = asRecord(value);
  const status = typeof item.status === 'string' ? item.status : '';
  if (
    typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.plate !== 'string' ||
    typeof item.renavam !== 'string' || typeof item.brand !== 'string' || typeof item.model !== 'string' ||
    !Object.values(VehicleStatus).includes(status as VehicleStatus) ||
    !Number.isFinite(item.currentKm) || !Number.isFinite(item.acquisitionValue) ||
    !Number.isFinite(item.currentValue) || !Number.isFinite(item.rentalValueBase) ||
    typeof item.isArchived !== 'boolean' || typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string'
  ) throw new Error('Invalid vehicle payload');
  return item as unknown as Vehicle;
}

async function apiError(response: Response): Promise<VehicleApiError> {
  let message = `Vehicle request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) message = payload.error;
  } catch {}
  return new VehicleApiError(response.status, message);
}

export interface VehicleWriteInput {
  plate?: string;
  renavam?: string;
  brand?: string;
  model?: string;
  version?: string;
  yearFabrication?: number;
  yearModel?: number;
  color?: string;
  chassis?: string;
  currentKm?: number;
  nextMaintenanceKm?: number;
  fuelType?: string;
  category?: string;
  acquisitionValue?: number;
  currentValue?: number;
  rentalValueBase?: number;
  notes?: string;
}

export type VehicleCreateInput = VehicleWriteInput & Required<Pick<VehicleWriteInput,
  'plate' | 'renavam' | 'brand' | 'model' | 'currentKm' | 'acquisitionValue' | 'currentValue' | 'rentalValueBase'
>>;

export class VehicleClient {
  static async list(): Promise<Vehicle[]> {
    const response = await fetch('/api/fleet/vehicles', { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid vehicle list');
    return payload.items.map(validateVehicle);
  }

  static async get(id: string): Promise<Vehicle> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async create(input: VehicleCreateInput): Promise<Vehicle> {
    const response = await fetch('/api/fleet/vehicles', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async update(id: string, input: VehicleWriteInput): Promise<Vehicle> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async changeStatus(id: string, status: VehicleStatus, reason?: string): Promise<Vehicle> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}/status`, {
      method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, reason }),
    });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }
}
''', encoding='utf-8')

Path('src/api/__tests__/vehicleClientTestRunner.ts').write_text(r'''import { VehicleApiError, VehicleClient } from '../vehicleClient';
import { VehicleStatus } from '../../types/enums';

const vehicle = {
  id: 'veh-1', companyId: 'company-a', plate: 'ABC1D23', brand: 'Chevrolet', model: 'Onix', version: 'LT',
  yearFabrication: 2025, yearModel: 2026, color: 'Branco', renavam: '12345678901', chassis: '9BG123',
  currentKm: 10, nextMaintenanceKm: 10000, fuelType: 'Flex', category: 'Hatch', acquisitionValue: 70000,
  currentValue: 65000, rentalValueBase: 750, status: VehicleStatus.AVAILABLE, isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

export class VehicleClientTestRunner {
  static async runAllTests() {
    const originalFetch = globalThis.fetch;
    let passed = 0;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let credentials: RequestCredentials | undefined;
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        credentials = init?.credentials;
        return new Response(JSON.stringify({ items: [vehicle] }), { status: 200 });
      }) as typeof fetch;
      const items = await VehicleClient.list();
      if (items.length !== 1 || credentials !== 'include') throw new Error('LIST transport');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ item: vehicle }), { status: 200 })) as typeof fetch;
      if ((await VehicleClient.get('veh 1')).id !== 'veh-1') throw new Error('GET transport');
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: vehicle }), { status: 201 });
      }) as typeof fetch;
      await VehicleClient.create({ plate: 'ABC1D23', renavam: '12345678901', brand: 'Chevrolet', model: 'Onix', currentKm: 10, acquisitionValue: 1, currentValue: 1, rentalValueBase: 1 });
      for (const key of ['companyId', 'userId', 'userName', 'role', 'currentDriverId', 'currentContractId', 'status', 'isArchived']) {
        if (key in body) throw new Error(`browser authority leaked ${key}`);
      }
    });

    tests.push(async () => {
      let method = '';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = String(init?.method);
        return new Response(JSON.stringify({ item: { ...vehicle, brand: 'GM' } }), { status: 200 });
      }) as typeof fetch;
      await VehicleClient.update('veh-1', { brand: 'GM' });
      if (method !== 'PATCH') throw new Error('UPDATE method');
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: { ...vehicle, status: VehicleStatus.MAINTENANCE } }), { status: 200 });
      }) as typeof fetch;
      const updated = await VehicleClient.changeStatus('veh-1', VehicleStatus.MAINTENANCE, 'Oficina');
      if (updated.status !== VehicleStatus.MAINTENANCE || body.status !== VehicleStatus.MAINTENANCE) throw new Error('STATUS transport');
      for (const key of ['companyId', 'userId', 'userName', 'role']) if (key in body) throw new Error(`status authority leaked ${key}`);
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;
      let error: unknown;
      try { await VehicleClient.list(); } catch (caught) { error = caught; }
      if (!(error instanceof VehicleApiError) || error.status !== 401) throw new Error('401 fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let error: unknown;
      try { await VehicleClient.update('veh-1', { brand: 'GM' }); } catch (caught) { error = caught; }
      if (!(error instanceof VehicleApiError) || error.status !== 403) throw new Error('403 fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...vehicle, currentKm: 'not-a-number' } }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await VehicleClient.get('veh-1'); } catch { failed = true; }
      if (!failed) throw new Error('malformed payload must fail');
    });

    try {
      for (const test of tests) { await test(); passed++; }
    } finally {
      globalThis.fetch = originalFetch;
    }
    const result = { passed, failed: tests.length - passed, total: tests.length };
    console.log(`VehicleClient ${passed}/${tests.length} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('vehicleClientTestRunner')) {
  VehicleClientTestRunner.runAllTests().then((result) => {
    if (result.failed) process.exit(1);
  }).catch((error) => { console.error(error); process.exit(1); });
}
''', encoding='utf-8')
