CREATE TABLE "account_payables" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"origin_type" text NOT NULL,
	"origin_id" text NOT NULL,
	"vehicle_id" text,
	"driver_id" text,
	"contract_id" text,
	"category_id" text NOT NULL,
	"description" text NOT NULL,
	"original_amount" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fine_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"interest_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_amount" numeric(12, 2) NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"balance_amount" numeric(12, 2) NOT NULL,
	"due_date" timestamp NOT NULL,
	"competence_date" timestamp NOT NULL,
	"status" text NOT NULL,
	"installment_group_id" text,
	"installment_number" integer,
	"period_ref" text,
	"total_installments" integer,
	"renegotiation_id" text,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"notes" text,
	"supplier_id" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_receivables" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"origin_type" text NOT NULL,
	"origin_id" text NOT NULL,
	"vehicle_id" text,
	"driver_id" text,
	"contract_id" text,
	"category_id" text NOT NULL,
	"description" text NOT NULL,
	"original_amount" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fine_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"interest_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_amount" numeric(12, 2) NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"balance_amount" numeric(12, 2) NOT NULL,
	"due_date" timestamp NOT NULL,
	"competence_date" timestamp NOT NULL,
	"status" text NOT NULL,
	"installment_group_id" text,
	"installment_number" integer,
	"period_ref" text,
	"total_installments" integer,
	"renegotiation_id" text,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"notes" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"correlation_id" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "bank_statement_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"account_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"transaction_id" text
);
--> statement-breakpoint
CREATE TABLE "communication_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"driver_id" text,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"document" text,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_document_unique" UNIQUE("document")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"driver_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"cpf" text NOT NULL,
	"cnh" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_company_id_cpf_unique" UNIQUE("company_id","cpf"),
	CONSTRAINT "drivers_company_id_cnh_unique" UNIQUE("company_id","cnh")
);
--> statement-breakpoint
CREATE TABLE "file_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"url" text NOT NULL,
	"size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"institution" text,
	"account_number" text,
	"agency" text,
	"pix_key" text,
	"initial_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"current_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" text NOT NULL,
	"closed_at" timestamp,
	"closed_by" text
);
--> statement-breakpoint
CREATE TABLE "financial_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"destination_account_id" text,
	"receivable_id" text,
	"payable_id" text,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method_id" text NOT NULL,
	"transaction_date" timestamp NOT NULL,
	"competence_date" timestamp NOT NULL,
	"description" text NOT NULL,
	"is_reversed" boolean DEFAULT false NOT NULL,
	"reversal_transaction_id" text,
	"vehicle_id" text,
	"driver_id" text,
	"supplier_id" text,
	"created_by_id" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"cost" numeric(12, 2),
	"date" timestamp,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"fee_percentage" numeric(5, 2) DEFAULT '0',
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"interval" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_execution" timestamp
);
--> statement-breakpoint
CREATE TABLE "security_deposit_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"deposit_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" timestamp NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "security_deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"driver_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trackers" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"serial_number" text NOT NULL,
	"status" text NOT NULL,
	"last_ping" timestamp
);
--> statement-breakpoint
CREATE TABLE "traffic_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"driver_id" text,
	"auto_number" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"issue_date" timestamp NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"permissions" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"plate" text NOT NULL,
	"renavam" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_company_id_plate_unique" UNIQUE("company_id","plate"),
	CONSTRAINT "vehicles_company_id_renavam_unique" UNIQUE("company_id","renavam")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "unq_payable_recurring" ON "account_payables" USING btree ("company_id","origin_type","origin_id","period_ref") WHERE "account_payables"."period_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "unq_payable_installments" ON "account_payables" USING btree ("company_id","origin_type","origin_id","installment_number") WHERE "account_payables"."installment_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "unq_payable_idempotency" ON "account_payables" USING btree ("company_id","idempotency_key") WHERE "account_payables"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "idx_payable_due_status" ON "account_payables" USING btree ("company_id","due_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "unq_receivable_recurring" ON "account_receivables" USING btree ("company_id","origin_type","origin_id","period_ref") WHERE "account_receivables"."period_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "unq_receivable_installments" ON "account_receivables" USING btree ("company_id","origin_type","origin_id","installment_number") WHERE "account_receivables"."installment_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "unq_receivable_idempotency" ON "account_receivables" USING btree ("company_id","idempotency_key") WHERE "account_receivables"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "idx_receivable_due_status" ON "account_receivables" USING btree ("company_id","due_date","status");--> statement-breakpoint
CREATE INDEX "idx_cnt_company_status" ON "contracts" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_drv_company_active" ON "drivers" USING btree ("company_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "unq_transaction_idempotency" ON "financial_transactions" USING btree ("company_id","idempotency_key") WHERE "financial_transactions"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "idx_transaction_date" ON "financial_transactions" USING btree ("company_id","transaction_date");--> statement-breakpoint
CREATE INDEX "idx_transaction_receivable" ON "financial_transactions" USING btree ("receivable_id") WHERE "financial_transactions"."receivable_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_transaction_payable" ON "financial_transactions" USING btree ("payable_id") WHERE "financial_transactions"."payable_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_veh_company_status" ON "vehicles" USING btree ("company_id","status");