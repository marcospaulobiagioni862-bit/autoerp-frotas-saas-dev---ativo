const { spawnSync } = require('node:child_process');
const { runMigrations } = require('./migrate_db.cjs');

const clientConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: 'autoerp_phase1_test',
  host: process.env.SQL_HOST,
};

function runTsxRegression(file, label) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsx', file],
    { stdio: 'inherit', env: process.env }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
  console.log(`${label} verified after migrations.`);
}

async function run() {
  await runMigrations({ clientConfig });
  await runMigrations({ clientConfig });
  console.log('Migration runner idempotency verified.');

  runTsxRegression(
    'src/server/__tests__/financeCreditCardStatementPersistenceIntegration.ts',
    'FINANCE-CARD-1B2 persistence regression'
  );
  runTsxRegression(
    'src/server/__tests__/financeCreditCardPurchaseCycleIntegration.ts',
    'FINANCE-CARD-1C purchase-cycle regression'
  );
  runTsxRegression(
    'src/server/__tests__/financeCreditCardPaymentReversalIntegration.ts',
    'FINANCE-CARD-1E3 payment-reversal regression'
  );
  runTsxRegression(
    'src/server/__tests__/financeCreditCardPurchaseReversalIntegration.ts',
    'FINANCE-CARD-1E4 purchase-reversal regression'
  );
  runTsxRegression(
    'src/server/__tests__/creditCardStatementOverdueTestRunner.ts',
    'FINANCE-CARD-1E2 overdue derivation regression'
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});