import { readdirSync, readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';

// Hard isolation: never use a configured network database or dotenv credentials.
process.env.NODE_ENV = 'test';
process.env.USE_PGLITE = 'true';
delete process.env.DATABASE_URL;
const { db } = await import('../../db');
for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  try {
    await db.$client.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  } catch (error) {
    console.error(`Local migration failed: ${file}`);
    throw error;
  }
}
// PGlite has one connection; these PostgreSQL concurrency primitives are tested in CI.
await db.execute(sql`CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(bigint) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'`);
await db.execute(sql`CREATE OR REPLACE FUNCTION pg_advisory_xact_lock_shared(bigint) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'`);
console.log('Isolated PGlite migrations ready');
if (process.argv[2]) {
  const suite = await import(new URL(process.argv[2], import.meta.url).href);
  if (process.argv[3]) await suite[process.argv[3]]();
}
await db.$client.close();
