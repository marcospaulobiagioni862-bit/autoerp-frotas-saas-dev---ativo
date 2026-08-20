-- SECURITY-2I5 — recurring scheduler + persistent notifications authority
-- Additive migration. Legacy rows are preserved but fail closed as PAUSED until
-- their financial semantics are explicit. Contract recurring rules are synchronized
-- atomically by PostgreSQL when the server-authoritative contract lifecycle changes.

ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS origin_type text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS origin_id text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS frequency text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS next_generation_date date;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS last_generated_reference text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS category_id text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS vehicle_id text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS driver_id text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS supplier_id text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS payment_method_id text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Deterministic semantic backfill from fields that already existed. Never invent
-- origin/category links: legacy rows stay PAUSED and therefore cannot generate money.
UPDATE recurring_rules
SET frequency = COALESCE(
      frequency,
      CASE upper(trim(interval))
        WHEN 'WEEKLY' THEN 'WEEKLY'
        WHEN 'MONTHLY' THEN 'MONTHLY'
        WHEN 'QUARTERLY' THEN 'QUARTERLY'
        WHEN 'SEMI_ANNUAL' THEN 'SEMI_ANNUAL'
        WHEN 'ANNUAL' THEN 'ANNUAL'
        ELSE NULL
      END
    ),
    start_date = COALESCE(start_date, next_execution::date),
    next_generation_date = COALESCE(next_generation_date, next_execution::date),
    status = CASE
      WHEN status IN ('CANCELLED','COMPLETED') THEN status
      ELSE 'PAUSED'
    END,
    active = false,
    updated_at = COALESCE(updated_at, now());

