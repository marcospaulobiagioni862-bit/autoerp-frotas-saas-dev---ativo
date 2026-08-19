import { isNotNull } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, integer, numeric, index, uniqueIndex, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Tenants / Companies
export const companies = pgTable('companies', {
  id: text('id').primaryKey(), // Using UUIDs string
  document: text('document').unique(),
  name: text('name').notNull(),
  status: text('status').notNull(), // ACTIVE, INACTIVE
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull(),
  active: boolean('active').notNull().default(true),
  permissions: text('permissions').array(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  plate: text('plate').notNull(),
  renavam: text('renavam').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq_plate: unique().on(t.companyId, t.plate),
  unq_renavam: unique().on(t.companyId, t.renavam),
  idx_company_status: index('idx_veh_company_status').on(t.companyId, t.status),
}));

export const drivers = pgTable('drivers', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  name: text('name').notNull(),
  cpf: text('cpf').notNull(),
  cnh: text('cnh').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq_cpf: unique().on(t.companyId, t.cpf),
  unq_cnh: unique().on(t.companyId, t.cnh),
  idx_company_active: index('idx_drv_company_active').on(t.companyId, t.active),
}));

export const driverHealthProfiles = pgTable('driver_health_profiles', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  driverId: text('driver_id').notNull(),
  bloodType: text('blood_type'),
  allergies: text('allergies'),
  relevantConditions: text('relevant_conditions'),
  continuousMedications: text('continuous_medications'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactRelationship: text('emergency_contact_relationship'),
  emergencyContactPhone: text('emergency_contact_phone'),
  emergencyNotes: text('emergency_notes'),
  lastUpdateDate: timestamp('last_update_date', { mode: 'string' }),
  responsibleUser: text('responsible_user'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq_company_driver: unique('driver_health_profiles_company_driver_unique').on(t.companyId, t.driverId),
  idx_company: index('idx_driver_health_profiles_company').on(t.companyId),
  idx_driver: index('idx_driver_health_profiles_driver').on(t.driverId),
}));

export const contracts = pgTable('contracts', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  driverId: text('driver_id').notNull(),
  vehicleId: text('vehicle_id').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idx_company_status: index('idx_cnt_company_status').on(t.companyId, t.status),
}));

