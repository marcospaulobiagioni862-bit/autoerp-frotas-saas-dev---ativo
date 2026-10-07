import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractNumericPrefix,
  assertNoRepositoryPrefixCollisions,
  assertNoDatabasePrefixCollision,
  HISTORICAL_PREFIX_EXCEPTIONS,
  runMigrations,
} = require('../../../migrate_db.cjs');

/**
 * REGRESSÃO E PROVA DE MUTAÇÃO: GUARDA DE PREFIXO DE MIGRATION (AUTOERP-68)
 *
 * Garante que:
 * 1. Mutações com arquivos duplicando prefixo numérico no repositório falham imediatamente.
 * 2. Mutações com arquivo pendente colidindo com prefixo já aplicado no banco falham imediatamente.
 * 3. Exceções históricas reais (0041, 0042, 0052, 0066, 0067) são respeitadas estritamente pelo whitelist.
 * 4. O repositório real passa sem nenhum falso positivo.
 * 5. Ensaios reais (dryRun) contra as bases reais de Homologação e Staging executam com sucesso.
 */
export async function runMigrationPrefixCollisionRegression(): Promise<void> {
  console.log('=== TESTE DE REGRESSÃO: GUARDA DE COLISÃO DE MIGRATIONS (AUTOERP-68) ===');

  // 1. Validar helper de extração de prefixo numérico
  assert.equal(extractNumericPrefix('0085_tenant_profile_logo_url.sql'), '0085');
  assert.equal(extractNumericPrefix('0001_rls_and_audit.sql'), '0001');
  assert.equal(extractNumericPrefix('readme.txt'), null);

  // 2. MUTAÇÃO 1: Colisão de prefixo no repositório local
  console.log('\n[1/5] Testando mutação de colisão no repositório local...');
  const syntheticCollidingRepoFiles = [
    '0001_init.sql',
    '0087_feature_a.sql',
    '0087_feature_b.sql',
  ];
  assert.throws(
    () => assertNoRepositoryPrefixCollisions(syntheticCollidingRepoFiles),
    (err: any) => {
      assert(err instanceof Error);
      assert(err.message.includes('MIGRATION PREFIX COLLISION IN REPOSITORY'));
      assert(err.message.includes('0087'));
      return true;
    },
    'Deve lançar erro ao detectar arquivos locais com prefixo numérico duplicado'
  );
  console.log('  ✓ Mutação local barrada com sucesso.');

  // 3. MUTAÇÃO 2: Tentativa de adicionar arquivo novo reutilizando prefixo histórico protegido
  console.log('\n[2/5] Testando tentativa de reuso indevido de prefixo histórico...');
  const syntheticIllegalHistoricReuse = [
    '0066_maintenance_split_finance_components.sql',
    '0066_arquivo_invasor.sql',
  ];
  assert.throws(
    () => assertNoRepositoryPrefixCollisions(syntheticIllegalHistoricReuse),
    (err: any) => {
      assert(err instanceof Error);
      assert(err.message.includes('MIGRATION PREFIX COLLISION IN REPOSITORY'));
      assert(err.message.includes('0066'));
      return true;
    },
    'Deve recusar reuso de prefixo histórico fora do whitelist fechado'
  );
  console.log('  ✓ Tentativa de invasão em prefixo histórico barrada com sucesso.');

  // 4. MUTAÇÃO 3: Colisão de prefixo pendente contra o histórico aplicado no banco
  console.log('\n[3/5] Testando mutação de colisão contra histórico de banco...');
  const appliedHistory = ['0085_tenant_profile_logo_url.sql', '0086_settlement_compositions.sql'];
  const newCollidingPendingFile = '0085_outro_recurso.sql';

  assert.throws(
    () => assertNoDatabasePrefixCollision(newCollidingPendingFile, appliedHistory),
    (err: any) => {
      assert(err instanceof Error);
      assert(err.message.includes('MIGRATION PREFIX COLLISION AGAINST DATABASE'));
      assert(err.message.includes('0085'));
      return true;
    },
    'Deve barrar aplicação de arquivo que colide com prefixo já registrado no banco'
  );
  console.log('  ✓ Colisão contra o histórico do banco barrada com sucesso.');

  // 5. ESTADO REAL DO REPOSITÓRIO: Validar arquivos reais em drizzle/
  console.log('\n[4/5] Validando integridade dos arquivos reais de drizzle/...');
  const drizzleDir = join(process.cwd(), 'drizzle');
  const realRepoFiles = readdirSync(drizzleDir).filter((f) => f.endsWith('.sql')).sort();
  assert.doesNotThrow(
    () => assertNoRepositoryPrefixCollisions(realRepoFiles),
    'Arquivos reais em drizzle/ não devem disparar erro na guarda local'
  );
  console.log(`  ✓ ${realRepoFiles.length} migrations em drizzle/ verificadas com sucesso.`);

  // 6. ENSAIO REAL CONTRA HOMOLOGAÇÃO E STAGING (se env disponível)
  console.log('\n[5/5] Executando ensaios reais (dryRun) contra Homologação e Staging...');
  let envContent = '';
  try {
    envContent = readFileSync(join(homedir(), '.config/autoerp-neon.env'), 'utf-8');
  } catch {
    console.log('  ⚠ ~/.config/autoerp-neon.env não encontrado. Pulando ensaio com banco remoto.');
    return;
  }

  let homologUrl = '';
  let stagingUrl = '';
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    const m1 = trimmed.match(/^HOMOLOG_DATABASE_URL="?([^"]*)"?$/);
    if (m1) homologUrl = m1[1];
    const m2 = trimmed.match(/^STAGING_MAIN_DATABASE_URL="?([^"]*)"?$/);
    if (m2) stagingUrl = m2[1];
  }

  if (homologUrl) {
    await runMigrations({ connectionString: homologUrl, dryRun: true });
    console.log('  ✓ Ensaio real contra HOMOLOGAÇÃO concluído com sucesso.');
  }

  if (stagingUrl) {
    await runMigrations({ connectionString: stagingUrl, dryRun: true });
    console.log('  ✓ Ensaio real contra STAGING concluído com sucesso.');
  }

  console.log('\n======================================================================');
  console.log('=== TODAS AS ASSERÇÕES E ENSAIOS DO AUTOERP-68 PASSARAM COM SUCESSO ===');
  console.log('======================================================================\n');
}

if (process.argv[1]?.endsWith('migrationPrefixCollisionRegression.ts')) {
  runMigrationPrefixCollisionRegression()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
