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
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = path.join(__dirname, 'drizzle');
    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const checksum = checksumSql(sql);
      const existing = await client.query(
        `SELECT checksum FROM ${MIGRATION_TABLE} WHERE filename = $1`,
        [file]
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Migration checksum mismatch for already-applied file: ${file}`);
        }
        console.log(`Skipping already-applied migration ${file}`);
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

module.exports = { normalizePostgresConnectionString, runMigrations };

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
