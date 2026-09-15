-- M1: NULL criteria preserve existing generic templates. No plan materialization.
-- Bounds are inclusive integers: [0,19999], [20000,50000], [50001,NULL].
ALTER TABLE maintenance_plan_templates
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS year_from integer,
  ADD COLUMN IF NOT EXISTS year_to integer,
  ADD COLUMN IF NOT EXISTS engine text,
  ADD COLUMN IF NOT EXISTS km_min integer,
  ADD COLUMN IF NOT EXISTS km_max integer;

ALTER TABLE maintenance_plan_templates
  ADD CONSTRAINT maintenance_template_year_range_chk CHECK (
    (year_from IS NULL OR year_from BETWEEN 1900 AND 9999) AND
    (year_to IS NULL OR year_to BETWEEN 1900 AND 9999) AND
    (year_from IS NULL OR year_to IS NULL OR year_from <= year_to)
  ),
  ADD CONSTRAINT maintenance_template_km_range_chk CHECK (
    (km_min IS NULL OR km_min >= 0) AND (km_max IS NULL OR km_max >= 0) AND
    (km_min IS NULL OR km_max IS NULL OR km_min <= km_max)
  ),
  ADD CONSTRAINT maintenance_template_matching_text_chk CHECK (
    (manufacturer IS NULL OR length(btrim(manufacturer)) BETWEEN 1 AND 200) AND
    (model IS NULL OR length(btrim(model)) BETWEEN 1 AND 200) AND
    (engine IS NULL OR length(btrim(engine)) BETWEEN 1 AND 200)
  );
-- Existing company_id, tenant RLS and vehicle/template uniqueness remain unchanged.
