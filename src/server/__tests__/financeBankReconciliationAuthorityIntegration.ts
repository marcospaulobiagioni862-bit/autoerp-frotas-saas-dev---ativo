import express from 'express';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { BankReconciliationAuthority } from '../bankReconciliationAuthority';
import { registerBankReconciliationRoutes } from '../bankReconciliationRoutes';
import type { AuthenticatedPrincipal } from '../auth';

const require = createRequire(import.meta.url);
const { Client } = require('pg') as typeof import('pg');

const companyA = 'finance-r14-company-a';
const companyB = 'finance-r14-company-b';
const adminA = 'finance-r14-admin-a';
const adminB = 'finance-r14-admin-b';
const readonlyA = 'finance-r14-readonly-a';
const accountA1 = 'finance-r14-account-a1';
const accountA2 = 'finance-r14-account-a2';
const accountB1 = 'finance-r14-account-b1';
const income100 = 'finance-r14-tx-income-100';
const expense80 = 'finance-r14-tx-expense-80';
const transfer50 = 'finance-r14-tx-transfer-50';
const reversedExpense30 = 'finance-r14-tx-reversed-expense-30';
const reversal30 = 'finance-r14-tx-reversal-30';
const concurrent25 = 'finance-r14-tx-concurrent-25';
const concurrent26a = 'finance-r14-tx-concurrent-26a';
const concurrent26b = 'finance-r14-tx-concurrent-26b';
const ambiguous40a = 'finance-r14-tx-ambiguous-40a';
const ambiguous40b = 'finance-r14-tx-ambiguous-40b';
const rlsRole = 'finance_r14_rls_user';
const rlsPassword = 'finance-r14-test-password';

const principalA: AuthenticatedPrincipal = { companyId: companyA, userId: adminA, name: 'R14 Admin A', role: 'ADMIN', permissions: ['*'] };
const principalB: AuthenticatedPrincipal = { companyId: companyB, userId: adminB, name: 'R14 Admin B', role: 'ADMIN', permissions: ['*'] };
const principalReadonly: AuthenticatedPrincipal = { companyId: companyA, userId: readonlyA, name: 'R14 Readonly', role: 'READONLY', permissions: [] };
const actorA = { companyId: companyA, userId: adminA, name: 'R14 Admin A' };
const actorB = { companyId: companyB, userId: adminB, name: 'R14 Admin B' };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function one(query: any): Promise<any> {
  return rows(await db.execute(query))[0];
}

