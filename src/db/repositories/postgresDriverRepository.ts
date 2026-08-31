import { sql, type SQL } from 'drizzle-orm';
import type { ITransactionDriverRepository } from '../../domain/finance/ITransactionContext';
import type { Driver } from '../../types/entities';
import { DocumentStatus, DriverStatus } from '../../types/enums';

function evaluateCnhStatus(expiration: string): DocumentStatus {
  const end = new Date(`${expiration}T00:00:00Z`);
  if (!Number.isFinite(end.getTime())) return DocumentStatus.PENDING;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.ceil((end.getTime() - todayUtc) / 86_400_000);
  if (days < 0) return DocumentStatus.EXPIRED;
  if (days <= 30) return DocumentStatus.EXPIRING_SOON;
  return DocumentStatus.VALID;
}

function rowsOf(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function activeFor(driver: Driver): boolean {
  return !driver.isArchived && driver.status === DriverStatus.ACTIVE;
}

function platformArraySql(values: string[]): SQL<unknown> {
  return sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(values)}::jsonb))`;
}

function duplicateIdentityError(message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = '23505';
  return error;
}

export class PostgresDriverRepository implements ITransactionDriverRepository {
  constructor(private readonly tx: any) {}

  private map(row: any): Driver {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      fullName: String(row.name || ''),
      cpf: String(row.cpf || ''),
      rg: row.rg || undefined,
      birthDate: String(row.birth_date || ''),
      phone: String(row.phone || ''),
      whatsapp: String(row.whatsapp || row.phone || ''),
      email: row.email || undefined,
      address: {
        street: String(row.address_street || ''),
        number: String(row.address_number || ''),
        complement: row.address_complement || undefined,
        neighborhood: String(row.address_neighborhood || ''),
        city: String(row.address_city || ''),
        state: String(row.address_state || ''),
        zipCode: String(row.address_zip_code || ''),
      },
      cnhNumber: String(row.cnh || ''),
      cnhCategory: String(row.cnh_category || ''),
      cnhExpiration: String(row.cnh_expiration || ''),
      cnhStatus: evaluateCnhStatus(String(row.cnh_expiration || '')),
      appPlatforms: Array.isArray(row.app_platforms) ? row.app_platforms.map(String) : [],
      status: String(row.status || (row.active ? 'ACTIVE' : 'INACTIVE')) as DriverStatus,
      currentVehicleId: row.current_vehicle_id || undefined,
      currentContractId: row.current_contract_id || undefined,
      photoUrl: row.photo_url || undefined,
      notes: row.notes || undefined,
      isArchived: Boolean(row.is_archived),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  private async queryOne(companyId: string, predicate: SQL<unknown>): Promise<Driver | null> {
    const result = await this.tx.execute(sql`
      SELECT d.*,
        (
          SELECT v.id FROM vehicles v
          WHERE v.company_id = ${companyId}
            AND v.current_driver_id = d.id
            AND v.is_archived = false
          ORDER BY v.updated_at DESC, v.id
          LIMIT 1
        ) AS current_vehicle_id,
        (
          SELECT v.current_contract_id FROM vehicles v
          WHERE v.company_id = ${companyId}
            AND v.current_driver_id = d.id
            AND v.is_archived = false
          ORDER BY v.updated_at DESC, v.id
          LIMIT 1
        ) AS current_contract_id
      FROM drivers d
      WHERE d.company_id = ${companyId} AND ${predicate}
      LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findByIdForCompany(companyId: string, id: string): Promise<Driver | null> {
    return await this.queryOne(companyId, sql`d.id = ${id}`);
  }

  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<Driver | null> {
    const result = await this.tx.execute(sql`
      SELECT d.*
      FROM drivers d
      WHERE d.company_id = ${companyId} AND d.id = ${id}
      FOR UPDATE OF d
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findAllByCompany(companyId: string): Promise<Driver[]> {
    const result = await this.tx.execute(sql`
      SELECT d.*,
        (
          SELECT v.id FROM vehicles v
          WHERE v.company_id = ${companyId}
            AND v.current_driver_id = d.id
            AND v.is_archived = false
          ORDER BY v.updated_at DESC, v.id
          LIMIT 1
        ) AS current_vehicle_id,
        (
          SELECT v.current_contract_id FROM vehicles v
          WHERE v.company_id = ${companyId}
            AND v.current_driver_id = d.id
            AND v.is_archived = false
          ORDER BY v.updated_at DESC, v.id
          LIMIT 1
        ) AS current_contract_id
      FROM drivers d
      WHERE d.company_id = ${companyId}
      ORDER BY d.name, d.id
    `);
    return rowsOf(result).map((row) => this.map(row));
  }

  async findByCpf(companyId: string, cpf: string): Promise<Driver | null> {
    return await this.queryOne(companyId, sql`d.cpf = ${cpf} AND d.is_archived = false`);
  }

  async findByCnh(companyId: string, cnh: string): Promise<Driver | null> {
    return await this.queryOne(companyId, sql`d.cnh = ${cnh} AND d.is_archived = false`);
  }

  async create(item: Driver): Promise<Driver> {
    const archivedByCpf = await this.queryOne(
      item.companyId,
      sql`d.cpf = ${item.cpf} AND d.is_archived = true`
    );
    const archivedByCnh = await this.queryOne(
      item.companyId,
      sql`d.cnh = ${item.cnhNumber} AND d.is_archived = true`
    );

    if (archivedByCpf || archivedByCnh) {
      if (!archivedByCpf || !archivedByCnh || archivedByCpf.id !== archivedByCnh.id) {
        throw duplicateIdentityError('Archived driver identity conflicts with CPF/CNH combination');
      }

      const restored: Driver = {
        ...item,
        id: archivedByCpf.id,
        isArchived: false,
        createdAt: archivedByCpf.createdAt,
        updatedAt: item.updatedAt,
      };
      const saved = await this.updateForCompany(item.companyId, archivedByCpf.id, restored);
      if (!saved) throw new Error('Driver restore failed');
      return saved;
    }

    await this.tx.execute(sql`
      INSERT INTO drivers (
        id, company_id, name, cpf, cnh, active, rg, birth_date, phone, whatsapp, email,
        address_street, address_number, address_complement, address_neighborhood,
        address_city, address_state, address_zip_code, cnh_category, cnh_expiration,
        app_platforms, status, photo_url, notes, is_archived, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.fullName}, ${item.cpf}, ${item.cnhNumber},
        ${activeFor(item)}, ${item.rg || null}, ${item.birthDate}, ${item.phone},
        ${item.whatsapp}, ${item.email || null}, ${item.address.street}, ${item.address.number},
        ${item.address.complement || null}, ${item.address.neighborhood}, ${item.address.city},
        ${item.address.state}, ${item.address.zipCode}, ${item.cnhCategory}, ${item.cnhExpiration},
        ${platformArraySql(item.appPlatforms)}, ${item.status}, ${item.photoUrl || null}, ${item.notes || null},
        ${item.isArchived}, ${item.createdAt}, ${item.updatedAt}
      )
    `);
    const created = await this.findByIdForCompany(item.companyId, item.id);
    if (!created) throw new Error('Driver create failed');
    return created;
  }

  async updateForCompany(companyId: string, id: string, item: Driver): Promise<Driver | null> {
    const result = await this.tx.execute(sql`
      UPDATE drivers SET
        name = ${item.fullName},
        cpf = ${item.cpf},
        cnh = ${item.cnhNumber},
        active = ${activeFor(item)},
        rg = ${item.rg || null},
        birth_date = ${item.birthDate},
        phone = ${item.phone},
        whatsapp = ${item.whatsapp},
        email = ${item.email || null},
        address_street = ${item.address.street},
        address_number = ${item.address.number},
        address_complement = ${item.address.complement || null},
        address_neighborhood = ${item.address.neighborhood},
        address_city = ${item.address.city},
        address_state = ${item.address.state},
        address_zip_code = ${item.address.zipCode},
        cnh_category = ${item.cnhCategory},
        cnh_expiration = ${item.cnhExpiration},
        app_platforms = ${platformArraySql(item.appPlatforms)},
        status = ${item.status},
        photo_url = ${item.photoUrl || null},
        notes = ${item.notes || null},
        is_archived = ${item.isArchived},
        updated_at = ${item.updatedAt}
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING id
    `);
    if (!rowsOf(result)[0]) return null;
    return await this.findByIdForCompany(companyId, id);
  }
}
