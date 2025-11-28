/**
 * Mileage to Expense Integration
 *
 * Enables mileage trips to be converted into expenses that can be added to reports.
 * Adds admin-configurable mileage rate settings to organizations.
 *
 * Author: Claude Code
 * Date: 2025-11-27
 */

-- ============================================================================
-- 1. Add Mileage Settings to Organization Settings Default
-- ============================================================================

-- Update the default settings for organizations to include mileage_settings
ALTER TABLE organizations
ALTER COLUMN settings SET DEFAULT jsonb_build_object(
  'expense_policies', jsonb_build_object(
    'max_single_receipt', 500,
    'max_daily_total', 1000,
    'max_receipt_age_days', 90
  ),
  'approval_workflow', jsonb_build_object(
    'require_manager_approval', true,
    'require_finance_approval', false
  ),
  'mileage_settings', jsonb_build_object(
    'use_custom_rate', false,
    'custom_rate_per_mile', 0.0,
    'mileage_category', 'business'
  )
);

-- Update existing organizations to add mileage_settings if missing
UPDATE organizations
SET settings = settings || jsonb_build_object(
  'mileage_settings', jsonb_build_object(
    'use_custom_rate', false,
    'custom_rate_per_mile', 0.0,
    'mileage_category', 'business'
  )
)
WHERE NOT (settings ? 'mileage_settings');

-- ============================================================================
-- 2. Create Convert Trip to Expense Function
-- ============================================================================

/**
 * convert_trip_to_expense
 *
 * Converts a mileage trip into an expense record that can be added to reports.
 * Uses organization's custom rate if configured, otherwise uses IRS rate.
 *
 * @param p_trip_id UUID - The mileage trip to convert
 * @param p_user_id UUID - The user performing the conversion (for authorization)
 * @returns UUID - The ID of the created expense
 */
