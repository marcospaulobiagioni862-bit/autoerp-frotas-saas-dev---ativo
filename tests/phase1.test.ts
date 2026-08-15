import { db } from '../src/db/index';
import { UnitOfWork } from '../src/db/uow';
import { users, auditLogs, accountReceivables, financialTransactions } from '../src/db/schema';
import { sql } from 'drizzle-orm';

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
    // DB-01
    const res = await db.execute(sql`SELECT 1 as val`);
    assert(res.rows[0].val === 1, 'DB-01 conexão PostgreSQL');
    
    // DB-02
    const schemaCheck = await db.execute(sql`SELECT count(*) FROM information_schema.tables WHERE table_name = 'financial_transactions'`);
    assert(Number(schemaCheck.rows[0].count) === 1, 'DB-02 migrations/schema');

    // DB-03: Company ID obrigatório (null na query deveria dar problema no Drizzle pq é .notNull())
    // Let's test by inserting without it (it will fail at TS compile or PG error)
    await assertThrows(
      db.execute(sql`INSERT INTO users (id, name, email, role) VALUES ('1', 'Test', 't@t.com', 'ADMIN')`),
      'DB-03 company_id obrigatório',
      'null value in column "company_id"'
    );

    // Prepare test data
    await db.execute(sql`DELETE FROM users`);
    await db.execute(sql`DELETE FROM audit_logs`);
    await db.execute(sql`DELETE FROM account_receivables`);
    
    // DB-04 / DB-05 / DB-06 / DB-07 RLS tests
    // Using unit of work which sets current_tenant
    await UnitOfWork.run('tenant-A', async (tx) => {
      await tx.insert(users).values({ id: 'u1', companyId: 'tenant-A', name: 'A', email: 'a@t.com', role: 'ADMIN' });
    });
    
    await UnitOfWork.run('tenant-B', async (tx) => {
      await tx.insert(users).values({ id: 'u2', companyId: 'tenant-B', name: 'B', email: 'b@t.com', role: 'ADMIN' });
      
      const res = await tx.select().from(users);
      assert(res.length === 1 && res[0].companyId === 'tenant-B', 'DB-05 RLS Tenant B não lê A');
    });

    await UnitOfWork.run('tenant-A', async (tx) => {
      const res = await tx.select().from(users);
      assert(res.length === 1 && res[0].companyId === 'tenant-A', 'DB-04 RLS Tenant A não lê B');
    });

    // TX-01 to TX-07: Acid tests using UnitOfWork rollback
    await assertThrows(
      UnitOfWork.run('tenant-A', async (tx) => {
        await tx.insert(users).values({ id: 'u3', companyId: 'tenant-A', name: 'C', email: 'c@t.com', role: 'ADMIN' });
        throw new Error('Simulated failure');
      }),
      'TX-02 Receipt rollback em falha intermediária (Simulated UoW Rollback)',
      'Simulated failure'
    );
    
    await UnitOfWork.run('tenant-A', async (tx) => {
      const res = await tx.select().from(users).where(sql`id = 'u3'`);
      assert(res.length === 0, 'TX-03 Rollback manteve consistência (u3 não inserido)');
    });

    // IDEMP-DB-01 to 04
    await UnitOfWork.run('tenant-A', async (tx) => {
      await tx.insert(accountReceivables).values({
        id: 'rec1', companyId: 'tenant-A', originType: 'MANUAL', originId: 'o1', categoryId: 'cat1',
        description: 'desc', originalAmount: '10', updatedAmount: '10', balanceAmount: '10',
        dueDate: new Date(), competenceDate: new Date(), status: 'PENDING',
        periodRef: '2026-08'
      });
      // Duplicity with same periodRef
      await assertThrows(
        tx.insert(accountReceivables).values({
          id: 'rec2', companyId: 'tenant-A', originType: 'MANUAL', originId: 'o1', categoryId: 'cat1',
          description: 'desc', originalAmount: '10', updatedAmount: '10', balanceAmount: '10',
          dueDate: new Date(), competenceDate: new Date(), status: 'PENDING',
          periodRef: '2026-08'
        }),
        'IDEMP-DB-01 duplicidade real bloqueada no banco',
        'duplicate key value violates unique constraint'
      );
    });

    await UnitOfWork.run('tenant-B', async (tx) => {
      // Same originId and periodRef, but different tenant -> Should succeed!
      await tx.insert(accountReceivables).values({
        id: 'rec3', companyId: 'tenant-B', originType: 'MANUAL', originId: 'o1', categoryId: 'cat1',
        description: 'desc', originalAmount: '10', updatedAmount: '10', balanceAmount: '10',
        dueDate: new Date(), competenceDate: new Date(), status: 'PENDING',
        periodRef: '2026-08'
      });
      assert(true, 'IDEMP-DB-02 tenants diferentes permitidos');
    });

    // AUD-DB-01, 02, 03
    await UnitOfWork.run('tenant-A', async (tx) => {
      await tx.insert(auditLogs).values({
        id: 'aud1', companyId: 'tenant-A', userId: 'u1', action: 'CREATE', entityType: 'User', entityId: 'u1'
      });
      assert(true, 'AUD-DB-01 AuditLog insert funciona');
      
      const updateRes = await tx.execute(sql`UPDATE audit_logs SET action = 'MODIFIED' WHERE id = 'aud1'`);
      // Since RLS blocks update:
      assert(updateRes.rowCount === 0, 'AUD-DB-02 update bloqueado via RLS');

      const delRes = await tx.execute(sql`DELETE FROM audit_logs WHERE id = 'aud1'`);
      assert(delRes.rowCount === 0, 'AUD-DB-03 delete bloqueado via RLS');
    });

    console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('Test suite failed:', e);
    process.exit(1);
  }
}

runTests();
