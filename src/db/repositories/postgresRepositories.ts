import { db } from '../index';
import { 
  users, companies, accountReceivables, accountPayables, 
  financialTransactions, financialAccounts, auditLogs, contracts 
} from '../schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import {
  IUserRepository,
  IAccountReceivableRepository,
  IAccountPayableRepository,
  IFinancialTransactionRepository,
  IFinancialAccountRepository,
  IAuditLogRepository,
  IContractRepository
} from '../../persistence/repositories/interfaces';
import {
  User,
  AccountReceivable,
  AccountPayable,
  FinancialTransaction,
  FinancialAccount,
  AuditLog,
  Contract
} from '../../types/entities';

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
    if (filters && Object.keys(filters).length > 0) {
      if (filters.companyId) {
        return await this.tx.select().from(this.tableName).where(eq(this.tableName.companyId, filters.companyId));
      }
      throw new Error("findAll filters not fully implemented in PostgresBaseRepository except companyId");
    }
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

export class PostgresUserRepository extends PostgresBaseRepository<User> implements IUserRepository {
  constructor(tx?: any) { super(users, tx); }

  async findByEmail(email: string): Promise<User | null> {
    const results = await this.tx.select().from(this.tableName).where(eq(this.tableName.email, email));
    return results[0] || null;
  }
}

export class PostgresAccountReceivableRepository extends PostgresBaseRepository<AccountReceivable> implements IAccountReceivableRepository {
  constructor(tx?: any) { super(accountReceivables, tx); }

  async findByIdempotencyKey(key: string): Promise<AccountReceivable | null> {
    const results = await this.tx.select().from(this.tableName).where(eq(this.tableName.idempotencyKey, key));
    return results[0] || null;
  }
  async findByContractId(contractId: string): Promise<AccountReceivable[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.contractId, contractId)); }
  async findByDriverId(driverId: string): Promise<AccountReceivable[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.driverId, driverId)); }
  async findByVehicleId(vehicleId: string): Promise<AccountReceivable[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.vehicleId, vehicleId)); }
  async findOverdue(companyId: string): Promise<AccountReceivable[]> { return await this.tx.select().from(this.tableName).where(and(eq(this.tableName.companyId, companyId), eq(this.tableName.status, 'PENDING'), lt(this.tableName.dueDate, new Date().toISOString()))); }
}

export class PostgresAccountPayableRepository extends PostgresBaseRepository<AccountPayable> implements IAccountPayableRepository {
  constructor(tx?: any) { super(accountPayables, tx); }

  async findByIdempotencyKey(key: string): Promise<AccountPayable | null> {
    const results = await this.tx.select().from(this.tableName).where(eq(this.tableName.idempotencyKey, key));
    return results[0] || null;
  }
  async findByVehicleId(vehicleId: string): Promise<AccountPayable[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.vehicleId, vehicleId)); }
  async findBySupplierId(supplierId: string): Promise<AccountPayable[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.supplierId, supplierId)); }
  async findOverdue(companyId: string): Promise<AccountPayable[]> { return await this.tx.select().from(this.tableName).where(and(eq(this.tableName.companyId, companyId), eq(this.tableName.status, 'PENDING'), lt(this.tableName.dueDate, new Date().toISOString()))); }
}

export class PostgresFinancialTransactionRepository extends PostgresBaseRepository<FinancialTransaction> implements IFinancialTransactionRepository {
  constructor(tx?: any) { super(financialTransactions, tx); }
  async findByReceivableId(receivableId: string): Promise<FinancialTransaction[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.receivableId, receivableId)); }
  async findByPayableId(payableId: string): Promise<FinancialTransaction[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.payableId, payableId)); }
  async findByVehicleId(vehicleId: string): Promise<FinancialTransaction[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.vehicleId, vehicleId)); }
}

export class PostgresFinancialAccountRepository extends PostgresBaseRepository<FinancialAccount> implements IFinancialAccountRepository {
  constructor(tx?: any) { super(financialAccounts, tx); }
  
  async findByIdWithLock(id: string): Promise<FinancialAccount | undefined> {
    const res = await this.tx.execute(
      sql`SELECT * FROM financial_accounts WHERE id = ${id} FOR UPDATE`
    );
    return res.rows[0];
  }
  
