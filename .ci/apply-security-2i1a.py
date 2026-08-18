from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

# Migration: fields already used by the existing Vehicle domain/form.
Path('drizzle/0007_vehicle_core_authority.sql').write_text("""-- SECURITY-2I1A: persist the existing core Vehicle domain in PostgreSQL.
-- Existing tenant constraints and FORCE RLS from 0001 remain authoritative.

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
""")

# Journal registration.
p = Path('drizzle/meta/_journal.json')
data = json.loads(p.read_text())
if not any(e.get('tag') == '0007_vehicle_core_authority' for e in data['entries']):
    data['entries'].append({
        'idx': 7,
        'version': '7',
        'when': 1787095200000,
        'tag': '0007_vehicle_core_authority',
        'breakpoints': True,
    })
p.write_text(json.dumps(data, indent=2) + '\n')

# Drizzle schema.
p = Path('src/db/schema.ts')
text = p.read_text()
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
p.write_text(text)

# Transaction context.
p = Path('src/domain/finance/ITransactionContext.ts')
text = p.read_text()
text = replace_once(
    text,
    "  SecurityDepositMovement,\n} from '../../types/entities';",
    "  SecurityDepositMovement,\n  Vehicle,\n} from '../../types/entities';",
    'vehicle type import',
)
insert = """export interface ITransactionVehicleRepository {
  findById(id: string): Promise<Vehicle | null>;
  findAll(filters?: TransactionFilterOptions): Promise<Vehicle[]>;
  findByPlate(plate: string): Promise<Vehicle | null>;
  findByRenavam(renavam: string): Promise<Vehicle | null>;
  create(item: Vehicle): Promise<Vehicle>;
  update(id: string, item: Partial<Vehicle>): Promise<Vehicle>;
}

"""
marker = "export interface ITransactionReceivableRepository {"
if 'export interface ITransactionVehicleRepository' not in text:
    text = replace_once(text, marker, insert + marker, 'vehicle repository interface')
text = replace_once(
    text,
    "export interface ITransactionContext {\n  getReceivableRepo(): ITransactionReceivableRepository;",
    "export interface ITransactionContext {\n  getVehicleRepo(): ITransactionVehicleRepository;\n  getReceivableRepo(): ITransactionReceivableRepository;",
    'vehicle context getter',
)
p.write_text(text)

