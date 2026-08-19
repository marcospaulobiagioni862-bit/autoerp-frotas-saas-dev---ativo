from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# 0009 — KmRecord server authority + deterministic backfill for existing server Vehicles.
Path('drizzle/0009_vehicle_km_authority.sql').write_text(r'''-- SECURITY-2I1B: server-authoritative Vehicle KM history.
CREATE TABLE IF NOT EXISTS vehicle_km_records (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  driver_id text,
  contract_id text,
  km_value integer NOT NULL,
  record_date text NOT NULL,
  reading_type text NOT NULL,
  photo_url text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_km_records_km_nonnegative CHECK (km_value >= 0),
  CONSTRAINT vehicle_km_records_reading_type CHECK (reading_type IN ('CHECK_IN','CHECK_OUT','PERIODIC','MAINTENANCE'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_km_company_vehicle_date
  ON vehicle_km_records(company_id, vehicle_id, record_date DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_km_exact_reading
  ON vehicle_km_records(company_id, vehicle_id, km_value, reading_type, record_date);

-- Deterministic bootstrap record for Vehicles that already exist on the server.
INSERT INTO vehicle_km_records (
  id, company_id, vehicle_id, driver_id, contract_id, km_value,
  record_date, reading_type, notes, created_at
)
SELECT
  'km-init-' || md5(v.company_id || ':' || v.id),
  v.company_id,
  v.id,
  v.current_driver_id,
  v.current_contract_id,
  v.current_km,
  to_char(v.created_at, 'YYYY-MM-DD'),
  'PERIODIC',
  'Registro inicial migrado da autoridade Vehicle server-side',
  v.created_at
FROM vehicles v
ON CONFLICT DO NOTHING;

ALTER TABLE vehicle_km_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_km_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_vehicle_km ON vehicle_km_records;
CREATE POLICY tenant_isolation_vehicle_km ON vehicle_km_records
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
''', encoding='utf-8')

# Journal.
p = Path('drizzle/meta/_journal.json')
data = json.loads(p.read_text(encoding='utf-8'))
if not any(e.get('tag') == '0009_vehicle_km_authority' for e in data['entries']):
    data['entries'].append({
        'idx': 9,
        'version': '7',
        'when': 1787109000000,
        'tag': '0009_vehicle_km_authority',
        'breakpoints': True,
    })
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

# Drizzle schema.
p = Path('src/db/schema.ts')
text = p.read_text(encoding='utf-8')
marker = """export const drivers = pgTable('drivers', {
"""
km_schema = """export const vehicleKmRecords = pgTable('vehicle_km_records', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  vehicleId: text('vehicle_id').notNull(),
  driverId: text('driver_id'),
  contractId: text('contract_id'),
  kmValue: integer('km_value').notNull(),
  recordDate: text('record_date').notNull(),
  readingType: text('reading_type').notNull(),
  photoUrl: text('photo_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxCompanyVehicleDate: index('idx_vehicle_km_company_vehicle_date').on(t.companyId, t.vehicleId, t.recordDate, t.createdAt),
  unqExactReading: unique('uq_vehicle_km_exact_reading').on(t.companyId, t.vehicleId, t.kmValue, t.readingType, t.recordDate),
}));

"""
if "export const vehicleKmRecords" not in text:
    text = replace_once(text, marker, km_schema + marker, 'km schema')
p.write_text(text, encoding='utf-8')

# Transaction contracts.
p = Path('src/domain/finance/ITransactionContext.ts')
text = p.read_text(encoding='utf-8')
text = replace_once(text, "  Vehicle,\n} from '../../types/entities';", "  Vehicle,\n  KmRecord,\n} from '../../types/entities';", 'KmRecord type import')
text = replace_once(
    text,
    "  findByIdForCompany(companyId: string, id: string): Promise<Vehicle | null>;\n",
    "  findByIdForCompany(companyId: string, id: string): Promise<Vehicle | null>;\n  findByIdForCompanyWithLock(companyId: string, id: string): Promise<Vehicle | null>;\n",
    'vehicle lock contract',
)
km_interface = """export interface ITransactionKmRecordRepository {
  findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<KmRecord[]>;
  create(item: KmRecord): Promise<KmRecord>;
}

"""
if 'export interface ITransactionKmRecordRepository' not in text:
    text = replace_once(text, 'export interface ITransactionReceivableRepository {', km_interface + 'export interface ITransactionReceivableRepository {', 'km repo interface')
