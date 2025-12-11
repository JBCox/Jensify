-- ============================================================================
-- Migration: Seed Default Categories on Organization Creation
-- Created: 2024-12-08
-- Description: Updates create_organization_with_admin to insert default expense categories
-- ============================================================================

-- Drop the existing function first
DROP FUNCTION IF EXISTS create_organization_with_admin(TEXT, TEXT, JSONB, UUID);

-- Recreate the function with default category seeding
CREATE OR REPLACE FUNCTION create_organization_with_admin(
  p_name TEXT,
  p_domain TEXT DEFAULT NULL,
  p_settings JSONB DEFAULT NULL,
  p_admin_user_id UUID DEFAULT auth.uid()
)
RETURNS organizations 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization organizations;
  v_default_settings JSONB := '{
    "expense_policies": {
      "max_single_receipt": 500,
      "max_daily_total": 750,
      "max_receipt_age_days": 90
    },
    "approval_workflow": {
      "require_manager_approval": true,
      "require_finance_approval": true
    }
  }'::jsonb;
BEGIN
  -- Create organization
  INSERT INTO organizations (name, domain, settings)
  VALUES (
    p_name,
    p_domain,
    COALESCE(p_settings, v_default_settings)
  )
  RETURNING * INTO v_organization;

  -- Add creator as admin
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role,
    is_active
  ) VALUES (
    v_organization.id,
    p_admin_user_id,
    'admin',
    true
  );

  -- Seed default expense categories for the new organization
  INSERT INTO expense_categories (organization_id, name, description, icon, color, display_order, requires_receipt, requires_description)
  VALUES
    (v_organization.id, 'Fuel', 'Gas and fuel expenses for vehicles', 'local_gas_station', '#FF5900', 1, true, false),
    (v_organization.id, 'Lodging', 'Hotel and accommodation expenses', 'hotel', '#2196F3', 2, true, false),
    (v_organization.id, 'Individual Meals', 'Personal meal expenses while traveling', 'restaurant', '#4CAF50', 3, true, false),
    (v_organization.id, 'Team Meals', 'Group or team meal expenses', 'groups', '#9C27B0', 4, true, true),
    (v_organization.id, 'Airfare', 'Flight and airline expenses', 'flight', '#00BCD4', 5, true, false),
    (v_organization.id, 'Ground Transportation', 'Taxi, Uber, rental car expenses', 'directions_car', '#FF9800', 6, true, false),
    (v_organization.id, 'Office Supplies', 'Office supplies and equipment', 'business_center', '#607D8B', 7, true, false),
    (v_organization.id, 'Software', 'Software and subscription expenses', 'computer', '#3F51B5', 8, true, false),
    (v_organization.id, 'Miscellaneous', 'Other business expenses', 'receipt_long', '#795548', 9, true, true);

  RETURN v_organization;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_organization_with_admin IS 'Creates organization, adds creator as admin, and seeds default expense categories';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Default Categories Seeding Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Updated: create_organization_with_admin()';
  RAISE NOTICE 'New organizations will now get 9 default expense categories';
  RAISE NOTICE '========================================';
END $$;
