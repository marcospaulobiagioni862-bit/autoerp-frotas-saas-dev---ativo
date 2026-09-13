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

-- Validate catalog stock while the OS item is selected/persisted. This does not
-- reserve stock; the completion trigger below is still the physical authority.
CREATE OR REPLACE FUNCTION validate_work_order_part_stock_selection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  available numeric(12,3);
  part_status text;
  requested numeric(12,3);
BEGIN
  IF NEW.part_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT current_stock,status INTO available,part_status
  FROM parts
  WHERE company_id=NEW.company_id AND id=NEW.part_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PART_NOT_FOUND:%', NEW.part_id USING ERRCODE='P0001';
  END IF;
  IF part_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'PART_ARCHIVED:%', NEW.part_id USING ERRCODE='P0001';
  END IF;

  SELECT COALESCE(SUM(quantity),0) + NEW.quantity INTO requested
  FROM work_order_parts
  WHERE company_id=NEW.company_id
    AND work_order_id=NEW.work_order_id
    AND part_id=NEW.part_id
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);
  IF requested > available THEN
    RAISE EXCEPTION 'INSUFFICIENT_PART_STOCK:%', NEW.part_id USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_work_order_part_stock_selection ON work_order_parts;
CREATE TRIGGER trg_validate_work_order_part_stock_selection
BEFORE INSERT OR UPDATE OF part_id,quantity ON work_order_parts
FOR EACH ROW
EXECUTE FUNCTION validate_work_order_part_stock_selection();

-- Physical consumption occurs only at the COMPLETED transition. A cancelled OS
-- that never completes therefore never consumes stock. Quantity is aggregated
-- by part to remain correct even if legacy data contains duplicate part lines.
CREATE OR REPLACE FUNCTION consume_work_order_parts_on_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item record;
  locked_part record;
  next_balance numeric(12,3);
  movement_key text;
BEGIN
  IF NEW.status <> 'COMPLETED' OR OLD.status = 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  FOR item IN
    SELECT wop.part_id,SUM(wop.quantity)::numeric(12,3) AS quantity
    FROM work_order_parts wop
    WHERE wop.company_id=NEW.company_id
      AND wop.work_order_id=NEW.id
      AND wop.part_id IS NOT NULL
    GROUP BY wop.part_id
    ORDER BY wop.part_id
  LOOP
    movement_key := 'work-order-use:' || NEW.id || ':' || item.part_id;
    IF EXISTS (
      SELECT 1 FROM part_stock_movements
      WHERE company_id=NEW.company_id AND idempotency_key=movement_key
    ) THEN
      CONTINUE;
    END IF;

    SELECT id,name,current_stock,status INTO locked_part
    FROM parts
    WHERE company_id=NEW.company_id AND id=item.part_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PART_NOT_FOUND:%', item.part_id USING ERRCODE='P0001';
    END IF;
    IF locked_part.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'PART_ARCHIVED:%', item.part_id USING ERRCODE='P0001';
    END IF;
    IF locked_part.current_stock < item.quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_PART_STOCK:%', item.part_id USING ERRCODE='P0001';
    END IF;

    next_balance := locked_part.current_stock - item.quantity;
    UPDATE parts
       SET current_stock=next_balance,updated_at=now()
     WHERE company_id=NEW.company_id AND id=item.part_id;

    INSERT INTO part_stock_movements (
      id,company_id,part_id,movement_type,quantity_delta,balance_after,
      work_order_id,vehicle_id,reason,idempotency_key,user_id,user_name,created_at
    ) VALUES (
      'stock-use-' || NEW.id || '-' || item.part_id,
      NEW.company_id,item.part_id,'USE_WORK_ORDER',-item.quantity,next_balance,
      NEW.id,NEW.vehicle_id,'Consumo confirmado na conclusão da OS',movement_key,
      COALESCE(NEW.created_by,'SYSTEM'),'Conclusão da OS',now()
    ) ON CONFLICT (company_id,idempotency_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consume_work_order_parts_on_completion ON work_orders;
CREATE TRIGGER trg_consume_work_order_parts_on_completion
BEFORE UPDATE OF status ON work_orders
FOR EACH ROW
WHEN (NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED')
EXECUTE FUNCTION consume_work_order_parts_on_completion();
