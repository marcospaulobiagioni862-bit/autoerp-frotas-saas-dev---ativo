-- V2: traffic tickets may reference a plate that is not registered in the fleet.
-- The plate remains authoritative on the ticket; vehicle_id is optional.
ALTER TABLE traffic_tickets
  ADD COLUMN IF NOT EXISTS vehicle_plate text;

UPDATE traffic_tickets ticket
SET vehicle_plate = UPPER(regexp_replace(vehicle.plate, '[^A-Za-z0-9]', '', 'g'))
FROM vehicles vehicle
WHERE ticket.company_id = vehicle.company_id
  AND ticket.vehicle_id = vehicle.id
  AND (ticket.vehicle_plate IS NULL OR btrim(ticket.vehicle_plate) = '');

ALTER TABLE traffic_tickets
  ALTER COLUMN vehicle_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_traffic_tickets_company_plate_date
  ON traffic_tickets(company_id, vehicle_plate, infraction_date DESC)
  WHERE canonical_ready = true;
