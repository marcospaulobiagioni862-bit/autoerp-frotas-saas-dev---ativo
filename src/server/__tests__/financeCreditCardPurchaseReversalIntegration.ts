import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { ReversalService } from '../../domain/finance/ReversalService';

const company='finance-card-1e4-company';
const user='finance-card-1e4-admin';
const card='finance-card-1e4-card';
const method='finance-card-1e4-method';
const profile='finance-card-1e4-profile';
const openStatement='finance-card-1e4-open';
const closedStatement='finance-card-1e4-closed';
const openPurchase='finance-card-1e4-open-purchase';
const closedPurchase='finance-card-1e4-closed-purchase';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
async function one(query:any){const result:any=await db.execute(query);return result.rows?.[0];}

async function seed(){
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id=${company}`);
  await db.execute(sql`DELETE FROM credit_card_statement_payments WHERE company_id=${company}`);
  await db.execute(sql`DELETE FROM credit_card_statement_items WHERE company_id=${company}`);
  await db.execute(sql`DELETE FROM credit_card_statements WHERE company_id=${company}`);
  await db.execute(sql`DELETE FROM credit_card_profiles WHERE company_id=${company}`);
  await db.execute(sql`DELETE FROM financial_transactions WHERE company_id=${company}`);
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id=${company}`);
  await db.execute(sql`DELETE FROM payment_methods WHERE company_id=${company}`);
  await db.execute(sql`DELETE FROM users WHERE company_id=${company}`);
  await db.execute(sql`DELETE FROM companies WHERE id=${company}`);
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${company},'CARD 1E4','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${user},${company},'CARD 1E4 Admin','card-1e4@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,active) VALUES(${method},${company},'PIX','PIX',true)`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at)
    VALUES(${card},${company},'Card','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO credit_card_profiles(id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id)
    VALUES(${profile},${company},${card},5000,20,27,true,1,${user},${user})`);
  await db.execute(sql`INSERT INTO credit_card_statements(
      id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,
      original_amount,adjustment_amount,balance_amount,closed_at,closed_by_id,version,created_by_id,updated_by_id
    ) VALUES
      (${openStatement},${company},${profile},'2026-08','2026-08-20','2026-08-27','OPEN',300,0,300,NULL,NULL,1,${user},${user}),
      (${closedStatement},${company},${profile},'2026-07','2026-07-20','2026-07-27','CLOSED',50,0,50,NOW(),${user},1,${user},${user})`);
  await db.execute(sql`INSERT INTO financial_transactions(
      id,company_id,financial_account_id,type,amount,payment_method_id,transaction_date,competence_date,
      description,is_reversed,created_by_id,created_at,updated_at
    ) VALUES
      (${openPurchase},${company},${card},'EXPENSE',300,${method},'2026-08-19','2026-08-19','open statement purchase',false,${user},NOW(),NOW()),
      (${closedPurchase},${company},${card},'EXPENSE',50,${method},'2026-07-19','2026-07-19','closed statement purchase',false,${user},NOW(),NOW())`);
  await db.execute(sql`INSERT INTO credit_card_statement_items(
      id,company_id,statement_id,financial_transaction_id,original_amount,adjustment_amount,final_amount,created_by_id
    ) VALUES
      ('finance-card-1e4-open-item',${company},${openStatement},${openPurchase},300,0,300,${user}),
      ('finance-card-1e4-closed-item',${company},${closedStatement},${closedPurchase},50,0,50,${user})`);
}

async function reverse(transactionId:string,amount:number,key:string){
  return UnitOfWork.run(company,tx=>ReversalService.reverseTransaction(
    company,transactionId,amount,'card purchase correction',user,'CARD 1E4 Admin',tx,key
  ),{financialPeriodLock:'SHARED'});
}

async function run(){
  await seed();
  const first=await reverse(openPurchase,100,'finance-card-1e4-reverse-100');
  const retry=await reverse(openPurchase,100,'finance-card-1e4-reverse-100');
  assert(first.id===retry.id,'same-key purchase reversal retry must converge');

  let item=await one(sql`SELECT original_amount,adjustment_amount,final_amount FROM credit_card_statement_items WHERE company_id=${company} AND financial_transaction_id=${openPurchase}`);
  let statement=await one(sql`SELECT original_amount,adjustment_amount,balance_amount,status FROM credit_card_statements WHERE company_id=${company} AND id=${openStatement}`);
  assert(Number(item.original_amount)===300&&Number(item.adjustment_amount)===-100&&Number(item.final_amount)===200,'partial purchase reversal must adjust the item exactly once');
  assert(Number(statement.original_amount)===300&&Number(statement.adjustment_amount)===-100&&Number(statement.balance_amount)===200&&statement.status==='OPEN','partial purchase reversal must recompute the open statement');

  await reverse(openPurchase,200,'finance-card-1e4-reverse-200');
  item=await one(sql`SELECT original_amount,adjustment_amount,final_amount FROM credit_card_statement_items WHERE company_id=${company} AND financial_transaction_id=${openPurchase}`);
  statement=await one(sql`SELECT original_amount,adjustment_amount,balance_amount,status FROM credit_card_statements WHERE company_id=${company} AND id=${openStatement}`);
  assert(Number(item.original_amount)===300&&Number(item.adjustment_amount)===-300&&Number(item.final_amount)===0,'full purchase reversal must zero final item amount without rewriting original amount');
  assert(Number(statement.original_amount)===300&&Number(statement.adjustment_amount)===-300&&Number(statement.balance_amount)===0&&statement.status==='OPEN','full purchase reversal must preserve open-cycle history and zero statement balance');

  let blocked=false;
  try{await reverse(closedPurchase,50,'finance-card-1e4-closed-reverse');}catch(error){blocked=String(error).includes('crédito pós-fechamento');}
  assert(blocked,'closed statement purchase reversal must fail closed until post-closing credit authority exists');
  const closedItem=await one(sql`SELECT adjustment_amount,final_amount FROM credit_card_statement_items WHERE company_id=${company} AND financial_transaction_id=${closedPurchase}`);
  const closedTx=await one(sql`SELECT is_reversed FROM financial_transactions WHERE company_id=${company} AND id=${closedPurchase}`);
  assert(Number(closedItem.adjustment_amount)===0&&Number(closedItem.final_amount)===50&&!closedTx.is_reversed,'blocked closed-cycle reversal must not mutate item or transaction');

  const reversals=await one(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${company} AND type='REVERSAL'`);
  assert(Number(reversals.count)===2,'effective purchase reversals must create only two REVERSAL rows and no duplicate EXPENSE');
  const itemAudits=await one(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${company} AND entity_type='CreditCardStatementItem' AND entity_id='finance-card-1e4-open-item'`);
  const statementAudits=await one(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${company} AND entity_type='CreditCardStatement' AND entity_id=${openStatement}`);
  assert(Number(itemAudits.count)===2&&Number(statementAudits.count)===2,'effective purchase reversal effects must be audited exactly once');
  console.log('FINANCE-CARD-1E4 open purchase reversal synchronization: PASS');
}

run().catch(error=>{console.error(error);process.exit(1);});
