import { db } from '../index';
import {
  users, companies, accountReceivables, accountPayables,
  financialTransactions, financialAccounts, paymentMethods, auditLogs, contracts, financialPeriods,
  securityDeposits, securityDepositMovements, driverHealthProfiles, vehicles, vehicleKmRecords
} from '../schema';
import { eq, and, sql, lt, desc } from 'drizzle-orm';
import { AuditLog, SecurityDeposit, SecurityDepositMovement, Vehicle, KmRecord } from '../../types/entities';

// Basic wrapper around Drizzle ORM to satisfy IBaseRepository requirements
export class PostgresBaseRepository<T extends { id: string; companyId?: string }> {
  protected tableName: any;
  protected tx: any;
  protected companyId: string;

  constructor(tableName: any, tx: any, companyId: string) {
    if (!companyId?.trim()) throw new Error('Tenant scope required');
    this.tableName = tableName;
    this.tx = tx || db;
    this.companyId = companyId;
  }

  withTransaction(tx: any) {
    return new (this.constructor as any)(tx, this.companyId);
  }

  private byTenantAndId(id: string) {
    return and(eq(this.tableName.companyId, this.companyId), eq(this.tableName.id, id));
  }

  private assertTenant(item: Partial<T>): void {
    if (item.companyId !== undefined && item.companyId !== this.companyId) {
      throw new Error('Cross-tenant repository operation blocked');
    }
  }

  async findById(id: string): Promise<T | null> {
    const results = await this.tx.select().from(this.tableName).where(this.byTenantAndId(id)).limit(1);
    return (results[0] as T) || null;
  }

  async findAll(_filters?: any): Promise<T[]> {
    return await this.tx.select().from(this.tableName).where(eq(this.tableName.companyId, this.companyId));
  }

  async create(item: T): Promise<T> {
    this.assertTenant(item);
    const scopedItem = { ...item, companyId: this.companyId };
    await this.tx.insert(this.tableName).values(scopedItem);
    return scopedItem as T;
  }

  async update(id: string, item: Partial<T>): Promise<T> {
    this.assertTenant(item);
    const { companyId: _ignoredCompanyId, ...safeItem } = item as any;
    const result = await this.tx.update(this.tableName)
      .set(safeItem)
      .where(this.byTenantAndId(id))
      .returning();
    return result[0] as T;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.tx.delete(this.tableName).where(this.byTenantAndId(id)).returning();
    return result.length > 0;
  }

  async count(_filters?: any): Promise<number> {
    const rows = await this.tx.select({ count: sql<number>`count(*)` })
      .from(this.tableName)
      .where(eq(this.tableName.companyId, this.companyId));
    return Number(rows[0]?.count || 0);
  }

  async save(item: T): Promise<void> {
    this.assertTenant(item);
    const scopedItem = { ...item, companyId: this.companyId } as T;
    const existing = await this.findById(item.id);
    if (existing) {
      await this.update(item.id, scopedItem);
      return;
    }
    await this.create(scopedItem);
  }
}
export class PostgresVehicleRepository {
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

  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<Vehicle | null> {
    const rows = await this.tx.select().from(vehicles)
      .where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, id)))
      .for('update')
      .limit(1);
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

export class PostgresKmRecordRepository {
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

export class PostgresUserRepository extends PostgresBaseRepository<any> {
  constructor(tx: any, companyId: string) { super(users, tx, companyId); }
}

export class PostgresAccountReceivableRepository extends PostgresBaseRepository<any> {
  constructor(tx: any, companyId: string) { super(accountReceivables, tx, companyId); }

  async findByIdempotencyKey(key: string): Promise<any | null> {
    const results = await this.tx.select().from(this.tableName).where(eq(this.tableName.idempotencyKey, key));
    return results[0] || null;
  }
  async findByContractId(contractId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.contractId, contractId)); }
  async findByDriverId(driverId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.driverId, driverId)); /* Adjust if actual driverId col exists */ }
  async findByVehicleId(vehicleId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.vehicleId, vehicleId)); /* Adjust if actual driverId col */ }
  async findOverdue(companyId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(and(eq(this.tableName.companyId, companyId), eq(this.tableName.status, 'PENDING'), lt(this.tableName.dueDate, new Date().toISOString()))); }
}

export class PostgresAccountPayableRepository extends PostgresBaseRepository<any> {
  constructor(tx: any, companyId: string) { super(accountPayables, tx, companyId); }

