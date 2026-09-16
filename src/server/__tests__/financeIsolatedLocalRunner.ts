import { readdirSync, readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';

// Never load credentials or connect to a network database.
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';
process.env.USE_PGLITE = 'true';
delete process.env.DATABASE_URL;
process.env.FINANCE_ISOLATED_RUNNER = 'true';
const { db } = await import('../../db');
for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  await db.$client.exec(readFileSync(`drizzle/${file}`, 'utf8'));
}
// Single-connection PGlite verifies behavior; real locking remains a PostgreSQL CI check.
await db.execute(sql`CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(bigint) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'`);
await db.execute(sql`CREATE OR REPLACE FUNCTION pg_advisory_xact_lock_shared(bigint) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'`);
console.log('Isolated PGlite migrations ready (no network database)');
const suite = await import(new URL(process.argv[2], import.meta.url).href);
try {
  await suite[process.argv[3] || 'run']();
} finally {
  await db.$client.close();
}