text = replace_once(
    text,
    "  getVehicleRepo(): ITransactionVehicleRepository;\n",
    "  getVehicleRepo(): ITransactionVehicleRepository;\n  getKmRecordRepo(): ITransactionKmRecordRepository;\n",
    'km context getter',
)
p.write_text(text, encoding='utf-8')

# PostgreSQL repositories.
p = Path('src/db/repositories/postgresRepositories.ts')
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "  securityDeposits, securityDepositMovements, driverHealthProfiles, vehicles\n} from '../schema';",
    "  securityDeposits, securityDepositMovements, driverHealthProfiles, vehicles, vehicleKmRecords\n} from '../schema';",
    'km table import',
)
text = replace_once(text, "import { eq, and, sql, lt } from 'drizzle-orm';", "import { eq, and, sql, lt, desc } from 'drizzle-orm';", 'desc import')
text = replace_once(
    text,
    "import { AuditLog, SecurityDeposit, SecurityDepositMovement, Vehicle } from '../../types/entities';",
    "import { AuditLog, SecurityDeposit, SecurityDepositMovement, Vehicle, KmRecord } from '../../types/entities';",
    'KmRecord repo import',
)
text = replace_once(
    text,
    "  async findByIdForCompany(companyId: string, id: string): Promise<Vehicle | null> {\n    const rows = await this.tx.select().from(vehicles).where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id))).limit(1);\n    return rows[0] ? this.map(rows[0]) : null;\n  }\n",
    "  async findByIdForCompany(companyId: string, id: string): Promise<Vehicle | null> {\n    const rows = await this.tx.select().from(vehicles).where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id))).limit(1);\n    return rows[0] ? this.map(rows[0]) : null;\n  }\n\n  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<Vehicle | null> {\n    const rows = await this.tx.select().from(vehicles)\n      .where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id)))\n      .for('update')\n      .limit(1);\n    return rows[0] ? this.map(rows[0]) : null;\n  }\n",
    'vehicle lock implementation',
)
km_repo = r'''export class PostgresKmRecordRepository {
  private tx: any;
  constructor(tx?: any) { this.tx = tx || db; }

  private map(row: any): KmRecord {
    return {
      id: row.id,
      companyId: row.companyId,
      vehicleId: row.vehicleId,
      driverId: row.driverId || undefined,
      contractId: row.contractId || undefined,
      kmValue: Number(row.kmValue),
      recordDate: row.recordDate,
      readingType: row.readingType as KmRecord['readingType'],
      photoUrl: row.photoUrl || undefined,
      notes: row.notes || undefined,
      createdAt: row.createdAt,
    };
  }

  async findByVehicleIdForCompany(companyId: string, vehicleId: string): Promise<KmRecord[]> {
    const rows = await this.tx.select().from(vehicleKmRecords)
      .where(and(eq(vehicleKmRecords.companyId, companyId), eq(vehicleKmRecords.vehicleId, vehicleId)))
      .orderBy(desc(vehicleKmRecords.createdAt), desc(vehicleKmRecords.id));
    return rows.map((row: any) => this.map(row));
  }

  async create(item: KmRecord): Promise<KmRecord> {
    const rows = await this.tx.insert(vehicleKmRecords).values({
      id: item.id,
      companyId: item.companyId,
      vehicleId: item.vehicleId,
      driverId: item.driverId || null,
      contractId: item.contractId || null,
      kmValue: item.kmValue,
      recordDate: item.recordDate,
      readingType: item.readingType,
      photoUrl: item.photoUrl || null,
      notes: item.notes || null,
      createdAt: item.createdAt,
    }).returning();
    return this.map(rows[0]);
  }
}

'''
if 'export class PostgresKmRecordRepository' not in text:
    text = replace_once(text, 'export class PostgresUserRepository', km_repo + 'export class PostgresUserRepository', 'km postgres repo')