CREATE OR REPLACE FUNCTION convert_trip_to_expense(
  p_trip_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trip RECORD;
  v_expense_id UUID;
  v_rate DECIMAL(5,3);
  v_amount DECIMAL(10,2);
  v_org_settings JSONB;
  v_merchant TEXT;
  v_notes TEXT;
BEGIN
  -- Get trip details
  SELECT * INTO v_trip FROM mileage_trips WHERE id = p_trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  -- Verify the user owns this trip or is a manager/admin
  IF v_trip.user_id != p_user_id THEN
    -- Check if user is manager or admin in the organization
    IF NOT EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = v_trip.organization_id
        AND user_id = p_user_id
        AND role IN ('admin', 'manager', 'finance')
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'User not authorized to convert this trip';
    END IF;
  END IF;

  -- Check if trip is already linked to an expense
  IF v_trip.expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'Trip is already linked to expense %', v_trip.expense_id;
  END IF;

  -- Get organization settings
  SELECT settings INTO v_org_settings
  FROM organizations WHERE id = v_trip.organization_id;

  -- Determine rate to use (custom or IRS)
  IF v_org_settings->'mileage_settings' IS NOT NULL
     AND (v_org_settings->'mileage_settings'->>'use_custom_rate')::boolean = true
     AND (v_org_settings->'mileage_settings'->>'custom_rate_per_mile')::DECIMAL > 0 THEN
    -- Use custom rate
    v_rate := (v_org_settings->'mileage_settings'->>'custom_rate_per_mile')::DECIMAL;
    v_amount := ROUND(v_trip.total_miles * v_rate, 2);
  ELSE
    -- Use IRS rate (already captured on trip)
    v_rate := v_trip.irs_rate;
    v_amount := v_trip.reimbursement_amount; -- Use pre-calculated amount
  END IF;

  -- Build merchant name (truncate addresses if too long)
  v_merchant := 'Mileage: ' ||
    LEFT(v_trip.origin_address, 50) ||
    ' to ' ||
    LEFT(v_trip.destination_address, 50);

  -- Build notes with calculation details
  v_notes := v_trip.purpose ||
    ' (' || v_trip.total_miles || ' miles @ $' || ROUND(v_rate, 3) || '/mile)';

  IF v_trip.is_round_trip THEN
    v_notes := v_notes || ' [Round Trip]';
  END IF;

  -- Create expense
  INSERT INTO expenses (
    organization_id,
    user_id,
    merchant,
    amount,
    currency,
    category,
    expense_date,
    notes,
    status,
    policy_violations,
    is_reimbursable
  )
  VALUES (
    v_trip.organization_id,
    v_trip.user_id,
    v_merchant,
    v_amount,
    'USD',
    'Mileage',
    v_trip.trip_date,
    v_notes,
    'draft',
    '[]'::jsonb,
    true
  )
  RETURNING id INTO v_expense_id;

  -- Link trip to expense
  UPDATE mileage_trips
  SET expense_id = v_expense_id,
      updated_at = NOW()
  WHERE id = p_trip_id;

  RETURN v_expense_id;
END;
$$;

COMMENT ON FUNCTION convert_trip_to_expense IS 'Converts a mileage trip into an expense record that can be added to reports';

GRANT EXECUTE ON FUNCTION convert_trip_to_expense TO authenticated;

-- ============================================================================
-- 3. Create Helper Function to Get Organization Mileage Rate
-- ============================================================================

/**
 * get_org_mileage_rate
 *
 * Returns the effective mileage rate for an organization.
 * Returns custom rate if configured, otherwise returns IRS rate.
 *
 * @param p_organization_id UUID - The organization to check
 * @param p_trip_date DATE - The trip date (for IRS rate lookup)
 * @param p_category TEXT - The mileage category (default 'business')
 * @returns JSONB with rate info: { rate, source, irs_rate }
 */
CREATE OR REPLACE FUNCTION get_org_mileage_rate(
  p_organization_id UUID,
  p_trip_date DATE DEFAULT CURRENT_DATE,
  p_category TEXT DEFAULT 'business'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_org_settings JSONB;
  v_irs_rate DECIMAL(5,3);
  v_custom_rate DECIMAL(5,3);
  v_use_custom BOOLEAN;
BEGIN
  -- Get organization settings
  SELECT settings INTO v_org_settings
  FROM organizations WHERE id = p_organization_id;

  -- Get IRS rate for the date
  v_irs_rate := get_irs_rate(p_category, p_trip_date);

  -- Check if custom rate is configured
  v_use_custom := COALESCE(
    (v_org_settings->'mileage_settings'->>'use_custom_rate')::boolean,
    false
  );

  v_custom_rate := COALESCE(
    (v_org_settings->'mileage_settings'->>'custom_rate_per_mile')::DECIMAL,
    0
  );

  -- Return rate info
  IF v_use_custom AND v_custom_rate > 0 THEN
    RETURN jsonb_build_object(
      'rate', v_custom_rate,
      'source', 'custom',
      'irs_rate', v_irs_rate
    );
  ELSE
    RETURN jsonb_build_object(
      'rate', v_irs_rate,
      'source', 'irs',
      'irs_rate', v_irs_rate
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION get_org_mileage_rate IS 'Returns the effective mileage rate for an organization (custom or IRS)';

GRANT EXECUTE ON FUNCTION get_org_mileage_rate TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Mileage to Expense Integration - Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '1. Added mileage_settings to organization settings default';
  RAISE NOTICE '2. Updated existing organizations with mileage_settings';
  RAISE NOTICE '3. Created convert_trip_to_expense function';
  RAISE NOTICE '4. Created get_org_mileage_rate helper function';
  RAISE NOTICE '';
  RAISE NOTICE 'Organization mileage_settings structure:';
  RAISE NOTICE '  - use_custom_rate: boolean (default false)';
  RAISE NOTICE '  - custom_rate_per_mile: number (default 0.0)';
  RAISE NOTICE '  - mileage_category: business|medical|charity|moving';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  SELECT convert_trip_to_expense(trip_id, user_id);';
  RAISE NOTICE '  SELECT get_org_mileage_rate(org_id, trip_date);';
  RAISE NOTICE '========================================';
END $$;
