const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  // connect to default db to drop and recreate
  const c0 = new Client({
    connectionString: `postgres://${process.env.SQL_USER}:${process.env.SQL_PASSWORD}@${encodeURIComponent(process.env.SQL_HOST)}/postgres`
  });
  await c0.connect();
  // drop connections
  await c0.query(`SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = 'autoerp_phase1_test' AND pid <> pg_backend_pid();`);
  await c0.query('DROP DATABASE IF EXISTS autoerp_phase1_test');
  await c0.query('CREATE DATABASE autoerp_phase1_test');
  await c0.end();
  
  // connect to the new db
  const c1 = new Client({
    connectionString: `postgres://${process.env.SQL_USER}:${process.env.SQL_PASSWORD}@${encodeURIComponent(process.env.SQL_HOST)}/autoerp_phase1_test`
  });
  await c1.connect();
  
  const files = fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    console.log('Running ' + file);
    const sql = fs.readFileSync(path.join('drizzle', file), 'utf8');
    await c1.query(sql);
  }
  await c1.end();
  console.log('DB recreated successfully.');
}
run().catch(console.error);
