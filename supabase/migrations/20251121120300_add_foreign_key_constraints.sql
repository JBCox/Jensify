-- ============================================================================
-- Add Missing Foreign Key Constraints
-- Created: 2025-11-21
-- Description: Add foreign key constraints for audit trail fields to ensure
--              referential integrity and prevent orphaned user references
-- Data Integrity Impact: CRITICAL - Prevents broken audit trails
-- ============================================================================

BEGIN;

-- ============================================================================
-- EXPENSES TABLE - REIMBURSEMENT AUDIT TRAIL
-- ============================================================================

-- Add FK for reimbursed_by (who processed the reimbursement)
ALTER TABLE expenses
  ADD CONSTRAINT fk_expenses_reimbursed_by
  FOREIGN KEY (reimbursed_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_expenses_reimbursed_by ON expenses IS
  'Ensures reimbursed_by references a valid user. Sets to NULL if user is deleted to preserve audit trail.';

-- ============================================================================
-- MILEAGE_TRIPS TABLE - APPROVAL AUDIT TRAIL
-- ============================================================================

-- Add FK for approved_by (who approved the trip)
ALTER TABLE mileage_trips
  ADD CONSTRAINT fk_mileage_trips_approved_by
  FOREIGN KEY (approved_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- Add FK for rejected_by (who rejected the trip)
ALTER TABLE mileage_trips
  ADD CONSTRAINT fk_mileage_trips_rejected_by
  FOREIGN KEY (rejected_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_mileage_trips_approved_by ON mileage_trips IS
  'Ensures approved_by references a valid user. Sets to NULL if user is deleted to preserve audit trail.';

COMMENT ON CONSTRAINT fk_mileage_trips_rejected_by ON mileage_trips IS
  'Ensures rejected_by references a valid user. Sets to NULL if user is deleted to preserve audit trail.';

-- ============================================================================
-- EXPENSE_REPORTS TABLE - WORKFLOW AUDIT TRAIL
-- ============================================================================

-- Add FK for submitted_by (who submitted the report)
ALTER TABLE expense_reports
  ADD CONSTRAINT fk_expense_reports_submitted_by
  FOREIGN KEY (submitted_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- Add FK for approved_by (who approved the report)
ALTER TABLE expense_reports
  ADD CONSTRAINT fk_expense_reports_approved_by
  FOREIGN KEY (approved_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- Add FK for rejected_by (who rejected the report)
ALTER TABLE expense_reports
  ADD CONSTRAINT fk_expense_reports_rejected_by
  FOREIGN KEY (rejected_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- Add FK for paid_by (who marked as paid)
ALTER TABLE expense_reports
  ADD CONSTRAINT fk_expense_reports_paid_by
  FOREIGN KEY (paid_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_expense_reports_submitted_by ON expense_reports IS
  'Ensures submitted_by references a valid user. Sets to NULL if user is deleted to preserve audit trail.';

COMMENT ON CONSTRAINT fk_expense_reports_approved_by ON expense_reports IS
  'Ensures approved_by references a valid user. Sets to NULL if user is deleted to preserve audit trail.';

COMMENT ON CONSTRAINT fk_expense_reports_rejected_by ON expense_reports IS
  'Ensures rejected_by references a valid user. Sets to NULL if user is deleted to preserve audit trail.';

COMMENT ON CONSTRAINT fk_expense_reports_paid_by ON expense_reports IS
  'Ensures paid_by references a valid user. Sets to NULL if user is deleted to preserve audit trail.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_expense_fks INTEGER;
  v_trip_fks INTEGER;
  v_report_fks INTEGER;
  v_total_fks INTEGER;
BEGIN
  -- Count foreign keys added
  SELECT COUNT(*) INTO v_expense_fks
  FROM pg_constraint
  WHERE conrelid = 'expenses'::regclass
    AND conname LIKE 'fk_expenses_%';

  SELECT COUNT(*) INTO v_trip_fks
  FROM pg_constraint
  WHERE conrelid = 'mileage_trips'::regclass
    AND conname LIKE 'fk_mileage_trips_%';

  SELECT COUNT(*) INTO v_report_fks
  FROM pg_constraint
  WHERE conrelid = 'expense_reports'::regclass
    AND conname LIKE 'fk_expense_reports_%';

  v_total_fks := v_expense_fks + v_trip_fks + v_report_fks;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Foreign Key Constraints Added!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'New constraints added: 7';
  RAISE NOTICE '  - expenses: % FK constraints', v_expense_fks;
  RAISE NOTICE '  - mileage_trips: % FK constraints', v_trip_fks;
  RAISE NOTICE '  - expense_reports: % FK constraints', v_report_fks;
  RAISE NOTICE 'Total audit trail FKs: %', v_total_fks;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Benefits:';
  RAISE NOTICE '  - Referential integrity enforced';
  RAISE NOTICE '  - Prevents orphaned user references';
  RAISE NOTICE '  - Preserves audit trail on user deletion';
  RAISE NOTICE '  - ON DELETE SET NULL maintains history';
  RAISE NOTICE '========================================';

  IF v_total_fks < 7 THEN
    RAISE WARNING 'Expected 7 foreign keys, found %', v_total_fks;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- DATA INTEGRITY VALIDATION
-- ============================================================================
-- After migration, verify no orphaned references exist:
--
-- 1. Check expenses for invalid reimbursed_by:
--    SELECT COUNT(*) FROM expenses
--    WHERE reimbursed_by IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = reimbursed_by);
--
-- 2. Check mileage_trips for invalid approved_by/rejected_by:
--    SELECT COUNT(*) FROM mileage_trips
--    WHERE approved_by IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = approved_by);
--
-- 3. Check expense_reports for invalid workflow users:
--    SELECT COUNT(*) FROM expense_reports
--    WHERE submitted_by IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = submitted_by);
--
-- Expected: All queries should return 0 (no orphaned references)
-- ============================================================================

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
-- ALTER TABLE expenses DROP CONSTRAINT IF EXISTS fk_expenses_reimbursed_by;
-- ALTER TABLE mileage_trips DROP CONSTRAINT IF EXISTS fk_mileage_trips_approved_by;
-- ALTER TABLE mileage_trips DROP CONSTRAINT IF EXISTS fk_mileage_trips_rejected_by;
-- ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS fk_expense_reports_submitted_by;
-- ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS fk_expense_reports_approved_by;
-- ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS fk_expense_reports_rejected_by;
-- ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS fk_expense_reports_paid_by;
-- ============================================================================