# PostgreSQL vehicle adapter.
p = Path('src/db/repositories/postgresRepositories.ts')
text = p.read_text()
text = replace_once(
    text,
    "  securityDeposits, securityDepositMovements\n} from '../schema';",
    "  securityDeposits, securityDepositMovements, vehicles\n} from '../schema';",
    'vehicle table import',
)
text = replace_once(
    text,
    "import { AuditLog, SecurityDeposit, SecurityDepositMovement } from '../../types/entities';",
    "import { AuditLog, SecurityDeposit, SecurityDepositMovement, Vehicle } from '../../types/entities';",
    'vehicle entity import',
)
class_marker = "export class PostgresUserRepository extends PostgresBaseRepository<any> {"
vehicle_class = """export class PostgresVehicleRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(vehicles, tx); }

  private map(row: any): Vehicle {
    return {
      id: row.id,
      companyId: row.companyId,
      plate: row.plate,
      brand: row.brand,
      model: row.model,
      version: row.version || undefined,
      yearFabrication: Number(row.yearFabrication || 0),
      yearModel: Number(row.yearModel || 0),
      color: row.color,
      renavam: row.renavam,
      chassis: row.chassis,
      currentKm: Number(row.currentKm || 0),
      nextMaintenanceKm: row.nextMaintenanceKm == null ? undefined : Number(row.nextMaintenanceKm),
      fuelType: row.fuelType,
      category: row.category,
      acquisitionValue: Number(row.acquisitionValue || 0),
      currentValue: Number(row.currentValue || 0),
      rentalValueBase: Number(row.rentalValueBase || 0),
      status: row.status,
      notes: row.notes || undefined,
      currentDriverId: row.currentDriverId || undefined,
      currentContractId: row.currentContractId || undefined,
      isArchived: Boolean(row.isArchived),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Vehicle;
  }

  async findById(id: string): Promise<Vehicle | null> {
    const rows = await this.tx.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findAll(): Promise<Vehicle[]> {
    const rows = await this.tx.select().from(vehicles);
    return rows.map((row: any) => this.map(row));
  }

  async findByPlate(plate: string): Promise<Vehicle | null> {
    const rows = await this.tx.select().from(vehicles).where(eq(vehicles.plate, plate)).limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findByRenavam(renavam: string): Promise<Vehicle | null> {
    const rows = await this.tx.select().from(vehicles).where(eq(vehicles.renavam, renavam)).limit(1);
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
      acquisitionValue: item.acquisitionValue,
      currentValue: item.currentValue,
      rentalValueBase: item.rentalValueBase,
      status: item.status,
      notes: item.notes || null,
      currentDriverId: item.currentDriverId || null,
      currentContractId: item.currentContractId || null,
      isArchived: Boolean(item.isArchived),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }).returning();
    return this.map(rows[0]);
  }

  async update(id: string, item: Partial<Vehicle>): Promise<Vehicle> {
    const values: any = { ...item };
    delete values.id;
    delete values.companyId;
    if (values.version === undefined) delete values.version;
    if (values.notes === undefined) delete values.notes;
    if (values.currentDriverId === undefined) delete values.currentDriverId;
    if (values.currentContractId === undefined) delete values.currentContractId;
    const rows = await this.tx.update(vehicles).set(values).where(eq(vehicles.id, id)).returning();
    if (!rows[0]) throw new Error('Veículo não encontrado');
    return this.map(rows[0]);
  }
}

"""
if 'export class PostgresVehicleRepository' not in text:
    text = replace_once(text, class_marker, vehicle_class + class_marker, 'vehicle adapter')
p.write_text(text)

# UnitOfWork.
p = Path('src/db/uow.ts')
text = p.read_text()
text = replace_once(
    text,
    "  PostgresSecurityDepositMovementRepository\n} from './repositories/postgresRepositories';",
    "  PostgresSecurityDepositMovementRepository,\n  PostgresVehicleRepository\n} from './repositories/postgresRepositories';",
    'uow vehicle import',
)
text = replace_once(
    text,
    "      const context: ITransactionContext = {\n        getReceivableRepo: () => new PostgresAccountReceivableRepository(tx),",
    "      const context: ITransactionContext = {\n        getVehicleRepo: () => new PostgresVehicleRepository(tx),\n        getReceivableRepo: () => new PostgresAccountReceivableRepository(tx),",
    'uow vehicle getter',
)
p.write_text(text)

# Server API and operational write RBAC.
p = Path('server.ts')
text = p.read_text()
if "import { VehicleStatus, AuditAction } from './src/types/enums';" not in text:
    text = replace_once(
        text,
        "import { AccountingRegime } from './src/types/enums';",
        "import { AccountingRegime, VehicleStatus, AuditAction } from './src/types/enums';",
        'server vehicle enums',
    )
if "import { generateUUID } from './src/shared/utils/uuid';" not in text:
    text = replace_once(
        text,
        "import { and, eq, sql } from 'drizzle-orm';",
        "import { and, eq, sql } from 'drizzle-orm';\nimport { generateUUID } from './src/shared/utils/uuid';",
        'server uuid import',
    )
helper_marker = "function sendFinanceCommandError(res: Response, error: unknown): void {"
helpers = """const OPERATIONAL_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);

function requireOperationalWritePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  if (!req.principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  if (!OPERATIONAL_WRITE_ROLES.has(req.principal.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return req.principal;
}

function sendOperationalError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('não encontrado') || message.includes('não encontrada')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (message.includes('já está cadastrada') || message.includes('já está cadastrado') || message.includes('já pertence')) {
    res.status(409).json({ error: 'Conflict' });
    return;
  }
  res.status(400).json({ error: 'Invalid operation' });
}

"""
if 'function requireOperationalWritePrincipal' not in text:
    text = replace_once(text, helper_marker, helpers + helper_marker, 'server operational helpers')

