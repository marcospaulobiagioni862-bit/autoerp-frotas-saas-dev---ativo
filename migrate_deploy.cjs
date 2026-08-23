const { Client } = require('pg');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function run() {
  if (!connectionString || !connectionString.startsWith('postgres')) {
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required for deploy migrations');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('autoerp_schema_migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.autoerp_schema_migrations (
        filename text PRIMARY KEY,
        checksum_sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = path.join(__dirname, 'drizzle');
    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const filename of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      const digest = checksum(sql);
      const existing = await client.query(
        'SELECT checksum_sha256 FROM public.autoerp_schema_migrations WHERE filename=$1',
        [filename]
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum_sha256 !== digest) {
          throw new Error(`Migration checksum changed after application: ${filename}`);
        }
        console.log(`Already applied: ${filename}`);
        continue;
      }

      console.log(`Applying: ${filename}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public.autoerp_schema_migrations(filename, checksum_sha256) VALUES ($1,$2)',
          [filename, digest]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log(`Deploy migrations complete: ${files.length} canonical files verified`);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('autoerp_schema_migrations'))");
    } catch {}
    await client.end();
  }
}

run().catch((error) => {
  console.error('AUTOERP_DEPLOY_MIGRATION_FAILURE', error);
  process.exit(1);
});
