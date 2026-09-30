import { isNotNull, sql } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, integer, numeric, index, uniqueIndex, unique, jsonb, check, foreignKey, pgPolicy } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Tenants / Companies
export const companies = pgTable('companies', {
  id: text('id').primaryKey(), // Using UUIDs string
  document: text('document').unique(),
  name: text('name').notNull(),
  tradeName: text('trade_name'),
  email: text('email'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  addressStreet: text('address_street'),
  addressNumber: text('address_number'),
  addressComplement: text('address_complement'),
  addressNeighborhood: text('address_neighborhood'),
  addressCity: text('address_city'),
  addressState: text('address_state'),
  addressZipCode: text('address_zip_code'),
  legalRepresentativeName: text('legal_representative_name'),
  legalRepresentativeCpf: text('legal_representative_cpf'),
  status: text('status').notNull(), // ACTIVE, INACTIVE
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const tenantOperationalConfigs = pgTable('tenant_operational_configs', {
  companyId: text('company_id').primaryKey().references(() => companies.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  currency: text('currency').notNull().default('BRL'),
  maxVehiclesLimit: integer('max_vehicles_limit').notNull().default(500),
  maxDriversLimit: integer('max_drivers_limit').notNull().default(1000),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  updatedBy: text('updated_by').notNull(),
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
  brand: text('brand').notNull().default(''),
  model: text('model').notNull().default(''),
  version: text('version'),
  yearFabrication: integer('year_fabrication').notNull().default(0),
  yearModel: integer('year_model').notNull().default(0),
  color: text('color').notNull().default(''),
  chassis: text('chassis').notNull().default(''),
  currentKm: integer('current_km').notNull().default(0),
  nextMaintenanceKm: integer('next_maintenance_km'),
  fuelType: text('fuel_type').notNull().default('Flex'),
  category: text('category').notNull().default('Padrão'),
  acquisitionValue: numeric('acquisition_value', { precision: 12, scale: 2 }).notNull().default('0'),
  currentValue: numeric('current_value', { precision: 12, scale: 2 }).notNull().default('0'),
  rentalValueBase: numeric('rental_value_base', { precision: 12, scale: 2 }).notNull().default('0'),
  status: text('status').notNull(),
  notes: text('notes'),
  currentDriverId: text('current_driver_id'),
  currentContractId: text('current_contract_id'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq_plate: unique().on(t.companyId, t.plate),
  unq_renavam: unique().on(t.companyId, t.renavam),
  idx_company_status: index('idx_veh_company_status').on(t.companyId, t.status),
}));

export const vehicleInspections = pgTable('vehicle_inspections', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  vehicleId: text('vehicle_id').notNull(),
  driverId: text('driver_id'),
  contractId: text('contract_id'),
  inspectionType: text('inspection_type').notNull(),
  inspectionDate: timestamp('inspection_date', { mode: 'string' }).notNull(),
  odometer: integer('odometer').notNull(),
  fuelLevel: integer('fuel_level').notNull(),
  checklist: jsonb('checklist').notNull().default({}),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxCompanyVehicleDate: index('idx_vehicle_inspection_company_vehicle_date').on(t.companyId, t.vehicleId, t.inspectionDate),
  idxCompanyContract: index('idx_vehicle_inspection_company_contract').on(t.companyId, t.contractId),
}));

export const vehicleKmRecords = pgTable('vehicle_km_records', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  vehicleId: text('vehicle_id').notNull(),
  driverId: text('driver_id'),
  contractId: text('contract_id'),
  kmValue: integer('km_value').notNull(),
  recordDate: text('record_date').notNull(),
  readingType: text('reading_type').notNull(),
  photoUrl: text('photo_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxCompanyVehicleDate: index('idx_vehicle_km_company_vehicle_date').on(t.companyId, t.vehicleId, t.recordDate, t.createdAt),
}));

export const drivers = pgTable('drivers', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  name: text('name').notNull(),
  cpf: text('cpf').notNull(),
  cnh: text('cnh').notNull(),
  maritalStatus: text('marital_status'),
  profession: text('profession'),
  motherName: text('mother_name'),
  pixKey: text('pix_key'),
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

// Existing table from 0023; 0075 adds only the nullable fixed daily amount.
export const financeLateChargeRules = pgTable('finance_late_charge_rules', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  obligationType: text('obligation_type').notNull(),
  gracePeriodDays: integer('grace_period_days').notNull(),
  finePercent: numeric('fine_percent', { precision: 7, scale: 4 }).notNull(),
  dailyInterestPercent: numeric('daily_interest_percent', { precision: 9, scale: 6 }).notNull(),
  dailyInterestAmount: numeric('daily_interest_amount', { precision: 12, scale: 2 }),
  active: boolean('active').notNull().default(true),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, t => ({
  companyType: unique('finance_late_charge_rules_company_type_unique').on(t.companyId, t.obligationType),
  companyFk: foreignKey({ name: 'finance_late_charge_rules_company_fk', columns: [t.companyId], foreignColumns: [companies.id] }),
  companyActive: index('idx_finance_late_charge_rules_company_active').on(t.companyId, t.obligationType, t.active),
  typeCheck: check('finance_late_charge_rules_obligation_type_check', sql`${t.obligationType} IN ('RECEIVABLE','PAYABLE')`),
  graceCheck: check('finance_late_charge_rules_grace_period_days_check', sql`${t.gracePeriodDays} BETWEEN 0 AND 365`),
  fineCheck: check('finance_late_charge_rules_fine_percent_check', sql`${t.finePercent} BETWEEN 0 AND 100`),
  percentCheck: check('finance_late_charge_rules_daily_interest_percent_check', sql`${t.dailyInterestPercent} BETWEEN 0 AND 10`),
  amountCheck: check('finance_late_charge_rules_daily_interest_amount_check', sql`${t.dailyInterestAmount} >= 0`),
  tenantPolicy: pgPolicy('finance_late_charge_rules_tenant_policy', {
    for: 'all',
    using: sql`${t.companyId} = nullif(current_setting('app.current_tenant', true), '')`,
    withCheck: sql`${t.companyId} = nullif(current_setting('app.current_tenant', true), '')`,
  }),
})).enableRLS();

export const contracts = pgTable('contracts', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  driverId: text('driver_id').notNull(),
  vehicleId: text('vehicle_id').notNull(),
  status: text('status').notNull(),
  contractNumber: text('contract_number').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  rentalAmount: numeric('rental_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  billingPeriodicity: text('billing_periodicity').notNull().default('WEEKLY'),
  billingDueDayOfWeek: integer('billing_due_day_of_week').notNull().default(1),
  billingDueDayOfMonth: integer('billing_due_day_of_month').notNull().default(1),
  securityDepositAmount: numeric('security_deposit_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  securityDepositId: text('security_deposit_id'),
  franchiseKm: integer('franchise_km').notNull().default(0),
  excessKmRate: numeric('excess_km_rate', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentMethodId: text('payment_method_id'),
  templateId: text('template_id'),
  generatedPdfUrl: text('generated_pdf_url'),
  signedContractUrl: text('signed_contract_url'),
  signatureRequired: boolean('signature_required').notNull().default(true),
  notes: text('notes'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idx_company_status: index('idx_cnt_company_status').on(t.companyId, t.status),
  idxCompanyVehicle: index('idx_contract_company_vehicle').on(t.companyId, t.vehicleId),
  idxCompanyDriver: index('idx_contract_company_driver').on(t.companyId, t.driverId),
  idxCompanyArchived: index('idx_contract_company_archived').on(t.companyId, t.isArchived),
  unqCompanyNumber: uniqueIndex('uq_contract_company_number').on(t.companyId, t.contractNumber),
}));

export const contractTemplates = pgTable('contract_templates', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  templateKey: text('template_key').notNull(),
  title: text('title').notNull(),
  contentMarkdown: text('content_markdown').notNull(),
  versionNumber: integer('version_number').notNull().default(1),
  supersedesTemplateId: text('supersedes_template_id'),
  isCurrent: boolean('is_current').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  isArchived: boolean('is_archived').notNull().default(false),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unqVersion: uniqueIndex('uq_contract_template_version').on(t.companyId, t.templateKey, t.versionNumber),
  idxCurrent: index('idx_contract_template_company_current').on(t.companyId, t.isCurrent, t.isActive, t.isArchived),
}));

export const contractArtifacts = pgTable('contract_artifacts', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  contractId: text('contract_id').notNull(),
  artifactType: text('artifact_type').notNull(),
  attachmentId: text('attachment_id').notNull(),
  templateId: text('template_id'),
  sourceArtifactId: text('source_artifact_id'),
  snapshotJson: text('snapshot_json'),
  snapshotHash: text('snapshot_hash').notNull(),
  isCurrent: boolean('is_current').notNull().default(true),
  isArchived: boolean('is_archived').notNull().default(false),
  signatureMethod: text('signature_method'),
  signedByName: text('signed_by_name'),
  signedAt: timestamp('signed_at', { mode: 'string' }),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxContract: index('idx_contract_artifact_contract').on(t.companyId, t.contractId, t.artifactType, t.isCurrent, t.isArchived),
  idxAttachment: index('idx_contract_artifact_attachment').on(t.companyId, t.attachmentId),
  idxSource: index('idx_contract_artifact_source').on(t.companyId, t.sourceArtifactId),
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
  additionalAmount: numeric('additional_amount', { precision: 12, scale: 2 }).notNull().default('0'),
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
  additionalAmount: numeric('additional_amount', { precision: 12, scale: 2 }).notNull().default('0'),
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
  vehicleId: text('vehicle_id'),
  vehiclePlate: text('vehicle_plate'),
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
  entityName: text('entity_name').notNull(),
  entityId: text('entity_id').notNull(),
  documentType: text('document_type'),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  url: text('url').notNull(),
  size: integer('size'),
  fileSize: integer('file_size').notNull().default(0),
  storageProvider: text('storage_provider').notNull().default('LEGACY_BROWSER'),
  storageKey: text('storage_key'),
  checksum: text('checksum'),
  description: text('description'),
  issueDate: text('issue_date'),
  expirationDate: text('expiration_date'),
  createdBy: text('created_by'),
  isArchived: boolean('is_archived').notNull().default(false),
  contentState: text('content_state').notNull().default('LEGACY_BROWSER'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxCompanyEntity: index('idx_att_company_entity').on(t.companyId, t.entityType, t.entityId, t.isArchived),
  idxCompanyDocument: index('idx_att_company_document').on(t.companyId, t.documentType, t.isArchived),
  idxCompanyCreated: index('idx_att_company_created').on(t.companyId, t.createdAt),
}));

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  documentType: text('document_type').notNull(),
  documentNumber: text('document_number'),
  referenceYear: integer('reference_year'),
  issueDate: text('issue_date'),
  expirationDate: text('expiration_date'),
  attachmentId: text('attachment_id'),
  versionNumber: integer('version_number').notNull().default(1),
  supersedesDocumentId: text('supersedes_document_id'),
  isCurrent: boolean('is_current').notNull().default(true),
  isArchived: boolean('is_archived').notNull().default(false),
  cost: numeric('cost', { precision: 12, scale: 2 }).notNull().default('0'),
  payableId: text('payable_id'),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxCompanySubjectCurrent: index('idx_documents_company_subject_current').on(t.companyId, t.subjectType, t.subjectId, t.isCurrent, t.isArchived),
  idxCompanyTypeCurrent: index('idx_documents_company_type_current').on(t.companyId, t.documentType, t.isCurrent, t.isArchived),
  idxCompanyExpiration: index('idx_documents_company_expiration').on(t.companyId, t.expirationDate, t.isCurrent, t.isArchived),
  idxAttachment: index('idx_documents_attachment').on(t.companyId, t.attachmentId),
}));