p.write_text(text, encoding='utf-8')

# UnitOfWork.
p = Path('src/db/uow.ts')
text = p.read_text(encoding='utf-8')
text = replace_once(text, "  PostgresVehicleRepository\n} from './repositories/postgresRepositories';", "  PostgresVehicleRepository,\n  PostgresKmRecordRepository\n} from './repositories/postgresRepositories';", 'uow km import')
text = replace_once(text, "        getVehicleRepo: () => new PostgresVehicleRepository(tx),\n", "        getVehicleRepo: () => new PostgresVehicleRepository(tx),\n        getKmRecordRepo: () => new PostgresKmRecordRepository(tx),\n", 'uow km getter')
p.write_text(text, encoding='utf-8')

# Server Vehicle/KM authority.
p = Path('src/server/vehicleRoutes.ts')
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "type VehicleAction = 'VIEW_VEHICLE' | 'CREATE_VEHICLE' | 'EDIT_VEHICLE' | 'CHANGE_VEHICLE_STATUS';",
    "type VehicleAction = 'VIEW_VEHICLE' | 'CREATE_VEHICLE' | 'EDIT_VEHICLE' | 'CHANGE_VEHICLE_STATUS' | 'RECORD_VEHICLE_KM';",
    'km RBAC action',
)
text = replace_once(
    text,
    "        const created = await repo.create({",
    "        const created = await repo.create({",
    'create anchor check',
)
create_audit_anchor = """        await txContext.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Vehicle',
          entityId: created.id,
          action: AuditAction.CREATE,
"""
initial_km = """        await txContext.getKmRecordRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          vehicleId: created.id,
          kmValue: created.currentKm,
          recordDate: now.split('T')[0],
          readingType: 'PERIODIC',
          notes: 'Cadastro inicial do veículo',
          createdAt: now,
        });
        await txContext.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Vehicle',
          entityId: created.id,
          action: AuditAction.CREATE,
"""
text = replace_once(text, create_audit_anchor, initial_km, 'atomic initial km')
patch_anchor = """  app.patch('/api/fleet/vehicles/:id', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'EDIT_VEHICLE');
    if (!principal) return;
    try {
"""
patch_replacement = """  app.patch('/api/fleet/vehicles/:id', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'EDIT_VEHICLE');
    if (!principal) return;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'currentKm')) {
      res.status(400).json({ error: 'Use the KM record endpoint to change currentKm' });
      return;
    }
    try {
"""
text = replace_once(text, patch_anchor, patch_replacement, 'block generic currentKm')
text = replace_once(text, "        if (req.body?.currentKm !== undefined) changes.currentKm = requiredNonNegative(req.body.currentKm, 'currentKm');\n", "", 'remove generic currentKm mutation')

