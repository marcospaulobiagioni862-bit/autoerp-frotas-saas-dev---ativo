import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { PostgresCreditCardPurchaseCycleRepository } from '../../db/repositories/postgresCreditCardPurchaseCycleRepository';

const companyId='finance-card-1c-company';
const cardAccountId='finance-card-1c-card';
const methodId='finance-card-1c-method';
const profileId='finance-card-1c-profile';
const augustStatement='finance-card-1c-2026-08';
const septemberStatement='finance-card-1c-2026-09';
const beforeClosePurchase='finance-card-1c-before-close';
const afterClosePurchase='finance-card-1c-after-close';

function assert(condition: unknown,message: string): asserts condition { if(!condition) throw new Error(message); }
async function exec(query:any){ return db.execute(query); }

async function seed(): Promise<void> {
  await exec(sql`DELETE FROM credit_card_statement_items WHERE company_id=${companyId}`);
  await exec(sql`DELETE FROM credit_card_statements WHERE company_id=${companyId}`);
  await exec(sql`DELETE FROM credit_card_profiles WHERE company_id=${companyId}`);
  await exec(sql`DELETE FROM financial_transactions WHERE company_id=${companyId}`);
  await exec(sql`DELETE FROM financial_accounts WHERE company_id=${companyId}`);
  await exec(sql`DELETE FROM payment_methods WHERE company_id=${companyId}`);
  await exec(sql`DELETE FROM companies WHERE id=${companyId}`);
  await exec(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyId},'CARD 1C','ACTIVE',NOW(),NOW())`);
  await exec(sql`INSERT INTO payment_methods(id,company_id,name,type,active) VALUES(${methodId},${companyId},'PIX','PIX',true)`);
  await exec(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at)
    VALUES(${cardAccountId},${companyId},'CARD','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW())`);
  await exec(sql`INSERT INTO credit_card_profiles(id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id)
    VALUES(${profileId},${companyId},${cardAccountId},5000,20,27,true,1,'card-1c-user','card-1c-user')`);
  await exec(sql`INSERT INTO credit_card_statements(id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,version,created_by_id,updated_by_id)
    VALUES
      (${augustStatement},${companyId},${profileId},'2026-08','2026-08-20','2026-08-27','OPEN',1,'card-1c-user','card-1c-user'),
      (${septemberStatement},${companyId},${profileId},'2026-09','2026-09-20','2026-09-27','OPEN',1,'card-1c-user','card-1c-user')`);
  await exec(sql`INSERT INTO financial_transactions(id,company_id,financial_account_id,type,amount,payment_method_id,transaction_date,competence_date,description,is_reversed,created_by_id,created_at,updated_at)
    VALUES
      (${beforeClosePurchase},${companyId},${cardAccountId},'EXPENSE',100,${methodId},'2026-08-19','2026-08-19','before close',false,'card-1c-user',NOW(),NOW()),
      (${afterClosePurchase},${companyId},${cardAccountId},'EXPENSE',200,${methodId},'2026-08-21','2026-08-21','after close',false,'card-1c-user',NOW(),NOW())`);
}

async function link(repo:PostgresCreditCardPurchaseCycleRepository,tx:any,transactionId:string,expectedStatement:string):Promise<void>{
  const purchase=await repo.findPurchaseForUpdate(companyId,transactionId);
  assert(purchase?.type==='EXPENSE'&&!purchase.is_reversed,'purchase must remain an authoritative non-reversed EXPENSE');
  const profile=await repo.findProfileByAccountForUpdate(companyId,purchase.financial_account_id);
  assert(profile?.id===profileId&&profile.active,'purchase account must resolve to the active credit-card profile');
  const purchaseDate=String(purchase.transaction_date).slice(0,10);
  const statement=await repo.findOpenStatementForPurchaseForUpdate(companyId,profile.id,purchaseDate);
  assert(statement?.id===expectedStatement,`purchase ${transactionId} must resolve deterministically to ${expectedStatement}`);
  const before=await repo.countTransactions(companyId);
  await repo.createItem({id:`item-${transactionId}`,companyId,statementId:statement.id,financialTransactionId:transactionId,amount:Number(purchase.amount),userId:'card-1c-user'});
  const totals=await repo.statementItemTotals(companyId,statement.id);
  await repo.updateStatementItemTotals(companyId,statement.id,totals,'card-1c-user');
  const after=await repo.countTransactions(companyId);
  assert(before===after,'linking a card purchase to a statement must not create a new FinancialTransaction');
  const replay=await repo.findItemByTransaction(companyId,transactionId);
  assert(replay?.statement_id===expectedStatement,'financial_transaction_id must remain the idempotent authoritative link');
}

async function run():Promise<void>{
  await seed();
  await UnitOfWork.run(companyId,async(txContext:any)=>{
    const tx=txContext.getRawTransaction();
    const repo=new PostgresCreditCardPurchaseCycleRepository(tx);
    await link(repo,tx,beforeClosePurchase,augustStatement);
    await link(repo,tx,afterClosePurchase,septemberStatement);
  });
  console.log('FINANCE-CARD-1C deterministic purchase-cycle PostgreSQL integration: PASS');
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
