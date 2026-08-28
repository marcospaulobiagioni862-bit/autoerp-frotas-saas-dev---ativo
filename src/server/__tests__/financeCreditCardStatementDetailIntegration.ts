import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { CreditCardStatementDetailAuthority } from '../creditCardStatementDetailAuthority';

const companyA='finance-card-f2-company-a'; const companyB='finance-card-f2-company-b';
const adminA='finance-card-f2-admin-a'; const readonlyA='finance-card-f2-readonly-a'; const adminB='finance-card-f2-admin-b';
const cardA='finance-card-f2-card-a'; const bankA='finance-card-f2-bank-a'; const cardB='finance-card-f2-card-b';
const methodA='finance-card-f2-method-a'; const methodB='finance-card-f2-method-b';
const statementA='finance-card-f2-statement-a'; const statementB='finance-card-f2-statement-b';
const purchaseA='finance-card-f2-purchase-a'; const paymentA='finance-card-f2-payment-a'; const purchaseB='finance-card-f2-purchase-b';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
async function one(query:any){const result:any=await db.execute(query);return result.rows?.[0]||null;}
async function expectFailure(action:()=>Promise<unknown>,expected:string){let message='';try{await action();}catch(error){message=error instanceof Error?error.message:String(error);}assert(message.includes(expected),`expected ${expected}, got ${message}`);}

