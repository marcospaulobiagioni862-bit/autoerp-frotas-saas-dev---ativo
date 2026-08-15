import * as schema from './schema';

if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
  try {
    const dotenv = require('dotenv');
    dotenv.config();
  } catch {
    // ignore in environments where dotenv cannot load
  }
}

let dbInstance: any;

const isBrowser = typeof window !== 'undefined';

if (!isBrowser) {
  try {
    if (typeof process !== 'undefined' && process.env.DATABASE_URL) {
      const { drizzle } = require('drizzle-orm/node-postgres');
      const pgPkg = require('pg');
      const { Pool } = pgPkg;
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      dbInstance = drizzle(pool, { schema });
    } else {
      // Default to PGlite in-memory when DATABASE_URL is not provided
      const { PGlite } = require('@electric-sql/pglite');
      const { drizzle } = require('drizzle-orm/pglite');
      const client = new PGlite();
      dbInstance = drizzle(client, { schema });
    }
  } catch (err) {
    console.warn('[AI Studio] Database init warning, falling back to proxy mock:', err);
  }
}

if (!dbInstance) {
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({}),
  };
  dbInstance = new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'query') return new Proxy({}, { get: () => noOp });
      if (prop === 'execute') return async () => ({ rows: [] });
      if (prop === 'transaction') return async (cb: any) => cb({ execute: async () => ({ rows: [] }) });
      return async () => [];
    },
  });
}

export const db = dbInstance;