route_marker = "  // SECURITY-2G7B1: DRE is server-authoritative and tenant-scoped."
routes = """  // SECURITY-2I1A: core Vehicle persistence/API foundation. UI switchover is I1B.\n  app.get('/api/fleet/vehicles', async (req: Request, res: Response) => {\n    const principal = requireFinancePrincipal(req, res);\n    if (!principal) return;\n    try {\n      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>\n        await txContext.getVehicleRepo().findAll()\n      );\n      res.json({ items: items.filter((item) => !item.isArchived) });\n    } catch (error) {\n      sendOperationalError(res, error);\n    }\n  });\n\n  app.get('/api/fleet/vehicles/:id', async (req: Request, res: Response) => {\n    const principal = requireFinancePrincipal(req, res);\n    if (!principal) return;\n    try {\n      const item = await UnitOfWork.run(principal.companyId, async (txContext) =>\n        await txContext.getVehicleRepo().findById(req.params.id)\n      );\n      if (!item || item.isArchived) {\n        res.status(404).json({ error: 'Not found' });\n        return;\n      }\n      res.json({ item });\n    } catch (error) {\n      sendOperationalError(res, error);\n    }\n  });\n\n  app.post('/api/fleet/vehicles', async (req: Request, res: Response) => {\n    const principal = requireOperationalWritePrincipal(req, res);\n    if (!principal) return;\n    const cleanPlate = typeof req.body?.plate === 'string' ? req.body.plate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '') : '';\n    const cleanRenavam = typeof req.body?.renavam === 'string' ? req.body.renavam.trim() : '';\n    const brand = typeof req.body?.brand === 'string' ? req.body.brand.trim() : '';\n    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';\n    const currentKm = Number(req.body?.currentKm);\n    const acquisitionValue = Number(req.body?.acquisitionValue);\n    const currentValue = Number(req.body?.currentValue);\n    const rentalValueBase = Number(req.body?.rentalValueBase);\n    if (cleanPlate.length < 7 || !cleanRenavam || !brand || !model || !Number.isFinite(currentKm) || currentKm < 0 || !Number.isFinite(acquisitionValue) || acquisitionValue < 0 || !Number.isFinite(currentValue) || currentValue < 0 || !Number.isFinite(rentalValueBase) || rentalValueBase < 0) {\n      res.status(400).json({ error: 'Invalid vehicle payload' });\n      return;\n    }\n    try {\n      const item = await UnitOfWork.run(principal.companyId, async (txContext) => {\n        const repo = txContext.getVehicleRepo();\n        if (await repo.findByPlate(cleanPlate)) throw new Error(`A placa ${cleanPlate} já está cadastrada no sistema.`);\n        if (await repo.findByRenavam(cleanRenavam)) throw new Error(`O RENAVAM ${cleanRenavam} já está cadastrado no sistema.`);\n        const now = new Date().toISOString();\n        const created = await repo.create({\n          id: generateUUID(), companyId: principal.companyId, plate: cleanPlate, renavam: cleanRenavam,\n          brand, model, version: typeof req.body?.version === 'string' && req.body.version.trim() ? req.body.version.trim() : undefined,\n          yearFabrication: Number(req.body?.yearFabrication || 0), yearModel: Number(req.body?.yearModel || 0),\n          color: typeof req.body?.color === 'string' ? req.body.color.trim() : '', chassis: typeof req.body?.chassis === 'string' ? req.body.chassis.trim().toUpperCase() : '',\n          currentKm, nextMaintenanceKm: req.body?.nextMaintenanceKm == null || req.body.nextMaintenanceKm === '' ? undefined : Number(req.body.nextMaintenanceKm),\n          fuelType: typeof req.body?.fuelType === 'string' && req.body.fuelType ? req.body.fuelType : 'Flex', category: typeof req.body?.category === 'string' && req.body.category ? req.body.category : 'Padrão',\n          acquisitionValue, currentValue, rentalValueBase, status: VehicleStatus.AVAILABLE,\n          notes: typeof req.body?.notes === 'string' && req.body.notes ? req.body.notes : undefined, isArchived: false, createdAt: now, updatedAt: now,\n        });\n        await txContext.getAuditLogRepo().create({\n          id: generateUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: created.id, action: AuditAction.CREATE,\n          userId: principal.userId, userName: principal.name, timestamp: now, previousState: null, newState: JSON.stringify(created),\n        });\n        return created;\n      });\n      res.status(201).json({ item });\n    } catch (error) {\n      sendOperationalError(res, error);\n    }\n  });\n\n  app.patch('/api/fleet/vehicles/:id', async (req: Request, res: Response) => {\n    const principal = requireOperationalWritePrincipal(req, res);\n    if (!principal) return;\n    try {\n      const item = await UnitOfWork.run(principal.companyId, async (txContext) => {\n        const repo = txContext.getVehicleRepo();\n        const existing = await repo.findById(req.params.id);\n        if (!existing || existing.isArchived) throw new Error('Veículo não encontrado');\n        const changes: any = { updatedAt: new Date().toISOString() };\n        if (typeof req.body?.plate === 'string' && req.body.plate) {\n          const clean = req.body.plate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');\n          if (clean.length < 7) throw new Error('Placa inválida');\n          const duplicate = await repo.findByPlate(clean);\n          if (duplicate && duplicate.id !== existing.id) throw new Error(`A placa ${clean} já pertence a outro veículo.`);\n          changes.plate = clean;\n        }\n        if (typeof req.body?.renavam === 'string' && req.body.renavam.trim()) {\n          const clean = req.body.renavam.trim();\n          const duplicate = await repo.findByRenavam(clean);\n          if (duplicate && duplicate.id !== existing.id) throw new Error(`O RENAVAM ${clean} já pertence a outro veículo.`);\n          changes.renavam = clean;\n        }\n        for (const key of ['brand','model','version','color','fuelType','category','notes'] as const) if (req.body?.[key] !== undefined) changes[key] = typeof req.body[key] === 'string' ? req.body[key].trim() : req.body[key];\n        if (req.body?.chassis !== undefined) changes.chassis = String(req.body.chassis).trim().toUpperCase();\n        for (const key of ['yearFabrication','yearModel','currentKm','nextMaintenanceKm','acquisitionValue','currentValue','rentalValueBase'] as const) if (req.body?.[key] !== undefined && req.body[key] !== '') { const value = Number(req.body[key]); if (!Number.isFinite(value) || (['currentKm','acquisitionValue','currentValue','rentalValueBase'].includes(key) && value < 0)) throw new Error('Valor de veículo inválido'); changes[key] = value; }\n        const updated = await repo.update(existing.id, changes);\n        await txContext.getAuditLogRepo().create({\n          id: generateUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: existing.id, action: AuditAction.UPDATE,\n          userId: principal.userId, userName: principal.name, timestamp: changes.updatedAt, previousState: JSON.stringify(existing), newState: JSON.stringify(updated),\n        });\n        return updated;\n      });\n      res.json({ item });\n    } catch (error) {\n      sendOperationalError(res, error);\n    }\n  });\n\n  app.post('/api/fleet/vehicles/:id/status', async (req: Request, res: Response) => {\n    const principal = requireOperationalWritePrincipal(req, res);\n    if (!principal) return;\n    const status = typeof req.body?.status === 'string' ? req.body.status : '';\n    if (!Object.values(VehicleStatus).includes(status as VehicleStatus)) {\n      res.status(400).json({ error: 'Invalid vehicle status' });\n      return;\n    }\n    try {\n      const item = await UnitOfWork.run(principal.companyId, async (txContext) => {\n        const repo = txContext.getVehicleRepo();\n        const existing = await repo.findById(req.params.id);\n        if (!existing || existing.isArchived) throw new Error('Veículo não encontrado');\n        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';\n        const changes: any = { status, updatedAt: new Date().toISOString() };\n        if (status === VehicleStatus.AVAILABLE && existing.currentContractId) { changes.currentDriverId = null; changes.currentContractId = null; }\n        if (reason) changes.notes = `${existing.notes || ''}\\n[Status]: ${reason}`.trim();\n        const updated = await repo.update(existing.id, changes);\n        await txContext.getAuditLogRepo().create({\n          id: generateUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: existing.id, action: AuditAction.UPDATE,\n          userId: principal.userId, userName: principal.name, timestamp: changes.updatedAt, previousState: JSON.stringify({ status: existing.status }), newState: JSON.stringify({ status: updated.status, reason }),\n        });\n        return updated;\n      });\n      res.json({ item });\n    } catch (error) {\n      sendOperationalError(res, error);\n    }\n  });\n\n"""
if "app.get('/api/fleet/vehicles'" not in text:
    text = replace_once(text, route_marker, routes + route_marker, 'vehicle routes')
