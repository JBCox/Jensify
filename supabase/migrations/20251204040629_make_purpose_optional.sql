-- ============================================================================
-- Make mileage trip purpose optional for quick logging
-- Created: 2024-12-04
-- Description: Allow users to create trips without purpose, add it later before submitting
-- ============================================================================

-- Make purpose column nullable to support quick logging workflow
ALTER TABLE mileage_trips ALTER COLUMN purpose DROP NOT NULL;

-- Update constraint to require purpose only when submitting
ALTER TABLE mileage_trips DROP CONSTRAINT IF EXISTS valid_workflow_submitted;
ALTER TABLE mileage_trips ADD CONSTRAINT valid_workflow_submitted CHECK (
  (status != 'submitted') OR (submitted_at IS NOT NULL AND purpose IS NOT NULL AND purpose != '')
);

COMMENT ON COLUMN mileage_trips.purpose IS 'Trip purpose - optional for draft, required before submitting';
