import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { DepositService } from '../../domain/finance/DepositService';
import { SecurityDepositLifecycleAuthority } from '../securityDepositLifecycleAuthority';
import type { AuthenticatedPrincipal } from '../auth';

const companyA='finance-r16-company-a', companyB='finance-r16-company-b';
const adminA='finance-r16-admin-a', adminB='finance-r16-admin-b';
const accountA='finance-r16-account-a', inactiveA='finance-r16-account-inactive', accountB='finance-r16-account-b';
const methodA='finance-r16-method-a', inactiveMethodA='finance-r16-method-inactive', methodB='finance-r16-method-b';
const contractA1='finance-r16-contract-a1', contractA2='finance-r16-contract-a2', contractB1='finance-r16-contract-b1';
const actorA:AuthenticatedPrincipal={userId:adminA,companyId:companyA,name:'R16 Admin A',role:'ADMIN',permissions:[]};
const actorB:AuthenticatedPrincipal={userId:adminB,companyId:companyB,name:'R16 Admin B',role:'ADMIN',permissions:[]};

function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
async function row(query:any){const result:any=await db.execute(query);return result.rows?.[0];}
async function rejects(fn:()=>Promise<unknown>,contains:string){let message='';try{await fn();}catch(error){message=String(error);}assert(message.includes(contains),`expected rejection containing ${contains}, got ${message||'no rejection'}`);}
async function balance(id:string){return Number((await row(sql`SELECT current_balance FROM financial_accounts WHERE id=${id}`))?.current_balance||0);}
async function txCount(companyId:string){return Number((await row(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}`))?.count||0);}
async function movementCount(companyId:string,type?:string){const result=type?await row(sql`SELECT count(*)::int count FROM security_deposit_movements WHERE company_id=${companyId} AND type=${type}`):await row(sql`SELECT count(*)::int count FROM security_deposit_movements WHERE company_id=${companyId}`);return Number(result?.count||0);}

async function seed(){
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES (${companyA},'R16 A','ACTIVE',NOW(),NOW()),(${companyB},'R16 B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES (${adminA},${companyA},'R16 Admin A','r16-a@example.test','ADMIN',true,NOW(),NOW()),(${adminB},${companyB},'R16 Admin B','r16-b@example.test','ADMIN',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,is_archived,created_at,updated_at) VALUES ('r16-veh-a1',${companyA},'R6A1A01','R16RENA1','RENTED',false,NOW(),NOW()),('r16-veh-a2',${companyA},'R6A2A02','R16RENA2','RENTED',false,NOW(),NOW()),('r16-veh-b1',${companyB},'R6B1B01','R16RENB1','RENTED',false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO drivers(id,company_id,name,cpf,cnh,active,cnh_expiration,status,app_platforms,is_archived,created_at,updated_at) VALUES ('r16-drv-a1',${companyA},'R16 Driver A1','39053344705','R16A111111',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW()),('r16-drv-a2',${companyA},'R16 Driver A2','52998224725','R16A222222',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW()),('r16-drv-b1',${companyB},'R16 Driver B1','16899535009','R16B111111',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO contracts(id,company_id,driver_id,vehicle_id,status,contract_number,start_date,rental_amount,billing_periodicity,billing_due_day_of_week,billing_due_day_of_month,security_deposit_amount,franchise_km,excess_km_rate,is_archived,created_at,updated_at) VALUES (${contractA1},${companyA},'r16-drv-a1','r16-veh-a1','ACTIVE','FIN-R16-A1','2026-08-23',700,'WEEKLY',1,1,1000,1500,0.5,false,NOW(),NOW()),(${contractA2},${companyA},'r16-drv-a2','r16-veh-a2','ACTIVE','FIN-R16-A2','2026-08-23',700,'WEEKLY',1,1,1000,1500,0.5,false,NOW(),NOW()),(${contractB1},${companyB},'r16-drv-b1','r16-veh-b1','ACTIVE','FIN-R16-B1','2026-08-23',700,'WEEKLY',1,1,700,1500,0.5,false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at) VALUES (${accountA},${companyA},'R16 A','BANK',0,0,'ACTIVE',NOW(),NOW()),(${inactiveA},${companyA},'R16 Inactive','BANK',0,0,'INACTIVE',NOW(),NOW()),(${accountB},${companyB},'R16 B','BANK',0,0,'ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active) VALUES (${methodA},${companyA},'PIX R16 A','PIX',0,true),(${inactiveMethodA},${companyA},'Inactive R16','PIX',0,false),(${methodB},${companyB},'PIX R16 B','PIX',0,true) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES ('r16-income-a',${companyA},'Income R16','INCOME',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
}

async function receive(companyId:string,contractId:string,amount:number,accountId:string,methodId:string,key:string,userId:string,userName:string){return UnitOfWork.run(companyId,tx=>DepositService.receiveSecurityDeposit(companyId,contractId,'forged-driver','forged-vehicle',amount,accountId,methodId,userId,userName,tx,key));}
async function createReceivable(id:string,driverId:string,contractId:string,amount:number){await db.execute(sql`INSERT INTO account_receivables(id,company_id,origin_type,origin_id,driver_id,contract_id,category_id,description,original_amount,discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status,idempotency_key,created_at,updated_at) VALUES (${id},${companyA},'MANUAL',${`origin-${id}`},${driverId},${contractId},'r16-income-a','R16 receivable',${amount},0,0,0,${amount},0,${amount},'2026-09-20','2026-08-23','PENDING',${`idem-${id}`},NOW(),NOW())`);}

async function run(){
  await seed();
  const receipt1=await receive(companyA,contractA1,1000,accountA,methodA,'r16-receive-a1',adminA,'R16 Admin A');
  const receipt2=await receive(companyA,contractA2,1000,accountA,methodA,'r16-receive-a2',adminA,'R16 Admin A');
  await receive(companyB,contractB1,700,accountB,methodB,'r16-receive-b1',adminB,'R16 Admin B');
  assert(await balance(accountA)===2000,'receipt setup balance mismatch');

  const first=await SecurityDepositLifecycleAuthority.returnDeposit(actorA,{depositId:receipt1.deposit.id,amount:200,financialAccountId:accountA,paymentMethodId:methodA,transactionDate:'2026-08-23',idempotencyKey:'r16-return-1'});
  const retry=await SecurityDepositLifecycleAuthority.returnDeposit(actorA,{depositId:receipt1.deposit.id,amount:200,financialAccountId:accountA,paymentMethodId:methodA,transactionDate:'2026-08-23',idempotencyKey:'r16-return-1'});
  assert(first.movement.id===retry.movement.id,'return retry did not converge');
  assert(await balance(accountA)===1800,'return retry duplicated cash outflow');
  assert(await movementCount(companyA,'RETURN')===1,'return retry duplicated movement');
  await rejects(()=>SecurityDepositLifecycleAuthority.returnDeposit(actorA,{depositId:receipt1.deposit.id,amount:201,financialAccountId:accountA,paymentMethodId:methodA,transactionDate:'2026-08-23',idempotencyKey:'r16-return-1'}),'Chave de idempotência reutilizada');

  await rejects(()=>SecurityDepositLifecycleAuthority.returnDeposit(actorA,{depositId:receipt1.deposit.id,amount:10,financialAccountId:inactiveA,paymentMethodId:methodA,transactionDate:'2026-08-23',idempotencyKey:'r16-return-inactive-account'}),'Conta financeira não encontrada');
  await rejects(()=>SecurityDepositLifecycleAuthority.returnDeposit(actorA,{depositId:receipt1.deposit.id,amount:10,financialAccountId:accountA,paymentMethodId:inactiveMethodA,transactionDate:'2026-08-23',idempotencyKey:'r16-return-inactive-method'}),'Forma de pagamento não encontrada');
  await rejects(()=>SecurityDepositLifecycleAuthority.returnDeposit(actorA,{depositId:receipt1.deposit.id,amount:10,financialAccountId:accountB,paymentMethodId:methodA,transactionDate:'2026-08-23',idempotencyKey:'r16-return-foreign-account'}),'Conta financeira não encontrada');

  await createReceivable('r16-ar-a1','r16-drv-a1',contractA1,500);
  const txBeforeComp=await txCount(companyA), balanceBeforeComp=await balance(accountA);
  const comp=await SecurityDepositLifecycleAuthority.compensateDeposit(actorA,{depositId:receipt1.deposit.id,receivableId:'r16-ar-a1',amount:300,idempotencyKey:'r16-comp-1'});
  const compRetry=await SecurityDepositLifecycleAuthority.compensateDeposit(actorA,{depositId:receipt1.deposit.id,receivableId:'r16-ar-a1',amount:300,idempotencyKey:'r16-comp-1'});
  assert(comp.movement.id===compRetry.movement.id,'compensation retry did not converge');
  const ar=await row(sql`SELECT paid_amount,balance_amount,status FROM account_receivables WHERE id='r16-ar-a1'`);
  assert(Number(ar.paid_amount)===300 && Number(ar.balance_amount)===200 && ar.status==='PARTIALLY_PAID','compensation did not settle AR exactly');
  assert(await txCount(companyA)===txBeforeComp,'compensation created a financial transaction');
  assert(await balance(accountA)===balanceBeforeComp,'compensation mutated bank balance');

  await createReceivable('r16-ar-a2','r16-drv-a2',contractA2,700);
  const race=await Promise.allSettled([
    SecurityDepositLifecycleAuthority.returnDeposit(actorA,{depositId:receipt2.deposit.id,amount:600,financialAccountId:accountA,paymentMethodId:methodA,transactionDate:'2026-08-23',idempotencyKey:'r16-race-return'}),
    SecurityDepositLifecycleAuthority.compensateDeposit(actorA,{depositId:receipt2.deposit.id,receivableId:'r16-ar-a2',amount:600,idempotencyKey:'r16-race-comp'}),
  ]);
  assert(race.filter(x=>x.status==='fulfilled').length===1,'return-vs-compensation race must allow exactly one 600 operation');
  const dep2=await UnitOfWork.run(companyA,tx=>tx.getSecurityDepositRepo().findById(receipt2.deposit.id));
  assert(dep2 && Number(dep2.usedAmount)+Number(dep2.returnedAmount)===600,'race overspent or lost deposit value');

  const same=await Promise.all([
    SecurityDepositLifecycleAuthority.returnDeposit(actorB,{depositId:(await UnitOfWork.run(companyB,tx=>tx.getSecurityDepositRepo().findByContractId(contractB1)))!.id,amount:200,financialAccountId:accountB,paymentMethodId:methodB,transactionDate:'2026-08-23',idempotencyKey:'r16-return-same'}),
    SecurityDepositLifecycleAuthority.returnDeposit(actorB,{depositId:(await UnitOfWork.run(companyB,tx=>tx.getSecurityDepositRepo().findByContractId(contractB1)))!.id,amount:200,financialAccountId:accountB,paymentMethodId:methodB,transactionDate:'2026-08-23',idempotencyKey:'r16-return-same'}),
  ]);
  assert(same[0].movement.id===same[1].movement.id,'concurrent same-key return did not converge');
  assert(await balance(accountB)===500,'concurrent same-key return duplicated cash');

  await db.execute(sql`INSERT INTO financial_periods(id,company_id,year,month,start_date,end_date,status,closed_at,closed_by,created_at,updated_at) VALUES ('r16-closed',${companyA},2026,8,'2026-08-01','2026-08-31','CLOSED',NOW(),${adminA},NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET status='CLOSED'`);
  const beforeClosed=await balance(accountA);
  await rejects(()=>SecurityDepositLifecycleAuthority.returnDeposit(actorA,{depositId:receipt1.deposit.id,amount:10,financialAccountId:accountA,paymentMethodId:methodA,transactionDate:'2026-08-23',idempotencyKey:'r16-closed-return'}),'fechado');
  assert(await balance(accountA)===beforeClosed,'closed-period return mutated account');

  console.log('FINANCE-R16 deposit lifecycle PostgreSQL authority integration: PASS');
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
