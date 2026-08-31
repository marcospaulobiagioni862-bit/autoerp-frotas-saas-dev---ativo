-- DRIVER-ADDRESS: persist structured residence details for driver profiles.
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_residence_type text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_condominium_name text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_building text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_unit text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_floor text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_reference text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_other_residence_type text;

ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_address_residence_type_check;
ALTER TABLE drivers ADD CONSTRAINT drivers_address_residence_type_check
  CHECK (address_residence_type IS NULL OR address_residence_type IN ('HOUSE','APARTMENT','OTHER'));
