-- ============================================================================
-- Jensify Database Schema - GL Code Mappings
-- Created: 2025-11-29
-- Description: Add General Ledger (GL) code mapping system to organization settings
-- This allows finance admins to configure how expense categories map to accounting codes
-- ============================================================================

-- ============================================================================
-- UPDATE ORGANIZATION SETTINGS DEFAULT
-- Add gl_code_mappings to default settings structure
-- ============================================================================

-- Note: Since settings is JSONB, we don't need to alter the column structure.
-- We're adding a function to initialize/update GL code mappings for existing organizations.

-- ============================================================================
-- FUNCTION: Initialize GL code mappings with default values
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_gl_code_mappings(p_organization_id UUID)
RETURNS VOID AS $$
DECLARE
  v_default_mappings JSONB := '{
    "Auto Allowance": {
      "gl_code": "auto allowance",
      "description": "Vehicle allowance/stipend",
      "is_active": true
    },
    "Parking": {
      "gl_code": "travel",
      "description": "Parking fees",
      "is_active": true
    },
    "Tolls": {
      "gl_code": "travel",
      "description": "Toll charges",
      "is_active": true
    },
    "Auto Rental": {
      "gl_code": "travel",
      "description": "Car rental expenses",
      "is_active": true
    },
    "Fuel": {
      "gl_code": "travel",
      "description": "Gas/fuel purchases",
      "is_active": true
    },
    "Airfare": {
      "gl_code": "travel",
      "description": "Flight tickets",
      "is_active": true
    },
    "Lodging": {
      "gl_code": "travel",
      "description": "Hotel/accommodation",
      "is_active": true
    },
    "Rail/Bus": {
      "gl_code": "travel",
      "description": "Train and bus fares",
      "is_active": true
    },
    "Ground Transportation": {
      "gl_code": "travel",
      "description": "Taxi, rideshare, etc.",
      "is_active": true
    },
    "Office Supplies": {
      "gl_code": "shop/office supplies",
      "description": "Office supplies and materials",
      "is_active": true
    },
    "Individual Meals": {
      "gl_code": "meals",
      "description": "Solo meals while traveling",
      "is_active": true
    },
    "Business Meals": {
      "gl_code": "meals",
      "description": "Meals with clients/partners (include attendees and purpose)",
      "is_active": true
    },
    "Business Entertainment": {
      "gl_code": "entertainment",
      "description": "Client entertainment (include attendees and purpose)",
      "is_active": true
    },
    "Software/Subscriptions": {
      "gl_code": "software",
      "description": "Software licenses and subscriptions",
      "is_active": true
    },
    "Mileage": {
      "gl_code": "travel",
      "description": "Personal vehicle mileage reimbursement",
      "is_active": true
    },
    "Miscellaneous": {
      "gl_code": "miscellaneous",
      "description": "Other uncategorized expenses",
      "is_active": true
    }
  }'::jsonb;
BEGIN
  -- Update organization settings with GL code mappings if not already set
  UPDATE organizations
  SET settings = settings || jsonb_build_object('gl_code_mappings', v_default_mappings)
  WHERE id = p_organization_id
    AND NOT (settings ? 'gl_code_mappings');

  -- If gl_code_mappings already exists but is empty, initialize it
  UPDATE organizations
  SET settings = jsonb_set(settings, '{gl_code_mappings}', v_default_mappings)
  WHERE id = p_organization_id
    AND (settings->'gl_code_mappings') IS NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION initialize_gl_code_mappings(UUID) IS 'Initializes default GL code mappings for an organization';

-- ============================================================================
-- FUNCTION: Get GL code for a category
-- ============================================================================

