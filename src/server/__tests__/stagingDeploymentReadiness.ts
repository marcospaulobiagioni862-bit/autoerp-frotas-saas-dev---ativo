import { readFile } from 'node:fs/promises';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const [server, migrator, packageJson] = await Promise.all([
    readFile('server.ts', 'utf8'),
    readFile('migrate_deploy.cjs', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  assert(server.includes("Number(process.env.PORT || 3000)"), 'Render PORT authority missing');
  assert(server.includes("app.get('/api/health'"), 'Public staging readiness route missing');
  assert(server.indexOf("app.get('/api/health'") < server.indexOf("app.use('/api'"), 'Health route must precede protected API middleware');
  assert(server.includes("await db.execute(sql\`SELECT 1\`)"), 'Health route must verify PostgreSQL');
  assert(server.includes("environment: process.env.APP_ENV || 'unknown'"), 'Health route must expose safe environment classification');
  assert(server.includes("commit: process.env.RENDER_GIT_COMMIT || null"), 'Health route must expose immutable deploy commit');

  assert(migrator.includes('autoerp_schema_migrations'), 'Deploy migrator tracking table missing');
  assert(migrator.includes('checksum_sha256'), 'Deploy migrator checksum guard missing');
  assert(migrator.includes('pg_advisory_lock'), 'Deploy migrator concurrency lock missing');
  assert(migrator.includes("await client.query('BEGIN')"), 'Deploy migrator transaction missing');
  assert(migrator.includes("await client.query('ROLLBACK')"), 'Deploy migrator rollback missing');
  assert(!migrator.includes('autoerp_phase1_test'), 'Deploy migrator must not target the test database');

  const pkg = JSON.parse(packageJson);
  assert(pkg.scripts?.['db:migrate:deploy'] === 'node migrate_deploy.cjs', 'Deploy migration script missing');

  console.log('STAGING-1 Render/Neon deployment readiness: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
