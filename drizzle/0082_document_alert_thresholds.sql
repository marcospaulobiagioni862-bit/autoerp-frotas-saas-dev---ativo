ALTER TABLE tenant_operational_configs ADD COLUMN IF NOT EXISTS document_red_days integer NOT NULL DEFAULT 7;
ALTER TABLE tenant_operational_configs ADD COLUMN IF NOT EXISTS document_yellow_days integer NOT NULL DEFAULT 15;
ALTER TABLE tenant_operational_configs ADD CONSTRAINT document_alert_thresholds_check
  CHECK (document_red_days >= 0 AND document_yellow_days >= document_red_days AND document_yellow_days <= 365);
