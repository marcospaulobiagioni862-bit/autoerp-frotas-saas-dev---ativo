-- KM Central: equal readings are distinct confirmations, even on the same day.
-- 0009's unique key (company, vehicle, KM, type, date) prevents that requirement.
-- Keep the primary key and idx_vehicle_km_company_vehicle_date for scoped history.
-- schema.ts previously declared a UNIQUE constraint; db:push can create that variant.
ALTER TABLE vehicle_km_records DROP CONSTRAINT IF EXISTS uq_vehicle_km_exact_reading;
DROP INDEX IF EXISTS uq_vehicle_km_exact_reading;
