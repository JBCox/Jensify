-- ============================================================================
-- Jensify Database Schema - Advanced Policy Engine
-- Created: 2025-11-30
-- Description: Per-category, per-department, and per-role expense limits
--
-- FEATURES:
-- 1. Category-specific spending limits (e.g., Meals max $75, Lodging max $300)
-- 2. Department-based policy overrides
-- 3. Role-based policy tiers (executives, managers, employees)
-- 4. Time-based rules (receipt age, weekend restrictions)
-- 5. Policy priority system (most specific wins)
-- ============================================================================

-- ============================================================================
-- EXPENSE POLICIES TABLE
-- Stores configurable policy rules per organization
-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Policy identification
  name TEXT NOT NULL,
  description TEXT,

  -- Scope: What this policy applies to (more specific = higher priority)
  scope_type TEXT NOT NULL CHECK (scope_type IN ('organization', 'department', 'role', 'user', 'category')),
  scope_value TEXT, -- Department name, role name, user_id, or category name (null for organization-wide)

  -- Category filter: If set, only applies to this category
  category TEXT, -- NULL means all categories

  -- Limits
  max_amount NUMERIC(10,2), -- Max per expense
  max_daily_total NUMERIC(10,2), -- Max total per day
  max_monthly_total NUMERIC(10,2), -- Max total per month
  max_receipt_age_days INTEGER DEFAULT 90, -- How old can receipts be

  -- Restrictions
  require_receipt BOOLEAN DEFAULT true, -- Require receipt attachment
  require_description BOOLEAN DEFAULT false, -- Require notes/description
  allow_weekends BOOLEAN DEFAULT true, -- Allow expenses dated on weekends

  -- Approval rules
  auto_approve_under NUMERIC(10,2), -- Auto-approve if under this amount (null = never)
  require_approval_over NUMERIC(10,2), -- Require approval if over this amount
  require_finance_over NUMERIC(10,2), -- Require finance approval if over this amount

  -- Priority (higher = checked first, most specific should have highest)
  priority INTEGER NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT unique_policy_scope UNIQUE(organization_id, scope_type, scope_value, category)
);

