import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { TransferService } from '../../domain/finance/TransferService';
import { ReversalService } from '../../domain/finance/ReversalService';

const companyA = 'finance-r19-company-a';
const companyB = 'finance-r19-company-b';
const adminA = 'finance-r19-admin-a';
const adminB = 'finance-r19-admin-b';
const paymentMethodA = 'finance-r19-pm-a';
const paymentMethodInactive = 'finance-r19-pm-inactive';
const paymentMethodB = 'finance-r19-pm-b';

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

async function seedAccount(
  id: string,
  companyId: string,
  balance: number,
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'
): Promise<void> {
  await db.execute(sql`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at)
    VALUES(${id},${companyId},${id},'BANK',${balance},${balance},${status},NOW(),NOW())`);
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM financial_transactions WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_periods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM payment_methods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
    (${companyA},'Finance R19 A','ACTIVE',NOW(),NOW()),
    (${companyB},'Finance R19 B','ACTIVE',NOW(),NOW())`);

  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'R19 Admin A','r19-admin-a@example.test','ADMIN',true,NOW(),NOW()),
    (${adminB},${companyB},'R19 Admin B','r19-admin-b@example.test','ADMIN',true,NOW(),NOW())`);

  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active) VALUES
    (${paymentMethodA},${companyA},'PIX R19 A','PIX',0,true),
    (${paymentMethodInactive},${companyA},'Inactive R19','PIX',0,false),
    (${paymentMethodB},${companyB},'PIX R19 B','PIX',0,true)`);

  for (const [id, balance, status] of [
    ['r19-source', 1000, 'ACTIVE'],
    ['r19-dest', 100, 'ACTIVE'],
    ['r19-source-2', 700, 'ACTIVE'],
    ['r19-dest-2', 300, 'ACTIVE'],
    ['r19-opposite-a', 1000, 'ACTIVE'],
    ['r19-opposite-b', 100, 'ACTIVE'],
    ['r19-inactive', 500, 'INACTIVE'],
    ['r19-closed-source', 500, 'ACTIVE'],
    ['r19-closed-dest', 100, 'ACTIVE'],
  ] as Array<[string, number, 'ACTIVE' | 'INACTIVE']>) {
    await seedAccount(id, companyA, balance, status);
  }

  await seedAccount('r19-b-source', companyB, 400);
  await seedAccount('r19-b-dest', companyB, 50);

  await db.execute(sql`INSERT INTO financial_periods(id,company_id,year,month,start_date,end_date,status,closed_at,closed_by)
    VALUES('r19-closed-period',${companyA},2026,7,'2026-07-01','2026-07-31','CLOSED',NOW(),${adminA})`);
}

function transfer(input: {
  companyId?: string;
  source: string;
  dest: string;
  amount: number;
  key: string;
  date?: string;
  method?: string;
  description?: string;
}) {
  const targetCompany = input.companyId || companyA;
  const userId = targetCompany === companyA ? adminA : adminB;
  const userName = targetCompany === companyA ? 'R19 Admin A' : 'R19 Admin B';
  const method = input.method || (targetCompany === companyA ? paymentMethodA : paymentMethodB);

  return UnitOfWork.run(
    targetCompany,
    (tx) => TransferService.transferFunds({
      companyId: targetCompany,
      sourceAccountId: input.source,
      destinationAccountId: input.dest,
      amount: input.amount,
      transferDate: input.date || '2026-08-22',
      paymentMethodId: method,
      description: input.description || 'R19 transfer',
      idempotencyKey: input.key,
      userId,
      userName,
    }, tx),
    { financialPeriodLock: 'SHARED' }
  );
}

async function balance(companyId: string, id: string): Promise<number> {
  const row = await scalar(sql`SELECT current_balance FROM financial_accounts WHERE company_id=${companyId} AND id=${id}`);
  return Number(row?.current_balance || 0);
}

async function txCount(companyId: string, key: string): Promise<number> {
  const row = await scalar(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyId} AND idempotency_key=${key}`);
  return Number(row?.count || 0);
}

