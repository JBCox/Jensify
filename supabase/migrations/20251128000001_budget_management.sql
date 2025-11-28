-- ============================================================================
-- Jensify Database Schema - Budget Management
-- Created: 2024-11-28
-- Description: Add budget tracking for organizations, departments, categories, and users
-- ============================================================================

-- ============================================================================
-- BUDGETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Budget identification
  name TEXT NOT NULL,
  budget_type TEXT NOT NULL CHECK (budget_type IN ('organization', 'department', 'category', 'user')),

  -- Scope filters (nullable based on budget_type)
  department TEXT,                                    -- For department budgets
  category TEXT,                                      -- For category budgets
  user_id UUID REFERENCES auth.users(id),             -- For per-user budgets

  -- Budget amount and period
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  period TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'yearly', 'custom')),
  start_date DATE NOT NULL,
  end_date DATE,                                      -- NULL for recurring budgets

  -- Alerts
  alert_threshold_percent INTEGER DEFAULT 80 CHECK (alert_threshold_percent BETWEEN 1 AND 100),

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE budgets IS 'Spending budgets for organizations, departments, categories, or users';
COMMENT ON COLUMN budgets.budget_type IS 'Scope of budget: organization, department, category, or user';
COMMENT ON COLUMN budgets.period IS 'Budget period: monthly, quarterly, yearly, or custom date range';
COMMENT ON COLUMN budgets.alert_threshold_percent IS 'Percentage at which to trigger warning alerts (default 80%)';

-- ============================================================================
-- BUDGET TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS budget_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Tracking period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Amounts (updated by trigger)
  spent_amount DECIMAL(12,2) DEFAULT 0,
  pending_amount DECIMAL(12,2) DEFAULT 0,

  -- Alert tracking
  alert_sent_at TIMESTAMPTZ,
  exceeded_at TIMESTAMPTZ,

  -- Audit
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT budget_tracking_unique_period UNIQUE(budget_id, period_start, period_end),
  CONSTRAINT valid_period CHECK (period_end >= period_start)
);

COMMENT ON TABLE budget_tracking IS 'Real-time tracking of budget spend per period';
COMMENT ON COLUMN budget_tracking.spent_amount IS 'Total of approved and reimbursed expenses';
COMMENT ON COLUMN budget_tracking.pending_amount IS 'Total of submitted but not yet approved expenses';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_budgets_org_id ON budgets(organization_id);
CREATE INDEX IF NOT EXISTS idx_budgets_type ON budgets(organization_id, budget_type);
CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(organization_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_budgets_department ON budgets(organization_id, department) WHERE department IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(organization_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(organization_id, user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_tracking_budget ON budget_tracking(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_tracking_period ON budget_tracking(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_budget_tracking_org ON budget_tracking(organization_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_tracking ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's org membership (avoids RLS recursion)
CREATE OR REPLACE FUNCTION get_user_budget_access(p_org_id UUID)
RETURNS TABLE(can_view BOOLEAN, can_manage BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    true AS can_view,
    role IN ('admin', 'finance') AS can_manage
  FROM organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- Budgets: All org members can view, Admin/Finance can manage
CREATE POLICY "budgets_select_policy" ON budgets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM get_user_budget_access(organization_id) WHERE can_view = true
    )
  );

CREATE POLICY "budgets_insert_policy" ON budgets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM get_user_budget_access(organization_id) WHERE can_manage = true
    )
  );

CREATE POLICY "budgets_update_policy" ON budgets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM get_user_budget_access(organization_id) WHERE can_manage = true
    )
  );

CREATE POLICY "budgets_delete_policy" ON budgets
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM get_user_budget_access(organization_id) WHERE can_manage = true
    )
  );

-- Budget tracking: Same as budgets (view only for non-admin/finance)
CREATE POLICY "budget_tracking_select_policy" ON budget_tracking
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM get_user_budget_access(organization_id) WHERE can_view = true
    )
  );

CREATE POLICY "budget_tracking_insert_policy" ON budget_tracking
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM get_user_budget_access(organization_id) WHERE can_manage = true
    )
  );