export const documentAiExtractions = pgTable('document_ai_extractions', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  attachmentId: text('attachment_id').notNull(),
  attachmentChecksum: text('attachment_checksum').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('PENDING'),
  requestedBy: text('requested_by').notNull(),
  workerId: text('worker_id'),
  processingStartedAt: timestamp('processing_started_at', { mode: 'string' }),
  completedAt: timestamp('completed_at', { mode: 'string' }),
  attemptCount: integer('attempt_count').notNull().default(0),
  provider: text('provider'),
  model: text('model'),
  modelVersion: text('model_version'),
  detectedDocumentType: text('detected_document_type'),
  rawExtraction: jsonb('raw_extraction').notNull().default({}),
  proposedFields: jsonb('proposed_fields').notNull().default({}),
  fieldConfidence: jsonb('field_confidence').notNull().default({}),
  failureCode: text('failure_code'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { mode: 'string' }),
  corrections: jsonb('corrections'),
  reviewNotes: text('review_notes'),
  approvedAt: timestamp('approved_at', { mode: 'string' }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unqCompanyIdempotency: unique('uq_document_ai_company_idempotency').on(t.companyId, t.idempotencyKey),
  idxCompanyStatusCreated: index('idx_document_ai_company_status_created').on(t.companyId, t.status, t.createdAt),
  idxCompanyAttachment: index('idx_document_ai_company_attachment').on(t.companyId, t.attachmentId, t.createdAt),
}));

export const communicationLogs = pgTable('communication_logs', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  driverId: text('driver_id'),
  type: text('type').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull(),
  sentAt: timestamp('sent_at', { mode: 'string' }).notNull().defaultNow(),
});
