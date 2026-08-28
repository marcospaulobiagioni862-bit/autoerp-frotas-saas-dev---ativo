import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { CreditCardStatementCreditAuthority } from '../creditCardStatementCreditAuthority';

const companyA='finance-card-1e6-company-a'; const companyB='finance-card-1e6-company-b';
const adminA='finance-card-1e6-admin-a'; const readonlyA='finance-card-1e6-readonly-a'; const adminB='finance-card-1e6-admin-b';
const cardA='finance-card-1e6-card-a'; const cardB='finance-card-1e6-card-b'; const methodA='finance-card-1e6-method-a'; const methodB='finance-card-1e6-method-b';
const statementA='finance-card-1e6-statement-a'; const partialA='finance-card-1e6-partial-a'; const statementB='finance-card-1e6-statement-b';
const purchaseA='finance-card-1e6-purchase-a'; const partialPurchaseA='finance-card-1e6-partial-purchase-a'; const purchaseB='finance-card-1e6-purchase-b';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
async function one(query:any){const result:any=await db.execute(query);return result.rows?.[0];}
async function expectFailure(action:()=>Promise<unknown>,expected:string){let message='';try{await action();}catch(error){message=error instanceof Error?error.message:String(error);}assert(message.includes(expected),`expected ${expected}, got ${message}`);}

