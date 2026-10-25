import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { FinanceMasterDataAuthority } from '../financeMasterDataAuthority';
import { DEFAULT_FINANCIAL_CATEGORIES } from '../../shared/utils/financialDreGroups';

// Em ambiente de teste local isolado sem Postgres ativo (fallback PGlite),
// aplica as migrações canônicas de drizzle/ diretamente para garantir integridade do schema (Regra 3.2-g).
// No CI, o runner migrate_test_db.cjs já aplica o schema completo no banco Postgres.
if ((db as any).$client && typeof (db as any).$client.exec === 'function') {
  for (const file of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) {
    try {
      await (db as any).$client.exec(readFileSync(`drizzle/${file}`, 'utf8'));
    } catch (e) {
      // Ignora se tabela/função já existir em re-execução
    }
  }
  await db.execute(sql`CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(bigint) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'`);
  await db.execute(sql`CREATE OR REPLACE FUNCTION pg_advisory_xact_lock_shared(bigint) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'`);
}

// 1. Invariantes Estáticas e Contratos de Fonte Única da Verdade (Regras 3.1 & 3.2)
const authoritySrc = readFileSync(resolve(process.cwd(), 'src/server/financeMasterDataAuthority.ts'), 'utf8');
const routesSrc = readFileSync(resolve(process.cwd(), 'src/server/financeMasterDataRoutes.ts'), 'utf8');
const clientSrc = readFileSync(resolve(process.cwd(), 'src/api/financeMasterDataClient.ts'), 'utf8');
const uiSrc = readFileSync(resolve(process.cwd(), 'src/components/finance/FinancialMasterDataView.tsx'), 'utf8');
const serverSrc = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');
const seedSrc = readFileSync(resolve(process.cwd(), 'src/db/seed.ts'), 'utf8');

const requiredCategories = [
  'Peças e componentes',
  'Serviços de oficina',
  'Mão de obra',
  'Pneus',
  'Combustível',
  'IPVA e Documentação',
  'Seguro',
  'Multas de trânsito',
];

for (const name of requiredCategories) {
  assert(
    DEFAULT_FINANCIAL_CATEGORIES.some((cat) => cat.name.toLowerCase() === name.toLowerCase()),
    `DEFAULT_FINANCIAL_CATEGORIES must contain canonical category: ${name}`
  );
}

// Invariantes de autoridade, lock e rota
assert(authoritySrc.includes('seedDefaultCategories'), 'FinanceMasterDataAuthority must expose seedDefaultCategories');
assert(authoritySrc.includes('lockLogicalName'), 'seedDefaultCategories must enforce advisory lock on tenant');
assert(authoritySrc.includes('assertUniqueName'), 'seedDefaultCategories must inherit assertUniqueName and advisory lock');
assert(authoritySrc.includes('onConflictDoNothing'), 'seedDefaultCategories must rely on onConflictDoNothing backed by unique index');
assert(authoritySrc.includes('FINANCIAL_MASTER_DATA_MANAGE'), 'seedDefaultCategories must enforce permission FINANCIAL_MASTER_DATA_MANAGE');
assert(routesSrc.includes('/api/finance/master-data/categories/seed-defaults'), 'Routes must expose POST /api/finance/master-data/categories/seed-defaults');
assert(clientSrc.includes('seedDefaultCategories'), 'FinanceMasterDataClient must expose seedDefaultCategories');
assert(uiSrc.includes('FinanceMasterDataClient.seedDefaultCategories()'), 'UI button must invoke authoritative seedDefaultCategories endpoint');

// Onboarding e fail-safe
assert(serverSrc.includes('FinanceMasterDataAuthority.seedDefaultCategories'), 'server.ts bootstrap must call canonical seedDefaultCategories');
assert(serverSrc.includes('AUTOERP_BOOTSTRAP_CATEGORIES_SEED_WARNING'), 'server.ts bootstrap must wrap category seed in try/catch to protect account provisioning');
assert(seedSrc.includes('FinanceMasterDataAuthority.seedDefaultCategories'), 'src/db/seed.ts must call canonical seedDefaultCategories');

