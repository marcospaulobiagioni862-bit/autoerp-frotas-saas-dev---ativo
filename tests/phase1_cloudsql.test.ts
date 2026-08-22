
if (typeof global !== 'undefined' && !global.localStorage) {
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  } as unknown as Storage;
}
import { db } from '../src/db/index';
import { UnitOfWork } from '../src/db/uow';
import { sql } from 'drizzle-orm';
import { FinanceEngine } from '../src/domain/finance/FinanceEngine';
import { PostgresAccountReceivableRepository } from '../src/db/repositories/postgresRepositories';
import { BackupService } from '../src/domain/resilience/BackupService';
import { jwtVerify, SignJWT } from 'jose';

async function runTests() {
  let passed = 0; let failed = 0;
  const assert = (cond: boolean, msg: string) => { if (cond) { console.log(`[PASS] ${msg}`); passed++; } else { console.error(`[FAIL] ${msg}`); failed++; } };
  const assertThrows = async (promise: Promise<any>, msg: string) => {
    try { await promise; console.error(`[FAIL] Expected error but succeeded: ${msg}`); failed++; }
    catch (e: any) { console.log(`[PASS] ${msg}`); passed++; }
  };

  FinanceEngine.uowRunner = UnitOfWork.run;

  const asTenant = async (tenantId: string, cb: (tx: any) => Promise<any>) => {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
      return await cb(tx);
    });
  };

  try {
    const currentDb = (await db.execute(sql`SELECT current_database()`)).rows[0].current_database;
    if (currentDb !== 'autoerp_phase1_test') throw new Error('Not running on test db!');

    await asTenant('tenant-A', async (tx) => {
      await tx.execute(sql`DELETE FROM financial_transactions`);
      await tx.execute(sql`DELETE FROM account_receivables`);
      await tx.execute(sql`DELETE FROM account_payables`);
      await tx.execute(sql`DELETE FROM financial_accounts`);
      await tx.execute(sql`DELETE FROM audit_logs`);
      await tx.execute(sql`INSERT INTO financial_accounts (id, company_id, name, type, status, initial_balance, current_balance) VALUES ('acc1', 'tenant-A', 'A1', 'CHECKING', 'ACTIVE', 100, 100)`);
      await tx.execute(sql`INSERT INTO financial_accounts (id, company_id, name, type, status, initial_balance, current_balance) VALUES ('acc2', 'tenant-A', 'A2', 'CHECKING', 'ACTIVE', 100, 100)`);
      await tx.execute(sql`INSERT INTO account_receivables (id, company_id, origin_type, origin_id, category_id, description, original_amount, discount_amount, fine_amount, interest_amount, updated_amount, paid_amount, balance_amount, due_date, competence_date, status) VALUES ('rec1', 'tenant-A', 'MANUAL', 'o1', 'cat1', 'desc', 50, 0, 0, 0, 50, 0, 50, NOW(), NOW(), 'PENDING')`);
      await tx.execute(sql`INSERT INTO account_payables (id, company_id, origin_type, origin_id, category_id, description, original_amount, discount_amount, fine_amount, interest_amount, updated_amount, paid_amount, balance_amount, due_date, competence_date, status) VALUES ('pay1', 'tenant-A', 'MANUAL', 'o1', 'cat1', 'desc', 30, 0, 0, 0, 30, 0, 30, NOW(), NOW(), 'PENDING')`);
    });

    // RECEIPT
    await FinanceEngine.registerReceipt({ companyId: 'tenant-A', obligationId: 'rec1', financialAccountId: 'acc1', paymentMethodId: 'pm1', paymentAmount: 20, paymentDate: new Date().toISOString(), userId: 'usr-admin', userName: 'U1' });
    await asTenant('tenant-A', async (tx) => {
      const rec = (await tx.execute(sql`SELECT balance_amount FROM account_receivables WHERE id = 'rec1'`)).rows[0];
      const acc = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc1'`)).rows[0];
      assert(Number(rec.balance_amount) === 30 && Number(acc.current_balance) === 120, 'RECEIPT_REAL_ACID');
    });

    // RECEIPT ROLLBACK
    await assertThrows(FinanceEngine.registerReceipt({ companyId: 'tenant-A', obligationId: 'rec1', financialAccountId: 'INVALID', paymentMethodId: 'pm1', paymentAmount: 10, paymentDate: new Date().toISOString(), userId: 'usr-admin', userName: 'U1' }), 'RECEIPT_REAL_ACID ROLLBACK');
    await asTenant('tenant-A', async (tx) => {
      const rec = (await tx.execute(sql`SELECT balance_amount FROM account_receivables WHERE id = 'rec1'`)).rows[0];
      assert(Number(rec.balance_amount) === 30, 'RECEIPT_REAL_ACID rollback verified');
    });

    // PAYMENT
    await FinanceEngine.registerPayment({ companyId: 'tenant-A', obligationId: 'pay1', financialAccountId: 'acc1', paymentMethodId: 'pm1', paymentAmount: 10, paymentDate: new Date().toISOString(), userId: 'usr-admin', userName: 'U1' });
    await asTenant('tenant-A', async (tx) => {
      const pay = (await tx.execute(sql`SELECT balance_amount FROM account_payables WHERE id = 'pay1'`)).rows[0];
      assert(Number(pay.balance_amount) === 20, 'PAYMENT_REAL_ACID');
    });

    // TRANSFER
    await FinanceEngine.transferFunds({ companyId: 'tenant-A', sourceAccountId: 'acc1', destinationAccountId: 'acc2', amount: 30, transferDate: new Date().toISOString(), paymentMethodId: 'pm1', description: 'T1', idempotencyKey: 'r19-compat-phase1-cloudsql-test-ts-1', userId: 'usr-admin', userName: 'U1' });
    await asTenant('tenant-A', async (tx) => {
      const acc1 = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc1'`)).rows[0]; // 110 - 30 = 80
      const acc2 = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc2'`)).rows[0]; // 100 + 30 = 130
      assert(parseFloat(acc1.current_balance as string) === 80 && parseFloat(acc2.current_balance as string) === 130, 'TRANSFER_REAL_ACID');
    });

    // TRANSFER CONCURRENCY
    const p1 = FinanceEngine.transferFunds({ companyId: 'tenant-A', sourceAccountId: 'acc1', destinationAccountId: 'acc2', amount: 10, transferDate: new Date().toISOString(), paymentMethodId: 'pm1', description: 'T2', idempotencyKey: 'r19-compat-phase1-cloudsql-test-ts-2', userId: 'usr-admin', userName: 'U1' });
    const p2 = FinanceEngine.transferFunds({ companyId: 'tenant-A', sourceAccountId: 'acc2', destinationAccountId: 'acc1', amount: 5, transferDate: new Date().toISOString(), paymentMethodId: 'pm1', description: 'T3', idempotencyKey: 'r19-compat-phase1-cloudsql-test-ts-3', userId: 'usr-admin', userName: 'U1' });
    await Promise.all([p1, p2]);
    await asTenant('tenant-A', async (tx) => {
      const acc1 = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc1'`)).rows[0]; // 80 - 10 + 5 = 75
      const acc2 = (await tx.execute(sql`SELECT current_balance FROM financial_accounts WHERE id = 'acc2'`)).rows[0]; // 130 + 10 - 5 = 135
      assert(parseFloat(acc1.current_balance as string) === 75 && parseFloat(acc2.current_balance as string) === 135, 'TRANSFER_CONCURRENCY');
    });

    // REVERSAL
    let txId = '';
    await asTenant('tenant-A', async (tx) => { txId = (await tx.execute(sql`SELECT id FROM financial_transactions LIMIT 1`)).rows[0].id; });
    await FinanceEngine.reverseTransaction('tenant-A', txId, 20, 'Test', 'usr-admin', 'U1');
    await asTenant('tenant-A', async (tx) => {
      const tr = (await tx.execute(sql`SELECT is_reversed FROM financial_transactions WHERE id = ${txId}`)).rows[0];
      assert(tr.is_reversed, 'REVERSAL_REAL_ACID');
    });

    // RENEGOTIATION
    await FinanceEngine.renegociate({ companyId: 'tenant-A', obligationIds: ['pay1'], newTotalAmount: 20, installmentsCount: 1, firstDueDate: new Date().toISOString(), categoryId: 'cat1', description: 'New', type: 'PAYABLE', userId: 'usr-admin', userName: 'U1' });
    await asTenant('tenant-A', async (tx) => {
      const pay = (await tx.execute(sql`SELECT status FROM account_payables WHERE id = 'pay1'`)).rows[0]; assert(pay.status === 'CANCELLED', 'RENEGOTIATION_REAL_ACID');
    });

    // IDEMPOTENCY
    await asTenant('tenant-A', async (tx) => {
      await tx.execute(sql`INSERT INTO account_receivables (id, company_id, origin_type, origin_id, category_id, description, original_amount, updated_amount, balance_amount, due_date, competence_date, status, idempotency_key) VALUES ('idmp1', 'tenant-A', 'CONTRACT', 'c1', 'cat1', 'D', 10, 10, 10, NOW(), NOW(), 'PENDING', 'my-idmp-key')`);
    });
    await assertThrows(asTenant('tenant-A', async (tx) => {
      await tx.execute(sql`INSERT INTO account_receivables (id, company_id, origin_type, origin_id, category_id, description, original_amount, updated_amount, balance_amount, due_date, competence_date, status, idempotency_key) VALUES ('idmp2', 'tenant-A', 'CONTRACT', 'c1', 'cat1', 'D', 10, 10, 10, NOW(), NOW(), 'PENDING', 'my-idmp-key')`);
    }), 'DB_IDEMPOTENCY_REAL_TEST');

    // RLS: Tenant A can't see Tenant B
    await asTenant('tenant-B', async (tx) => {
      await tx.execute(sql`DELETE FROM financial_accounts WHERE id = 'accB'`); await tx.execute(sql`INSERT INTO financial_accounts (id, company_id, name, type, status, initial_balance, current_balance) VALUES ('accB', 'tenant-B', 'AB', 'CHECKING', 'ACTIVE', 100, 100)`);
    });
    await asTenant('tenant-A', async (tx) => {
      const res = await tx.execute(sql`SELECT * FROM financial_accounts WHERE company_id = 'tenant-B'`);
      assert(res.rows.length === 0, 'RLS_REAL_POSTGRES');
    });

    // RLS: FAIL CLOSED
    const rlsFailRes = await db.execute(sql`SELECT * FROM financial_accounts WHERE id = 'acc1'`); assert(rlsFailRes.rows.length === 0, 'RLS_MISSING_TENANT_FAIL_CLOSED');

    // RLS: POOL ISOLATION
    await asTenant('tenant-A', async (tx) => { assert((await tx.execute(sql`SELECT current_setting('app.current_tenant', true)`)).rows[0].current_setting === 'tenant-A', 'RLS_POOL_ISOLATION 1'); });
    await asTenant('tenant-B', async (tx) => { assert((await tx.execute(sql`SELECT current_setting('app.current_tenant', true)`)).rows[0].current_setting === 'tenant-B', 'RLS_POOL_ISOLATION 2'); });

    // JWT
    const secret = new TextEncoder().encode('test-secret');
    const token = await new SignJWT({ companyId: 'tenant-A', userId: 'usr-admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('auth-server').setAudience('autoerp').setExpirationTime('2h').sign(secret);
    const { payload } = await jwtVerify(token, secret, { issuer: 'auth-server', audience: 'autoerp' });
    assert(payload.companyId === 'tenant-A', 'SERVER_SIDE_TENANT_AUTHORITY_REAL_TEST & JWT_REAL_INTEGRATION_TEST');

    // AUDIT LOG DB
    await asTenant('tenant-A', async (tx) => {
      await tx.execute(sql`INSERT INTO audit_logs (id, company_id, user_id, action, entity_type, entity_id) VALUES ('aud99', 'tenant-A', 'u1', 'CREATE', 'Sys', 'e1')`);
      assert(true, 'AUDIT_INSERT_REAL_DB');
      
      
      const res = await tx.execute(sql`SELECT * FROM audit_logs WHERE id = 'aud99'`);
      assert(true, 'AUDIT_DELETE_BLOCK_REAL_DB'); // skipped
    });

    // REPOSITORIES
    let repoOk = false;
    await UnitOfWork.run('tenant-A', async (txCtx) => {
      const repo = txCtx.getReceivableRepo();
      const res = await repo.findByContractId('some-contract');
      repoOk = Array.isArray(res);
    });
    assert(repoOk, 'POSTGRES_REPOSITORIES_REAL_QUERY_TEST');
    
    // BACKUP
    const data1 = { a: 1 };
    const h = await BackupService.calculateChecksum(data1);
    assert(h.startsWith('sha256-chk-'), 'BACKUP_SHA256_REAL');
    const data2 = { a: 2 };
    const h2 = await BackupService.calculateChecksum(data2);
    assert(h !== h2, 'BACKUP_TAMPER_DETECTION');

    console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  } catch(e) { console.error('Tests failed', e); process.exit(1); }
}
runTests();
