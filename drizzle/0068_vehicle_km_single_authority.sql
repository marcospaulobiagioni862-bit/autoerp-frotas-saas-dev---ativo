-- KM-AUTH-2: enforce a single monotonic KM authority across every ERP module.
-- New KM events are authoritative; vehicles.current_km is the synchronized snapshot.

CREATE OR REPLACE FUNCTION autoerp_vehicle_km_record_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_value integer;
BEGIN
  SELECT current_km
    INTO current_value
    FROM vehicles
   WHERE company_id = NEW.company_id
     AND id = NEW.vehicle_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found for KM record'
      USING ERRCODE = '23503', CONSTRAINT = 'vehicle_km_records_vehicle_guard';
  END IF;

  IF NEW.km_value < current_value THEN
    RAISE EXCEPTION 'KM regression is not allowed'
      USING ERRCODE = '23514', CONSTRAINT = 'vehicle_km_records_monotonic_guard';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM vehicle_km_records r
     WHERE r.company_id = NEW.company_id
       AND r.vehicle_id = NEW.vehicle_id
       AND r.km_value = NEW.km_value
       AND r.record_date = NEW.record_date
  ) THEN
    RAISE EXCEPTION 'Duplicate KM reading for vehicle/date'
      USING ERRCODE = '23505', CONSTRAINT = 'vehicle_km_records_daily_value_guard';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_km_record_guard ON vehicle_km_records;
CREATE TRIGGER trg_vehicle_km_record_guard
BEFORE INSERT ON vehicle_km_records
FOR EACH ROW
EXECUTE FUNCTION autoerp_vehicle_km_record_guard();

CREATE OR REPLACE FUNCTION autoerp_vehicle_km_record_sync_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE vehicles
     SET current_km = GREATEST(current_km, NEW.km_value),
         updated_at = GREATEST(updated_at, NEW.created_at)
   WHERE company_id = NEW.company_id
     AND id = NEW.vehicle_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_km_record_sync_snapshot ON vehicle_km_records;
CREATE TRIGGER trg_vehicle_km_record_sync_snapshot
AFTER INSERT ON vehicle_km_records
FOR EACH ROW
EXECUTE FUNCTION autoerp_vehicle_km_record_sync_snapshot();

CREATE OR REPLACE FUNCTION autoerp_vehicle_current_km_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_km IS NOT DISTINCT FROM OLD.current_km THEN
    RETURN NEW;
  END IF;

  IF NEW.current_km < OLD.current_km THEN
    RAISE EXCEPTION 'KM regression is not allowed'
      USING ERRCODE = '23514', CONSTRAINT = 'vehicles_current_km_monotonic_guard';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM vehicle_km_records r
     WHERE r.company_id = NEW.company_id
       AND r.vehicle_id = NEW.id
       AND r.km_value = NEW.current_km
  ) THEN
    RAISE EXCEPTION 'current_km must be backed by a KM history record'
      USING ERRCODE = '23514', CONSTRAINT = 'vehicles_current_km_history_guard';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_current_km_guard ON vehicles;
CREATE TRIGGER trg_vehicle_current_km_guard
BEFORE UPDATE OF current_km ON vehicles
FOR EACH ROW
EXECUTE FUNCTION autoerp_vehicle_current_km_guard();