status_anchor = """  app.patch('/api/fleet/vehicles/:id/status', async (req: Request, res: Response) => {
"""
km_routes = r'''  app.get('/api/fleet/vehicles/:id/km-records', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'VIEW_VEHICLE');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const vehicle = await txContext.getVehicleRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!vehicle || vehicle.isArchived) throw new VehicleNotFoundError();
        return await txContext.getKmRecordRepo().findByVehicleIdForCompany(principal.companyId, vehicle.id);
      });
      res.json({ items });
    } catch (error) {
      sendVehicleError(res, error);
    }
  });

  app.post('/api/fleet/vehicles/:id/km-records', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'RECORD_VEHICLE_KM');
    if (!principal) return;
    const newKm = Number(req.body?.kmValue);
    const readingType = typeof req.body?.readingType === 'string' ? req.body.readingType : '';
    const allowedTypes = new Set(['CHECK_IN', 'CHECK_OUT', 'PERIODIC', 'MAINTENANCE']);
    if (!Number.isInteger(newKm) || newKm < 0 || !allowedTypes.has(readingType)) {
      res.status(400).json({ error: 'Invalid KM record request' });
      return;
    }
    try {
      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const vehicleRepo = txContext.getVehicleRepo();
        const vehicle = await vehicleRepo.findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!vehicle || vehicle.isArchived) throw new VehicleNotFoundError();
        if (newKm < vehicle.currentKm) throw new VehicleValidationError('KM regression');
        const now = new Date().toISOString();
        const record = await txContext.getKmRecordRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          vehicleId: vehicle.id,
          driverId: vehicle.currentDriverId,
          contractId: vehicle.currentContractId,
          kmValue: newKm,
          recordDate: now.split('T')[0],
          readingType: readingType as 'CHECK_IN' | 'CHECK_OUT' | 'PERIODIC' | 'MAINTENANCE',
          notes: optionalText(req.body?.notes),
          createdAt: now,
        });
        const updated = await vehicleRepo.updateForCompany(principal.companyId, vehicle.id, {
          currentKm: newKm,
          updatedAt: now,
        });
        if (!updated) throw new VehicleNotFoundError();
        await txContext.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'KmRecord',
          entityId: record.id,
          action: AuditAction.CREATE,
          previousState: JSON.stringify({ vehicleId: vehicle.id, currentKm: vehicle.currentKm }),
          newState: JSON.stringify({ vehicleId: vehicle.id, currentKm: newKm, readingType }),
          userId: principal.userId,
          userName: principal.name,
          timestamp: now,
        });
        return { record, vehicle: updated };
      });
      res.status(201).json(result);
    } catch (error) {
      sendVehicleError(res, error);
    }
  });

'''
text = replace_once(text, status_anchor, km_routes + status_anchor, 'km routes')
p.write_text(text, encoding='utf-8')

# Fail-closed browser client. currentKm is create-only; all later KM writes use recordKm.
Path('src/api/vehicleClient.ts').write_text(r'''import type { Vehicle, KmRecord } from '../types/entities';
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

const KM_TYPES = new Set(['CHECK_IN', 'CHECK_OUT', 'PERIODIC', 'MAINTENANCE']);
function validateKmRecord(value: unknown): KmRecord {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.vehicleId !== 'string' ||
    !Number.isInteger(item.kmValue) || Number(item.kmValue) < 0 || typeof item.recordDate !== 'string' ||
    typeof item.readingType !== 'string' || !KM_TYPES.has(item.readingType) || typeof item.createdAt !== 'string'
  ) throw new Error('Invalid KM record payload');
  return item as unknown as KmRecord;
}

async function apiError(response: Response): Promise<VehicleApiError> {
  let message = `Vehicle request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) message = payload.error;
  } catch {}
  return new VehicleApiError(response.status, message);
}

export interface VehicleUpdateInput {
  plate?: string;
  renavam?: string;
  brand?: string;
  model?: string;
  version?: string;
  yearFabrication?: number;
  yearModel?: number;
  color?: string;
  chassis?: string;
  nextMaintenanceKm?: number;
  fuelType?: string;
  category?: string;
  acquisitionValue?: number;
  currentValue?: number;
  rentalValueBase?: number;
  notes?: string;
}

export type VehicleCreateInput = VehicleUpdateInput & {
  plate: string;
  renavam: string;
  brand: string;
  model: string;
  currentKm: number;
  acquisitionValue: number;
  currentValue: number;
  rentalValueBase: number;
};

export interface VehicleKmInput {
  kmValue: number;
  readingType: KmRecord['readingType'];
  notes?: string;
}

export interface VehicleKmResult {
  record: KmRecord;
  vehicle: Vehicle;
}

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

  static async update(id: string, input: VehicleUpdateInput): Promise<Vehicle> {
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

  static async listKm(vehicleId: string): Promise<KmRecord[]> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/km-records`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid KM record list');
    return payload.items.map(validateKmRecord);
  }

  static async recordKm(vehicleId: string, input: VehicleKmInput): Promise<VehicleKmResult> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/km-records`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return { record: validateKmRecord(payload.record), vehicle: validateVehicle(payload.vehicle) };
  }
}
''', encoding='utf-8')
