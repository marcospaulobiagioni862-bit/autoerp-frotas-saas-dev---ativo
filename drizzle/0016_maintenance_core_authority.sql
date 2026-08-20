-- SECURITY-2J1 — maintenance core server authority
-- Canonical Work Orders, suppliers, parts and itemized costs. Legacy `maintenance`
-- is intentionally preserved read-only until a later controlled reconciliation.

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  name text NOT NULL,
  trade_name text,
  document text NOT NULL,
  phone text,
  email text,
  address text,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_status_chk CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_company_document
  ON suppliers(company_id, upper(document))
  WHERE btrim(document) <> '';
CREATE INDEX IF NOT EXISTS idx_suppliers_company_status
  ON suppliers(company_id, status, name);

CREATE TABLE IF NOT EXISTS parts (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  manufacturer text,
  category text NOT NULL,
  unit text NOT NULL,
  current_cost numeric(12,2) NOT NULL DEFAULT 0,
  minimum_stock numeric(12,3) NOT NULL DEFAULT 0,
  current_stock numeric(12,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parts_cost_chk CHECK (current_cost >= 0),
  CONSTRAINT parts_minimum_stock_chk CHECK (minimum_stock >= 0),
  CONSTRAINT parts_current_stock_chk CHECK (current_stock >= 0),
  CONSTRAINT parts_status_chk CHECK (status IN ('ACTIVE','INACTIVE')),
  CONSTRAINT parts_company_code_unique UNIQUE(company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_parts_company_status
  ON parts(company_id, status, name);

CREATE TABLE IF NOT EXISTS work_orders (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  number text NOT NULL,
  vehicle_id text NOT NULL,
  supplier_id text,
  status text NOT NULL DEFAULT 'OPEN',
  opened_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  entry_km integer NOT NULL,
  exit_km integer,
  description text NOT NULL,
  diagnosis text,
  notes text,
  subtotal_parts numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_services numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_labor numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  account_payable_id text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_orders_status_chk CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_PARTS','WAITING_APPROVAL','COMPLETED','CANCELLED')),
  CONSTRAINT work_orders_entry_km_chk CHECK (entry_km >= 0),
  CONSTRAINT work_orders_exit_km_chk CHECK (exit_km IS NULL OR exit_km >= entry_km),
  CONSTRAINT work_orders_subtotal_parts_chk CHECK (subtotal_parts >= 0),
  CONSTRAINT work_orders_subtotal_services_chk CHECK (subtotal_services >= 0),
  CONSTRAINT work_orders_subtotal_labor_chk CHECK (subtotal_labor >= 0),
  CONSTRAINT work_orders_discount_chk CHECK (discount >= 0),
  CONSTRAINT work_orders_total_chk CHECK (total >= 0),
  CONSTRAINT work_orders_company_number_unique UNIQUE(company_id, number)
);
CREATE INDEX IF NOT EXISTS idx_work_orders_company_status
  ON work_orders(company_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_company_vehicle
  ON work_orders(company_id, vehicle_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_payable
  ON work_orders(company_id, account_payable_id)
  WHERE account_payable_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS work_order_parts (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  work_order_id text NOT NULL,
  part_id text,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL,
  unit_cost numeric(12,2) NOT NULL,
  total_cost numeric(12,2) NOT NULL,
  CONSTRAINT work_order_parts_quantity_chk CHECK (quantity > 0),
  CONSTRAINT work_order_parts_unit_cost_chk CHECK (unit_cost >= 0),
  CONSTRAINT work_order_parts_total_cost_chk CHECK (total_cost >= 0)
);
CREATE INDEX IF NOT EXISTS idx_work_order_parts_order
  ON work_order_parts(company_id, work_order_id);

CREATE TABLE IF NOT EXISTS work_order_services (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  work_order_id text NOT NULL,
  service_id text,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL,
  unit_cost numeric(12,2) NOT NULL,
  total_cost numeric(12,2) NOT NULL,
  CONSTRAINT work_order_services_quantity_chk CHECK (quantity > 0),
  CONSTRAINT work_order_services_unit_cost_chk CHECK (unit_cost >= 0),
  CONSTRAINT work_order_services_total_cost_chk CHECK (total_cost >= 0)
);
CREATE INDEX IF NOT EXISTS idx_work_order_services_order
  ON work_order_services(company_id, work_order_id);

CREATE TABLE IF NOT EXISTS work_order_labor (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  work_order_id text NOT NULL,
  description text NOT NULL,
  hours numeric(12,3) NOT NULL,
  hourly_rate numeric(12,2) NOT NULL,
  total_cost numeric(12,2) NOT NULL,
  CONSTRAINT work_order_labor_hours_chk CHECK (hours > 0),
  CONSTRAINT work_order_labor_hourly_rate_chk CHECK (hourly_rate >= 0),
  CONSTRAINT work_order_labor_total_cost_chk CHECK (total_cost >= 0)
);
CREATE INDEX IF NOT EXISTS idx_work_order_labor_order
  ON work_order_labor(company_id, work_order_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts FORCE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE work_order_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_parts FORCE ROW LEVEL SECURITY;
ALTER TABLE work_order_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_services FORCE ROW LEVEL SECURITY;
ALTER TABLE work_order_labor ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_labor FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_suppliers ON suppliers;
CREATE POLICY tenant_isolation_suppliers ON suppliers
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_parts ON parts;
CREATE POLICY tenant_isolation_parts ON parts
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_work_orders ON work_orders;
CREATE POLICY tenant_isolation_work_orders ON work_orders
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_work_order_parts ON work_order_parts;
CREATE POLICY tenant_isolation_work_order_parts ON work_order_parts
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_work_order_services ON work_order_services;
CREATE POLICY tenant_isolation_work_order_services ON work_order_services
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_work_order_labor ON work_order_labor;
CREATE POLICY tenant_isolation_work_order_labor ON work_order_labor
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