async function rejects(fn: () => Promise<unknown>, expected?: string): Promise<void> {
  let error: unknown;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, `expected rejection${expected ? ` containing ${expected}` : ''}`);
  if (expected) assert(String(error).includes(expected), `unexpected rejection: ${String(error)}`);
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
      (${companyA}, 'FINANCE-R14 A', 'ACTIVE', NOW(), NOW()),
      (${companyB}, 'FINANCE-R14 B', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
      (${adminA}, ${companyA}, 'R14 Admin A', 'finance-r14-admin-a@example.test', 'ADMIN', true, NOW(), NOW()),
      (${adminB}, ${companyB}, 'R14 Admin B', 'finance-r14-admin-b@example.test', 'ADMIN', true, NOW(), NOW()),
      (${readonlyA}, ${companyA}, 'R14 Readonly', 'finance-r14-readonly@example.test', 'READONLY', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO financial_accounts (
      id, company_id, name, type, initial_balance, current_balance, status, created_at, updated_at
    ) VALUES
      (${accountA1}, ${companyA}, 'R14 A1', 'BANK', 1000, 1000, 'ACTIVE', NOW(), NOW()),
      (${accountA2}, ${companyA}, 'R14 A2', 'BANK', 2000, 2000, 'ACTIVE', NOW(), NOW()),
      (${accountB1}, ${companyB}, 'R14 B1', 'BANK', 3000, 3000, 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO financial_transactions (
      id, company_id, financial_account_id, destination_account_id, type, amount,
      payment_method_id, transaction_date, competence_date, description, is_reversed,
      reversal_transaction_id, created_by_id, created_at, updated_at
    ) VALUES
      (${income100}, ${companyA}, ${accountA1}, NULL, 'INCOME', 100, 'pm-r14', '2026-01-10', '2026-01-10', 'income 100', false, NULL, ${adminA}, NOW(), NOW()),
      (${expense80}, ${companyA}, ${accountA1}, NULL, 'EXPENSE', 80, 'pm-r14', '2026-01-11', '2026-01-11', 'expense 80', false, NULL, ${adminA}, NOW(), NOW()),
      (${transfer50}, ${companyA}, ${accountA1}, ${accountA2}, 'TRANSFER', 50, 'pm-r14', '2026-01-12', '2026-01-12', 'transfer 50', false, NULL, ${adminA}, NOW(), NOW()),
      (${reversedExpense30}, ${companyA}, ${accountA1}, NULL, 'EXPENSE', 30, 'pm-r14', '2026-01-13', '2026-01-13', 'reversed expense 30', true, NULL, ${adminA}, NOW(), NOW()),
      (${reversal30}, ${companyA}, ${accountA1}, NULL, 'REVERSAL', 30, 'pm-r14', '2026-01-14', '2026-01-13', 'reversal 30', false, ${reversedExpense30}, ${adminA}, NOW(), NOW()),
      (${concurrent25}, ${companyA}, ${accountA1}, NULL, 'INCOME', 25, 'pm-r14', '2026-01-15', '2026-01-15', 'concurrent 25', false, NULL, ${adminA}, NOW(), NOW()),
      (${concurrent26a}, ${companyA}, ${accountA1}, NULL, 'INCOME', 26, 'pm-r14', '2026-01-16', '2026-01-16', 'concurrent 26 A', false, NULL, ${adminA}, NOW(), NOW()),
      (${concurrent26b}, ${companyA}, ${accountA1}, NULL, 'INCOME', 26, 'pm-r14', '2026-01-16', '2026-01-16', 'concurrent 26 B', false, NULL, ${adminA}, NOW(), NOW()),
      (${ambiguous40a}, ${companyA}, ${accountA1}, NULL, 'INCOME', 40, 'pm-r14', '2026-01-20', '2026-01-20', 'ambiguous 40 A', false, NULL, ${adminA}, NOW(), NOW()),
      (${ambiguous40b}, ${companyA}, ${accountA1}, NULL, 'INCOME', 40, 'pm-r14', '2026-01-20', '2026-01-20', 'ambiguous 40 B', false, NULL, ${adminA}, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function importOne(
  financialAccountId: string,
  externalId: string | undefined,
  date: string,
  description: string,
  amount: number,
  direction: 'CREDIT' | 'DEBIT',
) {
  const result = await BankReconciliationAuthority.importEntries(actorA, {
    financialAccountId,
    entries: [{ externalId, date, description, amount, direction, importSource: 'TEST' }],
  });
  assert(result.imported.length === 1, `expected one imported entry for ${description}`);
  return result.imported[0];
}

async function testHttpBoundary(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const who = req.header('x-test-principal');
    if (who === 'admin-a') (req as any).principal = principalA;
    if (who === 'admin-b') (req as any).principal = principalB;
    if (who === 'readonly-a') (req as any).principal = principalReadonly;
    next();
  });
  registerBankReconciliationRoutes(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server address unavailable');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    let response = await fetch(`${base}/api/finance/bank-reconciliation/import`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ financialAccountId: accountA1, entries: [] }),
    });
    assert(response.status === 401, `no-session import expected 401 got ${response.status}`);

    response = await fetch(`${base}/api/finance/bank-reconciliation/import`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-principal': 'admin-a' },
      body: JSON.stringify({ companyId: companyB, financialAccountId: accountA1, entries: [] }),
    });
    assert(response.status === 400, `forged companyId expected 400 got ${response.status}`);

    response = await fetch(`${base}/api/finance/bank-reconciliation/import`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-principal': 'readonly-a' },
      body: JSON.stringify({
        financialAccountId: accountA1,
        entries: [{ externalId: 'readonly-forbidden', date: '2026-01-01', description: 'readonly', amount: 1, direction: 'CREDIT' }],
      }),
    });
    assert(response.status === 403, `readonly import expected 403 got ${response.status}`);

    response = await fetch(`${base}/api/finance/bank-reconciliation/import`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-principal': 'admin-a' },
      body: JSON.stringify({
        financialAccountId: accountB1,
        entries: [{ externalId: 'cross-account', date: '2026-01-01', description: 'cross', amount: 1, direction: 'CREDIT' }],
      }),
    });
    assert(response.status === 404, `cross-tenant account expected 404 got ${response.status}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function testDurableImportIdempotencyAndTenantIsolation(): Promise<void> {
  const first = await BankReconciliationAuthority.importEntries(actorA, {
    financialAccountId: accountA1,
    entries: [{ externalId: 'EXT-R14-ONE', date: '2026-01-10', description: 'idempotent ext', amount: 10, direction: 'CREDIT' }],
  });
  assert(first.imported.length === 1 && first.skippedDuplicates === 0, 'initial external-id import failed');
  const retry = await BankReconciliationAuthority.importEntries(actorA, {
    financialAccountId: accountA1,
    entries: [{ externalId: 'EXT-R14-ONE', date: '2026-01-10', description: 'changed retry payload', amount: 999, direction: 'DEBIT' }],
  });
  assert(retry.imported.length === 0 && retry.skippedDuplicates === 1, 'external-id retry was not deduplicated durably');

  const fallback1 = await BankReconciliationAuthority.importEntries(actorA, {
    financialAccountId: accountA1,
    entries: [{ date: '2026-01-10', description: '  Fallback   deterministic ', amount: 12.34, direction: 'DEBIT', documentNumber: 'DOC-1' }],
  });
  const fallback2 = await BankReconciliationAuthority.importEntries(actorA, {
    financialAccountId: accountA1,
    entries: [{ date: '2026-01-10', description: 'Fallback deterministic', amount: 12.34, direction: 'DEBIT', documentNumber: 'DOC-1' }],
  });
  assert(fallback1.imported.length === 1 && fallback2.skippedDuplicates === 1, 'fallback retry did not converge');

  const sameExternalOtherAccount = await BankReconciliationAuthority.importEntries(actorA, {
    financialAccountId: accountA2,
    entries: [{ externalId: 'EXT-R14-ONE', date: '2026-01-10', description: 'same external other account', amount: 10, direction: 'CREDIT' }],
  });
  assert(sameExternalOtherAccount.imported.length === 1, 'external id was incorrectly global instead of account-scoped');

  const foreign = await BankReconciliationAuthority.importEntries(actorB, {
    financialAccountId: accountB1,
    entries: [{ externalId: 'EXT-R14-FOREIGN', date: '2026-01-10', description: 'foreign', amount: 10, direction: 'CREDIT' }],
  });
  assert(foreign.imported.length === 1, 'foreign tenant fixture import failed');
  const visibleA = await BankReconciliationAuthority.listEntries(actorA);
  assert(!visibleA.some((entry) => entry.id === foreign.imported[0].id), 'tenant A listed tenant B statement entry');
  await rejects(
    () => BankReconciliationAuthority.matchEntry(actorA, foreign.imported[0].id, income100),
    'não encontrada',
  );
}

async function testDirectionAmountAccountTransferAndReversal(): Promise<{ incomeEntryId: string }> {
  const incomeEntry = await importOne(accountA1, 'MATCH-INCOME-100', '2026-01-10', 'income statement', 100, 'CREDIT');
  const expenseEntry = await importOne(accountA1, 'MATCH-EXPENSE-80', '2026-01-11', 'expense statement', 80, 'DEBIT');
  assert((await BankReconciliationAuthority.matchEntry(actorA, incomeEntry.id, income100)).status === 'MATCHED', 'income credit did not match');
  assert((await BankReconciliationAuthority.matchEntry(actorA, expenseEntry.id, expense80)).status === 'MATCHED', 'expense debit did not match');

  const wrongDirection = await importOne(accountA1, 'WRONG-DIRECTION', '2026-01-10', 'wrong direction', 100, 'DEBIT');
  await rejects(() => BankReconciliationAuthority.matchEntry(actorA, wrongDirection.id, income100), 'incompatível');
  const wrongAmount = await importOne(accountA1, 'WRONG-AMOUNT', '2026-01-10', 'wrong amount', 101, 'CREDIT');
  await rejects(() => BankReconciliationAuthority.matchEntry(actorA, wrongAmount.id, income100), 'diverge');
  const wrongAccount = await importOne(accountA2, 'WRONG-ACCOUNT', '2026-01-10', 'wrong account', 100, 'CREDIT');
  await rejects(() => BankReconciliationAuthority.matchEntry(actorA, wrongAccount.id, income100), 'incompatível');

  const transferSource = await importOne(accountA1, 'TRANSFER-SOURCE', '2026-01-12', 'transfer source', 50, 'DEBIT');
  const transferDestination = await importOne(accountA2, 'TRANSFER-DESTINATION', '2026-01-12', 'transfer destination', 50, 'CREDIT');
  await BankReconciliationAuthority.matchEntry(actorA, transferSource.id, transfer50);
  await BankReconciliationAuthority.matchEntry(actorA, transferDestination.id, transfer50);
  const transferMatches = await one(sql`
    SELECT count(*)::int AS count FROM bank_statement_entries
    WHERE company_id=${companyA} AND transaction_id=${transfer50} AND status='MATCHED'
  `);
  assert(Number(transferMatches?.count) === 2, 'transfer was not independently reconcilable on source and destination accounts');

  const reversalEntry = await importOne(accountA1, 'REVERSAL-CREDIT-30', '2026-01-14', 'expense reversal', 30, 'CREDIT');
  await BankReconciliationAuthority.matchEntry(actorA, reversalEntry.id, reversal30);
  const reversedOriginalEntry = await importOne(accountA1, 'REVERSED-ORIGINAL-30', '2026-01-13', 'reversed original', 30, 'DEBIT');
  await rejects(() => BankReconciliationAuthority.matchEntry(actorA, reversedOriginalEntry.id, reversedExpense30), 'incompatível');

  return { incomeEntryId: incomeEntry.id };
}

async function testConcurrentMatchGuards(): Promise<void> {
  const entryA = await importOne(accountA1, 'CONCURRENT-25-A', '2026-01-15', 'concurrent 25 A', 25, 'CREDIT');
  const entryB = await importOne(accountA1, 'CONCURRENT-25-B', '2026-01-15', 'concurrent 25 B', 25, 'CREDIT');
  const sameTx = await Promise.allSettled([
    BankReconciliationAuthority.matchEntry(actorA, entryA.id, concurrent25),
    BankReconciliationAuthority.matchEntry(actorA, entryB.id, concurrent25),
  ]);
  assert(sameTx.filter((item) => item.status === 'fulfilled').length === 1, 'one transaction matched two entries concurrently');
  assert(Number((await one(sql`
    SELECT count(*)::int AS count FROM bank_statement_entries
    WHERE company_id=${companyA} AND account_id=${accountA1} AND transaction_id=${concurrent25} AND status='MATCHED'
  `))?.count) === 1, 'durable transaction match scope contains duplicates');

  const singleEntry = await importOne(accountA1, 'CONCURRENT-26-ENTRY', '2026-01-16', 'concurrent entry 26', 26, 'CREDIT');
  const sameEntry = await Promise.allSettled([
    BankReconciliationAuthority.matchEntry(actorA, singleEntry.id, concurrent26a),
    BankReconciliationAuthority.matchEntry(actorA, singleEntry.id, concurrent26b),
  ]);
  assert(sameEntry.filter((item) => item.status === 'fulfilled').length === 1, 'one entry matched two transactions concurrently');
  const persisted = await one(sql`
    SELECT status, transaction_id FROM bank_statement_entries WHERE company_id=${companyA} AND id=${singleEntry.id}
  `);
  assert(persisted?.status === 'MATCHED' && [concurrent26a, concurrent26b].includes(persisted?.transaction_id), 'concurrent entry did not persist exactly one winner');
}

async function testUnmatchRematchIgnoreAuditAndSuggestions(incomeEntryId: string): Promise<void> {
  const unmatched = await BankReconciliationAuthority.unmatchEntry(actorA, incomeEntryId, 'bank correction');
  assert(unmatched.status === 'UNMATCHED' && !unmatched.matchedTransactionId, 'unmatch did not clear authoritative link');
  const rematched = await BankReconciliationAuthority.matchEntry(actorA, incomeEntryId, income100);
  assert(rematched.status === 'MATCHED' && rematched.matchedTransactionId === income100, 'rematch did not restore authoritative link');
  const auditCount = await one(sql`
    SELECT count(*)::int AS count FROM audit_logs
    WHERE company_id=${companyA} AND entity_id=${incomeEntryId}
      AND action IN ('RECONCILIATION_MATCHED','RECONCILIATION_UNMATCHED')
  `);
  assert(Number(auditCount?.count) >= 3, `match/unmatch/rematch audit trail incomplete (${auditCount?.count})`);

  const ignored = await importOne(accountA1, 'IGNORE-R14', '2026-01-18', 'ignore me', 17, 'DEBIT');
  const ignoredResult = await BankReconciliationAuthority.ignoreEntry(actorA, ignored.id, 'not a ledger transaction');
  assert(ignoredResult.status === 'IGNORED', 'ignore did not persist');
  assert(Number((await one(sql`
    SELECT count(*)::int AS count FROM audit_logs
    WHERE company_id=${companyA} AND entity_id=${ignored.id} AND action='RECONCILIATION_IGNORED'
  `))?.count) === 1, 'ignore audit missing');

  const ambiguous = await importOne(accountA1, 'AMBIGUOUS-40', '2026-01-20', 'ambiguous 40', 40, 'CREDIT');
  const before = await one(sql`SELECT status, transaction_id FROM bank_statement_entries WHERE id=${ambiguous.id}`);
  const suggestions = await BankReconciliationAuthority.suggestMatches(actorA, accountA1);
  const suggestion = suggestions.find((item) => item.statementEntry.id === ambiguous.id);
  assert(suggestion, 'ambiguous statement entry missing from suggestions');
  assert(suggestion.candidates.filter((candidate) => candidate.confidence === 'EXACT').length === 2, 'ambiguous entry did not expose two exact candidates');
  assert(!suggestion.bestMatch, 'ambiguous candidates incorrectly produced an automatic best match');
  const after = await one(sql`SELECT status, transaction_id FROM bank_statement_entries WHERE id=${ambiguous.id}`);
  assert(before?.status === 'UNMATCHED' && after?.status === 'UNMATCHED' && !after?.transaction_id, 'suggestions mutated reconciliation state');
}

async function testRlsNonSuperuser(): Promise<void> {
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${rlsRole}`));
  await db.execute(sql.raw(`CREATE ROLE ${rlsRole} LOGIN PASSWORD '${rlsPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${rlsRole}`));
  await db.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE ON bank_statement_entries TO ${rlsRole}`));
  const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');
  const client = new Client({ host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1), user: rlsRole, password: rlsPassword });
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant',$1,false)`, [companyA]);
    const visible = await client.query('SELECT DISTINCT company_id FROM bank_statement_entries');
    assert(visible.rows.length >= 1 && visible.rows.every((row: any) => row.company_id === companyA), 'bank statement RLS leaked tenant rows');
    let rejected = false;
    try {
      await client.query(
        `INSERT INTO bank_statement_entries(id,company_id,account_id,date,amount,description,status,direction,dedup_key) VALUES($1,$2,$3,$4,$5,$6,'UNMATCHED','CREDIT',$7)`,
        ['finance-r14-rls-cross', companyB, accountB1, '2026-01-01', 1, 'cross', 'finance-r14-rls-cross-key'],
      );
    } catch (error: any) {
      rejected = String(error?.code || '') === '42501' || String(error?.message || '').toLowerCase().includes('row-level security');
    }
    assert(rejected, 'bank statement RLS allowed a cross-tenant insert');
  } finally {
    await client.end();
    await db.execute(sql.raw(`DROP OWNED BY ${rlsRole}`));
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${rlsRole}`));
  }
}

async function run(): Promise<void> {
  await seed();
  const baselineTxCount = Number((await one(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyA}`))?.count);
  const baselineA1 = Number((await one(sql`SELECT current_balance FROM financial_accounts WHERE id=${accountA1}`))?.current_balance);
  const baselineA2 = Number((await one(sql`SELECT current_balance FROM financial_accounts WHERE id=${accountA2}`))?.current_balance);

  await testHttpBoundary();
  await testDurableImportIdempotencyAndTenantIsolation();
  const { incomeEntryId } = await testDirectionAmountAccountTransferAndReversal();
  await testConcurrentMatchGuards();
  await testUnmatchRematchIgnoreAuditAndSuggestions(incomeEntryId);
  await testRlsNonSuperuser();

  const finalTxCount = Number((await one(sql`SELECT count(*)::int AS count FROM financial_transactions WHERE company_id=${companyA}`))?.count);
  const finalA1 = Number((await one(sql`SELECT current_balance FROM financial_accounts WHERE id=${accountA1}`))?.current_balance);
  const finalA2 = Number((await one(sql`SELECT current_balance FROM financial_accounts WHERE id=${accountA2}`))?.current_balance);
  assert(finalTxCount === baselineTxCount, `bank reconciliation created/deleted financial transactions (${baselineTxCount} -> ${finalTxCount})`);
  assert(finalA1 === baselineA1 && finalA2 === baselineA2, `bank reconciliation changed account balances (${baselineA1}/${baselineA2} -> ${finalA1}/${finalA2})`);
  console.log('FINANCE-R14 authoritative bank reconciliation PostgreSQL integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
