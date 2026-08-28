import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { Client } from 'pg';

const companyA = 'finance-card-b2-company-a';
const companyB = 'finance-card-b2-company-b';
const cardAccountA = 'finance-card-b2-card-a';
const bankAccountA = 'finance-card-b2-bank-a';
const cardAccountB = 'finance-card-b2-card-b';
const methodA = 'finance-card-b2-method-a';
const rlsTestRole = 'autoerp_card_b2_rls_test';
const rlsTestPassword = 'autoerp-card-b2-rls-password';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rows(query: any): Promise<any[]> {
  const result: any = await db.execute(query);
  return result.rows || [];
}

async function expectFailure(action: () => Promise<unknown>, message: string): Promise<void> {
  let failed = false;
  try {
    await action();
  } catch {
    failed = true;
  }
  assert(failed, message);
}

async function testRlsNonSuperuser(): Promise<void> {
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${rlsTestRole}`));
  await db.execute(sql.raw(`CREATE ROLE ${rlsTestRole} LOGIN PASSWORD '${rlsTestPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${rlsTestRole}`));
  await db.execute(sql.raw(`GRANT SELECT, INSERT ON credit_card_profiles TO ${rlsTestRole}`));

  const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');
  const client = new Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.slice(1),
    user: rlsTestRole,
    password: rlsTestPassword,
  });
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant',$1,false)`, [companyA]);
    const tenantA = await client.query('SELECT id, company_id FROM credit_card_profiles ORDER BY id');
    assert(tenantA.rows.length === 1 && tenantA.rows[0].id === 'card-b2-profile-a',
      'FORCE RLS must expose only tenant A credit-card profile');

    await client.query(`SELECT set_config('app.current_tenant',$1,false)`, [companyB]);
    const tenantB = await client.query('SELECT id, company_id FROM credit_card_profiles ORDER BY id');
    assert(tenantB.rows.length === 1 && tenantB.rows[0].id === 'card-b2-profile-b',
      'FORCE RLS must expose only tenant B credit-card profile');

    let crossTenantRejected = false;
    try {
      await client.query(
        `INSERT INTO credit_card_profiles(
          id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id
        ) VALUES ($1,$2,$3,1000,10,20,true,1,$4,$4)`,
        ['card-b2-profile-cross', companyA, cardAccountA, 'card-b2-rls-user'],
      );
    } catch (error: any) {
      crossTenantRejected = String(error?.code || '') === '42501'
        || String(error?.message || '').toLowerCase().includes('row-level security');
    }
    assert(crossTenantRejected, 'FORCE RLS must reject cross-tenant card profile insert');
  } finally {
    await client.end();
    await db.execute(sql.raw(`DROP OWNED BY ${rlsTestRole}`));
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${rlsTestRole}`));
  }
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM credit_card_statement_payments WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statement_items WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_statements WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM credit_card_profiles WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_transactions WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM payment_methods WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
    (${companyA},'Card B2 A','ACTIVE',NOW(),NOW()),
    (${companyB},'Card B2 B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO payment_methods(id,company_id,name,type,active) VALUES
    (${methodA},${companyA},'PIX','PIX',true)`);
  await db.execute(sql`INSERT INTO financial_accounts(
    id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at
  ) VALUES
    (${cardAccountA},${companyA},'Card A','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW()),
    (${bankAccountA},${companyA},'Bank A','BANK',1000,1000,'ACTIVE',NOW(),NOW()),
    (${cardAccountB},${companyB},'Card B','CREDIT_CARD',0,0,'ACTIVE',NOW(),NOW())`);

  await db.execute(sql`INSERT INTO financial_transactions(
    id,company_id,financial_account_id,destination_account_id,type,amount,payment_method_id,
    transaction_date,competence_date,description,is_reversed,created_by_id,created_at,updated_at
  ) VALUES
    ('card-b2-purchase',${companyA},${cardAccountA},NULL,'EXPENSE',300,${methodA},'2026-08-10','2026-08-10','Card purchase',false,'card-b2-user',NOW(),NOW()),
    ('card-b2-payment',${companyA},${bankAccountA},${cardAccountA},'TRANSFER',200,${methodA},'2026-08-25','2026-08-25','Statement payment',false,'card-b2-user',NOW(),NOW()),
    ('card-b2-not-transfer',${companyA},${bankAccountA},NULL,'EXPENSE',50,${methodA},'2026-08-25','2026-08-25','Not a statement payment',false,'card-b2-user',NOW(),NOW())`);
}

