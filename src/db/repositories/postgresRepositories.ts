import { db } from '../index';
import {
  users, companies, accountReceivables, accountPayables,
  financialTransactions, financialAccounts, paymentMethods, auditLogs, contracts, financialPeriods,
  securityDeposits, securityDepositMovements, driverHealthProfiles
} from '../schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import { AuditLog, SecurityDeposit, SecurityDepositMovement } from '../../types/entities';

// Basic wrapper around Drizzle ORM to satisfy IBaseRepository requirements
export class PostgresBaseRepository<T extends { id: string; companyId?: string }> {
  protected tableName: any;
  protected tx: any;

  constructor(tableName: any, tx?: any) {
    this.tableName = tableName;
    this.tx = tx || db;
  }

  withTransaction(tx: any) {
    return new (this.constructor as any)(this.tableName, tx);
  }

  async findById(id: string): Promise<T | null> {
    const results = await this.tx.select().from(this.tableName).where(eq(this.tableName.id, id));
    return (results[0] as T) || null;
  }

  async findAll(filters?: any): Promise<T[]> {
    return await this.tx.select().from(this.tableName);
  }

  async create(item: T): Promise<T> {
    await this.tx.insert(this.tableName).values(item);
    return item;
  }

  async update(id: string, item: Partial<T>): Promise<T> {
    const result = await this.tx.update(this.tableName)
      .set(item)
      .where(eq(this.tableName.id, id))
      .returning();
    return result[0] as T;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.tx.delete(this.tableName).where(eq(this.tableName.id, id)).returning();
    return result.length > 0;
  }

  async count(filters?: any): Promise<number> {
    const res = await this.tx.execute(sql`SELECT COUNT(*) FROM ${this.tableName}`);
    return parseInt(res.rows[0].count, 10);
  }

  async save(item: T): Promise<void> {
    await this.tx.insert(this.tableName).values(item).onConflictDoUpdate({
      target: this.tableName.id,
      set: item
    });
  }
}

export class PostgresUserRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(users, tx); }
}

export class PostgresAccountReceivableRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(accountReceivables, tx); }

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
  constructor(tx?: any) { super(accountPayables, tx); }

  async findByIdempotencyKey(key: string): Promise<any | null> {
    const results = await this.tx.select().from(this.tableName).where(eq(this.tableName.idempotencyKey, key));
    return results[0] || null;
  }
  async findByVehicleId(vehicleId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.vehicleId, vehicleId)); /* Adjust if actual vehicleId col */ }
  async findBySupplierId(supplierId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.supplierId, supplierId)); /* Assuming originId */ }
  async findOverdue(companyId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(and(eq(this.tableName.companyId, companyId), eq(this.tableName.status, 'PENDING'), lt(this.tableName.dueDate, new Date().toISOString()))); }
}

export class PostgresFinancialTransactionRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(financialTransactions, tx); }
  async findByReceivableId(receivableId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.receivableId, receivableId)); }
  async findByPayableId(payableId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.payableId, payableId)); }
  async findByVehicleId(vehicleId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.vehicleId, vehicleId)); /* Adjust if actual vehicleId col */ }
}

export class PostgresFinancialAccountRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(financialAccounts, tx); }

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
  constructor(tx?: any) { super(paymentMethods, tx); }
}

export class PostgresAuditLogRepository extends PostgresBaseRepository<AuditLog> {
  constructor(tx?: any) { super(auditLogs, tx); }

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
  constructor(tx?: any) { super(contracts, tx); }
}

export class PostgresFinancialPeriodRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(financialPeriods, tx); }
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
  constructor(tx?: any) { super(driverHealthProfiles, tx); }

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
