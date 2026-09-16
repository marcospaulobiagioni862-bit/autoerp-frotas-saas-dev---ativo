import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema';
import * as pgPkg from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

let dbInstance: any;

if (process.env.DATABASE_URL) {
  const { Pool } = pgPkg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  dbInstance = drizzlePg(pool, { schema });
} else {
  // PGlite fallback for container / local test execution without external PG URI
  const pgliteClient = new PGlite();
  dbInstance = drizzlePglite(pgliteClient, { schema });

  // Apply migrations synchronously / initially if files exist
  try {
    const drizzleDir = path.join(process.cwd(), 'drizzle');
    if (fs.existsSync(drizzleDir)) {
      const files = ['0000_milky_invisible_woman.sql', '0001_rls_and_audit.sql', '0002_security_rls_hardening.sql'];
      for (const file of files) {
        const filePath = path.join(drizzleDir, file);
        if (fs.existsSync(filePath)) {
          const sqlContent = fs.readFileSync(filePath, 'utf8');
          // Execute migration
          pgliteClient.exec(sqlContent).catch(() => {});
        }
      }
    }
  } catch {
    // Non-blocking initialization
  }
}

export const db = dbInstance;

