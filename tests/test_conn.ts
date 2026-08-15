import * as pgPkg from 'pg';
const { Pool } = pgPkg.default || pgPkg;
async function run() {
  const pool = new Pool({
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: 'autoerp_phase1_test',
    host: process.env.SQL_HOST
  });
  const res = await pool.query('SELECT current_database(), current_user');
  console.log(res.rows);
  await pool.end();
}
run().catch(console.error);
