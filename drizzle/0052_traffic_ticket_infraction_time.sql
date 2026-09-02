ALTER TABLE traffic_tickets
  ADD COLUMN IF NOT EXISTS infraction_time text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'traffic_tickets_infraction_time_chk'
  ) THEN
    ALTER TABLE traffic_tickets
      ADD CONSTRAINT traffic_tickets_infraction_time_chk
      CHECK (infraction_time IS NULL OR infraction_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  END IF;
END $$;