COMMENT ON TABLE expense_policies IS 'Configurable expense policy rules with scope-based targeting';
COMMENT ON COLUMN expense_policies.scope_type IS 'What level this policy applies to: organization, department, role, user, or category';
COMMENT ON COLUMN expense_policies.scope_value IS 'Specific value for scope (e.g., "Sales" for department, "manager" for role)';
COMMENT ON COLUMN expense_policies.priority IS 'Higher priority policies are checked first; most specific should have highest priority';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expense_policies_org ON expense_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_expense_policies_scope ON expense_policies(organization_id, scope_type, is_active);
CREATE INDEX IF NOT EXISTS idx_expense_policies_category ON expense_policies(organization_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expense_policies_active ON expense_policies(organization_id, is_active) WHERE is_active = true;

-- ============================================================================
-- DEFAULT POLICY PRESETS (Seed data)
-- Common policy templates that can be applied to organizations
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  preset_type TEXT NOT NULL CHECK (preset_type IN ('category_limit', 'tier', 'template')),
  config JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE policy_presets IS 'Pre-built policy templates for easy setup';

-- Insert default category limits preset
INSERT INTO policy_presets (name, description, preset_type, config, is_default) VALUES
  ('Standard Category Limits', 'Typical per-category spending limits', 'category_limit', '{
    "categories": {
      "Individual Meals": {"max_amount": 75, "require_receipt": true},
      "Business Meals": {"max_amount": 150, "require_receipt": true, "require_description": true},
      "Business Entertainment": {"max_amount": 250, "require_receipt": true, "require_description": true},
      "Lodging": {"max_amount": 300, "require_receipt": true},
      "Airfare": {"max_amount": 1000, "require_receipt": true},
      "Ground Transportation": {"max_amount": 100, "require_receipt": true},
      "Auto Rental": {"max_amount": 150, "require_receipt": true},
      "Fuel": {"max_amount": 100, "require_receipt": true},
      "Parking": {"max_amount": 50, "require_receipt": true},
      "Tolls": {"max_amount": 25, "require_receipt": true},
      "Office Supplies": {"max_amount": 100, "require_receipt": true},
      "Software/Subscriptions": {"max_amount": 200, "require_receipt": true}
    }
  }', true),

  ('Executive Tier', 'Higher limits for executives', 'tier', '{
    "max_amount": 1000,
    "max_daily_total": 2500,
    "max_monthly_total": 15000,
    "auto_approve_under": 250,
    "require_approval_over": 500
  }', false),

  ('Manager Tier', 'Standard limits for managers', 'tier', '{
    "max_amount": 500,
    "max_daily_total": 1000,
    "max_monthly_total": 5000,
    "auto_approve_under": 100,
    "require_approval_over": 250
  }', false),

  ('Employee Tier', 'Standard limits for employees', 'tier', '{
    "max_amount": 250,
    "max_daily_total": 500,
    "max_monthly_total": 2000,
    "auto_approve_under": 50,
    "require_approval_over": 100
  }', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- ENHANCED POLICY CHECK FUNCTION
-- Replaces the basic check_expense_policies function
-- ============================================================================

CREATE OR REPLACE FUNCTION check_expense_policies_v2()
RETURNS TRIGGER AS $$
DECLARE
  violations JSONB := '[]'::jsonb;
  v_policy RECORD;
  v_daily_total DECIMAL(10,2);
  v_monthly_total DECIMAL(10,2);
  v_member RECORD;
  v_applicable_policies CURSOR FOR
    SELECT * FROM expense_policies
    WHERE organization_id = NEW.organization_id
      AND is_active = true
      AND (
        -- Organization-wide policy
        (scope_type = 'organization' AND scope_value IS NULL)
        -- Category-specific policy
        OR (scope_type = 'category' AND (category = NEW.category OR category IS NULL))
        -- Department policy (requires lookup)
        OR (scope_type = 'department')
        -- Role policy (requires lookup)
        OR (scope_type = 'role')
        -- User-specific policy
        OR (scope_type = 'user' AND scope_value = NEW.user_id::text)
      )
    ORDER BY priority DESC, scope_type DESC;
  v_max_amount NUMERIC(10,2) := NULL;
  v_max_daily NUMERIC(10,2) := NULL;
  v_max_monthly NUMERIC(10,2) := NULL;
  v_max_age INTEGER := 90;
  v_require_receipt BOOLEAN := false;
  v_require_description BOOLEAN := false;
  v_allow_weekends BOOLEAN := true;
BEGIN
  -- Get user's department and role
  SELECT department, role INTO v_member
  FROM organization_members
  WHERE user_id = NEW.user_id
    AND organization_id = NEW.organization_id
    AND is_active = true
  LIMIT 1;

  -- Find the most specific applicable policy for each limit type
  FOR v_policy IN
    SELECT * FROM expense_policies
    WHERE organization_id = NEW.organization_id
      AND is_active = true
      AND (
        (scope_type = 'organization')
        OR (scope_type = 'category' AND (category = NEW.category OR category IS NULL))
        OR (scope_type = 'department' AND scope_value = v_member.department)
        OR (scope_type = 'role' AND scope_value = v_member.role)
        OR (scope_type = 'user' AND scope_value = NEW.user_id::text)
      )
    ORDER BY priority DESC
  LOOP
    -- Apply limits (first non-null wins due to priority ordering)
    IF v_max_amount IS NULL AND v_policy.max_amount IS NOT NULL THEN
      v_max_amount := v_policy.max_amount;
    END IF;
    IF v_max_daily IS NULL AND v_policy.max_daily_total IS NOT NULL THEN
      v_max_daily := v_policy.max_daily_total;
    END IF;
    IF v_max_monthly IS NULL AND v_policy.max_monthly_total IS NOT NULL THEN
      v_max_monthly := v_policy.max_monthly_total;
    END IF;
    IF v_policy.max_receipt_age_days IS NOT NULL THEN
      v_max_age := LEAST(v_max_age, v_policy.max_receipt_age_days);
    END IF;
    -- Boolean restrictions are additive (stricter wins)
    v_require_receipt := v_require_receipt OR v_policy.require_receipt;
    v_require_description := v_require_description OR v_policy.require_description;
    v_allow_weekends := v_allow_weekends AND v_policy.allow_weekends;
  END LOOP;

  -- Use defaults if no policies found
  IF v_max_amount IS NULL THEN v_max_amount := 500; END IF;
  IF v_max_daily IS NULL THEN v_max_daily := 1000; END IF;
  IF v_max_monthly IS NULL THEN v_max_monthly := 5000; END IF;

  -- Check 1: Single expense amount
  IF NEW.amount > v_max_amount THEN
    violations := violations || jsonb_build_object(
      'rule', 'max_expense_amount',
      'limit', v_max_amount,
      'actual', NEW.amount,
      'message', format('Expense amount $%s exceeds limit of $%s for %s', NEW.amount, v_max_amount, NEW.category)
    );
  END IF;

  -- Check 2: Daily total
  SELECT COALESCE(SUM(amount), 0) INTO v_daily_total
  FROM expenses
  WHERE user_id = NEW.user_id
    AND organization_id = NEW.organization_id
    AND expense_date = NEW.expense_date
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF (v_daily_total + NEW.amount) > v_max_daily THEN
    violations := violations || jsonb_build_object(
      'rule', 'max_daily_total',
      'limit', v_max_daily,
      'actual', v_daily_total + NEW.amount,
      'message', format('Daily total of $%s would exceed limit of $%s', v_daily_total + NEW.amount, v_max_daily)
    );
  END IF;

  -- Check 3: Monthly total
  SELECT COALESCE(SUM(amount), 0) INTO v_monthly_total
  FROM expenses
  WHERE user_id = NEW.user_id
    AND organization_id = NEW.organization_id
    AND date_trunc('month', expense_date) = date_trunc('month', NEW.expense_date)
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF (v_monthly_total + NEW.amount) > v_max_monthly THEN
    violations := violations || jsonb_build_object(
      'rule', 'max_monthly_total',
      'limit', v_max_monthly,
      'actual', v_monthly_total + NEW.amount,
      'message', format('Monthly total of $%s would exceed limit of $%s', v_monthly_total + NEW.amount, v_max_monthly)
    );
  END IF;

  -- Check 4: Receipt age
  IF NEW.expense_date < (CURRENT_DATE - v_max_age) THEN
    violations := violations || jsonb_build_object(
      'rule', 'max_receipt_age',
      'limit', v_max_age,
      'actual', CURRENT_DATE - NEW.expense_date,
      'message', format('Expense is %s days old, exceeding %s day limit', CURRENT_DATE - NEW.expense_date, v_max_age)
    );
  END IF;

  -- Check 5: Weekend restriction
  IF NOT v_allow_weekends AND EXTRACT(DOW FROM NEW.expense_date) IN (0, 6) THEN
    violations := violations || jsonb_build_object(
      'rule', 'no_weekend_expenses',
      'message', 'Weekend expenses are not allowed per policy'
    );
  END IF;

  -- Check 6: Description required
  IF v_require_description AND (NEW.notes IS NULL OR LENGTH(TRIM(NEW.notes)) < 5) THEN
    violations := violations || jsonb_build_object(
      'rule', 'require_description',
      'message', format('Description is required for %s expenses', NEW.category)
    );
  END IF;

  -- Store violations
  NEW.policy_violations := violations;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_expense_policies_v2() IS 'Enhanced policy validation with per-category, per-department, and per-role limits';

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS check_expense_policies_trigger ON expenses;
CREATE TRIGGER check_expense_policies_trigger
  BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION check_expense_policies_v2();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to apply a preset to an organization
CREATE OR REPLACE FUNCTION apply_policy_preset(
  p_organization_id UUID,
  p_preset_name TEXT,
  p_created_by UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_preset RECORD;
  v_category TEXT;
  v_config JSONB;
  v_count INTEGER := 0;
BEGIN
  -- Get the preset
  SELECT * INTO v_preset FROM policy_presets WHERE name = p_preset_name;

  IF v_preset IS NULL THEN
    RAISE EXCEPTION 'Preset not found: %', p_preset_name;
  END IF;

  -- Handle category limit preset
  IF v_preset.preset_type = 'category_limit' THEN
    FOR v_category, v_config IN SELECT * FROM jsonb_each(v_preset.config->'categories')
    LOOP
      INSERT INTO expense_policies (
        organization_id, name, scope_type, scope_value, category,
        max_amount, require_receipt, require_description,
        priority, created_by
      ) VALUES (
        p_organization_id,
        format('%s Limit', v_category),
        'category',
        v_category,
        v_category,
        (v_config->>'max_amount')::NUMERIC,
        COALESCE((v_config->>'require_receipt')::BOOLEAN, true),
        COALESCE((v_config->>'require_description')::BOOLEAN, false),
        100, -- Category policies have high priority
        p_created_by
      )
      ON CONFLICT (organization_id, scope_type, scope_value, category) DO UPDATE
      SET max_amount = EXCLUDED.max_amount,
          require_receipt = EXCLUDED.require_receipt,
          require_description = EXCLUDED.require_description,
          updated_at = NOW();

      v_count := v_count + 1;
    END LOOP;

  -- Handle tier preset
  ELSIF v_preset.preset_type = 'tier' THEN
    INSERT INTO expense_policies (
      organization_id, name, scope_type, scope_value,
      max_amount, max_daily_total, max_monthly_total,
      auto_approve_under, require_approval_over,
      priority, created_by
    ) VALUES (
      p_organization_id,
      v_preset.name,
      'organization',
      NULL,
      (v_preset.config->>'max_amount')::NUMERIC,
      (v_preset.config->>'max_daily_total')::NUMERIC,
      (v_preset.config->>'max_monthly_total')::NUMERIC,
      (v_preset.config->>'auto_approve_under')::NUMERIC,
      (v_preset.config->>'require_approval_over')::NUMERIC,
      10, -- Organization-wide has lower priority
      p_created_by
    )
    ON CONFLICT (organization_id, scope_type, scope_value, category) DO UPDATE
    SET max_amount = EXCLUDED.max_amount,
        max_daily_total = EXCLUDED.max_daily_total,
        max_monthly_total = EXCLUDED.max_monthly_total,
        updated_at = NOW();

    v_count := 1;
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION apply_policy_preset IS 'Applies a preset policy template to an organization';

-- Function to get effective policy for an expense
CREATE OR REPLACE FUNCTION get_effective_policy(
  p_organization_id UUID,
  p_user_id UUID,
  p_category TEXT
)
RETURNS TABLE (
  max_amount NUMERIC,
  max_daily_total NUMERIC,
  max_monthly_total NUMERIC,
  max_receipt_age_days INTEGER,
  require_receipt BOOLEAN,
  require_description BOOLEAN,
  allow_weekends BOOLEAN,
  auto_approve_under NUMERIC,
  policy_sources JSONB
) AS $$
DECLARE
  v_member RECORD;
  v_result RECORD;
  v_sources JSONB := '[]'::jsonb;
BEGIN
  -- Get user's department and role
  SELECT om.department, om.role INTO v_member
  FROM organization_members om
  WHERE om.user_id = p_user_id
    AND om.organization_id = p_organization_id
    AND om.is_active = true
  LIMIT 1;

  -- Find most specific policy for each attribute
  SELECT
    -- First non-null value from highest priority policy
    COALESCE(
      (SELECT ep.max_amount FROM expense_policies ep
       WHERE ep.organization_id = p_organization_id AND ep.is_active = true
         AND ep.max_amount IS NOT NULL
         AND ((ep.scope_type = 'user' AND ep.scope_value = p_user_id::text)
           OR (ep.scope_type = 'category' AND (ep.category = p_category OR ep.category IS NULL))
           OR (ep.scope_type = 'department' AND ep.scope_value = v_member.department)
           OR (ep.scope_type = 'role' AND ep.scope_value = v_member.role)
           OR (ep.scope_type = 'organization'))
       ORDER BY ep.priority DESC LIMIT 1),
      500 -- Default
    ) AS max_amount,
    COALESCE(
      (SELECT ep.max_daily_total FROM expense_policies ep
       WHERE ep.organization_id = p_organization_id AND ep.is_active = true
         AND ep.max_daily_total IS NOT NULL
         AND ((ep.scope_type = 'user' AND ep.scope_value = p_user_id::text)
           OR (ep.scope_type = 'department' AND ep.scope_value = v_member.department)
           OR (ep.scope_type = 'role' AND ep.scope_value = v_member.role)
           OR (ep.scope_type = 'organization'))
       ORDER BY ep.priority DESC LIMIT 1),
      1000 -- Default
    ) AS max_daily_total,
    COALESCE(
      (SELECT ep.max_monthly_total FROM expense_policies ep
       WHERE ep.organization_id = p_organization_id AND ep.is_active = true
         AND ep.max_monthly_total IS NOT NULL
         AND ((ep.scope_type = 'user' AND ep.scope_value = p_user_id::text)
           OR (ep.scope_type = 'department' AND ep.scope_value = v_member.department)
           OR (ep.scope_type = 'role' AND ep.scope_value = v_member.role)
           OR (ep.scope_type = 'organization'))
       ORDER BY ep.priority DESC LIMIT 1),
      5000 -- Default
    ) AS max_monthly_total,
    90 AS max_receipt_age_days,
    true AS require_receipt,
    COALESCE(
      (SELECT ep.require_description FROM expense_policies ep
       WHERE ep.organization_id = p_organization_id AND ep.is_active = true
         AND ep.category = p_category
       ORDER BY ep.priority DESC LIMIT 1),
      false
    ) AS require_description,
    true AS allow_weekends,
    (SELECT ep.auto_approve_under FROM expense_policies ep
     WHERE ep.organization_id = p_organization_id AND ep.is_active = true
       AND ep.auto_approve_under IS NOT NULL
     ORDER BY ep.priority DESC LIMIT 1) AS auto_approve_under
  INTO v_result;

  max_amount := v_result.max_amount;
  max_daily_total := v_result.max_daily_total;
  max_monthly_total := v_result.max_monthly_total;
  max_receipt_age_days := v_result.max_receipt_age_days;
  require_receipt := v_result.require_receipt;
  require_description := v_result.require_description;
  allow_weekends := v_result.allow_weekends;
  auto_approve_under := v_result.auto_approve_under;
  policy_sources := v_sources;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_effective_policy IS 'Returns the effective policy limits for a user/category combination';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE expense_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_presets ENABLE ROW LEVEL SECURITY;

-- Expense policies: Admin/Finance can manage, all members can view
CREATE POLICY "Members can view org policies"
  ON expense_policies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = expense_policies.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "Admin can manage policies"
  ON expense_policies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = expense_policies.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'finance')
        AND organization_members.is_active = true
    )
  );