// 2. Execução REAL da Idempotência contra Banco de Dados (Regra 3.2-h)
const testCompanyId = 'co-seed-idempotency-test-real';
const testUserId = 'user-admin-seed-real';
const testActor = {
  companyId: testCompanyId,
  userId: testUserId,
  name: 'Admin Seed Tester',
};

async function cleanTestData(): Promise<void> {
  await db.execute(sql`DELETE FROM financial_categories WHERE company_id = ${testCompanyId}`);
  await db.execute(sql`DELETE FROM users WHERE company_id = ${testCompanyId}`);
  await db.execute(sql`DELETE FROM companies WHERE id = ${testCompanyId}`);
}

await cleanTestData();

try {
  // Criar empresa e usuário ADMIN para teste
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at)
    VALUES (${testCompanyId}, 'Empresa Teste Idempotência Real', 'ACTIVE', now(), now())
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at)
    VALUES (${testUserId}, ${testCompanyId}, 'Admin Seed Tester', 'admin-seed@example.test', 'ADMIN', true, now(), now())
  `);

  // Simular o estado inicial do Marcos: 'Multas de trânsito' já cadastrada
  await db.execute(sql`
    INSERT INTO financial_categories (id, company_id, name, type, active, created_at, updated_at)
    VALUES ('cat-multas-preexistente', ${testCompanyId}, 'Multas de trânsito', 'BOTH', true, now(), now())
  `);

  // PRIMEIRA EXECUÇÃO REAL contra o banco
  const run1 = await FinanceMasterDataAuthority.seedDefaultCategories(testActor);
  assert(run1.created > 0, `Primeira execução deve criar categorias ausentes, criou ${run1.created}`);
  assert(run1.skipped >= 1, `Primeira execução deve pular Multas de trânsito preexistente, pulou ${run1.skipped}`);

  // Verificar no banco se 'Multas de trânsito' existe exatamente uma vez (não duplicada)
  const multasRows: any = await db.execute(sql`
    SELECT id, name, type FROM financial_categories
    WHERE company_id = ${testCompanyId} AND lower(name) = 'multas de trânsito'
  `);
  const multasCount = multasRows.rows ? multasRows.rows.length : multasRows.length;
  assert.equal(multasCount, 1, 'Multas de trânsito NUNCA pode ser duplicada');

  // Verificar se Peças e componentes foi criada
  const pecasRows: any = await db.execute(sql`
    SELECT id, name FROM financial_categories
    WHERE company_id = ${testCompanyId} AND lower(name) = 'peças e componentes'
  `);
  const pecasCount = pecasRows.rows ? pecasRows.rows.length : pecasRows.length;
  assert.equal(pecasCount, 1, 'Peças e componentes deve ter sido criada no banco');

  const totalAfterRun1 = run1.total;

  // SEGUNDA EXECUÇÃO REAL SEGUIDA (Simulação do segundo clique ou replay)
  const run2 = await FinanceMasterDataAuthority.seedDefaultCategories(testActor);
  assert.equal(run2.created, 0, `Segunda execução deve criar 0 categorias (idempotência real), mas criou ${run2.created}`);
  assert.equal(run2.skipped, DEFAULT_FINANCIAL_CATEGORIES.length, `Segunda execução deve pular todas as categorias padrão (${DEFAULT_FINANCIAL_CATEGORIES.length})`);
  assert.equal(run2.total, totalAfterRun1, `Total de categorias deve permanecer idêntico (${totalAfterRun1})`);

  // Verificar no banco que a contagem física de categorias permaneceu inalterada
  const finalCategoriesRows: any = await db.execute(sql`
    SELECT count(*) as total FROM financial_categories WHERE company_id = ${testCompanyId}
  `);
  const finalCount = Number((finalCategoriesRows.rows ? finalCategoriesRows.rows[0] : finalCategoriesRows[0]).total);
  assert.equal(finalCount, totalAfterRun1, `Contagem física no banco deve ser ${totalAfterRun1}, obteve ${finalCount}`);

} finally {
  await cleanTestData();
}

console.log('financialCategoriesSeedRegression: PASS');
process.exit(0);
