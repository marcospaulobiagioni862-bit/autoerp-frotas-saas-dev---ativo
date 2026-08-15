require('dotenv').config();
const { execSync } = require('child_process');

process.env.DATABASE_URL = `postgres://${process.env.SQL_USER}:${process.env.SQL_PASSWORD}@${encodeURIComponent(process.env.SQL_HOST)}/autoerp_phase1_test`;

try {
  execSync('npx drizzle-kit push --config=src/db/drizzle.config.ts --force', { stdio: 'inherit' });
} catch (e) {
  process.exit(1);
}
