const { runMigrations } = require('./migrate_db.cjs');

const clientConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: 'autoerp_phase1_test',
  host: process.env.SQL_HOST,
};

async function run() {
  await runMigrations({ clientConfig });
  await runMigrations({ clientConfig });
  console.log('Migration runner idempotency verified.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