-- Policy presets: Everyone can view
CREATE POLICY "Everyone can view presets"
  ON policy_presets FOR SELECT
  USING (true);

-- ============================================================================
-- UPDATE TRIGGER
-- ============================================================================

CREATE TRIGGER update_expense_policies_updated_at
  BEFORE UPDATE ON expense_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Advanced Policy Engine Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New tables created:';
  RAISE NOTICE '  - expense_policies (configurable rules)';
  RAISE NOTICE '  - policy_presets (templates)';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  - check_expense_policies_v2() - Enhanced validation';
  RAISE NOTICE '  - apply_policy_preset() - Apply templates';
  RAISE NOTICE '  - get_effective_policy() - Get limits for user/category';
  RAISE NOTICE '';
  RAISE NOTICE 'Policy scope types (priority):';
  RAISE NOTICE '  1. user (highest)';
  RAISE NOTICE '  2. category';
  RAISE NOTICE '  3. department';
  RAISE NOTICE '  4. role';
  RAISE NOTICE '  5. organization (lowest)';
  RAISE NOTICE '';
  RAISE NOTICE 'To set up default policies for an org:';
  RAISE NOTICE '  SELECT apply_policy_preset(org_id, ''Standard Category Limits'');';
  RAISE NOTICE '  SELECT apply_policy_preset(org_id, ''Employee Tier'');';
  RAISE NOTICE '========================================';
END $$;