async function run(): Promise<void> {
  await seed();

  const concurrent = await Promise.all([
    transfer({ source: 'r19-source', dest: 'r19-dest', amount: 100, key: 'r19-same-key' }),
    transfer({ source: 'r19-source', dest: 'r19-dest', amount: 100, key: 'r19-same-key' }),
  ]);
  assert(concurrent[0].id === concurrent[1].id, 'concurrent identical-key transfers must converge');
  assert(await txCount(companyA, 'r19-same-key') === 1, 'identical-key concurrency created duplicate transaction');
  assert(
    await balance(companyA, 'r19-source') === 900 && await balance(companyA, 'r19-dest') === 200,
    'identical-key concurrency moved cash twice'
  );

  const lostFirst = await transfer({ source: 'r19-source-2', dest: 'r19-dest-2', amount: 50, key: 'r19-lost-response' });
  const lostRetry = await transfer({ source: 'r19-source-2', dest: 'r19-dest-2', amount: 50, key: 'r19-lost-response' });
  assert(lostFirst.id === lostRetry.id, 'lost-response retry must return original transfer');
  assert(
    await balance(companyA, 'r19-source-2') === 650 && await balance(companyA, 'r19-dest-2') === 350,
    'lost-response retry moved cash twice'
  );
  await rejects(
    () => transfer({ source: 'r19-source-2', dest: 'r19-dest-2', amount: 60, key: 'r19-lost-response' }),
    'Chave de idempotência reutilizada'
  );
  assert(await balance(companyA, 'r19-source-2') === 650, 'conflicting retry changed balance');

  await transfer({ source: 'r19-source-2', dest: 'r19-dest-2', amount: 10, key: 'r19-intent-a' });
  await transfer({ source: 'r19-source-2', dest: 'r19-dest-2', amount: 10, key: 'r19-intent-b' });
  assert(
    await txCount(companyA, 'r19-intent-a') === 1 && await txCount(companyA, 'r19-intent-b') === 1,
    'different keys must create intentional distinct transfers'
  );

  const opposite = await Promise.all([
    transfer({ source: 'r19-opposite-a', dest: 'r19-opposite-b', amount: 50, key: 'r19-opposite-1' }),
    transfer({ source: 'r19-opposite-b', dest: 'r19-opposite-a', amount: 30, key: 'r19-opposite-2' }),
  ]);
  assert(opposite.length === 2, 'opposite-direction transfers must complete');
  assert(
    await balance(companyA, 'r19-opposite-a') === 980 && await balance(companyA, 'r19-opposite-b') === 120,
    'opposite-direction balances corrupted'
  );

  await rejects(
    () => transfer({ source: 'r19-inactive', dest: 'r19-dest', amount: 1, key: 'r19-inactive-source' }),
    'inativa'
  );
  await rejects(
    () => transfer({ source: 'r19-source', dest: 'r19-inactive', amount: 1, key: 'r19-inactive-dest' }),
    'inativa'
  );
  await rejects(
    () => transfer({ source: 'r19-source', dest: 'r19-dest', amount: 1, key: 'r19-inactive-method', method: paymentMethodInactive }),
    'inativa'
  );
  await rejects(
    () => transfer({ source: 'r19-source', dest: 'r19-b-dest', amount: 1, key: 'r19-foreign-account' }),
    'não encontrada'
  );
  await rejects(
    () => transfer({ source: 'r19-source', dest: 'r19-dest', amount: 1, key: 'r19-foreign-method', method: paymentMethodB }),
    'não encontrada'
  );
  await rejects(
    () => transfer({ source: 'r19-closed-source', dest: 'r19-closed-dest', amount: 1, key: 'r19-closed', date: '2026-07-15' }),
    'fechado'
  );

  const tenantA = await transfer({ source: 'r19-source', dest: 'r19-dest', amount: 5, key: 'r19-shared-opaque' });
  const tenantB = await transfer({ companyId: companyB, source: 'r19-b-source', dest: 'r19-b-dest', amount: 5, key: 'r19-shared-opaque' });
  assert(
    tenantA.companyId === companyA && tenantB.companyId === companyB && tenantA.id !== tenantB.id,
    'same opaque key must be reusable across tenants only'
  );

  const reversalOriginal = await transfer({ source: 'r19-source', dest: 'r19-dest', amount: 20, key: 'r19-reversal-transfer' });
  const reverse = () => UnitOfWork.run(
    companyA,
    (tx) => ReversalService.reverseTransaction(
      companyA,
      reversalOriginal.id,
      20,
      'R19 reversal regression',
      adminA,
      'R19 Admin A',
      tx,
      'r19-reversal-key'
    ),
    { financialPeriodLock: 'SHARED' }
  );
  const revA = await reverse();
  const revB = await reverse();
  assert(revA.id === revB.id, 'FINANCE-R18 transfer reversal retry must remain idempotent');

  const audit = await scalar(sql`SELECT count(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_id=${concurrent[0].id}`);
  assert(Number(audit?.count || 0) === 1, 'one logical transfer must be audited exactly once');

  console.log('FINANCE-R19 transfer concurrency/idempotency PostgreSQL integration: PASS');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
