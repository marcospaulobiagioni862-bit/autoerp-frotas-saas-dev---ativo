import { ITransactionContext } from '../domain/finance/ITransactionContext';
import {
  PostgresAccountReceivableRepository,
  PostgresAccountPayableRepository,
  PostgresFinancialTransactionRepository,
  PostgresFinancialAccountRepository,
  PostgresPaymentMethodRepository,
  PostgresAuditLogRepository,
  PostgresUserRepository,
  PostgresFinancialPeriodRepository,
  PostgresContractRepository,
  PostgresSecurityDepositRepository,
  PostgresSecurityDepositMovementRepository,
  PostgresDriverHealthProfileRepository,
  PostgresVehicleRepository,
  PostgresKmRecordRepository,
} from './repositories/postgresRepositories';
import { PostgresDriverRepository } from './repositories/postgresDriverRepository';
import { db } from './index';
import { sql } from 'drizzle-orm';

export class UnitOfWork {
  static async run<T>(
    companyId: string,
    callback: (tx: any | ITransactionContext) => Promise<T>,
    options?: { financialPeriodLock?: 'SHARED' | 'EXCLUSIVE' }
  ): Promise<T> {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_tenant', ${companyId}, true)`
      );

      if (options?.financialPeriodLock) {
        if (options.financialPeriodLock === 'SHARED') {
          await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(abs(hashtext(${companyId})))`);
        } else if (options.financialPeriodLock === 'EXCLUSIVE') {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${companyId})))`);
        }
      }

      const txContext: ITransactionContext = {
        getDriverRepo: () => new PostgresDriverRepository(tx),
        getVehicleRepo: () => new PostgresVehicleRepository(tx),
        getKmRecordRepo: () => new PostgresKmRecordRepository(tx),
        getReceivableRepo: () => new PostgresAccountReceivableRepository(tx),
        getPayableRepo: () => new PostgresAccountPayableRepository(tx),
        getTransactionRepo: () => new PostgresFinancialTransactionRepository(tx),
        getAccountRepo: () => new PostgresFinancialAccountRepository(tx),
        getPaymentMethodRepo: () => new PostgresPaymentMethodRepository(tx),
        getAuditLogRepo: () => new PostgresAuditLogRepository(tx),
        getUserRepo: () => new PostgresUserRepository(tx),
        getFinancialPeriodRepo: () => new PostgresFinancialPeriodRepository(tx),
        getContractRepo: () => new PostgresContractRepository(tx),
        getSecurityDepositRepo: () => new PostgresSecurityDepositRepository(tx),
        getSecurityDepositMovementRepo: () => new PostgresSecurityDepositMovementRepository(tx),
        getDriverHealthRepo: () => new PostgresDriverHealthProfileRepository(tx),
      };

      return await callback(txContext);
    });
  }
}