async function seed(){
  await db.execute(sql`DELETE FROM credit_card_statement_credits WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statement_adjustments WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statement_payments WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statement_items WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statements WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_profiles WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_transactions WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM payment_methods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES (${companyA},'CARD 1E6 A','ACTIVE',NOW(),NOW()),(${companyB},'CARD 1E6 B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'CARD 1E6 Admin A','card-1e6-admin-a@example.test','ADMIN',true,NOW(),NOW()),
    (${readonlyA},${companyA},'CARD 1E6 Readonly A','card-1e6-readonly-a@example.test','READONLY',true,NOW(),NOW()),
    (${adminB},${companyB},'CARD 1E6 Admin B','card-1e6-admin-b@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,active) VALUES (${methodA},${companyA},'PIX','PIX',true),(${methodB},${companyB},'PIX','PIX',true)`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at) VALUES
    (${cardA},${companyA},'Card A','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW()),(${cardB},${companyB},'Card B','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO credit_card_profiles(id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id) VALUES
    ('finance-card-1e6-profile-a',${companyA},${cardA},5000,20,27,true,1,${adminA},${adminA}),('finance-card-1e6-profile-b',${companyB},${cardB},5000,20,27,true,1,${adminB},${adminB})`);
  await db.execute(sql`INSERT INTO credit_card_statements(id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,original_amount,adjustment_amount,paid_amount,balance_amount,closed_at,closed_by_id,version,created_by_id,updated_by_id) VALUES
    (${statementA},${companyA},'finance-card-1e6-profile-a','2026-08-A','2026-08-20','2026-08-27','CLOSED',300,0,0,300,NOW(),${adminA},1,${adminA},${adminA}),
    (${partialA},${companyA},'finance-card-1e6-profile-a','2026-08-B','2026-08-20','2026-08-27','PARTIALLY_PAID',300,0,200,100,NOW(),${adminA},1,${adminA},${adminA}),
    (${statementB},${companyB},'finance-card-1e6-profile-b','2026-08-A','2026-08-20','2026-08-27','CLOSED',300,0,0,300,NOW(),${adminB},1,${adminB},${adminB})`);
  await db.execute(sql`INSERT INTO financial_transactions(id,company_id,financial_account_id,type,amount,payment_method_id,transaction_date,competence_date,description,is_reversed,created_by_id,created_at,updated_at) VALUES
    (${purchaseA},${companyA},${cardA},'EXPENSE',300,${methodA},'2026-08-19','2026-08-19','purchase A',false,${adminA},NOW(),NOW()),
    (${partialPurchaseA},${companyA},${cardA},'EXPENSE',300,${methodA},'2026-08-19','2026-08-19','partial purchase A',false,${adminA},NOW(),NOW()),
    (${purchaseB},${companyB},${cardB},'EXPENSE',300,${methodB},'2026-08-19','2026-08-19','purchase B',false,${adminB},NOW(),NOW())`);
  await db.execute(sql`INSERT INTO credit_card_statement_items(id,company_id,statement_id,financial_transaction_id,original_amount,adjustment_amount,final_amount,created_by_id) VALUES
    ('finance-card-1e6-item-a',${companyA},${statementA},${purchaseA},300,0,300,${adminA}),
    ('finance-card-1e6-item-partial-a',${companyA},${partialA},${partialPurchaseA},300,0,300,${adminA}),
    ('finance-card-1e6-item-b',${companyB},${statementB},${purchaseB},300,0,300,${adminB})`);
}

async function run(){
  await seed();
  const actorA={companyId:companyA,userId:adminA,name:'CARD 1E6 Admin A'}; const actorReadonly={companyId:companyA,userId:readonlyA,name:'CARD 1E6 Readonly A'}; const actorB={companyId:companyB,userId:adminB,name:'CARD 1E6 Admin B'};
  const txBefore=Number((await one(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyA}`)).count);
  const first=await CreditCardStatementCreditAuthority.apply(actorA,statementA,{financialTransactionId:purchaseA,amount:100,reason:'merchant refund',idempotencyKey:'card-1e6-credit-100'});
  assert(!first.replayed&&Number(first.statement.balance_amount)===200,'first credit must reduce statement balance once');
  let item=await one(sql`SELECT original_amount,adjustment_amount,final_amount FROM credit_card_statement_items WHERE id='finance-card-1e6-item-a'`);
  assert(Number(item.original_amount)===300&&Number(item.adjustment_amount)===0&&Number(item.final_amount)===300,'post-close credit must not rewrite closed item history');
  const replay=await CreditCardStatementCreditAuthority.apply(actorA,statementA,{financialTransactionId:purchaseA,amount:100,reason:'merchant refund',idempotencyKey:'card-1e6-credit-100'});
  assert(replay.replayed&&Number(replay.statement.balance_amount)===200,'retry must not apply credit twice');
  await CreditCardStatementCreditAuthority.apply(actorA,statementA,{financialTransactionId:purchaseA,amount:200,reason:'final merchant refund',idempotencyKey:'card-1e6-credit-200'});
  const finalStatement=await one(sql`SELECT status,balance_amount,paid_amount FROM credit_card_statements WHERE id=${statementA}`);
  assert(finalStatement.status==='PAID'&&Number(finalStatement.balance_amount)===0&&Number(finalStatement.paid_amount)===0,'final credit must converge to zero balance without inventing payment');
  item=await one(sql`SELECT final_amount FROM credit_card_statement_items WHERE id='finance-card-1e6-item-a'`); assert(Number(item.final_amount)===300,'final credit must preserve original item');

  await expectFailure(()=>CreditCardStatementCreditAuthority.apply(actorA,partialA,{financialTransactionId:partialPurchaseA,amount:150,reason:'too much for balance',idempotencyKey:'card-1e6-over-balance'}),'saldo autoritativo');
  await expectFailure(()=>CreditCardStatementCreditAuthority.apply(actorA,statementA,{financialTransactionId:purchaseA,amount:1,reason:'already settled',idempotencyKey:'card-1e6-after-paid'}),'não está elegível');
  await expectFailure(()=>CreditCardStatementCreditAuthority.apply(actorReadonly,partialA,{financialTransactionId:partialPurchaseA,amount:50,reason:'readonly',idempotencyKey:'card-1e6-readonly'}),'Acesso negado:');
  await expectFailure(()=>CreditCardStatementCreditAuthority.apply(actorB,statementA,{financialTransactionId:purchaseA,amount:50,reason:'foreign',idempotencyKey:'card-1e6-foreign'}),'Fatura de cartão não encontrada');

  const txAfter=Number((await one(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyA}`)).count); assert(txAfter===txBefore,'post-close credits must create zero FinancialTransactions');
  const credits=await one(sql`SELECT count(*)::int count,COALESCE(SUM(amount),0) amount FROM credit_card_statement_credits WHERE company_id=${companyA}`); assert(Number(credits.count)===2&&Number(credits.amount)===300,'exactly two effective credit commands must persist');
  const audits=await one(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${companyA} AND entity_type='CreditCardStatementCredit'`); assert(Number(audits.count)===2,'effective credits must be audited exactly once');
  console.log('FINANCE-CARD-1E6 post-close credit integration: PASS');
}
run().catch(error=>{console.error(error);process.exit(1);});
