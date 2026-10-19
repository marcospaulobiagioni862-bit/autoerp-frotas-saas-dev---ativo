-- Migration: 0092_contract_template_single_current.sql
-- Card: PH-061
-- Fix contract templates multiple is_current = true issue.
-- 1. Demote older duplicate versions for each (company_id, template_key) so only the highest version stays is_current = true.
UPDATE contract_templates ct
SET is_current = false, updated_at = now()
WHERE is_current = true
  AND version_number < (
    SELECT MAX(ct2.version_number)
    FROM contract_templates ct2
    WHERE ct2.company_id = ct.company_id
      AND ct2.template_key = ct.template_key
      AND ct2.is_current = true
  );

-- 2. Drop legacy partial index that allowed multiple current versions when archived
DROP INDEX IF EXISTS uq_contract_template_current;

-- 3. Create strict unique partial index: at most one current version per (company_id, template_key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_template_single_current
  ON contract_templates (company_id, template_key)
  WHERE is_current = true;
