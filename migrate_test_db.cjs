const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new Client({
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: 'autoerp_phase1_test',
    host: process.env.SQL_HOST
  });
  await client.connect();

  const migrationsDir = path.join(__dirname, 'drizzle');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    console.log('Applying ' + file);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
  }

  // Historical repositories could have a standalone rls.sql. Current AutoERP
  // manages RLS in numbered migrations, so keep this compatibility hook optional.
  const legacyRlsPath = path.join(__dirname, 'rls.sql');
  if (fs.existsSync(legacyRlsPath)) {
    console.log('Applying legacy rls.sql');
    await client.query(fs.readFileSync(legacyRlsPath, 'utf8'));
  } else {
    console.log('No legacy rls.sql found; RLS is managed by numbered migrations.');
  }

  await client.end();
  console.log('Migrations applied successfully.');
}
run().catch(e => { console.error(e); process.exit(1); });
