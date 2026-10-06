-- Additive only. Legacy categories stay unclassified until explicitly reviewed.
ALTER TABLE financial_categories ADD COLUMN IF NOT EXISTS dre_group text;
ALTER TABLE financial_categories ADD CONSTRAINT financial_category_dre_group_check
  CHECK (dre_group IS NULL OR dre_group IN ('REVENUE','MAINTENANCE','INSURANCE','TRACKER','TRAFFIC_TICKETS','DOCUMENTATION','FINANCING','ADMINISTRATIVE','PAYROLL','TAXES','OTHER_COSTS','SECURITY_DEPOSIT'));
