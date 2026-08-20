import { ITransactionContext, TrustedSystemActor } from '../domain/finance/ITransactionContext';
import {
  PostgresAccountReceivableRepository,
  PostgresAccountPayableRepository,
  PostgresFinancialTransactionRepository,
  PostgresFinancialAccountRepository,
  PostgresPaymentMethodRepository,
  PostgresAuditLogRepository,
  PostgresUserRepository,
  PostgresFinancialPeriodRepository,
  PostgresSecurityDepositRepository,
  PostgresSecurityDepositMovementRepository,
  PostgresDriverHealthProfileRepository,
  PostgresVehicleRepository,
  PostgresKmRecordRepository,
} from './repositories/postgresRepositories';
import { PostgresDriverRepository } from './repositories/postgresDriverRepository';
import { PostgresContractRepository } from './repositories/postgresContractRepository';
import { PostgresContractTemplateRepository } from './repositories/postgresContractTemplateRepository';
import { PostgresContractArtifactRepository } from './repositories/postgresContractArtifactRepository';
import { PostgresAttachmentRepository } from './repositories/postgresAttachmentRepository';
import { PostgresDocumentRepository } from './repositories/postgresDocumentRepository';
import { PostgresPartRepository, PostgresSupplierRepository, PostgresWorkOrderRepository } from './repositories/postgresMaintenanceRepository';
import { PostgresTrackerRepository } from './repositories/postgresTrackerRepository';
import { db } from './index';
import { sql } from 'drizzle-orm';

export interface UnitOfWorkOptions {
  financialPeriodLock?: 'SHARED' | 'EXCLUSIVE';
  trustedSystemActor?: TrustedSystemActor;
}

export class UnitOfWork {
  static async run<T>(companyId:string,callback:(tx:any|ITransactionContext)=>Promise<T>,options?:UnitOfWorkOptions):Promise<T>{
    return await db.transaction(async(tx)=>{
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${companyId}, true)`);
      if(options?.financialPeriodLock){
        if(options.financialPeriodLock==='SHARED')await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(abs(hashtext(${companyId})))`);
        else await tx.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${companyId})))`);
      }
      // Authority waves may expose transaction-scoped repositories without widening
      // the stable finance interface for every operational module.
      const txContext:any={
        getDriverRepo:()=>new PostgresDriverRepository(tx),
        getVehicleRepo:()=>new PostgresVehicleRepository(tx),
        getKmRecordRepo:()=>new PostgresKmRecordRepository(tx),
        getReceivableRepo:()=>new PostgresAccountReceivableRepository(tx),
        getPayableRepo:()=>new PostgresAccountPayableRepository(tx),
        getTransactionRepo:()=>new PostgresFinancialTransactionRepository(tx),
        getAccountRepo:()=>new PostgresFinancialAccountRepository(tx),
        getPaymentMethodRepo:()=>new PostgresPaymentMethodRepository(tx),
        getAuditLogRepo:()=>new PostgresAuditLogRepository(tx),
        getAttachmentRepo:()=>new PostgresAttachmentRepository(tx),
        getDocumentRepo:()=>new PostgresDocumentRepository(tx),
        getUserRepo:()=>new PostgresUserRepository(tx),
        getFinancialPeriodRepo:()=>new PostgresFinancialPeriodRepository(tx),
        getContractRepo:()=>new PostgresContractRepository(tx),
        getContractTemplateRepo:()=>new PostgresContractTemplateRepository(tx),
        getContractArtifactRepo:()=>new PostgresContractArtifactRepository(tx),
        getSecurityDepositRepo:()=>new PostgresSecurityDepositRepository(tx),
        getSecurityDepositMovementRepo:()=>new PostgresSecurityDepositMovementRepository(tx),
        getDriverHealthRepo:()=>new PostgresDriverHealthProfileRepository(tx),
        getWorkOrderRepo:()=>new PostgresWorkOrderRepository(tx),
        getSupplierRepo:()=>new PostgresSupplierRepository(tx),
        getPartRepo:()=>new PostgresPartRepository(tx),
        getTrackerRepo:()=>new PostgresTrackerRepository(tx),
        getRawTransaction:()=>tx,
        trustedSystemActor:options?.trustedSystemActor,
      };
      return await callback(txContext);
    });
  }
}
