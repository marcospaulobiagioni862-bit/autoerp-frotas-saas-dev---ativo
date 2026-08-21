import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { DepositService } from '../../domain/finance/DepositService';
import { SecurityDepositStatus } from '../../types/enums';

const companyA = 'finance-r4-company-a';
const companyB = 'finance-r4-company-b';
const adminA = 'finance-r4-admin-a';
const adminB = 'finance-r4-admin-b';
const accountA = 'finance-r4-account-a';
const accountB = 'finance-r4-account-b';
const paymentA = 'finance-r4-payment-a';
const paymentB = 'finance-r4-payment-b';
const contractA1 = 'finance-r4-contract-a1';
const contractA2 = 'finance-r4-contract-a2';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function rejects(fn: () => Promise<unknown>, contains: string): Promise<void> {
  let message = '';
  try {
    await fn();
  } catch (error) {
    message = String(error);
  }
  assert(message.includes(contains), `expected rejection containing ${contains}, got ${message || 'no rejection'}`);
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at)
    VALUES
      (${companyA},'Finance R4 A','ACTIVE',NOW(),NOW()),
      (${companyB},'Finance R4 B','ACTIVE',NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES
      (${adminA},${companyA},'Finance R4 Admin A','finance-r4-a@example.test','ADMIN',true,NOW(),NOW()),
      (${adminB},${companyB},'Finance R4 Admin B','finance-r4-b@example.test','ADMIN',true,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO vehicles(id,company_id,plate,renavam,status,is_archived,created_at,updated_at)
    VALUES
      ('finance-r4-veh-a1',${companyA},'R4A1A01','R4RENAVAMA1','RENTED',false,NOW(),NOW()),
      ('finance-r4-veh-a2',${companyA},'R4A2A02','R4RENAVAMA2','RENTED',false,NOW(),NOW()),
      ('finance-r4-veh-b1',${companyB},'R4B1B01','R4RENAVAMB1','RENTED',false,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO drivers(id,company_id,name,cpf,cnh,active,cnh_expiration,status,app_platforms,is_archived,created_at,updated_at)
    VALUES
      ('finance-r4-drv-a1',${companyA},'Finance R4 Driver A1','39053344705','11111111111',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW()),
      ('finance-r4-drv-a2',${companyA},'Finance R4 Driver A2','52998224725','22222222222',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW()),
      ('finance-r4-drv-b1',${companyB},'Finance R4 Driver B1','11144477735','33333333333',true,'2035-01-01','ACTIVE',ARRAY['Uber'],false,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO contracts(
      id,company_id,driver_id,vehicle_id,status,contract_number,start_date,rental_amount,
      billing_periodicity,billing_due_day_of_week,billing_due_day_of_month,security_deposit_amount,
      franchise_km,excess_km_rate,is_archived,created_at,updated_at
    ) VALUES
      (${contractA1},${companyA},'finance-r4-drv-a1','finance-r4-veh-a1','ACTIVE','FIN-R4-A1','2026-08-21',700,'WEEKLY',1,1,1000,1500,0.50,false,NOW(),NOW()),
      (${contractA2},${companyA},'finance-r4-drv-a2','finance-r4-veh-a2','ACTIVE','FIN-R4-A2','2026-08-21',700,'WEEKLY',1,1,500,1500,0.50,false,NOW(),NOW()),
      ('finance-r4-contract-b1',${companyB},'finance-r4-drv-b1','finance-r4-veh-b1','ACTIVE','FIN-R4-B1','2026-08-21',700,'WEEKLY',1,1,800,1500,0.50,false,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at)
    VALUES
      (${accountA},${companyA},'Conta R4 A','BANK',0,0,'ACTIVE',NOW(),NOW()),
      (${accountB},${companyB},'Conta R4 B','BANK',0,0,'ACTIVE',NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active)
    VALUES
      (${paymentA},${companyA},'PIX R4 A','PIX',0,true),
      (${paymentB},${companyB},'PIX R4 B','PIX',0,true)
    ON CONFLICT(id) DO NOTHING
  `);
}

async function run(): Promise<void> {
  await seed();

  const first = await UnitOfWork.run(companyA, async (tx) =>
    await DepositService.receiveSecurityDeposit(
      companyA,
      contractA1,
      'finance-r4-drv-b1',
      'finance-r4-veh-b1',
      300,
      accountA,
      paymentA,
      adminA,
      'Finance R4 Admin A',
      tx
    )
  );

  assert(first.deposit.originalAmount === 1000, `canonical principal expected 1000, got ${first.deposit.originalAmount}`);
  assert(first.deposit.receivedAmount === 300, `partial receipt expected 300, got ${first.deposit.receivedAmount}`);
  assert(first.deposit.status === SecurityDepositStatus.PENDING, `partial receipt expected PENDING, got ${first.deposit.status}`);
  assert(first.deposit.driverId === 'finance-r4-drv-a1', 'forged driver leaked into deposit');
  assert(first.deposit.vehicleId === 'finance-r4-veh-a1', 'forged vehicle leaked into deposit');
  assert(first.movement.amount === 300, 'partial movement amount mismatch');

  const afterFirst = await scalar(sql`
    SELECT current_balance FROM financial_accounts WHERE id=${accountA}
  `);
  assert(Number(afterFirst?.current_balance) === 300, `account balance after partial expected 300, got ${afterFirst?.current_balance}`);

  const second = await UnitOfWork.run(companyA, async (tx) =>
    await DepositService.receiveSecurityDeposit(
      companyA,
      contractA1,
      'ignored-driver',
      'ignored-vehicle',
      700,
      accountA,
      paymentA,
      adminA,
      'Finance R4 Admin A',
      tx
    )
  );
  assert(second.deposit.originalAmount === 1000, 'principal changed after final receipt');
  assert(second.deposit.receivedAmount === 1000, `final received expected 1000, got ${second.deposit.receivedAmount}`);
  assert(second.deposit.status === SecurityDepositStatus.RECEIVED, `final receipt expected RECEIVED, got ${second.deposit.status}`);

  const txCountBeforeOver = Number((await scalar(sql`
    SELECT count(*)::int AS count FROM financial_transactions
    WHERE company_id=${companyA} AND description LIKE ${`Recebimento de Caução (Contrato: ${contractA1})%`}
  `))?.count || 0);
  const movementCountBeforeOver = Number((await scalar(sql`
    SELECT count(*)::int AS count FROM security_deposit_movements
    WHERE company_id=${companyA} AND deposit_id=${second.deposit.id}
  `))?.count || 0);
  const balanceBeforeOver = Number((await scalar(sql`SELECT current_balance FROM financial_accounts WHERE id=${accountA}`))?.current_balance || 0);

  await rejects(
    () => UnitOfWork.run(companyA, async (tx) =>
      await DepositService.receiveSecurityDeposit(
        companyA, contractA1, 'ignored', 'ignored', 0.01, accountA, paymentA, adminA, 'Finance R4 Admin A', tx
      )
    ),
    'excede o saldo'
  );

  const txCountAfterOver = Number((await scalar(sql`
    SELECT count(*)::int AS count FROM financial_transactions
    WHERE company_id=${companyA} AND description LIKE ${`Recebimento de Caução (Contrato: ${contractA1})%`}
  `))?.count || 0);
  const movementCountAfterOver = Number((await scalar(sql`
    SELECT count(*)::int AS count FROM security_deposit_movements
    WHERE company_id=${companyA} AND deposit_id=${second.deposit.id}
  `))?.count || 0);
  const balanceAfterOver = Number((await scalar(sql`SELECT current_balance FROM financial_accounts WHERE id=${accountA}`))?.current_balance || 0);
  assert(txCountAfterOver === txCountBeforeOver, 'over-receipt created a financial transaction');
  assert(movementCountAfterOver === movementCountBeforeOver, 'over-receipt created a deposit movement');
  assert(balanceAfterOver === balanceBeforeOver, 'over-receipt changed account balance');

  await rejects(
    () => UnitOfWork.run(companyA, async (tx) =>
      await DepositService.receiveSecurityDeposit(
        companyA, contractA2, 'ignored', 'ignored', 100, accountB, paymentA, adminA, 'Finance R4 Admin A', tx
      )
    ),
    'Conta financeira não encontrada'
  );
  await rejects(
    () => UnitOfWork.run(companyA, async (tx) =>
      await DepositService.receiveSecurityDeposit(
        companyA, contractA2, 'ignored', 'ignored', 100, accountA, paymentB, adminA, 'Finance R4 Admin A', tx
      )
    ),
    'Forma de pagamento não encontrada'
  );
  await rejects(
    () => UnitOfWork.run(companyA, async (tx) =>
      await DepositService.receiveSecurityDeposit(
        companyA, 'finance-r4-contract-b1', 'ignored', 'ignored', 100, accountA, paymentA, adminA, 'Finance R4 Admin A', tx
      )
    ),
    'Contrato não encontrado'
  );

  const rolledBackDeposit = await scalar(sql`
    SELECT count(*)::int AS count FROM security_deposits WHERE company_id=${companyA} AND contract_id=${contractA2}
  `);
  assert(Number(rolledBackDeposit?.count) === 0, 'failed cross-tenant settlement left a deposit row');

  console.log('FINANCE-R4 security deposit authority integration PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});