CREATE POLICY "budget_tracking_update_policy" ON budget_tracking
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM get_user_budget_access(organization_id) WHERE can_manage = true
    )
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate period dates based on budget settings
CREATE OR REPLACE FUNCTION calculate_budget_period(
  p_period TEXT,
  p_start_date DATE,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(period_start DATE, period_end DATE)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  CASE p_period
    WHEN 'monthly' THEN
      RETURN QUERY SELECT
        date_trunc('month', p_reference_date)::DATE,
        (date_trunc('month', p_reference_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    WHEN 'quarterly' THEN
      RETURN QUERY SELECT
        date_trunc('quarter', p_reference_date)::DATE,
        (date_trunc('quarter', p_reference_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
    WHEN 'yearly' THEN
      RETURN QUERY SELECT
        date_trunc('year', p_reference_date)::DATE,
        (date_trunc('year', p_reference_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    WHEN 'custom' THEN
      RETURN QUERY SELECT p_start_date, COALESCE(
        (SELECT end_date FROM budgets WHERE start_date = p_start_date LIMIT 1),
        (p_start_date + INTERVAL '1 year')::DATE
      );
    ELSE
      RAISE EXCEPTION 'Invalid period type: %', p_period;
  END CASE;
END;
$$;

-- Get or create budget tracking record for current period
CREATE OR REPLACE FUNCTION ensure_budget_tracking(p_budget_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget RECORD;
  v_period RECORD;
  v_tracking_id UUID;
BEGIN
  -- Get budget details
  SELECT * INTO v_budget FROM budgets WHERE id = p_budget_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget not found: %', p_budget_id;
  END IF;

  -- Calculate current period
  SELECT * INTO v_period FROM calculate_budget_period(v_budget.period, v_budget.start_date);

  -- Get or create tracking record
  SELECT id INTO v_tracking_id
  FROM budget_tracking
  WHERE budget_id = p_budget_id
    AND period_start = v_period.period_start
    AND period_end = v_period.period_end;

  IF NOT FOUND THEN
    INSERT INTO budget_tracking (
      budget_id,
      organization_id,
      period_start,
      period_end,
      spent_amount,
      pending_amount
    ) VALUES (
      p_budget_id,
      v_budget.organization_id,
      v_period.period_start,
      v_period.period_end,
      0,
      0
    )
    RETURNING id INTO v_tracking_id;
  END IF;

  RETURN v_tracking_id;
END;
$$;

-- Recalculate budget tracking amounts
CREATE OR REPLACE FUNCTION recalculate_budget_tracking(p_tracking_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tracking RECORD;
  v_budget RECORD;
  v_spent DECIMAL(12,2);
  v_pending DECIMAL(12,2);
BEGIN
  -- Get tracking and budget details
  SELECT * INTO v_tracking FROM budget_tracking WHERE id = p_tracking_id;
  SELECT * INTO v_budget FROM budgets WHERE id = v_tracking.budget_id;

  -- Calculate spent amount (approved + reimbursed)
  SELECT COALESCE(SUM(e.amount), 0) INTO v_spent
  FROM expenses e
  WHERE e.organization_id = v_tracking.organization_id
    AND e.expense_date::DATE BETWEEN v_tracking.period_start AND v_tracking.period_end
    AND e.status IN ('approved', 'reimbursed')
    AND (
      v_budget.budget_type = 'organization'
      OR (v_budget.budget_type = 'department' AND EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.user_id = e.user_id
          AND om.organization_id = e.organization_id
          AND om.department = v_budget.department
      ))
      OR (v_budget.budget_type = 'category' AND e.category = v_budget.category)
      OR (v_budget.budget_type = 'user' AND e.user_id = v_budget.user_id)
    );

  -- Calculate pending amount (submitted)
  SELECT COALESCE(SUM(e.amount), 0) INTO v_pending
  FROM expenses e
  WHERE e.organization_id = v_tracking.organization_id
    AND e.expense_date::DATE BETWEEN v_tracking.period_start AND v_tracking.period_end
    AND e.status = 'submitted'
    AND (
      v_budget.budget_type = 'organization'
      OR (v_budget.budget_type = 'department' AND EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.user_id = e.user_id
          AND om.organization_id = e.organization_id
          AND om.department = v_budget.department
      ))
      OR (v_budget.budget_type = 'category' AND e.category = v_budget.category)
      OR (v_budget.budget_type = 'user' AND e.user_id = v_budget.user_id)
    );

  -- Update tracking record
  UPDATE budget_tracking
  SET
    spent_amount = v_spent,
    pending_amount = v_pending,
    exceeded_at = CASE
      WHEN (v_spent + v_pending) > v_budget.amount AND exceeded_at IS NULL THEN NOW()
      WHEN (v_spent + v_pending) <= v_budget.amount THEN NULL
      ELSE exceeded_at
    END,
    last_calculated_at = NOW()
  WHERE id = p_tracking_id;
END;
$$;

-- Check expense against applicable budgets
CREATE OR REPLACE FUNCTION check_expense_budgets(
  p_organization_id UUID,
  p_user_id UUID,
  p_category TEXT,
  p_amount DECIMAL,
  p_expense_date DATE
)
RETURNS TABLE(
  budget_id UUID,
  budget_name TEXT,
  budget_amount DECIMAL,
  spent_amount DECIMAL,
  pending_amount DECIMAL,
  remaining_amount DECIMAL,
  percent_used INTEGER,
  status TEXT,
  message TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_department TEXT;
BEGIN
  -- Get user's department
  SELECT department INTO v_user_department
  FROM organization_members
  WHERE user_id = p_user_id AND organization_id = p_organization_id
  LIMIT 1;

  RETURN QUERY
  WITH applicable_budgets AS (
    SELECT b.*
    FROM budgets b
    WHERE b.organization_id = p_organization_id
      AND b.is_active = true
      AND (
        b.budget_type = 'organization'
        OR (b.budget_type = 'department' AND b.department = v_user_department)
        OR (b.budget_type = 'category' AND b.category = p_category)
        OR (b.budget_type = 'user' AND b.user_id = p_user_id)
      )
  ),
  budget_periods AS (
    SELECT
      ab.*,
      cp.period_start,
      cp.period_end
    FROM applicable_budgets ab
    CROSS JOIN LATERAL calculate_budget_period(ab.period, ab.start_date, p_expense_date) cp
  ),
  tracking_data AS (
    SELECT
      bp.*,
      COALESCE(bt.spent_amount, 0) AS tracked_spent,
      COALESCE(bt.pending_amount, 0) AS tracked_pending
    FROM budget_periods bp
    LEFT JOIN budget_tracking bt ON bt.budget_id = bp.id
      AND bt.period_start = bp.period_start
      AND bt.period_end = bp.period_end
  )
  SELECT
    td.id AS budget_id,
    td.name AS budget_name,
    td.amount AS budget_amount,
    td.tracked_spent AS spent_amount,
    td.tracked_pending + p_amount AS pending_amount, -- Include new expense
    td.amount - td.tracked_spent - td.tracked_pending - p_amount AS remaining_amount,
    LEAST(100, GREATEST(0, ROUND(
      ((td.tracked_spent + td.tracked_pending + p_amount) / td.amount) * 100
    )))::INTEGER AS percent_used,
    CASE
      WHEN (td.tracked_spent + td.tracked_pending + p_amount) > td.amount THEN 'exceeded'
      WHEN ((td.tracked_spent + td.tracked_pending + p_amount) / td.amount) * 100 >= td.alert_threshold_percent THEN 'warning'
      ELSE 'under'
    END AS status,
    CASE
      WHEN (td.tracked_spent + td.tracked_pending + p_amount) > td.amount THEN
        format('Budget "%s" exceeded by $%s', td.name, ROUND((td.tracked_spent + td.tracked_pending + p_amount) - td.amount, 2))
      WHEN ((td.tracked_spent + td.tracked_pending + p_amount) / td.amount) * 100 >= td.alert_threshold_percent THEN
        format('Budget "%s" at %s%% of limit', td.name, ROUND(((td.tracked_spent + td.tracked_pending + p_amount) / td.amount) * 100))
      ELSE
        format('Budget "%s" has $%s remaining', td.name, ROUND(td.amount - td.tracked_spent - td.tracked_pending - p_amount, 2))
    END AS message
  FROM tracking_data td;
END;
$$;

-- ============================================================================
-- TRIGGER FOR AUTO-UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_update_budget_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_expense_date DATE;
  v_tracking_id UUID;
  v_budget RECORD;
BEGIN
  -- Determine org_id and date from NEW or OLD
  v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);
  v_expense_date := COALESCE(NEW.expense_date, OLD.expense_date)::DATE;

  -- Find all active budgets for this organization
  FOR v_budget IN
    SELECT b.id
    FROM budgets b
    WHERE b.organization_id = v_org_id
      AND b.is_active = true
  LOOP
    -- Ensure tracking record exists
    v_tracking_id := ensure_budget_tracking(v_budget.id);

    -- Recalculate the tracking
    PERFORM recalculate_budget_tracking(v_tracking_id);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on expenses table
DROP TRIGGER IF EXISTS expense_budget_tracking_trigger ON expenses;
CREATE TRIGGER expense_budget_tracking_trigger
  AFTER INSERT OR UPDATE OF amount, status, category, expense_date OR DELETE
  ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_budget_tracking();

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE TRIGGER budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GRANT PERMISSIONS (for service role)
-- ============================================================================

GRANT ALL ON budgets TO service_role;
GRANT ALL ON budget_tracking TO service_role;
GRANT EXECUTE ON FUNCTION calculate_budget_period TO authenticated;
GRANT EXECUTE ON FUNCTION check_expense_budgets TO authenticated;
