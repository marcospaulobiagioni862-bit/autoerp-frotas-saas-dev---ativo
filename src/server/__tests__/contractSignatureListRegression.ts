import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PostgresContractRepository } from '../../db/repositories/postgresContractRepository';
import { ContractClient } from '../../api/contractClient';
import { contractStatusLabel } from '../../components/contracts/ContractsManagement';
import { ContractStatus } from '../../types/enums';

// Disposable in-memory PostgreSQL: no ERP connection or migrations are executed.
const db = new PGlite();
const originalFetch = globalThis.fetch;
try {
  await db.exec(`
    CREATE TABLE contracts (
      id text PRIMARY KEY, company_id text, contract_number text,
      driver_id text DEFAULT 'driver', vehicle_id text DEFAULT 'vehicle',
      start_date text DEFAULT '2026-09-15', status text,
      signature_required boolean DEFAULT true, is_archived boolean DEFAULT false,
      signed_contract_url text, created_at text DEFAULT '2026-09-15T00:00:00Z',
      updated_at text DEFAULT '2026-09-15T00:00:00Z'
    );
    CREATE TABLE contract_artifacts (
      company_id text, contract_id text, artifact_type text,
      is_current boolean, is_archived boolean
    );
    INSERT INTO contracts(id, company_id, contract_number, status, signed_contract_url) VALUES
      ('unsigned','a','CNT-1','AWAITING_SIGNATURE',NULL),
      ('signed','a','CNT-2','AWAITING_SIGNATURE',NULL),
      ('active','a','CNT-3','ACTIVE',NULL),
      ('archived-evidence','a','CNT-4','AWAITING_SIGNATURE','legacy.pdf'),
      ('superseded-evidence','a','CNT-5','AWAITING_SIGNATURE',NULL),
      ('generated-only','a','CNT-6','AWAITING_SIGNATURE',NULL),
      ('foreign-evidence','a','CNT-7','AWAITING_SIGNATURE',NULL),
      ('draft-signed','a','CNT-8','DRAFT',NULL),
      ('foreign-contract','b','CNT-9','ACTIVE',NULL);
    INSERT INTO contract_artifacts VALUES
      ('a','signed','SIGNED_EVIDENCE',true,false),
      ('a','active','SIGNED_EVIDENCE',true,false),
      ('a','archived-evidence','SIGNED_EVIDENCE',true,true),
      ('a','superseded-evidence','SIGNED_EVIDENCE',false,false),
      ('a','generated-only','GENERATED_PDF',true,false),
      ('b','foreign-evidence','SIGNED_EVIDENCE',true,false),
      ('a','draft-signed','SIGNED_EVIDENCE',true,false);
  `);
  const before = await db.query('SELECT * FROM contracts ORDER BY id');
  let queryCount = 0;
  const dialect = new PgDialect();
  const repository = new PostgresContractRepository({
    execute: async (statement: SQL) => {
      const query = dialect.sqlToQuery(statement);
      assert.match(query.sql.trim(), /^SELECT\b/i, 'list projection must be read-only');
      queryCount++;
      return db.query(query.sql, query.params);
    },
  });
  const projected = await repository.findAllByCompany('a');
  assert.equal(queryCount, 1, 'projection must not add per-contract queries');
  assert.equal(projected.length, 8, 'foreign contract must not leak');
  globalThis.fetch = (async (_url, options) => {
    assert.ok(!options?.method || options.method === 'GET', 'listing must not activate contracts');
    return new Response(JSON.stringify({ items: projected }), {
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const contracts = await ContractClient.list();
  for (const id of ['unsigned','archived-evidence','superseded-evidence','generated-only','foreign-evidence']) {
    const item = contracts.find(contract => contract.id === id)!;
    assert.equal(item.hasSignedEvidence, false, id);
    assert.equal(contractStatusLabel(item.status, item.signedContractUrl, item.hasSignedEvidence), 'Aguardando assinatura', id);
  }
  for (const id of ['signed','draft-signed']) {
    const item = contracts.find(contract => contract.id === id)!;
    assert.equal(item.hasSignedEvidence, true, id);
    assert.equal(contractStatusLabel(item.status, item.signedContractUrl, item.hasSignedEvidence), 'Assinado • aguardando ativação', id);
  }
  const active = contracts.find(contract => contract.id === 'active')!;
  assert.equal(contractStatusLabel(active.status, undefined, active.hasSignedEvidence), 'Ativo');
  assert.equal(contractStatusLabel(ContractStatus.ACTIVE, undefined, false), 'Ativo');
  assert.equal(contracts.find(contract => contract.id === 'signed')!.status, ContractStatus.AWAITING_SIGNATURE);
  assert.deepEqual((await db.query('SELECT * FROM contracts ORDER BY id')).rows, before.rows, 'no contract status or other field may change');
  globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ ...projected[0], hasSignedEvidence: 'true' }] }))) as typeof fetch;
  await assert.rejects(() => ContractClient.list(), /Invalid Contract payload/);
  console.log('contract signature list regression: PASS (canonical projection, tenant isolation, archived/superseded evidence, labels, no activation)');
} finally {
  globalThis.fetch = originalFetch;
  await db.close();
}
