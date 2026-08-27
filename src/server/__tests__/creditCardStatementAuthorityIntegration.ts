import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';

type QueryResult = { rows?: unknown[] } | unknown[];

function rows(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const companyA = 'card-authority-company-a';
const companyB = 'card-authority-company-b';

async function run(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies (id, name, status) VALUES
      (${companyA}, 'Card Authority A', 'ACTIVE'),
      (${companyB}, 'Card Authority B', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO financial_accounts
      (id, company_id, name, type, initial_balance, current_balance, status)
    VALUES
      ('card-account-a', ${companyA}, 'Cartão A', 'CREDIT_CARD', 0, 0, 'ACTIVE'),
      ('card-account-b', ${companyB}, 'Cartão B', 'CREDIT_CARD', 0, 0, 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `);

  await UnitOfWork.run(companyA, async (context: any) => {
    const tx = context.getRawTransaction();
    await tx.execute(sql`
      INSERT INTO credit_card_profiles
        (company_id, financial_account_id, credit_limit, closing_day, due_day, created_by)
      VALUES (${companyA}, 'card-account-a', 5000, 20, 28, 'card-test-user')
    `);
    await tx.execute(sql`
      INSERT INTO credit_card_statements
        (id, company_id, financial_account_id, cycle_ref, cycle_start, cycle_end,
         closing_date, due_date, original_amount, balance_amount, idempotency_key, created_by)
      VALUES
        ('statement-a-2026-08', ${companyA}, 'card-account-a', '2026-08',
         '2026-07-21', '2026-08-20', '2026-08-20', '2026-08-28',
         1000, 1000, 'statement-a-2026-08', 'card-test-user')
    `);
  });

  const tenantAVisible = await UnitOfWork.run(companyA, async (context: any) =>
    context.getRawTransaction().execute(sql`
      SELECT id FROM credit_card_statements ORDER BY id
    `)
  );
  assert(rows(tenantAVisible).length === 1, 'tenant A must see its statement');

  const tenantBVisible = await UnitOfWork.run(companyB, async (context: any) =>
    context.getRawTransaction().execute(sql`
      SELECT id FROM credit_card_statements ORDER BY id
    `)
  );
  assert(rows(tenantBVisible).length === 0, 'tenant B must not see tenant A statement');

  let duplicateCycleRejected = false;
  try {
    await UnitOfWork.run(companyA, async (context: any) =>
      context.getRawTransaction().execute(sql`
        INSERT INTO credit_card_statements
          (id, company_id, financial_account_id, cycle_ref, cycle_start, cycle_end,
           closing_date, due_date, original_amount, balance_amount, idempotency_key, created_by)
        VALUES
          ('statement-a-duplicate', ${companyA}, 'card-account-a', '2026-08',
           '2026-07-21', '2026-08-20', '2026-08-20', '2026-08-28',
           1000, 1000, 'statement-a-duplicate', 'card-test-user')
      `)
    );
  } catch {
    duplicateCycleRejected = true;
  }
  assert(duplicateCycleRejected, 'one statement per card and cycle must be enforced');

  let invalidBalanceRejected = false;
  try {
    await UnitOfWork.run(companyA, async (context: any) =>
      context.getRawTransaction().execute(sql`
        INSERT INTO credit_card_statements
          (id, company_id, financial_account_id, cycle_ref, cycle_start, cycle_end,
           closing_date, due_date, original_amount, balance_amount, idempotency_key, created_by)
        VALUES
          ('statement-a-invalid', ${companyA}, 'card-account-a', '2026-09',
           '2026-08-21', '2026-09-20', '2026-09-20', '2026-09-28',
           1000, 999, 'statement-a-invalid', 'card-test-user')
      `)
    );
  } catch {
    invalidBalanceRejected = true;
  }
  assert(invalidBalanceRejected, 'statement balance invariant must fail closed');

  console.log('FINANCE-CARD-1B2 persistence authority: PASS');
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