p.write_text(text)

# Client, not wired to UI until I1B.
Path('src/api/vehicleClient.ts').write_text("""import { Vehicle } from '../types/entities';\nimport { VehicleStatus } from '../types/enums';\n\nexport class VehicleApiError extends Error {\n  constructor(public readonly status: number, message: string) { super(message); this.name = 'VehicleApiError'; }\n}\n\ntype JsonRecord = Record<string, unknown>;\nfunction asRecord(v: unknown): JsonRecord { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid vehicle response'); return v as JsonRecord; }\nfunction validateVehicle(v: unknown): Vehicle {\n  const item=asRecord(v);\n  if(typeof item.id!=='string'||typeof item.plate!=='string'||typeof item.renavam!=='string'||typeof item.brand!=='string'||typeof item.model!=='string'||typeof item.status!=='string'||!Number.isFinite(Number(item.currentKm))||!Number.isFinite(Number(item.rentalValueBase))) throw new Error('Invalid vehicle payload');\n  return item as unknown as Vehicle;\n}\nasync function apiError(r: Response){let m=`Vehicle request failed (${r.status})`;try{const p=asRecord(await r.json());if(typeof p.error==='string'&&p.error)m=p.error}catch{}return new VehicleApiError(r.status,m)}\n\nexport interface VehicleWriteInput {\n  plate?: string; renavam?: string; brand?: string; model?: string; version?: string; yearFabrication?: number; yearModel?: number; color?: string; chassis?: string; currentKm?: number; nextMaintenanceKm?: number; fuelType?: string; category?: string; acquisitionValue?: number; currentValue?: number; rentalValueBase?: number; notes?: string;\n}\n\nexport class VehicleClient {\n  static async list(): Promise<Vehicle[]> { const r=await fetch('/api/fleet/vehicles',{credentials:'include'});if(!r.ok)throw await apiError(r);const p=asRecord(await r.json());if(!Array.isArray(p.items))throw new Error('Invalid vehicle list');return p.items.map(validateVehicle); }\n  static async get(id:string): Promise<Vehicle> { const r=await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}`,{credentials:'include'});if(!r.ok)throw await apiError(r);return validateVehicle(asRecord(await r.json()).item); }\n  static async create(input: Required<Pick<VehicleWriteInput,'plate'|'renavam'|'brand'|'model'|'currentKm'|'acquisitionValue'|'currentValue'|'rentalValueBase'>> & VehicleWriteInput): Promise<Vehicle> { const r=await fetch('/api/fleet/vehicles',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!r.ok)throw await apiError(r);return validateVehicle(asRecord(await r.json()).item); }\n  static async update(id:string,input:VehicleWriteInput):Promise<Vehicle>{const r=await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}`,{method:'PATCH',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!r.ok)throw await apiError(r);return validateVehicle(asRecord(await r.json()).item)}\n  static async changeStatus(id:string,status:VehicleStatus,reason?:string):Promise<Vehicle>{const r=await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}/status`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({status,reason})});if(!r.ok)throw await apiError(r);return validateVehicle(asRecord(await r.json()).item)}\n}\n""")

