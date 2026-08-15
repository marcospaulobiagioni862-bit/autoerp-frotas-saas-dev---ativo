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
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

  for (const file of files) {
    console.log('Applying ' + file);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
  }

  // Also apply RLS
  console.log('Applying rls.sql');
  const rlsSql = fs.readFileSync(path.join(__dirname, 'rls.sql'), 'utf8');
  await client.query(rlsSql);

  await client.end();
  console.log('Migrations and RLS applied successfully.');
}
run().catch(e => { console.error(e); process.exit(1); });
