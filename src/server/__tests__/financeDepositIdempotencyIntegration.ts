import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { DepositService } from '../../domain/finance/DepositService';
import { DREService } from '../../domain/finance/DREService';
import { AccountingRegime } from '../../types/enums';

const companyA='finance-r22-company-a', companyB='finance-r22-company-b';
const adminA='finance-r22-admin-a', adminB='finance-r22-admin-b';
const accountA='finance-r22-account-a', accountA2='finance-r22-account-a2', inactiveA='finance-r22-account-inactive', accountB='finance-r22-account-b';
const methodA='finance-r22-method-a', methodA2='finance-r22-method-a2', inactiveMethodA='finance-r22-method-inactive', methodB='finance-r22-method-b';
const contractA1='finance-r22-contract-a1', contractA2='finance-r22-contract-a2', contractA3='finance-r22-contract-a3', contractB1='finance-r22-contract-b1';

function assert(condition: unknown, message: string): asserts condition { if(!condition) throw new Error(message); }
async function scalar(query:any){const result:any=await db.execute(query);return result.rows?.[0];}
async function rejects(fn:()=>Promise<unknown>, contains:string){let message='';try{await fn();}catch(error){message=String(error);}assert(message.includes(contains),`expected rejection containing ${contains}, got ${message||'no rejection'}`);}

async function seed(){
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES (${companyA},'R22 A','ACTIVE',NOW(),NOW()),(${companyB},'R22 B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES (${adminA},${companyA},'R22 Admin A','r22-a@example.test','ADMIN',true,NOW(),NOW()),(${adminB},${companyB},'R22 Admin B','r22-b@example.test','ADMIN',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,is_archived,created_at,updated_at) VALUES
    ('finance-r22-veh-a1',${companyA},'R2A1A01','R22RENAVAMA1','RENTED',false,NOW(),NOW()),
    ('finance-r22-veh-a2',${companyA},'R2A2A02','R22RENAVAMA2','RENTED',false,NOW(),NOW()),
    ('finance-r22-veh-a3',${companyA},'R2A3A03','R22RENAVAMA3','RENTED',false,NOW(),NOW()),
    ('finance-r22-veh-b1',${companyB},'R2B1B01','R22RENAVAMB1','RENTED',false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO drivers(id,company_id,name,cpf,cnh,active,cnh_expiration,status,app_platforms,is_archived,created_at,updated_at) VALUES
    ('finance-r22-drv-a1',${companyA},'R22 Driver A1','39053344705','R22A111111',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW()),
    ('finance-r22-drv-a2',${companyA},'R22 Driver A2','52998224725','R22A222222',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW()),
    ('finance-r22-drv-a3',${companyA},'R22 Driver A3','11144477735','R22A333333',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW()),
    ('finance-r22-drv-b1',${companyB},'R22 Driver B1','16899535009','R22B111111',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO contracts(id,company_id,driver_id,vehicle_id,status,contract_number,start_date,rental_amount,billing_periodicity,billing_due_day_of_week,billing_due_day_of_month,security_deposit_amount,franchise_km,excess_km_rate,is_archived,created_at,updated_at) VALUES
    (${contractA1},${companyA},'finance-r22-drv-a1','finance-r22-veh-a1','ACTIVE','FIN-R22-A1','2026-08-22',700,'WEEKLY',1,1,1000,1500,0.50,false,NOW(),NOW()),
    (${contractA2},${companyA},'finance-r22-drv-a2','finance-r22-veh-a2','ACTIVE','FIN-R22-A2','2026-08-22',700,'WEEKLY',1,1,1000,1500,0.50,false,NOW(),NOW()),
    (${contractA3},${companyA},'finance-r22-drv-a3','finance-r22-veh-a3','ACTIVE','FIN-R22-A3','2026-08-22',700,'WEEKLY',1,1,500,1500,0.50,false,NOW(),NOW()),
    (${contractB1},${companyB},'finance-r22-drv-b1','finance-r22-veh-b1','ACTIVE','FIN-R22-B1','2026-08-22',700,'WEEKLY',1,1,700,1500,0.50,false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at) VALUES
    (${accountA},${companyA},'R22 A','BANK',0,0,'ACTIVE',NOW(),NOW()),(${accountA2},${companyA},'R22 A2','BANK',0,0,'ACTIVE',NOW(),NOW()),
    (${inactiveA},${companyA},'R22 Inactive','BANK',0,0,'INACTIVE',NOW(),NOW()),(${accountB},${companyB},'R22 B','BANK',0,0,'ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active) VALUES
    (${methodA},${companyA},'PIX R22 A','PIX',0,true),(${methodA2},${companyA},'TED R22 A','TED',0,true),(${inactiveMethodA},${companyA},'Inactive R22','PIX',0,false),(${methodB},${companyB},'PIX R22 B','PIX',0,true) ON CONFLICT(id) DO NOTHING`);
}

async function receive(companyId:string,contractId:string,amount:number,accountId:string,methodId:string,key:string,userId=adminA,userName='R22 Admin A'){
  return await UnitOfWork.run(companyId, async tx => await DepositService.receiveSecurityDeposit(companyId,contractId,'forged-driver','forged-vehicle',amount,accountId,methodId,userId,userName,tx,key));
}
async function balance(id:string){return Number((await scalar(sql`SELECT current_balance FROM financial_accounts WHERE id=${id}`))?.current_balance||0);}
async function txCount(companyId:string,key?:string){const row=key?await scalar(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId} AND idempotency_key=${key}`):await scalar(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}`);return Number(row?.count||0);}
async function movementCount(companyId:string){return Number((await scalar(sql`SELECT count(*)::int count FROM security_deposit_movements WHERE company_id=${companyId}`))?.count||0);}
async function auditCount(companyId:string){return Number((await scalar(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${companyId} AND entity_type='SecurityDeposit' AND action='RECEIVE'`))?.count||0);}

