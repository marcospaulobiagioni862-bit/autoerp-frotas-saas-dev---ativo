const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const MIGRATION_TABLE = 'autoerp_schema_migrations';
const CURRENT_VERIFY_FULL_ALIASES = new Set(['prefer', 'require', 'verify-ca']);

function normalizePostgresConnectionString(connectionString) {
  try {
    const parsed = new URL(connectionString);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return connectionString;
    if (parsed.searchParams.get('uselibpqcompat')?.toLowerCase() === 'true') return connectionString;

    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (!sslMode || !CURRENT_VERIFY_FULL_ALIASES.has(sslMode)) return connectionString;

    parsed.searchParams.set('sslmode', 'verify-full');
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

function checksumSql(sql) {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

const HISTORICAL_PREFIX_EXCEPTIONS = new Map([
  ['0041', new Set(['0041_finance_credit_card_full_payment_authority.sql', '0041_finance_credit_card_statement_adjustments.sql'])],
  ['0042', new Set(['0042_finance_credit_card_partial_payment_authority.sql', '0042_finance_credit_card_post_close_credits.sql'])],
  ['0052', new Set(['0052_traffic_ticket_infraction_time.sql', '0052_whatsapp_traffic_ticket_template.sql'])],
  ['0066', new Set(['0066_maintenance_split_finance_components.sql', '0066_vehicle_km_batch_schedule.sql'])],
  ['0067', new Set(['0067_maintenance_rule_bank.sql', '0067_vehicle_km_whatsapp_alerts.sql'])],
]);

function extractNumericPrefix(filename) {
  const match = String(filename || '').match(/^(\d{4})/);
  return match ? match[1] : null;
}

function assertNoRepositoryPrefixCollisions(files) {
  const prefixMap = new Map();
  for (const file of files) {
    const prefix = extractNumericPrefix(file);
    if (!prefix) continue;
    if (!prefixMap.has(prefix)) prefixMap.set(prefix, []);
    prefixMap.get(prefix).push(file);
  }

  for (const [prefix, list] of prefixMap.entries()) {
    if (list.length > 1) {
      const allowed = HISTORICAL_PREFIX_EXCEPTIONS.get(prefix);
      if (!allowed || list.some((f) => !allowed.has(f))) {
        throw new Error(
          `MIGRATION PREFIX COLLISION IN REPOSITORY: multiple migration files share numeric prefix ${prefix}: ${list.join(', ')}`
        );
      }
    }
  }
}

function assertNoDatabasePrefixCollision(file, appliedFiles) {
  const prefix = extractNumericPrefix(file);
  if (!prefix) return;

  const allowed = HISTORICAL_PREFIX_EXCEPTIONS.get(prefix);
  for (const applied of appliedFiles) {
    if (applied === file) continue;
    const appliedPrefix = extractNumericPrefix(applied);
    if (appliedPrefix === prefix) {
      if (!allowed || !allowed.has(file) || !allowed.has(applied)) {
        throw new Error(
          `MIGRATION PREFIX COLLISION AGAINST DATABASE: numeric prefix ${prefix} from "${file}" has already been applied under a different filename "${applied}".`
        );
      }
    }
  }
}

async function runMigrations(options = {}) {
  const rawConnectionString = options.connectionString || process.env.DATABASE_URL;
  const clientConfig = options.clientConfig || (rawConnectionString
    ? { connectionString: normalizePostgresConnectionString(rawConnectionString) }
    : null);

  if (!clientConfig) {
    throw new Error('DATABASE_URL is required to run AutoERP database migrations.');
  }

  const client = new Client(clientConfig);
  await client.connect();

  try {
    const tableCheck = await client.query(
      `SELECT to_regclass('${MIGRATION_TABLE}') as reg`
    );
    if (!tableCheck.rows[0]?.reg) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
          filename text PRIMARY KEY,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    }

    const migrationsDir = path.join(__dirname, 'drizzle');
    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // Guarda 1: validar colisão no diretório local de migrations
    assertNoRepositoryPrefixCollisions(files);

    const appliedResult = await client.query(
      `SELECT filename, checksum FROM ${MIGRATION_TABLE}`
    );
    const appliedMap = new Map(appliedResult.rows.map((r) => [r.filename, r.checksum]));
    const appliedFiles = Array.from(appliedMap.keys());

    for (const file of files) {
      // Guarda 2: validar colisão contra o histórico de migrations do banco
      assertNoDatabasePrefixCollision(file, appliedFiles);

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const checksum = checksumSql(sql);
      const existingChecksum = appliedMap.get(file);

      if (existingChecksum !== undefined) {
        if (existingChecksum !== checksum) {
          throw new Error(`Migration checksum mismatch for already-applied file: ${file}`);
        }
        console.log(`Skipping already-applied migration ${file}`);
        continue;
      }

      if (options.dryRun) {
        console.log(`[dryRun] Verified prefix and ready to apply: ${file}`);
        continue;
      }

      console.log(`Applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO ${MIGRATION_TABLE} (filename, checksum) VALUES ($1, $2)`,
          [file, checksum]
        );
        await client.query('COMMIT');
        appliedMap.set(file, checksum);
        appliedFiles.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('Database migrations are up to date.');
  } finally {
    await client.end();
  }
}

module.exports = {
  normalizePostgresConnectionString,
  runMigrations,
  extractNumericPrefix,
  assertNoRepositoryPrefixCollisions,
  assertNoDatabasePrefixCollision,
  HISTORICAL_PREFIX_EXCEPTIONS,
};

if (require.main === module) {
  if (process.env.AUTOERP_SKIP_MIGRATIONS === 'true') {
    console.log('Database migrations skipped for isolated visual preview.');
    process.exit(0);
  }
  runMigrations().catch((error) => {
    console.error('DATABASE_MIGRATION_FAILED', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