async function seed(){
  await db.execute(sql`DELETE FROM credit_card_statement_credits WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statement_adjustments WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statement_payments WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statement_items WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statements WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_profiles WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_transactions WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM payment_methods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES (${companyA},'Card F2 A','ACTIVE',NOW(),NOW()),(${companyB},'Card F2 B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'Card F2 Admin A','card-f2-admin-a@example.test','ADMIN',true,NOW(),NOW()),
    (${readonlyA},${companyA},'Card F2 Readonly A','card-f2-readonly-a@example.test','READONLY',true,NOW(),NOW()),
    (${adminB},${companyB},'Card F2 Admin B','card-f2-admin-b@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,active) VALUES (${methodA},${companyA},'PIX','PIX',true),(${methodB},${companyB},'PIX','PIX',true)`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at) VALUES
    (${cardA},${companyA},'Card F2 A','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW()),(${bankA},${companyA},'Bank F2 A','BANK',1000,1000,'ACTIVE',NOW(),NOW()),(${cardB},${companyB},'Card F2 B','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO credit_card_profiles(id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id) VALUES
    ('finance-card-f2-profile-a',${companyA},${cardA},5000,20,27,true,1,${adminA},${adminA}),('finance-card-f2-profile-b',${companyB},${cardB},5000,20,27,true,1,${adminB},${adminB})`);
  await db.execute(sql`INSERT INTO credit_card_statements(id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,original_amount,adjustment_amount,interest_amount,fine_amount,discount_amount,paid_amount,balance_amount,closed_at,closed_by_id,version,created_by_id,updated_by_id) VALUES
    (${statementA},${companyA},'finance-card-f2-profile-a','2020-01','2020-01-20','2020-01-27','PARTIALLY_PAID',300,0,20,10,5,100,175,NOW(),${adminA},1,${adminA},${adminA}),
    (${statementB},${companyB},'finance-card-f2-profile-b','2020-01','2020-01-20','2020-01-27','CLOSED',300,0,0,0,0,0,300,NOW(),${adminB},1,${adminB},${adminB})`);
  await db.execute(sql`INSERT INTO financial_transactions(id,company_id,financial_account_id,destination_account_id,type,amount,payment_method_id,transaction_date,competence_date,description,is_reversed,created_by_id,created_at,updated_at) VALUES
    (${purchaseA},${companyA},${cardA},NULL,'EXPENSE',300,${methodA},'2020-01-10','2020-01-10','Card purchase A',false,${adminA},NOW(),NOW()),
    (${paymentA},${companyA},${bankA},${cardA},'TRANSFER',100,${methodA},'2020-01-28','2020-01-28','Statement payment A',false,${adminA},NOW(),NOW()),
    (${purchaseB},${companyB},${cardB},NULL,'EXPENSE',300,${methodB},'2020-01-10','2020-01-10','Card purchase B',false,${adminB},NOW(),NOW())`);
  await db.execute(sql`INSERT INTO credit_card_statement_items(id,company_id,statement_id,financial_transaction_id,origin_type,origin_id,original_amount,adjustment_amount,final_amount,created_by_id,created_at) VALUES
    ('finance-card-f2-item-a',${companyA},${statementA},${purchaseA},'MAINTENANCE','maint-f2-a',300,0,300,${adminA},'2020-01-10T10:00:00Z'),
    ('finance-card-f2-item-b',${companyB},${statementB},${purchaseB},'MAINTENANCE','maint-f2-b',300,0,300,${adminB},'2020-01-10T10:00:00Z')`);
  await db.execute(sql`INSERT INTO credit_card_statement_payments(id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id,created_at) VALUES ('finance-card-f2-payment-link-a',${companyA},${statementA},${paymentA},100,'finance-card-f2-payment-key',${adminA},'2020-01-28T10:00:00Z')`);
  await db.execute(sql`INSERT INTO credit_card_statement_adjustments(id,company_id,statement_id,interest_amount,fine_amount,discount_amount,reason,idempotency_key,created_by_id,created_at) VALUES ('finance-card-f2-adjust-a',${companyA},${statementA},20,10,5,'Atraso','finance-card-f2-adjust-key',${adminA},'2020-01-29T10:00:00Z')`);
  await db.execute(sql`INSERT INTO credit_card_statement_credits(id,company_id,statement_id,statement_item_id,financial_transaction_id,amount,reason,idempotency_key,created_by_id,created_at) VALUES ('finance-card-f2-credit-a',${companyA},${statementA},'finance-card-f2-item-a',${purchaseA},50,'Crédito lojista','finance-card-f2-credit-key',${adminA},'2020-01-30T10:00:00Z')`);
}

async function run(){
  await seed();
  const actorA={companyId:companyA,userId:adminA,name:'Card F2 Admin A'};
  const actorReadonly={companyId:companyA,userId:readonlyA,name:'Card F2 Readonly A'};
  const actorB={companyId:companyB,userId:adminB,name:'Card F2 Admin B'};
  const auditsBefore=Number((await one(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${companyA}`)).count);
  const txBefore=Number((await one(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyA}`)).count);

  const detail=await CreditCardStatementDetailAuthority.get(actorA,statementA);
  assert(detail.statement.id===statementA,'detail must return requested tenant statement');
  assert(detail.statement.is_overdue===true&&Number(detail.statement.overdue_days)>0,'overdue state must be server-derived');
  assert(detail.items.length===1&&detail.items[0].financial_transaction_id===purchaseA,'detail must include tenant item once');
  assert(detail.payments.length===1&&detail.payments[0].financial_transaction_id===paymentA,'detail must include linked payment once');
  assert(detail.adjustments.length===1&&Number(detail.adjustments[0].interest_amount)===20,'detail must include authoritative adjustment once');
  assert(detail.credits.length===1&&Number(detail.credits[0].amount)===50,'detail must include post-close credit once');

  const readonlyDetail=await CreditCardStatementDetailAuthority.get(actorReadonly,statementA);
  assert(readonlyDetail.statement.id===statementA,'READONLY must retain VIEW_FINANCIAL access');
  await expectFailure(()=>CreditCardStatementDetailAuthority.get(actorB,statementA),'Fatura de cartão não encontrada');

  const auditsAfter=Number((await one(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${companyA}`)).count);
  const txAfter=Number((await one(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyA}`)).count);
  assert(auditsAfter===auditsBefore,'read-model must not create audit writes');
  assert(txAfter===txBefore,'read-model must not create FinancialTransactions');
  console.log('FINANCE-CARD-1F2 statement detail PostgreSQL integration: PASS');
}
run().catch(error=>{console.error(error);process.exit(1);});