async function run(){
  await seed();

  const first=await receive(companyA,contractA1,400,accountA,methodA,'r22-key-1');
  const afterFirstAudit=await auditCount(companyA);
  const retry=await receive(companyA,contractA1,400,accountA,methodA,'r22-key-1');
  assert(retry.movement.id===first.movement.id,'same-key retry must return original movement');
  assert(retry.deposit.receivedAmount===400,'same-key retry changed deposit received amount');
  assert(await balance(accountA)===400,'same-key retry duplicated account credit');
  assert(await txCount(companyA,'r22-key-1')===1,'same-key retry duplicated transaction');
  assert(await movementCount(companyA)===1,'same-key retry duplicated movement');
  assert(await auditCount(companyA)===afterFirstAudit,'same-key retry duplicated audit');

  await rejects(()=>receive(companyA,contractA1,300,accountA,methodA,'r22-key-1'),'Chave de idempotência reutilizada');
  await rejects(()=>receive(companyA,contractA1,400,accountA2,methodA,'r22-key-1'),'Chave de idempotência reutilizada');
  await rejects(()=>receive(companyA,contractA1,400,accountA,methodA2,'r22-key-1'),'Chave de idempotência reutilizada');
  assert(await balance(accountA)===400,'conflicting retries changed account balance');

  const intentional=await receive(companyA,contractA1,300,accountA,methodA,'r22-key-2');
  assert(intentional.deposit.receivedAmount===700,'distinct logical receipt did not advance to 700');
  assert(await balance(accountA)===700,'distinct logical receipt account balance mismatch');

  const [same1,same2]=await Promise.all([
    receive(companyA,contractA2,400,accountA,methodA,'r22-key-concurrent-same'),
    receive(companyA,contractA2,400,accountA,methodA,'r22-key-concurrent-same'),
  ]);
  assert(same1.movement.id===same2.movement.id,'concurrent same-key receipts did not converge');
  assert(await txCount(companyA,'r22-key-concurrent-same')===1,'concurrent same-key created duplicate tx');
  assert(await balance(accountA)===1100,'concurrent same-key duplicated cash');

  await Promise.all([
    receive(companyA,contractA2,300,accountA,methodA,'r22-key-distinct-a'),
    receive(companyA,contractA2,300,accountA,methodA,'r22-key-distinct-b'),
  ]);
  const depA2=await UnitOfWork.run(companyA,async tx=>await tx.getSecurityDepositRepo().findByContractId(contractA2));
  assert(depA2?.receivedAmount===1000,'concurrent distinct keys must serialize to exactly 1000');
  assert(await balance(accountA)===1700,'concurrent distinct keys account balance mismatch');
  const fullRetry=await receive(companyA,contractA2,300,accountA,methodA,'r22-key-distinct-a');
  assert(fullRetry.deposit.receivedAmount===1000,'retry after full receipt must converge before over-receipt check');
  assert(await balance(accountA)===1700,'retry after full receipt duplicated cash');

  const full=await receive(companyA,contractA3,500,accountA,methodA,'r22-key-full');
  const fullAgain=await receive(companyA,contractA3,500,accountA,methodA,'r22-key-full');
  assert(full.movement.id===fullAgain.movement.id && fullAgain.deposit.receivedAmount===500,'full receipt retry did not converge');
  assert(await balance(accountA)===2200,'full receipt retry duplicated account credit');

  const beforeInvalidTx=await txCount(companyA), beforeInvalidMov=await movementCount(companyA), beforeInvalidBal=await balance(accountA);
  await rejects(()=>receive(companyA,contractA1,100,inactiveA,methodA,'r22-inactive-account'),'Conta financeira não encontrada');
  await rejects(()=>receive(companyA,contractA1,100,accountB,methodA,'r22-foreign-account'),'Conta financeira não encontrada');
  await rejects(()=>receive(companyA,contractA1,100,accountA,inactiveMethodA,'r22-inactive-method'),'Forma de pagamento não encontrada');
  await rejects(()=>receive(companyA,contractA1,100,accountA,methodB,'r22-foreign-method'),'Forma de pagamento não encontrada');
  assert(await txCount(companyA)===beforeInvalidTx && await movementCount(companyA)===beforeInvalidMov && await balance(accountA)===beforeInvalidBal,'invalid authority attempt mutated financial state');

  await rejects(async()=>await UnitOfWork.run(companyA,async tx=>await DepositService.receiveSecurityDeposit(companyA,contractA1,'x','y',1,accountA,methodA,adminA,'R22 Admin A',tx)),'Chave de idempotência');

  const crossTenant=await receive(companyB,contractB1,200,accountB,methodB,'r22-key-1',adminB,'R22 Admin B');
  assert(crossTenant.deposit.receivedAmount===200,'cross-tenant same key must be independently valid');
  assert(await txCount(companyB,'r22-key-1')===1 && await balance(accountB)===200,'cross-tenant same key was not company-scoped');

  const today=new Date().toISOString().slice(0,10);
  const dre=await UnitOfWork.run(companyA,async tx=>await DREService.getDREReport(companyA,today,today,AccountingRegime.CASH,tx));
  assert(dre.grossRevenue.amount===0,'security deposit receipts leaked into DRE gross revenue');

  console.log('FINANCE-R22 deposit receipt idempotency integration PASS');
}

run().catch(error=>{console.error(error);process.exit(1);});
