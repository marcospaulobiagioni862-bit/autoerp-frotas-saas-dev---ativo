import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';

const companyA = 'auth-001-company-a';
const companyB = 'auth-001-company-b';
const accountA = 'auth-001-account-a';
const accountB = 'auth-001-account-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function cleanup(): Promise<void> {
  await db.execute(sql`DELETE FROM financial_accounts WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);
}

async function seed(): Promise<void> {
  await cleanup();
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
      (${companyA},'AUTH 001 A','ACTIVE',NOW(),NOW()),
      (${companyB},'AUTH 001 B','ACTIVE',NOW(),NOW())
  `);
  await db.execute(sql`
    INSERT INTO financial_accounts(
      id,company_id,name,type,initial_balance,current_balance,status,created_at,updated_at
    ) VALUES
      (${accountA},${companyA},'Conta A','BANK',0,0,'ACTIVE',NOW(),NOW()),
      (${accountB},${companyB},'Conta B','BANK',0,0,'ACTIVE',NOW(),NOW())
  `);
}

async function run(): Promise<void> {
  await seed();
  try {
    await UnitOfWork.run(companyA, async (tx: any) => {
      const repo = tx.getAccountRepo();

      assert(await repo.findById(accountB) === null, 'findById exposed another tenant');
      assert((await repo.findAll()).every((item: any) => item.companyId === companyA), 'findAll exposed another tenant');
      assert(await repo.count() === 1, 'count included another tenant');

      assert(await repo.findByIdWithLock(accountB) === undefined, 'findByIdWithLock exposed another tenant');
      const lockedAccounts = await repo.lockTwoAccounts(accountA, accountB);
      assert(lockedAccounts[0]?.id === accountA, 'lockTwoAccounts did not return the same-tenant account');
      assert(lockedAccounts[1] === undefined, 'lockTwoAccounts exposed another tenant');

      let blockedBalanceUpdate = false;
      try {
        await repo.updateBalance(accountB, 100);
      } catch (error) {
        blockedBalanceUpdate = error instanceof Error
          && error.message === 'Account not found or update failed';
      }
      assert(blockedBalanceUpdate, 'updateBalance changed another tenant');
      const updatedOwnAccount = await repo.updateBalance(accountA, 7);
      assert(Number(updatedOwnAccount.current_balance) === 7, 'updateBalance failed for the current tenant');

      const crossUpdate = await repo.update(accountB, { name: 'ALTERADA POR A' });
      assert(!crossUpdate, 'update changed another tenant');
      assert(await repo.delete(accountB) === false, 'delete removed another tenant');

      let blockedCreate = false;
      try {
        await repo.create({
          id: 'auth-001-forged-account',
          companyId: companyB,
          name: 'Forjada',
          type: 'BANK',
          initialBalance: '0',
          currentBalance: '0',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        blockedCreate = true;
      }
      assert(blockedCreate, 'create accepted a browser-forged tenant');
    });

    const verification: any = await db.execute(sql`
      SELECT id, name, current_balance
      FROM financial_accounts
      WHERE id IN (${accountA}, ${accountB})
      ORDER BY id
    `);
    const verifiedAccountA = verification.rows?.find((row: any) => row.id === accountA);
    const verifiedAccountB = verification.rows?.find((row: any) => row.id === accountB);
    assert(Number(verifiedAccountA?.current_balance) === 7, 'same-tenant balance update was not persisted');
    assert(verifiedAccountB?.name === 'Conta B', 'tenant B record was modified');
    assert(Number(verifiedAccountB?.current_balance) === 0, 'tenant B balance was modified');
    console.log('AUTH-001/AUTH-002A tenant-scoped financial accounts: PASS');
  } finally {
    await cleanup();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
