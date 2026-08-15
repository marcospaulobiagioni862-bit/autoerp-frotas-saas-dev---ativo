import { db } from '../src/db/index';
import { UnitOfWork } from '../src/db/uow';
import { users, auditLogs, accountReceivables, financialTransactions, financialAccounts } from '../src/db/schema';
import { sql } from 'drizzle-orm';
import { FinanceEngine } from '../src/domain/finance/FinanceEngine';

async function runTests() {
  let passed = 0;
  let failed = 0;
  
  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  };

  const assertThrows = async (promise: Promise<any>, msg: string, errIncludes?: string) => {
    try {
      await promise;
      console.error(`[FAIL] Expected error but succeeded: ${msg}`);
      failed++;
    } catch (e: any) {
      if (errIncludes && !e.message.includes(errIncludes)) {
        console.error(`[FAIL] ${msg}. Expected error containing '${errIncludes}', got '${e.message}'`);
        failed++;
      } else {
        console.log(`[PASS] ${msg}`);
        passed++;
      }
    }
  };

  try {
    // Inject REAL UOW into the REAL FinanceEngine!
    FinanceEngine.uowRunner = UnitOfWork.run;
    
    // Preparation
    await UnitOfWork.run('tenant-X', async (tx) => {
      // Clear data
      await tx.execute(sql`DELETE FROM financial_transactions`);
      await tx.execute(sql`DELETE FROM account_receivables`);
      await tx.execute(sql`DELETE FROM financial_accounts`);
      await tx.execute(sql`DELETE FROM audit_logs`);
      
      // Insert Accounts
      await tx.execute(sql`INSERT INTO financial_accounts (id, company_id, name, type, status, initial_balance, current_balance) VALUES ('acc1', 'tenant-X', 'Acc1', 'CHECKING', 'ACTIVE', '100', '100')`);
      await tx.execute(sql`INSERT INTO financial_accounts (id, company_id, name, type, status, initial_balance, current_balance) VALUES ('acc2', 'tenant-X', 'Acc2', 'CHECKING', 'ACTIVE', '50', '50')`);
      
      // Insert Receivable
      await tx.execute(sql`INSERT INTO account_receivables (id, company_id, origin_type, origin_id, category_id, description, original_amount, discount_amount, fine_amount, interest_amount, updated_amount, paid_amount, balance_amount, due_date, competence_date, status) VALUES ('rec1', 'tenant-X', 'MANUAL', 'o1', 'cat1', 'desc', '50', '0', '0', '0', '50', '0', '50', NOW(), NOW(), 'PENDING')`);
    });

    // 1. REAL_RECEIPT_POSTGRES_ACID (COMMIT)
    await FinanceEngine.registerReceipt({
      companyId: 'tenant-X',
      obligationId: 'rec1',
      financialAccountId: 'acc1',
      paymentMethodId: 'pm1',
      paymentAmount: 20,
      paymentDate: new Date().toISOString(),
      userId: 'u1',
      userName: 'User 1'
    });

    await UnitOfWork.run('tenant-X', async (tx) => {
      const rec = (await tx.execute(sql`SELECT balance_amount FROM account_receivables WHERE id = 'rec1'`)).rows[0];
      const acc = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc1'`)).rows[0];
      assert(parseFloat(rec.balance_amount) === 30 && parseFloat(acc.current_balance) === 120, 'REAL_RECEIPT_POSTGRES_ACID: Commit (30 and 120)');
    });

    // 2. TRANSFER_DEADLOCK_TEST & TRANSFER_ACID (COMMIT)
    // Transfer from acc1 to acc2
    await FinanceEngine.transferFunds({
      companyId: 'tenant-X',
      sourceAccountId: 'acc1',
      destinationAccountId: 'acc2',
      amount: 40,
      transferDate: new Date().toISOString(),
      paymentMethodId: 'pm1',
      description: 'Transfer',
      userId: 'u1',
      userName: 'User 1'
    });

    await UnitOfWork.run('tenant-X', async (tx) => {
      const acc1 = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc1'`)).rows[0];
      const acc2 = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc2'`)).rows[0];
      assert(parseFloat(acc1.current_balance) === 80 && parseFloat(acc2.current_balance) === 90, 'REAL_TRANSFER_POSTGRES_ACID');
    });
    
    // Concurrent Deadlock test
    const p1 = FinanceEngine.transferFunds({
      companyId: 'tenant-X', sourceAccountId: 'acc1', destinationAccountId: 'acc2', amount: 10, transferDate: new Date().toISOString(), paymentMethodId: 'pm1', description: 'T1', userId: 'u1', userName: 'User 1'
    });
    const p2 = FinanceEngine.transferFunds({
      companyId: 'tenant-X', sourceAccountId: 'acc2', destinationAccountId: 'acc1', amount: 5, transferDate: new Date().toISOString(), paymentMethodId: 'pm1', description: 'T2', userId: 'u1', userName: 'User 1'
    });
    
    await Promise.all([p1, p2]);
    await UnitOfWork.run('tenant-X', async (tx) => {
      const acc1 = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc1'`)).rows[0];
      const acc2 = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc2'`)).rows[0];
      // acc1: 80 - 10 + 5 = 75
      // acc2: 90 + 10 - 5 = 95
      assert(parseFloat(acc1.current_balance) === 75 && parseFloat(acc2.current_balance) === 95, 'TRANSFER_DEADLOCK_TEST concurrent');
    });

    // 3. RLS Missing Tenant Fail Closed
    // Note: Our backend isn't magically hooking up RLS when someone forgets to use UOW, but we can test
    // that UOW enforces it.
    await assertThrows(
      UnitOfWork.run('unknown', async (tx) => {
         const acc = await tx.execute(sql`SELECT * FROM financial_accounts WHERE id = 'acc1'`);
         if (acc.rows.length === 0) throw new Error('Accounts not found');
      }),
      'RLS_MISSING_TENANT_FAIL_CLOSED',
      'Accounts not found'
    );
    
    // 4. Audit DB Tests
    await UnitOfWork.run('tenant-X', async (tx) => {
      await tx.execute(sql`INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id) VALUES ('aud1', 'tenant-X', 'u1', 'TEST', 'Sys', 'e1')`);
      assert(true, 'AUDIT_INSERT_REAL_DB');
      
      let updBlock = false;
      try {
        await tx.execute(sql`UPDATE audit_logs SET action = 'MOD' WHERE id = 'aud1'`);
      } catch (e: any) {
        if (e.message.includes('new row violates row-level security policy for table "audit_logs"')) updBlock = true;
      }
      assert(updBlock, 'AUDIT_UPDATE_BLOCK_REAL_DB');

      let delBlock = false;
      try {
        await tx.execute(sql`DELETE FROM audit_logs WHERE id = 'aud1'`);
      } catch (e: any) {
         // deletion doesn't return anything or throws RLS violation? It just affects 0 rows usually, but with RESTRICTIVE it might throw or filter.
      }
      const res = await tx.execute(sql`SELECT * FROM audit_logs WHERE id = 'aud1'`);
      assert(res.rows.length === 1, 'AUDIT_DELETE_BLOCK_REAL_DB');
    });

    console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('Test suite failed:', e);
    process.exit(1);
  }
}

runTests();
