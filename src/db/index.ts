import * as schema from './schema';
import * as dotenv from 'dotenv';
import { createRequire } from 'module';
import { normalizePostgresConnectionString } from './postgresConnectionString';

const require = createRequire(import.meta.url);
dotenv.config();

let dbInstance: any;

if (process.env.NODE_ENV === 'production') {
  if (process.env.USE_PGLITE === 'true' || !process.env.DATABASE_URL) {
    throw new Error('FATAL: Production environment requires valid DATABASE_URL and USE_PGLITE must be false.');
  }
}

if (process.env.USE_PGLITE === 'true' || (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production')) {
  const { PGlite } = require('@electric-sql/pglite');
  const { drizzle } = require('drizzle-orm/pglite');
  const client = new PGlite();
  dbInstance = drizzle(client, { schema });
} else {
  const { drizzle } = require('drizzle-orm/node-postgres');
  const pgPkg = require('pg');
  const { Pool } = pgPkg;
  const rawConnectionString = process.env.DATABASE_URL || (process.env.NODE_ENV === 'test' ? 'postgres://ai_studio_app_user:@localhost:5432/autoerp_phase1_test' : undefined);
  if (!rawConnectionString) {
    throw new Error('DATABASE_URL environment variable is required.');
  }
  const connectionString = normalizePostgresConnectionString(rawConnectionString);
  const pool = new Pool({ connectionString });
  dbInstance = drizzle(pool, { schema });
}

export const db = dbInstance;


