-- V2: preserve optional buyer contact details on each vehicle sale lifecycle event.
ALTER TABLE vehicle_lifecycle_events
  ADD COLUMN IF NOT EXISTS buyer_phone text,
  ADD COLUMN IF NOT EXISTS buyer_email text;
