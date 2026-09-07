-- VEHICLE-ID-1: normalized Plate/RENAVAM identity guard.
-- Existing duplicate rows are preserved for explicit review; the trigger blocks NEW duplicate identities.

CREATE OR REPLACE FUNCTION autoerp_guard_vehicle_normalized_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_plate text;
  normalized_renavam text;
  conflicting_vehicle_id text;
BEGIN
  normalized_plate := upper(regexp_replace(trim(coalesce(NEW.plate, '')), '[^A-Z0-9]', '', 'g'));
  normalized_renavam := upper(regexp_replace(trim(coalesce(NEW.renavam, '')), '[^A-Z0-9]', '', 'g'));

  IF normalized_plate = '' OR normalized_renavam = '' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Vehicle plate and RENAVAM are required';
  END IF;

  -- Serialize competing creates even when browser requests arrive at the same time.
  PERFORM pg_advisory_xact_lock(hashtext('vehicle:plate:' || NEW.company_id || ':' || normalized_plate));
  PERFORM pg_advisory_xact_lock(hashtext('vehicle:renavam:' || NEW.company_id || ':' || normalized_renavam));

  SELECT v.id
  INTO conflicting_vehicle_id
  FROM vehicles v
  WHERE v.company_id = NEW.company_id
    AND v.id <> NEW.id
    AND (
      upper(regexp_replace(trim(coalesce(v.plate, '')), '[^A-Z0-9]', '', 'g')) = normalized_plate
      OR upper(regexp_replace(trim(coalesce(v.renavam, '')), '[^A-Z0-9]', '', 'g')) = normalized_renavam
    )
  ORDER BY v.created_at, v.id
  LIMIT 1;

  IF conflicting_vehicle_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'vehicles_normalized_identity_unique',
      MESSAGE = 'Vehicle Plate/RENAVAM already exists after normalization',
      DETAIL = 'Existing vehicle id=' || conflicting_vehicle_id;
  END IF;

  NEW.plate := normalized_plate;
  NEW.renavam := normalized_renavam;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_normalized_identity_guard ON vehicles;
CREATE TRIGGER trg_vehicle_normalized_identity_guard
BEFORE INSERT OR UPDATE OF plate, renavam ON vehicles
FOR EACH ROW
EXECUTE FUNCTION autoerp_guard_vehicle_normalized_identity();
