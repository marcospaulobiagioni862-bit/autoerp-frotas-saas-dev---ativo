import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { ReversalService } from '../../domain/finance/ReversalService';

const company='finance-card-1e3-company';
const user='finance-card-1e3-admin';
const source='finance-card-1e3-bank';
const card='finance-card-1e3-card';
const transfer='finance-card-1e3-transfer';
const statement='finance-card-1e3-statement';

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
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${company},'CARD 1E3','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${user},${company},'CARD 1E3 Admin','card-1e3@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,active)
    VALUES('finance-card-1e3-pm',${company},'PIX','PIX',true)`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at) VALUES
    (${source},${company},'Bank','BANK',1000,800,'ACTIVE',NOW(),NOW()),
    (${card},${company},'Card','CREDIT_CARD',0,200,'ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO credit_card_profiles(id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id)
    VALUES('finance-card-1e3-profile',${company},${card},5000,20,27,true,1,${user},${user})`);
  await db.execute(sql`INSERT INTO credit_card_statements(id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,original_amount,paid_amount,balance_amount,closed_at,closed_by_id,version,created_by_id,updated_by_id)
    VALUES(${statement},${company},'finance-card-1e3-profile','2026-08','2026-08-20','2026-08-27','CLOSED',300,0,300,NOW(),${user},1,${user},${user})`);
  await db.execute(sql`INSERT INTO financial_transactions(id,company_id,financial_account_id,destination_account_id,type,amount,payment_method_id,transaction_date,competence_date,description,is_reversed,created_by_id,created_at,updated_at)
    VALUES(${transfer},${company},${source},${card},'TRANSFER',200,'finance-card-1e3-pm','2026-08-25','2026-08-25','Card statement payment',false,${user},NOW(),NOW())`);
  await db.execute(sql`INSERT INTO credit_card_statement_payments(id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id)
    VALUES('finance-card-1e3-payment',${company},${statement},${transfer},200,'finance-card-1e3-payment-key',${user})`);
  await db.execute(sql`UPDATE credit_card_statements SET status='PARTIALLY_PAID',paid_amount=200,balance_amount=100 WHERE id=${statement}`);
}

async function reverse(amount:number,key:string){
  return UnitOfWork.run(company,tx=>ReversalService.reverseTransaction(company,transfer,amount,'card payment correction',user,'CARD 1E3 Admin',tx,key),{financialPeriodLock:'SHARED'});
}

async function run(){
  await seed();
  const first=await reverse(50,'finance-card-1e3-reverse-50');
  const retry=await reverse(50,'finance-card-1e3-reverse-50');
  assert(first.id===retry.id,'same-key reversal retry must converge');
  let state=await one(sql`SELECT paid_amount,balance_amount,status FROM credit_card_statements WHERE id=${statement}`);
  assert(Number(state.paid_amount)===150&&Number(state.balance_amount)===150&&state.status==='PARTIALLY_PAID','partial reversal must restore statement balance exactly once');
  await reverse(150,'finance-card-1e3-reverse-150');
  state=await one(sql`SELECT paid_amount,balance_amount,status FROM credit_card_statements WHERE id=${statement}`);
  assert(Number(state.paid_amount)===0&&Number(state.balance_amount)===300&&state.status==='CLOSED','full payment reversal must restore CLOSED statement');
  const ledger=await one(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${company}`);
  assert(Number(ledger.count)===3,'two reversals must create only two REVERSAL rows and no EXPENSE');
  const audit=await one(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${company} AND entity_type='CreditCardStatement' AND entity_id=${statement}`);
  assert(Number(audit.count)===2,'statement reversal effects must be audited once per effective reversal');
  console.log('FINANCE-CARD-1E3 payment reversal synchronization: PASS');
}
run().catch(error=>{console.error(error);process.exit(1);});