async function run(): Promise<void> {
  await seed();

  await UnitOfWork.run(companyA, async (txContext: any) => {
    const tx = txContext.getRawTransaction();
    await db.execute(sql`INSERT INTO credit_card_profiles(
      id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id
    ) VALUES ('card-b2-profile-a',${companyA},${cardAccountA},5000,20,27,true,1,'card-b2-user','card-b2-user')`);

    await expectFailure(
      () => db.execute(sql`INSERT INTO credit_card_profiles(
        id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id
      ) VALUES ('card-b2-profile-bank',${companyA},${bankAccountA},5000,20,27,true,1,'card-b2-user','card-b2-user')`),
      'profile must reject a non-CREDIT_CARD financial account'
    );

    await db.execute(sql`INSERT INTO credit_card_statements(
      id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,
      original_amount,adjustment_amount,interest_amount,fine_amount,discount_amount,paid_amount,balance_amount,
      version,created_by_id,updated_by_id
    ) VALUES ('card-b2-statement-a',${companyA},'card-b2-profile-a','2026-08','2026-08-20','2026-08-27','OPEN',
      300,0,0,0,0,0,300,1,'card-b2-user','card-b2-user')`);

    await expectFailure(
      () => db.execute(sql`INSERT INTO credit_card_statements(
        id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,
        original_amount,balance_amount,version,created_by_id,updated_by_id
      ) VALUES ('card-b2-statement-duplicate',${companyA},'card-b2-profile-a','2026-08','2026-08-20','2026-08-27','OPEN',300,300,1,'card-b2-user','card-b2-user')`),
      'one statement per company+card+cycle must be enforced'
    );

    await db.execute(sql`INSERT INTO credit_card_statement_items(
      id,company_id,statement_id,financial_transaction_id,original_amount,adjustment_amount,final_amount,created_by_id
    ) VALUES ('card-b2-item-a',${companyA},'card-b2-statement-a','card-b2-purchase',300,0,300,'card-b2-user')`);

    await expectFailure(
      () => db.execute(sql`INSERT INTO credit_card_statement_items(
        id,company_id,statement_id,financial_transaction_id,original_amount,adjustment_amount,final_amount,created_by_id
      ) VALUES ('card-b2-item-duplicate',${companyA},'card-b2-statement-a','card-b2-purchase',300,0,300,'card-b2-user')`),
      'a financial transaction must not belong to two statement items'
    );

    const beforeClose = Number((await rows(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyA}`))[0].count);
    await db.execute(sql`UPDATE credit_card_statements
      SET status='CLOSED',closed_at=NOW(),closed_by_id='card-b2-user',updated_at=NOW(),version=version+1
      WHERE id='card-b2-statement-a'`);
    const afterClose = Number((await rows(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyA}`))[0].count);
    assert(beforeClose === afterClose, 'closing a statement must not create a FinancialTransaction');

    await db.execute(sql`INSERT INTO credit_card_statement_payments(
      id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id
    ) VALUES ('card-b2-payment-link',${companyA},'card-b2-statement-a','card-b2-payment',200,'card-b2-pay-key','card-b2-user')`);

    await expectFailure(
      () => db.execute(sql`INSERT INTO credit_card_statement_payments(
        id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id
      ) VALUES ('card-b2-invalid-payment',${companyA},'card-b2-statement-a','card-b2-not-transfer',50,'card-b2-invalid-key','card-b2-user')`),
      'statement payment must reference an existing TRANSFER into the card account'
    );

    const paymentTransaction = (await rows(sql`SELECT type,destination_account_id FROM financial_transactions WHERE id='card-b2-payment'`))[0];
    assert(paymentTransaction.type === 'TRANSFER' && paymentTransaction.destination_account_id === cardAccountA,
      'statement payment link must preserve authoritative TRANSFER semantics');
  });

  await UnitOfWork.run(companyB, async (txContext: any) => {
    const tx = txContext.getRawTransaction();
    await db.execute(sql`INSERT INTO credit_card_profiles(
      id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id
    ) VALUES ('card-b2-profile-b',${companyB},${cardAccountB},3000,15,22,true,1,'card-b2-user-b','card-b2-user-b')`);
  });

  await testRlsNonSuperuser();

  console.log('FINANCE-CARD-1B2 credit-card persistence PostgreSQL integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
