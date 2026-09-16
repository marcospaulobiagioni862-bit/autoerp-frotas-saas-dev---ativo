import { ITransactionContext } from '../domain/finance/ITransactionContext';
import {
  PostgresAccountReceivableRepository,
  PostgresAccountPayableRepository,
  PostgresFinancialTransactionRepository,
  PostgresFinancialAccountRepository,
  PostgresAuditLogRepository,
  PostgresUserRepository
} from './repositories/postgresRepositories';
import { PostgresFinancialPeriodRepository } from './repositories/PostgresFinancialPeriodRepository';
import { db } from './index';
import { sql } from 'drizzle-orm';

export interface UOWOptions {
  lockMode?: 'shared' | 'exclusive' | 'none';
}

export class UnitOfWork {
  static async run<T>(
    companyId: string,
    callback: (tx: ITransactionContext) => Promise<T>,
    options: UOWOptions = { lockMode: 'shared' }
  ): Promise<T> {
    return await db.transaction(async (tx) => {
      // Set RLS for this transaction scope securely parameterized
      await tx.execute(
        sql`SELECT set_config('app.current_tenant', ${companyId}, true)`
      );

      // Advisory lock to serialize period closure against mutations
      if (options.lockMode === 'exclusive') {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`
        );
      } else if (options.lockMode === 'shared') {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock_shared(hashtext(${companyId}))`
        );
      }
      
      const txContext: ITransactionContext = {
        getUserRepo: () => new PostgresUserRepository(tx),
        getFinancialPeriodRepo: () => new PostgresFinancialPeriodRepository(tx),
        getReceivableRepo: () => new PostgresAccountReceivableRepository(tx),
        getPayableRepo: () => new PostgresAccountPayableRepository(tx),
        getTransactionRepo: () => new PostgresFinancialTransactionRepository(tx),
        getAccountRepo: () => new PostgresFinancialAccountRepository(tx),
        getAuditLogRepo: () => new PostgresAuditLogRepository(tx)
      };
      (txContext as any).tx = tx;
      
      return await callback(txContext);
    });
  }
}
