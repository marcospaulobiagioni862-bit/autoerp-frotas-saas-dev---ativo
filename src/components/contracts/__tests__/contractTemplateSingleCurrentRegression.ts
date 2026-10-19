import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

console.log('--- PH-061: Regression Runner - Contract Template Single Current & Explanation ---');

// 1. Static Invariant Audit
const migration0092Path = 'drizzle/0092_contract_template_single_current.sql';
assert(existsSync(migration0092Path), 'Migration 0092 must exist on disk');
const migrationSql = readFileSync(migration0092Path, 'utf8');

assert.match(
  migrationSql,
  /UPDATE\s+contract_templates\s+ct[\s\S]*SET\s+is_current\s*=\s*false[\s\S]*MAX\(ct2\.version_number\)/i,
  'Migration 0092 must demote older duplicate versions for each (company_id, template_key) to false'
);
assert.match(
  migrationSql,
  /DROP\s+INDEX\s+IF\s+EXISTS\s+uq_contract_template_current/i,
  'Migration 0092 must drop the legacy lenient index uq_contract_template_current'
);
assert.match(
  migrationSql,
  /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_contract_template_single_current\s+ON\s+contract_templates\s*\(\s*company_id\s*,\s*template_key\s*\)\s+WHERE\s+is_current\s*=\s*true/i,
  'Migration 0092 must create strict unique partial index uq_contract_template_single_current WHERE is_current = true'
);
assert.doesNotMatch(
  migrationSql,
  /WHERE\s+is_current\s*=\s*true\s+AND\s+is_archived\s*=\s*false/i,
  'Strict index must NOT contain lenient is_archived = false condition'
);

const schemaFile = readFileSync('src/db/schema.ts', 'utf8');
assert.match(
  schemaFile,
  /unqSingleCurrent:\s*uniqueIndex\('uq_contract_template_single_current'\)\s*\.on\(t\.companyId,\s*t\.templateKey\)\s*\.where\(sql`is_current\s*=\s*true`\)/,
  'src/db/schema.ts must define uq_contract_template_single_current partial index'
);

const contractFormFile = readFileSync('src/components/contracts/ContractFormModal.tsx', 'utf8');
assert.match(
  contractFormFile,
  /Nenhum modelo com arquivo ou texto/,
  'ContractFormModal must explain why template selector is empty'
);
assert.match(
  contractFormFile,
  /Gerenciar modelos de contrato/,
  'ContractFormModal must provide a shortcut button to manage templates'
);
assert.match(
  contractFormFile,
  /Arquivo pendente/,
  'ContractFormModal must display "Arquivo pendente" badge for enabled templates lacking content'
);
assert.match(
  contractFormFile,
  /onOpenTemplateManager/,
  'ContractFormModal must support onOpenTemplateManager callback'
);

const contractsManagementFile = readFileSync('src/components/contracts/ContractsManagement.tsx', 'utf8');
assert.match(
  contractsManagementFile,
  /onOpenTemplateManager=\{\(\)\s*=>\s*\{\s*setFormOpen\(false\);\s*setTemplateManagerOpen\(true\);\s*\}\}/,
  'ContractsManagement must wire onOpenTemplateManager between form and template modal'
);

console.log('✓ Invariant 1: Static code and schema contracts verified');

