import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';

const companyA = 'finance-card-b2-company-a';
const companyB = 'finance-card-b2-company-b';
const cardAccountA = 'finance-card-b2-card-a';
const bankAccountA = 'finance-card-b2-bank-a';
const cardAccountB = 'finance-card-b2-card-b';
const methodA = 'finance-card-b2-method-a';
const rlsTestRole = 'autoerp_card_b2_rls_test';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rows(query: any): Promise<any[]> {
  const result: any = await db.execute(query);
  return result.rows || [];
}

async function txRows(tx: any, query: any): Promise<any[]> {
  const result: any = await tx.execute(query);
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

async function ensureRlsTestRole(): Promise<void> {
  await db.execute(sql.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${rlsTestRole}') THEN
        CREATE ROLE ${rlsTestRole} NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF;
    END
    $$
  `));
  await db.execute(sql.raw(`ALTER ROLE ${rlsTestRole} NOLOGIN NOSUPERUSER NOBYPASSRLS`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${rlsTestRole}`));
  await db.execute(sql.raw(`GRANT SELECT ON credit_card_profiles TO ${rlsTestRole}`));

  const roleRows = await rows(sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=${rlsTestRole}`);
  assert(
    roleRows.length === 1 && roleRows[0].rolsuper === false && roleRows[0].rolbypassrls === false,
    'RLS regression role must not be superuser or BYPASSRLS'
  );
}

async function rlsVisibleProfiles(tx: any): Promise<any[]> {
  await tx.execute(sql.raw(`SET LOCAL ROLE ${rlsTestRole}`));
  try {
    return await txRows(tx, sql`SELECT id FROM credit_card_profiles ORDER BY id`);
  } finally {
    await tx.execute(sql.raw('RESET ROLE'));
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
    ('card-b2-payment-200',${companyA},${bankAccountA},${cardAccountA},'TRANSFER',200,${methodA},'2026-08-25','2026-08-25','Partial statement payment',false,'card-b2-user',NOW(),NOW()),
    ('card-b2-payment-100',${companyA},${bankAccountA},${cardAccountA},'TRANSFER',100,${methodA},'2026-08-26','2026-08-26','Final statement payment',false,'card-b2-user',NOW(),NOW()),
    ('card-b2-payment-over',${companyA},${bankAccountA},${cardAccountA},'TRANSFER',400,${methodA},'2026-08-25','2026-08-25','Over statement payment',false,'card-b2-user',NOW(),NOW()),
    ('card-b2-not-transfer',${companyA},${bankAccountA},NULL,'EXPENSE',50,${methodA},'2026-08-25','2026-08-25','Not a statement payment',false,'card-b2-user',NOW(),NOW())`);
}

async function run(): Promise<void> {
  await seed();
  await ensureRlsTestRole();

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

    await expectFailure(
      () => db.execute(sql`INSERT INTO credit_card_statement_payments(
        id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id
      ) VALUES ('card-b2-overpayment',${companyA},'card-b2-statement-a','card-b2-payment-over',400,'card-b2-overpayment-key','card-b2-user')`),
      'statement payment must reject a transfer above the authoritative balance'
    );

    await db.execute(sql`INSERT INTO credit_card_statement_payments(
      id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id
    ) VALUES ('card-b2-payment-link-200',${companyA},'card-b2-statement-a','card-b2-payment-200',200,'card-b2-pay-200-key','card-b2-user')`);
    await db.execute(sql`UPDATE credit_card_statements
      SET status='PARTIALLY_PAID',paid_amount=200,balance_amount=100,updated_at=NOW(),version=version+1
      WHERE id='card-b2-statement-a'`);

    await expectFailure(
      () => db.execute(sql`INSERT INTO credit_card_statement_payments(
        id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id
      ) VALUES ('card-b2-invalid-payment',${companyA},'card-b2-statement-a','card-b2-not-transfer',50,'card-b2-invalid-key','card-b2-user')`),
      'statement payment must reference an existing TRANSFER into the card account'
    );

    await db.execute(sql`INSERT INTO credit_card_statement_payments(
      id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id
    ) VALUES ('card-b2-payment-link-100',${companyA},'card-b2-statement-a','card-b2-payment-100',100,'card-b2-pay-100-key','card-b2-user')`);
    await db.execute(sql`UPDATE credit_card_statements
      SET status='PAID',paid_amount=300,balance_amount=0,updated_at=NOW(),version=version+1
      WHERE id='card-b2-statement-a'`);

    const payments = (await rows(sql`SELECT count(*)::int AS count, COALESCE(sum(amount),0)::numeric AS total
      FROM credit_card_statement_payments WHERE company_id=${companyA} AND statement_id='card-b2-statement-a'`))[0];
    assert(Number(payments.count) === 2 && Number(payments.total) === 300,
      'partial and final payments must settle the statement exactly once');

    const paymentTransaction = (await rows(sql`SELECT type,destination_account_id FROM financial_transactions WHERE id='card-b2-payment-200'`))[0];
    assert(paymentTransaction.type === 'TRANSFER' && paymentTransaction.destination_account_id === cardAccountA,
      'statement payment link must preserve authoritative TRANSFER semantics');

    const visibleProfiles = await rlsVisibleProfiles(tx);
    assert(visibleProfiles.length === 1 && visibleProfiles[0].id === 'card-b2-profile-a',
      'tenant A must only see its own credit-card profile');
  });

  await UnitOfWork.run(companyB, async (txContext: any) => {
    const tx = txContext.getRawTransaction();
    await db.execute(sql`INSERT INTO credit_card_profiles(
      id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id
    ) VALUES ('card-b2-profile-b',${companyB},${cardAccountB},3000,15,22,true,1,'card-b2-user-b','card-b2-user-b')`);
    const visibleProfiles = await rlsVisibleProfiles(tx);
    assert(visibleProfiles.length === 1 && visibleProfiles[0].id === 'card-b2-profile-b',
      'FORCE RLS must isolate tenant B from tenant A card profiles');
  });

  console.log('FINANCE-CARD-1B2 credit-card persistence PostgreSQL integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
