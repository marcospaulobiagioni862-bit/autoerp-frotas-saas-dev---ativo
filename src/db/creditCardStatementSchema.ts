import { boolean, date, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { financialAccounts, financialTransactions } from './schema';

// FINANCE-CARD-1B2 Drizzle model. Database constraints/triggers/RLS remain authoritative in migration 0040.
export const creditCardProfiles = pgTable('credit_card_profiles', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  financialAccountId: text('financial_account_id').notNull().references(() => financialAccounts.id, { onDelete: 'restrict' }),
  creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull().default('0'),
  closingDay: integer('closing_day').notNull(),
  dueDay: integer('due_day').notNull(),
  active: boolean('active').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdById: text('created_by_id').notNull(),
  updatedById: text('updated_by_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  uqCompanyAccount: uniqueIndex('credit_card_profiles_company_id_financial_account_id_key').on(t.companyId, t.financialAccountId),
  idxCompanyActive: index('idx_credit_card_profiles_company_active').on(t.companyId, t.active),
}));

export const creditCardStatements = pgTable('credit_card_statements', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  creditCardProfileId: text('credit_card_profile_id').notNull().references(() => creditCardProfiles.id, { onDelete: 'restrict' }),
  cycleRef: text('cycle_ref').notNull(),
  closingDate: date('closing_date', { mode: 'string' }).notNull(),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  status: text('status').notNull().default('OPEN'),
  originalAmount: numeric('original_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  adjustmentAmount: numeric('adjustment_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  interestAmount: numeric('interest_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  fineAmount: numeric('fine_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  closedAt: timestamp('closed_at', { mode: 'string' }),
  closedById: text('closed_by_id'),
  version: integer('version').notNull().default(1),
  createdById: text('created_by_id').notNull(),
  updatedById: text('updated_by_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  uqCycle: uniqueIndex('uq_credit_card_statement_cycle').on(t.companyId, t.creditCardProfileId, t.cycleRef),
  idxCompanyDue: index('idx_credit_card_statements_company_due').on(t.companyId, t.dueDate, t.status),
}));

export const creditCardStatementItems = pgTable('credit_card_statement_items', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  statementId: text('statement_id').notNull().references(() => creditCardStatements.id, { onDelete: 'restrict' }),
  financialTransactionId: text('financial_transaction_id').notNull().references(() => financialTransactions.id, { onDelete: 'restrict' }),
  payableId: text('payable_id'),
  originType: text('origin_type'),
  originId: text('origin_id'),
  originalAmount: numeric('original_amount', { precision: 12, scale: 2 }).notNull(),
  adjustmentAmount: numeric('adjustment_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  finalAmount: numeric('final_amount', { precision: 12, scale: 2 }).notNull(),
  createdById: text('created_by_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  uqTransaction: uniqueIndex('uq_credit_card_statement_item_transaction').on(t.companyId, t.financialTransactionId),
  idxStatement: index('idx_credit_card_statement_items_statement').on(t.companyId, t.statementId),
}));

export const creditCardStatementPayments = pgTable('credit_card_statement_payments', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  statementId: text('statement_id').notNull().references(() => creditCardStatements.id, { onDelete: 'restrict' }),
  financialTransactionId: text('financial_transaction_id').notNull().references(() => financialTransactions.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  createdById: text('created_by_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  uqTransfer: uniqueIndex('uq_credit_card_statement_payment_transfer').on(t.companyId, t.financialTransactionId),
  uqIdempotency: uniqueIndex('uq_credit_card_statement_payment_idempotency').on(t.companyId, t.idempotencyKey),
  idxStatement: index('idx_credit_card_statement_payments_statement').on(t.companyId, t.statementId, t.createdAt),
}));
