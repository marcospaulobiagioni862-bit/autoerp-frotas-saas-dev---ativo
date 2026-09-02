ALTER TABLE traffic_tickets
  ADD COLUMN IF NOT EXISTS infraction_location text;
