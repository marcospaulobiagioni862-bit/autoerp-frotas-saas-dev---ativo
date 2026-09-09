-- A vehicle or driver may belong to only one non-terminal contract at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_blocking_vehicle
  ON contracts(company_id, vehicle_id)
  WHERE is_archived = false
    AND status IN ('DRAFT','AWAITING_SIGNATURE','ACTIVE','SUSPENDED');

CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_blocking_driver
  ON contracts(company_id, driver_id)
  WHERE is_archived = false
    AND status IN ('DRAFT','AWAITING_SIGNATURE','ACTIVE','SUSPENDED');
