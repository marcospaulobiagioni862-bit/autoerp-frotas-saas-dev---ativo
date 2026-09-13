-- #1081 — Maintenance part stock movement authority
-- Additive, tenant-scoped and auditable. No destructive changes.

CREATE TABLE IF NOT EXISTS part_stock_movements (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  part_id text NOT NULL,
  movement_type text NOT NULL,
  quantity_delta numeric(12,3) NOT NULL,
  balance_after numeric(12,3) NOT NULL,
  work_order_id text,
  vehicle_id text,
  reason text,
  reversed_movement_id text,
  idempotency_key text NOT NULL,
  user_id text NOT NULL,
  user_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_stock_movements_type_chk CHECK (movement_type IN ('ENTRY','USE_WORK_ORDER','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN','LOSS','REVERSAL')),
  CONSTRAINT part_stock_movements_delta_chk CHECK (quantity_delta <> 0),
  CONSTRAINT part_stock_movements_balance_chk CHECK (balance_after >= 0),
  CONSTRAINT part_stock_movements_company_idempotency_unique UNIQUE(company_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_part_stock_movements_company_part
  ON part_stock_movements(company_id,part_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_part_stock_movements_company_work_order
  ON part_stock_movements(company_id,work_order_id)
  WHERE work_order_id IS NOT NULL;

ALTER TABLE part_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_stock_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_part_stock_movements ON part_stock_movements;
CREATE POLICY tenant_isolation_part_stock_movements ON part_stock_movements
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- Preserve pre-authority stock as an explicit opening movement.
INSERT INTO part_stock_movements (
  id,company_id,part_id,movement_type,quantity_delta,balance_after,reason,idempotency_key,user_id,user_name,created_at
)
SELECT
  'opening-' || p.id,
  p.company_id,
  p.id,
  'ENTRY',
  p.current_stock,
  p.current_stock,
  'Saldo inicial anterior à autoridade de movimentação de estoque',
  'opening:' || p.id,
  'SYSTEM',
  'SYSTEM',
  COALESCE(p.created_at,now())
FROM parts p
WHERE p.current_stock > 0
ON CONFLICT (company_id,idempotency_key) DO NOTHING;
