-- #663 Driver completion address details.
-- Additive/idempotent columns only; existing driver rows remain valid.

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_residence_type text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_residence_type_other text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_condominium_name text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_block_tower text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_unit text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_floor text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_reference text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'drivers_address_residence_type_check'
  ) THEN
    ALTER TABLE drivers
      ADD CONSTRAINT drivers_address_residence_type_check
      CHECK (address_residence_type IS NULL OR address_residence_type IN ('HOUSE', 'APARTMENT', 'OTHER'));
  END IF;
END $$;
