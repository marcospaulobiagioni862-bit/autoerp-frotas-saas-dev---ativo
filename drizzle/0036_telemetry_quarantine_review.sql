-- TELEMETRY-1D: auditable human triage for quarantined synthetic telemetry.
-- This migration does not apply odometer data or create operational/financial side effects.

ALTER TABLE tracker_telemetry_events
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

UPDATE tracker_telemetry_events
SET review_status = 'PENDING'
WHERE status = 'QUARANTINED' AND review_status IS NULL;

ALTER TABLE tracker_telemetry_events
  DROP CONSTRAINT IF EXISTS tracker_telemetry_events_review_status_chk,
  ADD CONSTRAINT tracker_telemetry_events_review_status_chk
    CHECK (review_status IS NULL OR review_status IN ('PENDING', 'ACKNOWLEDGED', 'DISMISSED')),
  DROP CONSTRAINT IF EXISTS tracker_telemetry_events_review_state_chk,
  ADD CONSTRAINT tracker_telemetry_events_review_state_chk CHECK (
    (
      status = 'ACCEPTED'
      AND review_status IS NULL
      AND review_reason IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
    )
    OR
    (
      status = 'QUARANTINED'
      AND review_status = 'PENDING'
      AND review_reason IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
    )
    OR
    (
      status = 'QUARANTINED'
      AND review_status IN ('ACKNOWLEDGED', 'DISMISSED')
      AND review_reason IS NOT NULL
      AND char_length(btrim(review_reason)) BETWEEN 3 AND 500
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_tracker_telemetry_events_pending_review
  ON tracker_telemetry_events(company_id, tracker_id, received_at DESC, id DESC)
  WHERE status = 'QUARANTINED' AND review_status = 'PENDING';
