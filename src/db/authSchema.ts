import { boolean, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { companies, users } from './schema';

export const userCredentials = pgTable('user_credentials', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  companyId: text('company_id'),
  passwordHash: text('password_hash').notNull(),
  passwordUpdatedAt: timestamp('password_updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (table) => ({
  userIndex: index('idx_user_credentials_user').on(table.userId),
}));

export const userCompanyMemberships = pgTable('user_company_memberships', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  permissions: text('permissions').array(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({
    columns: [table.userId, table.companyId],
    name: 'user_company_memberships_pkey',
  }),
  companyIndex: index('idx_ucm_company').on(table.companyId, table.userId),
  userIndex: index('idx_ucm_user').on(table.userId, table.active),
}));

export type UserCredentialRow = typeof userCredentials.$inferSelect;
export type NewUserCredentialRow = typeof userCredentials.$inferInsert;
export type UserCompanyMembershipRow = typeof userCompanyMemberships.$inferSelect;
export type NewUserCompanyMembershipRow = typeof userCompanyMemberships.$inferInsert;