  async lockTwoAccounts(id1: string, id2: string): Promise<FinancialAccount[]> {
    const [firstId, secondId] = id1 < id2 ? [id1, id2] : [id2, id1];
    const res1 = await this.tx.execute(
      sql`SELECT * FROM financial_accounts WHERE id = ${firstId} FOR UPDATE`
    );
    const res2 = await this.tx.execute(
      sql`SELECT * FROM financial_accounts WHERE id = ${secondId} FOR UPDATE`
    );
    return id1 < id2 ? [res1.rows[0], res2.rows[0]] : [res2.rows[0], res1.rows[0]];
  }

  async updateBalance(accountId: string, delta: number): Promise<FinancialAccount> {
    const results = await this.tx.execute(sql`
      UPDATE financial_accounts
      SET current_balance = current_balance + ${delta}
      WHERE id = ${accountId}
      RETURNING *
    `);
    if (results.rows.length === 0) throw new Error('Account not found');
    return results.rows[0];
  }
}

export class PostgresAuditLogRepository extends PostgresBaseRepository<AuditLog> implements IAuditLogRepository {
  constructor(tx?: any) { super(auditLogs, tx); }

  private mapFromDb(row: any): AuditLog {
    let parsedChanges: any = {};
    try {
      if (row.changes) parsedChanges = JSON.parse(row.changes);
    } catch {}

    return {
      id: row.id,
      companyId: row.companyId,
      entityName: row.entityType || 'General',
      entityId: row.entityId,
      action: row.action,
      previousState: parsedChanges.previous ? JSON.stringify(parsedChanges.previous) : undefined,
      newState: parsedChanges.current ? JSON.stringify(parsedChanges.current) : (row.changes || undefined),
      userId: row.userId,
      userName: row.userName || row.userId,
      ipAddress: row.ipAddress,
      timestamp: row.timestamp || new Date().toISOString(),
    };
  }

  private mapToDb(item: any): any {
    const changesObj: any = {};
    if (item.previousState) {
      try { changesObj.previous = JSON.parse(item.previousState); } catch { changesObj.previous = item.previousState; }
    }
    if (item.newState) {
      try { changesObj.current = JSON.parse(item.newState); } catch { changesObj.current = item.newState; }
    }
    if (item.changes) {
      try { Object.assign(changesObj, typeof item.changes === 'string' ? JSON.parse(item.changes) : item.changes); } catch {}
    }

    return {
      id: item.id,
      companyId: item.companyId,
      userId: item.userId || 'system',
      action: item.action,
      entityType: item.entityName || item.entityType || 'General',
      entityId: item.entityId || 'none',
      changes: Object.keys(changesObj).length > 0 ? JSON.stringify(changesObj) : (typeof item.changes === 'string' ? item.changes : null),
      timestamp: item.timestamp || new Date().toISOString(),
      correlationId: item.correlationId || null,
      ipAddress: item.ipAddress || null,
    };
  }

  async findById(id: string): Promise<AuditLog | null> {
    const results = await this.tx.select().from(this.tableName).where(eq(this.tableName.id, id));
    return results[0] ? this.mapFromDb(results[0]) : null;
  }

  async create(item: AuditLog): Promise<AuditLog> {
    const dbRecord = this.mapToDb(item);
    await this.tx.insert(this.tableName).values(dbRecord);
    return item;
  }

  async findAll(filters?: any): Promise<AuditLog[]> {
    const rows = await super.findAll(filters);
    return rows.map((r: any) => this.mapFromDb(r));
  }
}


export class PostgresContractRepository extends PostgresBaseRepository<Contract> implements IContractRepository {
  constructor(tx?: any) { super(contracts, tx); }

  async findActiveByVehicleId(vehicleId: string): Promise<Contract | null> {
    const results = await this.tx.select().from(this.tableName).where(and(eq(this.tableName.vehicleId, vehicleId), eq(this.tableName.status, 'ACTIVE')));
    return results[0] || null;
  }

  async findActiveByDriverId(driverId: string): Promise<Contract | null> {
    const results = await this.tx.select().from(this.tableName).where(and(eq(this.tableName.driverId, driverId), eq(this.tableName.status, 'ACTIVE')));
    return results[0] || null;
  }
}