Path('src/api/__tests__/vehicleClientTestRunner.ts').write_text("""import { VehicleClient, VehicleApiError } from '../vehicleClient';\nimport { VehicleStatus } from '../../types/enums';\nconst vehicle={id:'veh-1',companyId:'company-a',plate:'ABC1D23',brand:'Chevrolet',model:'Onix',yearFabrication:2025,yearModel:2025,color:'Branco',renavam:'123',chassis:'XYZ',currentKm:10,fuelType:'Flex',category:'Hatch',acquisitionValue:70000,currentValue:65000,rentalValueBase:750,status:'AVAILABLE',isArchived:false,createdAt:'2026-01-01',updatedAt:'2026-01-01'};\nexport class VehicleClientTestRunner{static async runAllTests(){const original=globalThis.fetch;let passed=0;const tests:Array<()=>Promise<void>>=[];\n tests.push(async()=>{let cred:any;globalThis.fetch=(async(_i:any,init?:RequestInit)=>{cred=init?.credentials;return new Response(JSON.stringify({items:[vehicle]}),{status:200})}) as typeof fetch;const x=await VehicleClient.list();if(x.length!==1||cred!=='include')throw Error('list transport')});\n tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({item:vehicle}),{status:200})) as typeof fetch;if((await VehicleClient.get('veh-1')).id!=='veh-1')throw Error('get')});\n tests.push(async()=>{let body:any;globalThis.fetch=(async(_i:any,init?:RequestInit)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({item:vehicle}),{status:201})}) as typeof fetch;await VehicleClient.create({plate:'ABC1D23',renavam:'123',brand:'Chevrolet',model:'Onix',currentKm:10,acquisitionValue:1,currentValue:1,rentalValueBase:1});for(const k of ['companyId','userId','userName','currentDriverId','currentContractId','status'])if(k in body)throw Error(`authority leaked ${k}`)});\n tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({item:vehicle}),{status:200})) as typeof fetch;await VehicleClient.update('veh-1',{brand:'GM'})});\n tests.push(async()=>{let body:any;globalThis.fetch=(async(_i:any,init?:RequestInit)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({item:{...vehicle,status:'MAINTENANCE'}}),{status:200})}) as typeof fetch;const x=await VehicleClient.changeStatus('veh-1',VehicleStatus.MAINTENANCE,'oficina');if(x.status!=='MAINTENANCE'||body.companyId||body.userId)throw Error('status transport')});\n tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({error:'Forbidden'}),{status:403})) as typeof fetch;let e:any;try{await VehicleClient.update('veh-1',{brand:'X'})}catch(x){e=x}if(!(e instanceof VehicleApiError)||e.status!==403)throw Error('fail closed')});\n tests.push(async()=>{globalThis.fetch=(async()=>new Response(JSON.stringify({item:{id:'bad'}}),{status:200})) as typeof fetch;let failed=false;try{await VehicleClient.get('bad')}catch{failed=true}if(!failed)throw Error('malformed fail closed')});\n try{for(const t of tests){await t();passed++}}finally{globalThis.fetch=original}const r={passed,failed:tests.length-passed,total:tests.length};console.log(`VehicleClient ${r.passed}/${r.total} PASS`);return r}}\nif(process.argv[1]?.includes('vehicleClientTestRunner'))VehicleClientTestRunner.runAllTests().then(r=>{if(r.failed)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)});\n""")

print('SECURITY-2I1A patch applied')
