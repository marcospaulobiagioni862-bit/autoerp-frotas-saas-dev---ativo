-- Align vehicle_inspections with the existing Drizzle model used by KM/inspection flows.
ALTER TABLE vehicle_inspections
  ADD COLUMN IF NOT EXISTS vehicle_plate text;