// 2. Database Constraint & Mutation Proof (Negative Test)
async function testDatabaseIndexConstraint() {
  const pg = new PGlite();

  // Create minimal contract_templates table with strict unique index
  await pg.exec(`
    CREATE TABLE contract_templates (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      template_key text NOT NULL,
      title text NOT NULL,
      content_markdown text NOT NULL DEFAULT '',
      version_number integer NOT NULL DEFAULT 1,
      is_current boolean NOT NULL DEFAULT true,
      is_active boolean NOT NULL DEFAULT true,
      is_archived boolean NOT NULL DEFAULT false,
      created_by text NOT NULL DEFAULT 'test-user',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX uq_contract_template_single_current
      ON contract_templates (company_id, template_key)
      WHERE is_current = true;
  `);

  const companyId = 'test-company-001';
  const templateKey = 'locacao-padrao';

  // Step 2.1: Insert first version with is_current = true
  await pg.query(`
    INSERT INTO contract_templates (id, company_id, template_key, title, version_number, is_current, is_active)
    VALUES ('ct-v1', $1, $2, 'Contrato MoveFlex v1', 1, true, true);
  `, [companyId, templateKey]);

  console.log('✓ Step 2.1: First version inserted with is_current = true');

  // Step 2.2: Negative Test / Mutation Proof:
  // Attempt to insert a second version for the same (company_id, template_key) with is_current = true
  let constraintTriggered = false;
  try {
    await pg.query(`
      INSERT INTO contract_templates (id, company_id, template_key, title, version_number, is_current, is_active)
      VALUES ('ct-v2', $1, $2, 'Contrato MoveFlex v2', 2, true, true);
    `, [companyId, templateKey]);
  } catch (caught: any) {
    constraintTriggered = true;
    assert.match(
      String(caught?.message || caught),
      /uq_contract_template_single_current|unique constraint/i,
      `Expected unique constraint violation on uq_contract_template_single_current, got: ${caught}`
    );
  }

  assert.equal(
    constraintTriggered,
    true,
    'MUTATION PROOF: Database MUST reject inserting a second is_current = true for the same template_key'
  );
  console.log('✓ Step 2.2: Mutation proof passed: Database strictly rejected duplicate is_current = true');

  // Step 2.3: Atomic Demote and Promote New Version
  await pg.query(`
    UPDATE contract_templates SET is_current = false, updated_at = now()
    WHERE company_id = $1 AND template_key = $2 AND is_current = true;
  `, [companyId, templateKey]);

  await pg.query(`
    INSERT INTO contract_templates (id, company_id, template_key, title, version_number, is_current, is_active)
    VALUES ('ct-v2', $1, $2, 'Contrato MoveFlex v2', 2, true, true);
  `, [companyId, templateKey]);

  const rows = await pg.query<{ id: string; version_number: number; is_current: boolean }>(`
    SELECT id, version_number, is_current FROM contract_templates
    WHERE company_id = $1 AND template_key = $2
    ORDER BY version_number;
  `, [companyId, templateKey]);

  assert.equal(rows.rows.length, 2, 'Zero physical deletion: both versions must remain in table');
  assert.equal(rows.rows[0].id, 'ct-v1');
  assert.equal(rows.rows[0].is_current, false, 'Prior version demoted to is_current = false');
  assert.equal(rows.rows[1].id, 'ct-v2');
  assert.equal(rows.rows[1].is_current, true, 'New version promoted to is_current = true');

  const currentCount = await pg.query<{ count: string }>(`
    SELECT count(*)::text as count FROM contract_templates
    WHERE company_id = $1 AND template_key = $2 AND is_current = true;
  `, [companyId, templateKey]);
  assert.equal(currentCount.rows[0].count, '1', 'Exactly one current version exists');

  console.log('✓ Step 2.3: Demotion and promotion succeeded cleanly with zero physical deletion');

  // Step 2.4: Test Migration Cleanup Logic on Legacy Multiple Current Records
  // Temporarily disable index to simulate legacy dirty state with 3 current versions
  await pg.exec(`DROP INDEX uq_contract_template_single_current;`);
  await pg.query(`
    INSERT INTO contract_templates (id, company_id, template_key, title, version_number, is_current, is_active, is_archived)
    VALUES
      ('ct-v3', $1, $2, 'Contrato MoveFlex v3', 3, true, false, true),
      ('ct-v4', $1, $2, 'Contrato MoveFlex v4', 4, false, false, false),
      ('ct-v5', $1, $2, 'Contrato MoveFlex v5', 5, true, true, false);
  `, [companyId, templateKey]);

  const dirtyCount = await pg.query<{ count: string }>(`
    SELECT count(*)::text as count FROM contract_templates
    WHERE company_id = $1 AND template_key = $2 AND is_current = true;
  `, [companyId, templateKey]);
  assert.equal(dirtyCount.rows[0].count, '3', 'Simulated dirty state with 3 is_current = true (v2, v3, v5)');

  // Run the exact Migration 0092 cleanup query
  await pg.exec(`
    UPDATE contract_templates ct
    SET is_current = false, updated_at = now()
    WHERE is_current = true
      AND version_number < (
        SELECT MAX(ct2.version_number)
        FROM contract_templates ct2
        WHERE ct2.company_id = ct.company_id
          AND ct2.template_key = ct.template_key
          AND ct2.is_current = true
      );
  `);

  const cleanCount = await pg.query<{ count: string; max_version: number }>(`
    SELECT count(*)::text as count, MAX(version_number) as max_version
    FROM contract_templates
    WHERE company_id = $1 AND template_key = $2 AND is_current = true;
  `, [companyId, templateKey]);
  assert.equal(cleanCount.rows[0].count, '1', 'After migration cleanup, count is strictly 1');
  assert.equal(cleanCount.rows[0].max_version, 5, 'Highest version number (v5) was preserved as current');

  // Re-create unique index to prove index creation succeeds without collision
  await pg.exec(`
    CREATE UNIQUE INDEX uq_contract_template_single_current
      ON contract_templates (company_id, template_key)
      WHERE is_current = true;
  `);

  console.log('✓ Step 2.4: Migration 0092 cleanup query proved: reduced 3 current versions to 1 (retaining MAX)');
}

testDatabaseIndexConstraint()
  .then(() => {
    console.log('\n======================================================');
    console.log('PH-061 CONTRACT TEMPLATE SINGLE CURRENT REGRESSION: PASS');
    console.log('======================================================\n');
  })
  .catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