CREATE OR REPLACE FUNCTION get_gl_code_for_category(
  p_organization_id UUID,
  p_category TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_gl_code TEXT;
BEGIN
  SELECT settings->'gl_code_mappings'->p_category->>'gl_code'
  INTO v_gl_code
  FROM organizations
  WHERE id = p_organization_id;

  -- Return 'uncategorized' if no mapping found
  RETURN COALESCE(v_gl_code, 'uncategorized');
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_gl_code_for_category(UUID, TEXT) IS 'Returns the GL code for a given expense category';

-- ============================================================================
-- FUNCTION: Update GL code mapping
-- ============================================================================

CREATE OR REPLACE FUNCTION update_gl_code_mapping(
  p_organization_id UUID,
  p_category TEXT,
  p_gl_code TEXT,
  p_description TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS VOID AS $$
DECLARE
  v_mapping JSONB;
BEGIN
  -- Build the mapping object
  v_mapping := jsonb_build_object(
    'gl_code', p_gl_code,
    'description', COALESCE(p_description, ''),
    'is_active', p_is_active
  );

  -- Update the specific category mapping
  UPDATE organizations
  SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    ARRAY['gl_code_mappings', p_category],
    v_mapping
  ),
  updated_at = NOW()
  WHERE id = p_organization_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_gl_code_mapping(UUID, TEXT, TEXT, TEXT, BOOLEAN) IS 'Updates the GL code mapping for a specific expense category';

-- ============================================================================
-- FUNCTION: Get all GL codes for reporting
-- ============================================================================

CREATE OR REPLACE FUNCTION get_all_gl_codes(p_organization_id UUID)
RETURNS TABLE (
  category TEXT,
  gl_code TEXT,
  description TEXT,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    key as category,
    (value->>'gl_code')::TEXT as gl_code,
    (value->>'description')::TEXT as description,
    COALESCE((value->>'is_active')::BOOLEAN, true) as is_active
  FROM organizations o,
  LATERAL jsonb_each(o.settings->'gl_code_mappings') AS kv(key, value)
  WHERE o.id = p_organization_id
  ORDER BY key;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_all_gl_codes(UUID) IS 'Returns all GL code mappings for an organization';

-- ============================================================================
-- VIEW: Expenses with GL codes (for reporting)
-- ============================================================================

CREATE OR REPLACE VIEW expenses_with_gl_codes AS
SELECT
  e.*,
  get_gl_code_for_category(e.organization_id, e.category) as gl_code
FROM expenses e;

COMMENT ON VIEW expenses_with_gl_codes IS 'Expenses view with GL code assignment based on category';

-- ============================================================================
-- INITIALIZE GL CODE MAPPINGS FOR EXISTING ORGANIZATIONS
-- ============================================================================

DO $$
DECLARE
  v_org RECORD;
BEGIN
  RAISE NOTICE 'Initializing GL code mappings for existing organizations...';

  FOR v_org IN SELECT id FROM organizations LOOP
    PERFORM initialize_gl_code_mappings(v_org.id);
    RAISE NOTICE 'Initialized GL codes for organization: %', v_org.id;
  END LOOP;

  RAISE NOTICE 'GL code mappings initialization complete!';
END $$;

-- ============================================================================
-- TRIGGER: Auto-initialize GL codes for new organizations
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_initialize_gl_codes()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM initialize_gl_code_mappings(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_init_gl_codes ON organizations;

CREATE TRIGGER auto_init_gl_codes
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_initialize_gl_codes();

COMMENT ON TRIGGER auto_init_gl_codes ON organizations IS 'Automatically initializes GL code mappings when a new organization is created';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'GL Code Mappings Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New capabilities:';
  RAISE NOTICE '  - GL code mappings stored in organization settings (JSONB)';
  RAISE NOTICE '  - Function: initialize_gl_code_mappings(org_id)';
  RAISE NOTICE '  - Function: get_gl_code_for_category(org_id, category)';
  RAISE NOTICE '  - Function: update_gl_code_mapping(org_id, category, gl_code, desc, active)';
  RAISE NOTICE '  - Function: get_all_gl_codes(org_id)';
  RAISE NOTICE '  - View: expenses_with_gl_codes';
  RAISE NOTICE '';
  RAISE NOTICE 'Default expense categories with GL codes:';
  RAISE NOTICE '  - Auto Allowance     -> auto allowance';
  RAISE NOTICE '  - Parking            -> travel';
  RAISE NOTICE '  - Tolls              -> travel';
  RAISE NOTICE '  - Auto Rental        -> travel';
  RAISE NOTICE '  - Fuel               -> travel';
  RAISE NOTICE '  - Airfare            -> travel';
  RAISE NOTICE '  - Lodging            -> travel';
  RAISE NOTICE '  - Rail/Bus           -> travel';
  RAISE NOTICE '  - Ground Transportation -> travel';
  RAISE NOTICE '  - Office Supplies    -> shop/office supplies';
  RAISE NOTICE '  - Individual Meals   -> meals';
  RAISE NOTICE '  - Business Meals     -> meals';
  RAISE NOTICE '  - Business Entertainment -> entertainment';
  RAISE NOTICE '  - Software/Subscriptions -> software';
  RAISE NOTICE '  - Mileage            -> travel';
  RAISE NOTICE '  - Miscellaneous      -> miscellaneous';
  RAISE NOTICE '';
  RAISE NOTICE 'All existing organizations have been initialized with default mappings.';
  RAISE NOTICE 'New organizations will automatically receive default mappings.';
  RAISE NOTICE '========================================';
END $$;
