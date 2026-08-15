import { db } from '../index';
import { 
  users, companies, accountReceivables, accountPayables, 
  financialTransactions, financialAccounts, auditLogs, contracts, financialPeriods
} from '../schema';
import { eq, and, sql, lt } from 'drizzle-orm';

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
  async findByVehicleId(vehicleId: string): Promise<any[]> { return await this.tx.select().from(this.tableName).where(eq(this.tableName.vehicleId, vehicleId)); /* Adjust if actual vehicleId col */ }
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

export class PostgresAuditLogRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(auditLogs, tx); }
}

export class PostgresContractRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(contracts, tx); }
}

export class PostgresFinancialPeriodRepository extends PostgresBaseRepository<any> {
  constructor(tx?: any) { super(financialPeriods, tx); }
}
