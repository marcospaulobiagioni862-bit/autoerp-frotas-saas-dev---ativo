import { AsyncLocalStorage } from 'node:async_hooks';
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
  financialCategories,
} from './schema';
import { and, eq, lt, sql } from 'drizzle-orm';

export interface UnitOfWorkOptions {
  financialPeriodLock?: 'SHARED' | 'EXCLUSIVE';
  trustedSystemActor?: TrustedSystemActor;
  allowNestedReuse?: boolean;
}

type ActiveUnitOfWork={companyId:string;txContext:any};
const activeUnitOfWork=new AsyncLocalStorage<ActiveUnitOfWork>();

async function applyFinancialPeriodLock(tx:any,companyId:string,mode:'SHARED'|'EXCLUSIVE'|undefined):Promise<void>{
  if(!mode)return;
  if(mode==='SHARED')await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(abs(hashtext(${companyId})))`);
  else await tx.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${companyId})))`);
}

export class UnitOfWork {
  static async run<T>(companyId:string,callback:(tx:any|ITransactionContext)=>Promise<T>,options?:UnitOfWorkOptions):Promise<T>{
    const active=activeUnitOfWork.getStore();
    if(active&&active.companyId===companyId){
      const raw=active.txContext.getRawTransaction?.();
      if(!raw)throw new Error('Nested unit of work transaction unavailable');
      await applyFinancialPeriodLock(raw,companyId,options?.financialPeriodLock);
      return await callback(active.txContext);
    }
    return await db.transaction(async(tx)=>{
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${companyId}, true)`);
      await applyFinancialPeriodLock(tx,companyId,options?.financialPeriodLock);
      const txContext:any={
        getDriverRepo:()=>new PostgresDriverRepository(tx),
        getVehicleRepo:()=>new PostgresVehicleRepository(tx),
        getKmRecordRepo:()=>new PostgresKmRecordRepository(tx),
        getReceivableRepo:()=>new PostgresAccountReceivableRepository(tx,companyId),
        getPayableRepo:()=>new PostgresAccountPayableRepository(tx,companyId),
        getFinancialCategories:async()=>await tx.select().from(financialCategories).where(eq(financialCategories.companyId,companyId)),
        getTransactionRepo:()=>new PostgresFinancialTransactionRepository(tx,companyId),
        getAccountRepo:()=>new PostgresFinancialAccountRepository(tx,companyId),
        getPaymentMethodRepo:()=>new PostgresPaymentMethodRepository(tx,companyId),
        getAuditLogRepo:()=>new PostgresAuditLogRepository(tx,companyId),
        getAttachmentRepo:()=>new PostgresAttachmentRepository(tx),
        getDocumentRepo:()=>new PostgresDocumentRepository(tx),
        getUserRepo:()=>new PostgresUserRepository(tx,companyId),
        getFinancialPeriodRepo:()=>new PostgresFinancialPeriodRepository(tx,companyId),
        getContractRepo:()=>new PostgresContractRepository(tx),
        getContractTemplateRepo:()=>new PostgresContractTemplateRepository(tx),
        getContractArtifactRepo:()=>new PostgresContractArtifactRepository(tx),
        getSecurityDepositRepo:()=>new PostgresSecurityDepositRepository(tx),
        getSecurityDepositMovementRepo:()=>new PostgresSecurityDepositMovementRepository(tx),
        getDriverHealthRepo:()=>new PostgresDriverHealthProfileRepository(tx,companyId),
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
        findPreviousPayableInstallmentsForUpdate:async(groupId:string,installmentNumber:number)=>{
          return await tx.select().from(accountPayables)
            .where(and(eq(accountPayables.companyId,companyId),eq(accountPayables.installmentGroupId,groupId),lt(accountPayables.installmentNumber,installmentNumber)))
            .orderBy(accountPayables.installmentNumber).for('update');
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
        findCreditCardStatementPurchaseForUpdate:async(financialTransactionId:string)=>{
          const result:any=await tx.execute(sql`
            SELECT i.id AS item_id,i.statement_id,i.original_amount,i.adjustment_amount,i.final_amount,
                   s.status,s.original_amount AS statement_original_amount,
                   s.adjustment_amount AS statement_adjustment_amount,s.balance_amount AS statement_balance_amount
            FROM credit_card_statement_items i
            JOIN credit_card_statements s ON s.id=i.statement_id AND s.company_id=i.company_id
            WHERE i.company_id=${companyId} AND i.financial_transaction_id=${financialTransactionId}
            FOR UPDATE OF i,s
          `);
          return result.rows?.[0]||null;
        },
        applyCreditCardStatementPurchaseReversal:async(itemId:string,statementId:string,amount:number,userId:string)=>{
          const itemResult:any=await tx.execute(sql`
            UPDATE credit_card_statement_items
            SET adjustment_amount=adjustment_amount-${String(amount)},
                final_amount=final_amount-${String(amount)}
            WHERE company_id=${companyId} AND id=${itemId} AND statement_id=${statementId}
              AND final_amount>=${String(amount)}
            RETURNING *
          `);
          const item=itemResult.rows?.[0]||null;
          if(!item)return null;
          const statementResult:any=await tx.execute(sql`
            WITH totals AS (
              SELECT COALESCE(SUM(original_amount),0) AS original_amount,
                     COALESCE(SUM(adjustment_amount),0) AS adjustment_amount,
                     COALESCE(SUM(final_amount),0) AS balance_amount
              FROM credit_card_statement_items
              WHERE company_id=${companyId} AND statement_id=${statementId}
            )
            UPDATE credit_card_statements s
            SET original_amount=totals.original_amount,
                adjustment_amount=totals.adjustment_amount,
                balance_amount=totals.balance_amount,
                updated_by_id=${userId},updated_at=NOW(),version=version+1
            FROM totals
            WHERE s.company_id=${companyId} AND s.id=${statementId} AND s.status='OPEN'
            RETURNING s.*
          `);
          const statement=statementResult.rows?.[0]||null;
          if(!statement)throw new Error('Fatura não está aberta para estorno de compra');
          return {item,statement};
        },
        getRawTransaction:()=>tx,
        trustedSystemActor:options?.trustedSystemActor,
      };
      if(options?.allowNestedReuse){
        return await activeUnitOfWork.run({companyId,txContext},async()=>await callback(txContext));
      }
      return await callback(txContext);
    });
  }
}
