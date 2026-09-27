-- KM Central: equal readings are distinct confirmations, even on the same day.
-- 0009's unique key (company, vehicle, KM, type, date) prevents that requirement.
-- Keep the primary key and idx_vehicle_km_company_vehicle_date for scoped history.
DROP INDEX IF EXISTS uq_vehicle_km_exact_reading;