export const financialCategories = pgTable('financial_categories', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  parentId: text('parent_id'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const financialAccounts = pgTable('financial_accounts', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  institution: text('institution'),
  accountNumber: text('account_number'),
  agency: text('agency'),
  pixKey: text('pix_key'),
  initialBalance: numeric('initial_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  currentBalance: numeric('current_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const accountReceivables = pgTable('account_receivables', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  originType: text('origin_type').notNull(),
  originId: text('origin_id').notNull(),
  vehicleId: text('vehicle_id'),
  driverId: text('driver_id'),
  contractId: text('contract_id'),
  categoryId: text('category_id').notNull(),
  description: text('description').notNull(),
  originalAmount: numeric('original_amount', { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  fineAmount: numeric('fine_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  interestAmount: numeric('interest_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  updatedAmount: numeric('updated_amount', { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull(),
  dueDate: timestamp('due_date', { mode: 'string' }).notNull(),
  competenceDate: timestamp('competence_date', { mode: 'string' }).notNull(),
  status: text('status').notNull(),
  installmentGroupId: text('installment_group_id'),
  installmentNumber: integer('installment_number'),
  periodRef: text('period_ref'), // For uniqueness
  totalInstallments: integer('total_installments'),
  renegotiationId: text('renegotiation_id'),
  cancelledAt: timestamp('cancelled_at', { mode: 'string' }),
  cancelReason: text('cancel_reason'),
  notes: text('notes'),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  // Recurring Billing Uniqueness
  unq_recurring: uniqueIndex('unq_receivable_recurring')
    .on(t.companyId, t.originType, t.originId, t.periodRef)
    .where(isNotNull(t.periodRef)),
  // Installments Uniqueness
  unq_installments: uniqueIndex('unq_receivable_installments')
    .on(t.companyId, t.originType, t.originId, t.installmentNumber)
    .where(isNotNull(t.installmentNumber)),
  unq_idempotency: uniqueIndex('unq_receivable_idempotency')
    .on(t.companyId, t.idempotencyKey)
    .where(isNotNull(t.idempotencyKey)),
  idx_due_status: index('idx_receivable_due_status').on(t.companyId, t.dueDate, t.status),
}));

export const accountPayables = pgTable('account_payables', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  originType: text('origin_type').notNull(),
  originId: text('origin_id').notNull(),
  vehicleId: text('vehicle_id'),
  driverId: text('driver_id'),
  contractId: text('contract_id'),
  categoryId: text('category_id').notNull(),
  description: text('description').notNull(),
  originalAmount: numeric('original_amount', { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  fineAmount: numeric('fine_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  interestAmount: numeric('interest_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  updatedAmount: numeric('updated_amount', { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull(),
  dueDate: timestamp('due_date', { mode: 'string' }).notNull(),
  competenceDate: timestamp('competence_date', { mode: 'string' }).notNull(),
  status: text('status').notNull(),
  installmentGroupId: text('installment_group_id'),
  installmentNumber: integer('installment_number'),
  periodRef: text('period_ref'),
  totalInstallments: integer('total_installments'),
  renegotiationId: text('renegotiation_id'),
  cancelledAt: timestamp('cancelled_at', { mode: 'string' }),
  cancelReason: text('cancel_reason'),
  notes: text('notes'),
  supplierId: text('supplier_id'),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq_recurring: uniqueIndex('unq_payable_recurring')
    .on(t.companyId, t.originType, t.originId, t.periodRef)
    .where(isNotNull(t.periodRef)),
  unq_installments: uniqueIndex('unq_payable_installments')
    .on(t.companyId, t.originType, t.originId, t.installmentNumber)
    .where(isNotNull(t.installmentNumber)),
  unq_idempotency: uniqueIndex('unq_payable_idempotency')
    .on(t.companyId, t.idempotencyKey)
    .where(isNotNull(t.idempotencyKey)),
  idx_due_status: index('idx_payable_due_status').on(t.companyId, t.dueDate, t.status),
}));

export const financialTransactions = pgTable('financial_transactions', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  financialAccountId: text('financial_account_id').notNull(),
  destinationAccountId: text('destination_account_id'),
  receivableId: text('receivable_id'),
  payableId: text('payable_id'),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethodId: text('payment_method_id').notNull(),
  transactionDate: timestamp('transaction_date', { mode: 'string' }).notNull(),
  competenceDate: timestamp('competence_date', { mode: 'string' }).notNull(),
  description: text('description').notNull(),
  isReversed: boolean('is_reversed').notNull().default(false),
  reversalTransactionId: text('reversal_transaction_id'),
  vehicleId: text('vehicle_id'),
  driverId: text('driver_id'),
  supplierId: text('supplier_id'),
  createdById: text('created_by_id').notNull(),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq_idempotency: uniqueIndex('unq_transaction_idempotency')
    .on(t.companyId, t.idempotencyKey)
    .where(isNotNull(t.idempotencyKey)),
  idx_transaction_date: index('idx_transaction_date').on(t.companyId, t.transactionDate),
  idx_receivable: index('idx_transaction_receivable').on(t.receivableId).where(isNotNull(t.receivableId)),
  idx_payable: index('idx_transaction_payable').on(t.payableId).where(isNotNull(t.payableId)),
}));

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  changes: text('changes'), // Keep it as string/JSON string, but scrubbed
  timestamp: timestamp('timestamp', { mode: 'string' }).notNull().defaultNow(),
  correlationId: text('correlation_id'),
  ipAddress: text('ip_address'),
});


export const paymentMethods = pgTable('payment_methods', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  feePercentage: numeric('fee_percentage', { precision: 5, scale: 2 }).default('0'),
  active: boolean('active').notNull().default(true),
});

export const securityDeposits = pgTable('security_deposits', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  contractId: text('contract_id').notNull(),
  driverId: text('driver_id').notNull(),
  vehicleId: text('vehicle_id'),
  // Legacy amount is retained for backward-compatible persistence; new writes
  // keep it equal to originalAmount.
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  originalAmount: numeric('original_amount', { precision: 12, scale: 2 }).notNull(),
  receivedAmount: numeric('received_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  usedAmount: numeric('used_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  returnedAmount: numeric('returned_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  status: text('status').notNull(),
  receivedAt: timestamp('received_at', { mode: 'string' }),
  returnedAt: timestamp('returned_at', { mode: 'string' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const securityDepositMovements = pgTable('security_deposit_movements', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  depositId: text('deposit_id').notNull(),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  date: timestamp('date', { mode: 'string' }).notNull(),
  financialTransactionId: text('financial_transaction_id'),
  receivableId: text('receivable_id'),
  description: text('description'),
  createdById: text('created_by_id'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
});

export const recurringRules = pgTable('recurring_rules', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  interval: text('interval').notNull(),
  active: boolean('active').notNull().default(true),
  nextExecution: timestamp('next_execution', { mode: 'string' }),
});

export const bankStatementEntries = pgTable('bank_statement_entries', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  accountId: text('account_id').notNull(),
  date: timestamp('date', { mode: 'string' }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  description: text('description').notNull(),
  status: text('status').notNull(),
  transactionId: text('transaction_id'),
});

export const financialPeriods = pgTable('financial_periods', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  startDate: text('start_date'),
  endDate: text('end_date'),
  status: text('status').notNull(),
  closedAt: timestamp('closed_at', { mode: 'string' }),
  closedBy: text('closed_by'),
  reopenedAt: timestamp('reopened_at', { mode: 'string' }),
  reopenedBy: text('reopened_by'),
  reopenReason: text('reopen_reason'),
  correlationId: text('correlation_id'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq_company_year_month: unique('unq_company_year_month').on(t.companyId, t.year, t.month),
}));

export const maintenance = pgTable('maintenance', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  vehicleId: text('vehicle_id').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  cost: numeric('cost', { precision: 12, scale: 2 }),
  date: timestamp('date', { mode: 'string' }),
  description: text('description'),
});

export const trafficTickets = pgTable('traffic_tickets', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  vehicleId: text('vehicle_id').notNull(),
  driverId: text('driver_id'),
  autoNumber: text('auto_number').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  issueDate: timestamp('issue_date', { mode: 'string' }).notNull(),
  status: text('status').notNull(),
});

export const trackers = pgTable('trackers', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  vehicleId: text('vehicle_id').notNull(),
  serialNumber: text('serial_number').notNull(),
  status: text('status').notNull(),
  lastPing: timestamp('last_ping', { mode: 'string' }),
});

export const fileAttachments = pgTable('file_attachments', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  url: text('url').notNull(),
  size: integer('size'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
});

export const communicationLogs = pgTable('communication_logs', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  driverId: text('driver_id'),
  type: text('type').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull(),
  sentAt: timestamp('sent_at', { mode: 'string' }).notNull().defaultNow(),
});