  async findByIdempotencyKey(key: string): Promise<any | null> {
    const results = await this.tx.select().from(this.tableName).where(eq(this.tableName.idempotencyKey, key));
    return results[0] || null;
  }
  async findByVehicleId(vehicleId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.vehicleId, vehicleId)); /* Adjust if actual vehicleId col */ }
  async findBySupplierId(supplierId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.supplierId, supplierId)); /* Assuming originId */ }
  async findOverdue(companyId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(and(eq(this.tableName.companyId, companyId), eq(this.tableName.status, 'PENDING'), lt(this.tableName.dueDate, new Date().toISOString()))); }
}

export class PostgresFinancialTransactionRepository extends PostgresBaseRepository<any> {
  constructor(tx: any, companyId: string) { super(financialTransactions, tx, companyId); }
  async findByReceivableId(receivableId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.receivableId, receivableId)); }
  async findByPayableId(payableId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.payableId, payableId)); }
  async findByVehicleId(vehicleId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.vehicleId, vehicleId)); /* Adjust if actual vehicleId col */ }
}

export class PostgresFinancialAccountRepository extends PostgresBaseRepository<any> {
  constructor(tx: any, companyId: string) { super(financialAccounts, tx, companyId); }

  async findByIdWithLock(id: string): Promise<any | undefined> {
    const res = await this.tx.execute(
      sql`SELECT * FROM financial_accounts WHERE id = ${id} FOR UPDATE`
    );
    return res.rows[0];
  }

  async lockTwoAccounts(id1: string, id2: string): Promise<any[]> {
    const [firstId, secondId] = id1 < id2 ? [id1, id2] : [id2, id1];
    const res1 = await this.tx.execute(
      sql`SELECT * FROM financial_accounts WHERE id = ${firstId} FOR UPDATE`
    );
    const res2 = await this.tx.execute(
      sql`SELECT * FROM financial_accounts WHERE id = ${secondId} FOR UPDATE`
    );
    return id1 < id2 ? [res1.rows[0], res2.rows[0]] : [res2.rows[0], res1.rows[0]];
  }

  async updateBalance(accountId: string, delta: number): Promise<any> {
    const res = await this.tx.execute(
      sql`UPDATE financial_accounts SET current_balance = current_balance + ${delta}, updated_at = NOW() WHERE id = ${accountId} RETURNING *`
    );
    if (!res.rows[0]) throw new Error('Account not found or update failed');
    return res.rows[0];
  }
}

export class PostgresPaymentMethodRepository extends PostgresBaseRepository<any> {
  constructor(tx: any, companyId: string) { super(paymentMethods, tx, companyId); }
}

export class PostgresAuditLogRepository extends PostgresBaseRepository<AuditLog> {
  constructor(tx: any, companyId: string) { super(auditLogs, tx, companyId); }

  async create(item: AuditLog): Promise<AuditLog> {
    const changes = JSON.stringify({
      previousState: item.previousState ?? null,
      newState: item.newState ?? null,
      userName: item.userName,
    });

    await this.tx.insert(auditLogs).values({
      id: item.id,
      companyId: item.companyId,
      userId: item.userId,
      action: String(item.action),
      entityType: item.entityName,
      entityId: item.entityId,
      changes,
      timestamp: item.timestamp,
      ipAddress: item.ipAddress,
    });

    return item;
  }
}

export class PostgresContractRepository extends PostgresBaseRepository<any> {
  constructor(tx: any, companyId: string) { super(contracts, tx, companyId); }
}

export class PostgresFinancialPeriodRepository extends PostgresBaseRepository<any> {
  constructor(tx: any, companyId: string) { super(financialPeriods, tx, companyId); }
}


export class PostgresSecurityDepositRepository {
  private tx: any;
  constructor(tx?: any) { this.tx = tx || db; }

  private map(row: any): SecurityDeposit {
    return {
      id: row.id,
      companyId: row.companyId,
      contractId: row.contractId,
      driverId: row.driverId,
      vehicleId: row.vehicleId || '',
      originalAmount: Number(row.originalAmount ?? row.amount ?? 0),
      receivedAmount: Number(row.receivedAmount ?? 0),
      usedAmount: Number(row.usedAmount ?? 0),
      returnedAmount: Number(row.returnedAmount ?? 0),
      status: row.status,
      receivedAt: row.receivedAt || undefined,
      returnedAt: row.returnedAt || undefined,
      notes: row.notes || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || row.createdAt,
    } as SecurityDeposit;
  }

