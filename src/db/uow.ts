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
import { PostgresMaintenancePlanRepository, PostgresOilChangeRepository, PostgresTireRepository } from './repositories/postgresMaintenancePreventiveRepository';
import { PostgresTrackerRepository } from './repositories/postgresTrackerRepository';
import { PostgresInsuranceRepository } from './repositories/postgresInsuranceRepository';
import { PostgresTrafficTicketRepository } from './repositories/postgresTrafficTicketRepository';
import { db } from './index';
import {
  accountPayables,
  accountReceivables,
  financialAccounts,
  financialTransactions,
} from './schema';
import { and, eq, sql } from 'drizzle-orm';

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
        getMaintenancePlanRepo:()=>new PostgresMaintenancePlanRepository(tx),
        getOilChangeRepo:()=>new PostgresOilChangeRepository(tx),
        getTireRepo:()=>new PostgresTireRepository(tx),
        getTrackerRepo:()=>new PostgresTrackerRepository(tx),
        getInsuranceRepo:()=>new PostgresInsuranceRepository(tx),
        getTrafficTicketRepo:()=>new PostgresTrafficTicketRepository(tx),
        findReceivableByIdWithLock:async(id:string)=>{
          const rows=await tx.select().from(accountReceivables)
            .where(and(eq(accountReceivables.companyId,companyId),eq(accountReceivables.id,id)))
            .for('update').limit(1);
          return rows[0]||null;
        },
        findPayableByIdWithLock:async(id:string)=>{
          const rows=await tx.select().from(accountPayables)
            .where(and(eq(accountPayables.companyId,companyId),eq(accountPayables.id,id)))
            .for('update').limit(1);
          return rows[0]||null;
        },
        findFinancialAccountByIdWithLock:async(id:string)=>{
          const rows=await tx.select().from(financialAccounts)
            .where(and(eq(financialAccounts.companyId,companyId),eq(financialAccounts.id,id)))
            .for('update').limit(1);
          return rows[0]||null;
        },
        findFinancialTransactionByIdWithLock:async(id:string)=>{
          const rows=await tx.select().from(financialTransactions)
            .where(and(eq(financialTransactions.companyId,companyId),eq(financialTransactions.id,id)))
            .for('update').limit(1);
          return rows[0]||null;
        },
        findFinancialTransactionByIdempotencyKey:async(key:string)=>{
          const rows=await tx.select().from(financialTransactions)
            .where(and(eq(financialTransactions.companyId,companyId),eq(financialTransactions.idempotencyKey,key)))
            .limit(1);
          return rows[0]||null;
        },
        findCreditCardStatementPaymentForUpdate:async(financialTransactionId:string)=>{
          const result:any=await tx.execute(sql`
            SELECT p.id AS payment_id,p.statement_id,p.amount,
                   s.paid_amount,s.balance_amount,s.status,s.updated_by_id
            FROM credit_card_statement_payments p
            JOIN credit_card_statements s ON s.id=p.statement_id AND s.company_id=p.company_id
            WHERE p.company_id=${companyId} AND p.financial_transaction_id=${financialTransactionId}
            FOR UPDATE OF p,s
          `);
          return result.rows?.[0]||null;
        },
        applyCreditCardStatementPaymentReversal:async(statementId:string,amount:number,userId:string)=>{
          const result:any=await tx.execute(sql`
            UPDATE credit_card_statements
            SET paid_amount=GREATEST(0,paid_amount-${String(amount)}),
                balance_amount=balance_amount+${String(amount)},
                status=CASE WHEN GREATEST(0,paid_amount-${String(amount)})=0
                            THEN 'CLOSED' ELSE 'PARTIALLY_PAID' END,
                updated_by_id=${userId},updated_at=NOW(),version=version+1
            WHERE company_id=${companyId} AND id=${statementId}
            RETURNING *
          `);
          return result.rows?.[0]||null;
        },
        getRawTransaction:()=>tx,
        trustedSystemActor:options?.trustedSystemActor,
      };
      return await callback(txContext);
    });
  }
}
