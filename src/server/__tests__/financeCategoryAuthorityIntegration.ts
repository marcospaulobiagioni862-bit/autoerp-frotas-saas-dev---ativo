import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { assertFinancialCategoryForObligation } from '../../domain/finance/FinancialCategoryAuthority';
import { ReceivableService } from '../../domain/finance/ReceivableService';
import { PayableService } from '../../domain/finance/PayableService';
import { OriginType } from '../../types/enums';

const companyA = 'finance-r2-company-a';
const companyB = 'finance-r2-company-b';
const adminA = 'finance-r2-admin-a';
const incomeA = 'finance-r2-income-a';
const expenseA = 'finance-r2-expense-a';
const bothA = 'finance-r2-both-a';
const inactiveA = 'finance-r2-inactive-a';
const incomeB = 'finance-r2-income-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rejects(fn: () => Promise<unknown>, contains: string): Promise<void> {
  let failed = false;
  try {
    await fn();
  } catch (error) {
    failed = String(error).includes(contains);
  }
  assert(failed, `expected rejection containing ${contains}`);
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies(id,name,status,created_at,updated_at)
    VALUES
      (${companyA},'Finance R2 A','ACTIVE',NOW(),NOW()),
      (${companyB},'Finance R2 B','ACTIVE',NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${adminA},${companyA},'Finance R2 Admin','finance-r2-admin@example.test','ADMIN',true,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at)
    VALUES
      (${incomeA},${companyA},'Receita R2','INCOME',true,NOW(),NOW()),
      (${expenseA},${companyA},'Despesa R2','EXPENSE',true,NOW(),NOW()),
      (${bothA},${companyA},'Mista R2','BOTH',true,NOW(),NOW()),
      (${inactiveA},${companyA},'Inativa R2','INCOME',false,NOW(),NOW()),
      (${incomeB},${companyB},'Receita B','INCOME',true,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING
  `);
}

async function run(): Promise<void> {
  await seed();

  await UnitOfWork.run(companyA, async (tx) => {
    await assertFinancialCategoryForObligation(companyA, incomeA, 'RECEIVABLE', tx);
    await assertFinancialCategoryForObligation(companyA, bothA, 'RECEIVABLE', tx);
    await assertFinancialCategoryForObligation(companyA, expenseA, 'PAYABLE', tx);
    await assertFinancialCategoryForObligation(companyA, bothA, 'PAYABLE', tx);

    await rejects(
      () => assertFinancialCategoryForObligation(companyA, expenseA, 'RECEIVABLE', tx),
      'incompatível'
    );
    await rejects(
      () => assertFinancialCategoryForObligation(companyA, incomeA, 'PAYABLE', tx),
      'incompatível'
    );
    await rejects(
      () => assertFinancialCategoryForObligation(companyA, inactiveA, 'RECEIVABLE', tx),
      'inativa'
    );
    await rejects(
      () => assertFinancialCategoryForObligation(companyA, incomeB, 'RECEIVABLE', tx),
      'não encontrada'
    );
    await rejects(
      () => assertFinancialCategoryForObligation(companyA, 'finance-r2-missing', 'PAYABLE', tx),
      'não encontrada'
    );

    const receivablesBefore = await tx.getReceivableRepo().findAll();
    await rejects(
      () => ReceivableService.create(
        {
          companyId: companyA,
          originType: OriginType.MANUAL,
          originId: 'finance-r2-invalid-ar',
          categoryId: expenseA,
          description: 'Invalid AR category',
          totalAmount: 100,
          dueDate: '2026-09-20',
          userId: adminA,
          userName: 'Finance R2 Admin',
        },
        tx
      ),
      'incompatível'
    );
    const receivablesAfter = await tx.getReceivableRepo().findAll();
    assert(receivablesAfter.length === receivablesBefore.length, 'invalid AR category created an obligation');

    const payablesBefore = await tx.getPayableRepo().findAll();
    await rejects(
      () => PayableService.create(
        {
          companyId: companyA,
          originType: OriginType.MANUAL,
          originId: 'finance-r2-invalid-ap',
          categoryId: incomeA,
          description: 'Invalid AP category',
          totalAmount: 100,
          dueDate: '2026-09-20',
          userId: adminA,
          userName: 'Finance R2 Admin',
        },
        tx
      ),
      'incompatível'
    );
    const payablesAfter = await tx.getPayableRepo().findAll();
    assert(payablesAfter.length === payablesBefore.length, 'invalid AP category created an obligation');
  });

  console.log('FINANCE-R2 category authority integration PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
