-- KM-BATCH-1: source evidence and per-vehicle reading schedule.
-- Existing KM rows remain valid and are classified as MANUAL by default.

ALTER TABLE vehicle_km_records
  ADD COLUMN source_type text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN source_attachment_id text,
  ADD COLUMN source_tracker_id text,
  ADD COLUMN source_observed_at timestamp;

ALTER TABLE vehicle_km_records
  ADD CONSTRAINT vehicle_km_records_source_type_check
  CHECK (source_type IN ('MANUAL','DRIVER_PHOTO','TRACKER'));

CREATE INDEX idx_vehicle_km_company_source
  ON vehicle_km_records(company_id, vehicle_id, source_type, record_date);

CREATE TABLE vehicle_km_reading_schedules (
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  frequency text NOT NULL,
  weekday integer,
  day_of_month integer,
  next_due_date text NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_km_reading_schedules_pk PRIMARY KEY (company_id, vehicle_id),
  CONSTRAINT vehicle_km_reading_schedules_frequency_check CHECK (frequency IN ('WEEKLY','MONTHLY')),
  CONSTRAINT vehicle_km_reading_schedules_weekday_check CHECK (weekday IS NULL OR weekday BETWEEN 1 AND 7),
  CONSTRAINT vehicle_km_reading_schedules_day_check CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  CONSTRAINT vehicle_km_reading_schedules_shape_check CHECK (
    (frequency='WEEKLY' AND weekday IS NOT NULL AND day_of_month IS NULL)
    OR
    (frequency='MONTHLY' AND weekday IS NULL AND day_of_month IS NOT NULL)
  )
);

CREATE INDEX idx_vehicle_km_schedule_due
  ON vehicle_km_reading_schedules(company_id, next_due_date, vehicle_id);

ALTER TABLE vehicle_km_reading_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_km_reading_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY vehicle_km_reading_schedules_tenant_policy
  ON vehicle_km_reading_schedules
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
