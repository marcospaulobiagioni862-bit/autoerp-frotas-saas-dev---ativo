import { foreignKey, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './schema';

export const userCredentials = pgTable('user_credentials', {
  companyId: text('company_id').notNull(),
  userId: text('user_id').notNull(),
  passwordHash: text('password_hash').notNull(),
  passwordUpdatedAt: timestamp('password_updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({
    columns: [table.companyId, table.userId],
    name: 'user_credentials_pkey',
  }),
  userIndex: index('idx_user_credentials_user').on(table.userId),
  userTenantForeignKey: foreignKey({
    columns: [table.companyId, table.userId],
    foreignColumns: [users.companyId, users.id],
    name: 'user_credentials_user_tenant_fk',
  }).onDelete('cascade'),
}));

export type UserCredentialRow = typeof userCredentials.$inferSelect;
export type NewUserCredentialRow = typeof userCredentials.$inferInsert;