  async lockContract(companyId: string, contractId: string): Promise<void> {
    const key = `${companyId}:${contractId}`;
    await this.tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`);
  }

  async findById(id: string): Promise<SecurityDeposit | null> {
    const rows = await this.tx.select().from(securityDeposits).where(eq(securityDeposits.id, id)).limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findByContractId(contractId: string): Promise<SecurityDeposit | null> {
    const rows = await this.tx.select().from(securityDeposits).where(eq(securityDeposits.contractId, contractId)).limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async create(item: SecurityDeposit): Promise<SecurityDeposit> {
    const rows = await this.tx.insert(securityDeposits).values({
      id: item.id,
      companyId: item.companyId,
      contractId: item.contractId,
      driverId: item.driverId,
      vehicleId: item.vehicleId || null,
      amount: item.originalAmount,
      originalAmount: item.originalAmount,
      receivedAmount: item.receivedAmount,
      usedAmount: item.usedAmount,
      returnedAmount: item.returnedAmount,
      status: item.status,
      receivedAt: item.receivedAt || null,
      returnedAt: item.returnedAt || null,
      notes: item.notes || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }).returning();
    return this.map(rows[0]);
  }

  async update(id: string, item: Partial<SecurityDeposit>): Promise<SecurityDeposit> {
    const values: any = {};
    if (item.contractId !== undefined) values.contractId = item.contractId;
    if (item.driverId !== undefined) values.driverId = item.driverId;
    if (item.vehicleId !== undefined) values.vehicleId = item.vehicleId || null;
    if (item.originalAmount !== undefined) {
      values.originalAmount = item.originalAmount;
      values.amount = item.originalAmount;
    }
    if (item.receivedAmount !== undefined) values.receivedAmount = item.receivedAmount;
    if (item.usedAmount !== undefined) values.usedAmount = item.usedAmount;
    if (item.returnedAmount !== undefined) values.returnedAmount = item.returnedAmount;
    if (item.status !== undefined) values.status = item.status;
    if (item.receivedAt !== undefined) values.receivedAt = item.receivedAt || null;
    if (item.returnedAt !== undefined) values.returnedAt = item.returnedAt || null;
    if (item.notes !== undefined) values.notes = item.notes || null;
    if (item.updatedAt !== undefined) values.updatedAt = item.updatedAt;
    const rows = await this.tx.update(securityDeposits).set(values).where(eq(securityDeposits.id, id)).returning();
    if (!rows[0]) throw new Error('Caução não encontrada');
    return this.map(rows[0]);
  }
}

export class PostgresSecurityDepositMovementRepository {
  private tx: any;
  constructor(tx?: any) { this.tx = tx || db; }

  private map(row: any): SecurityDepositMovement {
    return {
      id: row.id,
      securityDepositId: row.depositId,
      companyId: row.companyId,
      type: row.type,
      amount: Number(row.amount || 0),
      date: row.date,
      financialTransactionId: row.financialTransactionId || undefined,
      receivableId: row.receivableId || undefined,
      description: row.description || '',
      createdById: row.createdById || '',
      createdAt: row.createdAt,
    } as SecurityDepositMovement;
  }

  async findByFinancialTransactionId(financialTransactionId: string): Promise<SecurityDepositMovement | null> {
    const rows = await this.tx.select().from(securityDepositMovements)
      .where(eq(securityDepositMovements.financialTransactionId, financialTransactionId))
      .limit(1);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async create(item: SecurityDepositMovement): Promise<SecurityDepositMovement> {
    const rows = await this.tx.insert(securityDepositMovements).values({
      id: item.id,
      companyId: item.companyId,
      depositId: item.securityDepositId,
      type: item.type,
      amount: item.amount,
      date: item.date,
      financialTransactionId: item.financialTransactionId || null,
      receivableId: item.receivableId || null,
      description: item.description || null,
      createdById: item.createdById,
      createdAt: item.createdAt,
    }).returning();
    return this.map(rows[0]);
  }
}

export class PostgresDriverHealthProfileRepository extends PostgresBaseRepository<any> {
  constructor(tx: any, companyId: string) { super(driverHealthProfiles, tx, companyId); }

  async findByDriverId(driverId: string): Promise<any | null> {
    const rows = await this.tx.select().from(driverHealthProfiles).where(eq(driverHealthProfiles.driverId, driverId)).limit(1);
    return rows[0] || null;
  }

  async upsert(item: any): Promise<any> {
    const rows = await this.tx.insert(driverHealthProfiles).values(item).onConflictDoUpdate({
      target: [driverHealthProfiles.companyId, driverHealthProfiles.driverId],
      set: {
        bloodType: item.bloodType ?? null, allergies: item.allergies ?? null,
        relevantConditions: item.relevantConditions ?? null, continuousMedications: item.continuousMedications ?? null,
        emergencyContactName: item.emergencyContactName ?? null, emergencyContactRelationship: item.emergencyContactRelationship ?? null,
        emergencyContactPhone: item.emergencyContactPhone ?? null, emergencyNotes: item.emergencyNotes ?? null,
        lastUpdateDate: item.lastUpdateDate ?? null, responsibleUser: item.responsibleUser ?? null, updatedAt: item.updatedAt,
      },
    }).returning();
    return rows[0];
  }
}