ALTER TABLE recurring_rules ALTER COLUMN status SET DEFAULT 'PAUSED';
ALTER TABLE recurring_rules ALTER COLUMN status SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE recurring_rules ADD CONSTRAINT recurring_rules_frequency_chk
    CHECK (frequency IS NULL OR frequency IN ('WEEKLY','MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE recurring_rules ADD CONSTRAINT recurring_rules_status_chk
    CHECK (status IN ('ACTIVE','PAUSED','CANCELLED','COMPLETED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE recurring_rules ADD CONSTRAINT recurring_rules_active_complete_chk
    CHECK (
      status <> 'ACTIVE' OR (
        origin_type IS NOT NULL AND
        frequency IS NOT NULL AND
        start_date IS NOT NULL AND
        next_generation_date IS NOT NULL AND
        category_id IS NOT NULL AND
        amount > 0
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_recurring_rules_due
  ON recurring_rules(company_id, status, next_generation_date, id);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_origin
  ON recurring_rules(company_id, origin_type, origin_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_rules_origin
  ON recurring_rules(company_id, origin_type, origin_id)
  WHERE origin_type IS NOT NULL AND origin_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS recurring_rule_runs (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  rule_id text NOT NULL,
  scheduled_for date NOT NULL,
  period_ref text NOT NULL,
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result_entity_type text,
  result_entity_id text,
  error_code text,
  error_message text,
  worker_id text,
  lease_token text,
  CONSTRAINT recurring_rule_runs_status_chk
    CHECK (status IN ('CLAIMED','SUCCEEDED','SKIPPED','FAILED')),
  CONSTRAINT recurring_rule_runs_occurrence_unique
    UNIQUE(company_id, rule_id, period_ref)
);
CREATE INDEX IF NOT EXISTS idx_recurring_rule_runs_rule
  ON recurring_rule_runs(company_id, rule_id, scheduled_for DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  user_id text NOT NULL,
  event_type text NOT NULL,
  dedup_key text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL,
  entity_type text,
  entity_id text,
  alert_stage text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  created_by text NOT NULL DEFAULT 'SYSTEM',
  CONSTRAINT notifications_severity_chk
    CHECK (severity IN ('INFO','WARNING','DANGER','SUCCESS')),
  CONSTRAINT notifications_user_dedup_unique
    UNIQUE(company_id, user_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_inbox
  ON notifications(company_id, user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications(company_id, entity_type, entity_id, created_at DESC);

-- Pure SQL helpers shared by the contract lifecycle trigger. They are immutable,
-- timezone-independent and preserve month-end/leap-day clamping semantics.
CREATE OR REPLACE FUNCTION autoerp_recurring_period_ref(p_date date, p_frequency text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_frequency
    WHEN 'WEEKLY' THEN to_char(p_date, 'IYYY-"W"IW')
    WHEN 'MONTHLY' THEN to_char(p_date, 'YYYY-MM')
    WHEN 'QUARTERLY' THEN to_char(p_date, 'YYYY') || '-Q' || (((extract(month FROM p_date)::int - 1) / 3) + 1)::text
    WHEN 'SEMI_ANNUAL' THEN to_char(p_date, 'YYYY') || '-S' || CASE WHEN extract(month FROM p_date) <= 6 THEN '1' ELSE '2' END
    WHEN 'ANNUAL' THEN to_char(p_date, 'YYYY')
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION autoerp_advance_recurring_date(p_date date, p_frequency text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  months_to_add integer;
  target_month date;
  target_last_day date;
  target_day integer;
BEGIN
  IF p_frequency = 'WEEKLY' THEN
    RETURN p_date + 7;
  END IF;
  months_to_add := CASE p_frequency
    WHEN 'MONTHLY' THEN 1
    WHEN 'QUARTERLY' THEN 3
    WHEN 'SEMI_ANNUAL' THEN 6
    WHEN 'ANNUAL' THEN 12
    ELSE NULL
  END;
  IF months_to_add IS NULL THEN
    RAISE EXCEPTION 'Unsupported recurring frequency: %', p_frequency;
  END IF;
  target_month := (date_trunc('month', p_date)::date + make_interval(months => months_to_add))::date;
  target_last_day := (target_month + interval '1 month - 1 day')::date;
  target_day := LEAST(extract(day FROM p_date)::int, extract(day FROM target_last_day)::int);
  RETURN target_month + (target_day - 1);
END;
$$;


-- Contract rent has one canonical non-cancelled receivable per billing period,
-- independent of whether it was issued by the scheduler or the manual contract endpoint.
-- This BEFORE trigger also upgrades legacy/server paths that do not explicitly set period_ref.
CREATE OR REPLACE FUNCTION autoerp_set_contract_rent_period_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  contract_frequency text;
BEGIN
  IF NEW.origin_type = 'CONTRACT_RENT' AND NEW.contract_id IS NOT NULL AND NEW.period_ref IS NULL THEN
    SELECT billing_periodicity INTO contract_frequency
    FROM contracts
    WHERE company_id = NEW.company_id AND id = NEW.contract_id;
    IF contract_frequency IS NULL THEN
      RAISE EXCEPTION 'Contract recurring authority unavailable for contract %', NEW.contract_id;
    END IF;
    NEW.period_ref := autoerp_recurring_period_ref(NEW.competence_date::date, contract_frequency);
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill the period authority before enabling the stronger invariant. If legacy
-- data already contains multiple live charges for the same contract/period, fail
-- closed and require explicit reconciliation rather than choosing a winner.
UPDATE account_receivables ar
SET period_ref = autoerp_recurring_period_ref(ar.competence_date::date, c.billing_periodicity)
FROM contracts c
WHERE ar.company_id = c.company_id
  AND ar.contract_id = c.id
  AND ar.origin_type = 'CONTRACT_RENT'
  AND ar.period_ref IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM account_receivables
    WHERE origin_type = 'CONTRACT_RENT'
      AND contract_id IS NOT NULL
      AND period_ref IS NOT NULL
      AND status <> 'CANCELLED'
    GROUP BY company_id, contract_id, period_ref
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SECURITY-2I5 migration blocked: duplicate live contract rent receivables for a billing period';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_receivable_contract_period
  ON account_receivables(company_id, contract_id, period_ref)
  WHERE origin_type = 'CONTRACT_RENT'
    AND contract_id IS NOT NULL
    AND period_ref IS NOT NULL
    AND status <> 'CANCELLED';

DROP TRIGGER IF EXISTS trg_contract_rent_period_ref ON account_receivables;
CREATE TRIGGER trg_contract_rent_period_ref
BEFORE INSERT OR UPDATE OF competence_date, contract_id, origin_type, period_ref
ON account_receivables
FOR EACH ROW
EXECUTE FUNCTION autoerp_set_contract_rent_period_ref();

-- The contract lifecycle intentionally creates a PAUSED rule first. The first
-- authoritative contract receivable (created in the same server UnitOfWork) supplies
-- the actual tenant-owned category id and activates the rule. This avoids a global
-- hard-coded category dependency while preserving the current contract command surface.
CREATE OR REPLACE FUNCTION autoerp_sync_contract_rule_from_receivable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  contract_active boolean;
BEGIN
  IF NEW.origin_type <> 'CONTRACT_RENT' OR NEW.contract_id IS NULL OR NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM contracts c
    WHERE c.company_id = NEW.company_id AND c.id = NEW.contract_id
      AND c.status = 'ACTIVE' AND c.is_archived = false
  ) INTO contract_active;
  IF contract_active THEN
    UPDATE recurring_rules
    SET category_id = NEW.category_id,
        status = 'ACTIVE',
        active = true,
        updated_at = now()
    WHERE company_id = NEW.company_id
      AND origin_type = 'CONTRACT_RENT'
      AND origin_id = NEW.contract_id
      AND status IN ('PAUSED','ACTIVE');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_rule_from_receivable ON account_receivables;
CREATE TRIGGER trg_contract_rule_from_receivable
AFTER INSERT OR UPDATE OF category_id, status
ON account_receivables
FOR EACH ROW
EXECUTE FUNCTION autoerp_sync_contract_rule_from_receivable();

-- Existing ACTIVE contracts are promoted to canonical server-side rules. The last
-- known receivable due date is used as the safe billing checkpoint, preventing a
-- migration from blindly replaying already-issued historical rent charges.
INSERT INTO recurring_rules (
  id, company_id, description, amount, interval, active, next_execution,
  origin_type, origin_id, frequency, start_date, end_date, next_generation_date,
  last_generated_reference, category_id, vehicle_id, driver_id, payment_method_id,
  status, created_by, created_at, updated_at
)
SELECT
  'rr-contract-' || md5(c.company_id || ':' || c.id),
  c.company_id,
  'Aluguel Recorrente - Contrato ' || c.contract_number,
  c.rental_amount,
  c.billing_periodicity,
  CASE WHEN last_charge.last_category_id IS NOT NULL THEN true ELSE false END,
  autoerp_advance_recurring_date(COALESCE(last_charge.last_due, c.start_date::date), c.billing_periodicity),
  'CONTRACT_RENT', c.id, c.billing_periodicity, c.start_date::date, NULLIF(c.end_date, '')::date,
  autoerp_advance_recurring_date(COALESCE(last_charge.last_due, c.start_date::date), c.billing_periodicity),
  autoerp_recurring_period_ref(COALESCE(last_charge.last_due, c.start_date::date), c.billing_periodicity),
  last_charge.last_category_id, c.vehicle_id, c.driver_id, c.payment_method_id,
  CASE WHEN last_charge.last_category_id IS NOT NULL THEN 'ACTIVE' ELSE 'PAUSED' END,
  'SYSTEM_MIGRATION', now(), now()
FROM contracts c
LEFT JOIN LATERAL (
  SELECT max(ar.due_date)::date AS last_due,
         (array_agg(ar.category_id ORDER BY ar.due_date DESC, ar.created_at DESC))[1] AS last_category_id
  FROM account_receivables ar
  WHERE ar.company_id = c.company_id
    AND ar.contract_id = c.id
    AND ar.status <> 'CANCELLED'
) last_charge ON true
WHERE c.status = 'ACTIVE'
  AND c.is_archived = false
  AND c.rental_amount > 0
  AND c.billing_periodicity IN ('WEEKLY','MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL')
  AND NOT EXISTS (
    SELECT 1 FROM recurring_rules r
    WHERE r.company_id = c.company_id AND r.origin_type = 'CONTRACT_RENT' AND r.origin_id = c.id
  );

CREATE OR REPLACE FUNCTION autoerp_sync_contract_recurring_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rule_id text;
  next_date date;
BEGIN
  rule_id := 'rr-contract-' || md5(NEW.company_id || ':' || NEW.id);

  IF NEW.status = 'ACTIVE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    next_date := autoerp_advance_recurring_date(NEW.start_date::date, NEW.billing_periodicity);
    UPDATE recurring_rules
    SET description = 'Aluguel Recorrente - Contrato ' || NEW.contract_number,
        amount = NEW.rental_amount,
        interval = NEW.billing_periodicity,
        active = false,
        next_execution = next_date,
        origin_type = 'CONTRACT_RENT',
        origin_id = NEW.id,
        frequency = NEW.billing_periodicity,
        start_date = NEW.start_date::date,
        end_date = NULLIF(NEW.end_date, '')::date,
        next_generation_date = next_date,
        last_generated_reference = autoerp_recurring_period_ref(NEW.start_date::date, NEW.billing_periodicity),
        category_id = NULL,
        vehicle_id = NEW.vehicle_id,
        driver_id = NEW.driver_id,
        payment_method_id = NEW.payment_method_id,
        status = 'PAUSED',
        updated_at = now()
    WHERE company_id = NEW.company_id AND origin_type = 'CONTRACT_RENT' AND origin_id = NEW.id;

    IF NOT FOUND THEN
      INSERT INTO recurring_rules (
        id, company_id, description, amount, interval, active, next_execution,
        origin_type, origin_id, frequency, start_date, end_date, next_generation_date,
        last_generated_reference, category_id, vehicle_id, driver_id, payment_method_id,
        status, created_by, created_at, updated_at
      ) VALUES (
        rule_id, NEW.company_id, 'Aluguel Recorrente - Contrato ' || NEW.contract_number,
        NEW.rental_amount, NEW.billing_periodicity, false, next_date,
        'CONTRACT_RENT', NEW.id, NEW.billing_periodicity, NEW.start_date::date, NULLIF(NEW.end_date, '')::date,
        next_date, autoerp_recurring_period_ref(NEW.start_date::date, NEW.billing_periodicity),
        NULL, NEW.vehicle_id, NEW.driver_id, NEW.payment_method_id,
        'PAUSED', 'SYSTEM_CONTRACT_LIFECYCLE', now(), now()
      );
    END IF;
  ELSIF NEW.status IN ('CLOSED','FINISHED','ARCHIVED') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE recurring_rules
    SET status = 'COMPLETED', active = false, updated_at = now()
    WHERE company_id = NEW.company_id AND origin_type = 'CONTRACT_RENT' AND origin_id = NEW.id
      AND status NOT IN ('CANCELLED','COMPLETED');
  ELSIF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE recurring_rules
    SET status = 'CANCELLED', active = false, updated_at = now()
    WHERE company_id = NEW.company_id AND origin_type = 'CONTRACT_RENT' AND origin_id = NEW.id
      AND status <> 'CANCELLED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_recurring_rule ON contracts;
CREATE TRIGGER trg_contract_recurring_rule
AFTER UPDATE OF status ON contracts
FOR EACH ROW
EXECUTE FUNCTION autoerp_sync_contract_recurring_rule();

ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE recurring_rule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rule_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_recurring_rules ON recurring_rules;
CREATE POLICY tenant_isolation_recurring_rules ON recurring_rules
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_recurring_rule_runs ON recurring_rule_runs;
CREATE POLICY tenant_isolation_recurring_rule_runs ON recurring_rule_runs
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
