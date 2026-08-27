const { spawnSync } = require('node:child_process');
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

  const cardB2 = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsx', 'src/server/__tests__/financeCreditCardStatementPersistenceIntegration.ts'],
    { stdio: 'inherit', env: process.env }
  );
  if (cardB2.error) throw cardB2.error;
  if (cardB2.status !== 0) {
    throw new Error(`FINANCE-CARD-1B2 persistence regression failed with exit code ${cardB2.status}`);
  }
  console.log('FINANCE-CARD-1B2 persistence regression verified after migrations.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
