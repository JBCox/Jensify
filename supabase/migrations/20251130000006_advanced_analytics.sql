-- Advanced Analytics Migration
-- Comprehensive analytics functions for expense management reporting

-- =============================================================================
-- EXPENSE TRENDS ANALYSIS
-- =============================================================================

-- Get expense trends over time (daily, weekly, monthly)
CREATE OR REPLACE FUNCTION get_expense_trends(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_interval TEXT DEFAULT 'month', -- 'day', 'week', 'month', 'quarter', 'year'
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  period_label TEXT,
  total_amount DECIMAL(12, 2),
  expense_count BIGINT,
  avg_expense DECIMAL(12, 2),
  approved_amount DECIMAL(12, 2),
  pending_amount DECIMAL(12, 2),
  rejected_amount DECIMAL(12, 2)
) AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT
      generate_series(
        date_trunc(p_interval, p_start_date::timestamp),
        date_trunc(p_interval, p_end_date::timestamp),
        ('1 ' || p_interval)::interval
      )::DATE AS period_start
  ),
  expense_data AS (
    SELECT
      date_trunc(p_interval, e.expense_date::timestamp)::DATE AS period,
      e.amount,
      e.status
    FROM expenses e
    WHERE e.organization_id = p_organization_id
      AND e.expense_date >= p_start_date
      AND e.expense_date <= p_end_date
      AND (p_user_id IS NULL OR e.user_id = p_user_id)
  )
  SELECT
    ds.period_start,
    (ds.period_start + ('1 ' || p_interval)::interval - interval '1 day')::DATE AS period_end,
    to_char(ds.period_start,
      CASE p_interval
        WHEN 'day' THEN 'YYYY-MM-DD'
        WHEN 'week' THEN 'IYYY-"W"IW'
        WHEN 'month' THEN 'YYYY-MM'
        WHEN 'quarter' THEN 'YYYY-"Q"Q'
        WHEN 'year' THEN 'YYYY'
        ELSE 'YYYY-MM-DD'
      END
    ) AS period_label,
    COALESCE(SUM(ed.amount), 0)::DECIMAL(12, 2) AS total_amount,
    COUNT(ed.amount)::BIGINT AS expense_count,
    COALESCE(AVG(ed.amount), 0)::DECIMAL(12, 2) AS avg_expense,
    COALESCE(SUM(CASE WHEN ed.status = 'approved' THEN ed.amount ELSE 0 END), 0)::DECIMAL(12, 2) AS approved_amount,
    COALESCE(SUM(CASE WHEN ed.status IN ('pending', 'submitted') THEN ed.amount ELSE 0 END), 0)::DECIMAL(12, 2) AS pending_amount,
    COALESCE(SUM(CASE WHEN ed.status = 'rejected' THEN ed.amount ELSE 0 END), 0)::DECIMAL(12, 2) AS rejected_amount
  FROM date_series ds
  LEFT JOIN expense_data ed ON ed.period = ds.period_start
  GROUP BY ds.period_start
  ORDER BY ds.period_start;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- CATEGORY BREAKDOWN ANALYSIS
-- =============================================================================

-- Get expense breakdown by category
CREATE OR REPLACE FUNCTION get_category_breakdown(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  category TEXT,
  total_amount DECIMAL(12, 2),
  expense_count BIGINT,
  percentage DECIMAL(5, 2),
  avg_expense DECIMAL(12, 2),
  max_expense DECIMAL(12, 2),
  min_expense DECIMAL(12, 2)
) AS $$
DECLARE
  v_total DECIMAL(12, 2);
BEGIN
  -- Calculate total for percentage
  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_start_date
    AND expense_date <= p_end_date
    AND (p_user_id IS NULL OR user_id = p_user_id);

  RETURN QUERY
  SELECT
    e.category::TEXT,
    SUM(e.amount)::DECIMAL(12, 2) AS total_amount,
    COUNT(*)::BIGINT AS expense_count,
    CASE
      WHEN v_total > 0 THEN (SUM(e.amount) / v_total * 100)::DECIMAL(5, 2)
      ELSE 0::DECIMAL(5, 2)
    END AS percentage,
    AVG(e.amount)::DECIMAL(12, 2) AS avg_expense,
    MAX(e.amount)::DECIMAL(12, 2) AS max_expense,
    MIN(e.amount)::DECIMAL(12, 2) AS min_expense
  FROM expenses e
  WHERE e.organization_id = p_organization_id
    AND e.expense_date >= p_start_date
    AND e.expense_date <= p_end_date
    AND (p_user_id IS NULL OR e.user_id = p_user_id)
  GROUP BY e.category
  ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- TOP SPENDERS ANALYSIS
-- =============================================================================

-- Get top spenders in the organization
CREATE OR REPLACE FUNCTION get_top_spenders(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  department TEXT,
  total_amount DECIMAL(12, 2),
  expense_count BIGINT,
  avg_expense DECIMAL(12, 2),
  approval_rate DECIMAL(5, 2),
  policy_violation_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.user_id,
    u.full_name AS user_name,
    u.email AS user_email,
    u.department,
    SUM(e.amount)::DECIMAL(12, 2) AS total_amount,
    COUNT(*)::BIGINT AS expense_count,
    AVG(e.amount)::DECIMAL(12, 2) AS avg_expense,
    (COUNT(CASE WHEN e.status = 'approved' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100)::DECIMAL(5, 2) AS approval_rate,
    COUNT(CASE WHEN jsonb_array_length(e.policy_violations) > 0 THEN 1 END)::BIGINT AS policy_violation_count
  FROM expenses e
  JOIN users u ON e.user_id = u.id
  WHERE e.organization_id = p_organization_id
    AND e.expense_date >= p_start_date
    AND e.expense_date <= p_end_date
  GROUP BY e.user_id, u.full_name, u.email, u.department
  ORDER BY total_amount DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- MERCHANT ANALYSIS
-- =============================================================================

-- Get top merchants by spend
CREATE OR REPLACE FUNCTION get_merchant_analysis(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  merchant TEXT,
  total_amount DECIMAL(12, 2),
  expense_count BIGINT,
  avg_expense DECIMAL(12, 2),
  unique_users BIGINT,
  most_common_category TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH merchant_stats AS (
    SELECT
      UPPER(TRIM(e.merchant)) AS normalized_merchant,
      SUM(e.amount) AS total,
      COUNT(*) AS cnt,
      AVG(e.amount) AS avg_amt,
      COUNT(DISTINCT e.user_id) AS users,
      e.category,
      ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(e.merchant)) ORDER BY COUNT(*) DESC) AS cat_rank
    FROM expenses e
    WHERE e.organization_id = p_organization_id
      AND e.expense_date >= p_start_date
      AND e.expense_date <= p_end_date
    GROUP BY UPPER(TRIM(e.merchant)), e.category
  )
  SELECT
    ms.normalized_merchant AS merchant,
    SUM(ms.total)::DECIMAL(12, 2) AS total_amount,
    SUM(ms.cnt)::BIGINT AS expense_count,
    (SUM(ms.total) / SUM(ms.cnt))::DECIMAL(12, 2) AS avg_expense,
    MAX(ms.users)::BIGINT AS unique_users,
    MAX(CASE WHEN ms.cat_rank = 1 THEN ms.category END)::TEXT AS most_common_category
  FROM merchant_stats ms
  GROUP BY ms.normalized_merchant
  ORDER BY total_amount DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- APPROVAL METRICS
-- =============================================================================

-- Get approval workflow metrics
CREATE OR REPLACE FUNCTION get_approval_metrics(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  metric_name TEXT,
  metric_value DECIMAL(12, 2),
  metric_unit TEXT
) AS $$
BEGIN
  RETURN QUERY

  -- Total submitted
  SELECT
    'total_submitted'::TEXT,
    COUNT(*)::DECIMAL(12, 2),
    'count'::TEXT
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_start_date
    AND expense_date <= p_end_date
    AND status != 'draft'

  UNION ALL

  -- Approval rate
  SELECT
    'approval_rate'::TEXT,
    (COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / NULLIF(COUNT(CASE WHEN status IN ('approved', 'rejected') THEN 1 END), 0) * 100)::DECIMAL(12, 2),
    'percent'::TEXT
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_start_date
    AND expense_date <= p_end_date

  UNION ALL

  -- Average approval time (in hours)
  SELECT
    'avg_approval_time'::TEXT,
    COALESCE(
      AVG(EXTRACT(EPOCH FROM (updated_at - submitted_at)) / 3600),
      0
    )::DECIMAL(12, 2),
    'hours'::TEXT
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_start_date
    AND expense_date <= p_end_date
    AND status = 'approved'
    AND submitted_at IS NOT NULL

  UNION ALL

  -- Pending count
  SELECT
    'pending_count'::TEXT,
    COUNT(*)::DECIMAL(12, 2),
    'count'::TEXT
  FROM expenses
  WHERE organization_id = p_organization_id
    AND status IN ('pending', 'submitted')

  UNION ALL

  -- Policy violation rate
  SELECT
    'policy_violation_rate'::TEXT,
    (COUNT(CASE WHEN jsonb_array_length(policy_violations) > 0 THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100)::DECIMAL(12, 2),
    'percent'::TEXT
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_start_date
    AND expense_date <= p_end_date;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- BUDGET VS ACTUAL
-- =============================================================================

-- Get budget vs actual spending comparison
CREATE OR REPLACE FUNCTION get_budget_vs_actual(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  budget_name TEXT,
  budget_type TEXT,
  budget_amount DECIMAL(12, 2),
  actual_spent DECIMAL(12, 2),
  remaining DECIMAL(12, 2),
  utilization_percent DECIMAL(5, 2),
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.name AS budget_name,
    b.budget_type::TEXT,
    b.amount AS budget_amount,
    COALESCE(SUM(e.amount), 0)::DECIMAL(12, 2) AS actual_spent,
    (b.amount - COALESCE(SUM(e.amount), 0))::DECIMAL(12, 2) AS remaining,
    CASE
      WHEN b.amount > 0 THEN (COALESCE(SUM(e.amount), 0) / b.amount * 100)::DECIMAL(5, 2)
      ELSE 0::DECIMAL(5, 2)
    END AS utilization_percent,
    CASE
      WHEN COALESCE(SUM(e.amount), 0) > b.amount THEN 'over_budget'
      WHEN COALESCE(SUM(e.amount), 0) > b.amount * 0.9 THEN 'warning'
      ELSE 'on_track'
    END::TEXT AS status
  FROM budgets b
  LEFT JOIN expenses e ON (
    e.organization_id = b.organization_id
    AND e.expense_date >= p_start_date
    AND e.expense_date <= p_end_date
    AND e.status NOT IN ('draft', 'rejected')
    AND (
      (b.budget_type = 'category' AND e.category = b.category)
      OR (b.budget_type = 'department' AND EXISTS (
        SELECT 1 FROM users u WHERE u.id = e.user_id AND u.department = b.department
      ))
      OR (b.budget_type = 'user' AND e.user_id = b.user_id)
      OR (b.budget_type = 'organization')
    )
  )
  WHERE b.organization_id = p_organization_id
    AND b.is_active = true
    AND (
      (b.period = 'monthly' AND b.start_date <= p_end_date AND (b.end_date IS NULL OR b.end_date >= p_start_date))
      OR (b.period = 'quarterly' AND b.start_date <= p_end_date AND (b.end_date IS NULL OR b.end_date >= p_start_date))
      OR (b.period = 'yearly' AND b.start_date <= p_end_date AND (b.end_date IS NULL OR b.end_date >= p_start_date))
    )
  GROUP BY b.id, b.name, b.budget_type, b.amount
  ORDER BY utilization_percent DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- DEPARTMENT COMPARISON
-- =============================================================================

-- Compare spending across departments
CREATE OR REPLACE FUNCTION get_department_comparison(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  department TEXT,
  total_amount DECIMAL(12, 2),
  expense_count BIGINT,
  employee_count BIGINT,
  per_employee_avg DECIMAL(12, 2),
  percentage_of_total DECIMAL(5, 2)
) AS $$
DECLARE
  v_total DECIMAL(12, 2);
BEGIN
  -- Calculate total for percentage
  SELECT COALESCE(SUM(e.amount), 0) INTO v_total
  FROM expenses e
  JOIN users u ON e.user_id = u.id
  WHERE e.organization_id = p_organization_id
    AND e.expense_date >= p_start_date
    AND e.expense_date <= p_end_date;

  RETURN QUERY
  SELECT
    COALESCE(u.department, 'Unassigned')::TEXT AS department,
    SUM(e.amount)::DECIMAL(12, 2) AS total_amount,
    COUNT(DISTINCT e.id)::BIGINT AS expense_count,
    COUNT(DISTINCT u.id)::BIGINT AS employee_count,
    (SUM(e.amount) / NULLIF(COUNT(DISTINCT u.id), 0))::DECIMAL(12, 2) AS per_employee_avg,
    CASE
      WHEN v_total > 0 THEN (SUM(e.amount) / v_total * 100)::DECIMAL(5, 2)
      ELSE 0::DECIMAL(5, 2)
    END AS percentage_of_total
  FROM expenses e
  JOIN users u ON e.user_id = u.id
  WHERE e.organization_id = p_organization_id
    AND e.expense_date >= p_start_date
    AND e.expense_date <= p_end_date
  GROUP BY u.department
  ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- YEAR OVER YEAR COMPARISON
-- =============================================================================

-- Compare spending year over year
CREATE OR REPLACE FUNCTION get_yoy_comparison(
  p_organization_id UUID,
  p_current_year INT
)
RETURNS TABLE (
  month_num INT,
  month_name TEXT,
  current_year_amount DECIMAL(12, 2),
  previous_year_amount DECIMAL(12, 2),
  change_amount DECIMAL(12, 2),
  change_percent DECIMAL(5, 2)
) AS $$
BEGIN
  RETURN QUERY
  WITH current_year AS (
    SELECT
      EXTRACT(MONTH FROM expense_date)::INT AS month,
      SUM(amount) AS total
    FROM expenses
    WHERE organization_id = p_organization_id
      AND EXTRACT(YEAR FROM expense_date) = p_current_year
      AND status NOT IN ('draft', 'rejected')
    GROUP BY EXTRACT(MONTH FROM expense_date)
  ),
  previous_year AS (
    SELECT
      EXTRACT(MONTH FROM expense_date)::INT AS month,
      SUM(amount) AS total
    FROM expenses
    WHERE organization_id = p_organization_id
      AND EXTRACT(YEAR FROM expense_date) = p_current_year - 1
      AND status NOT IN ('draft', 'rejected')
    GROUP BY EXTRACT(MONTH FROM expense_date)
  ),
  months AS (
    SELECT generate_series(1, 12) AS month_num
  )
  SELECT
    m.month_num,
    to_char(make_date(p_current_year, m.month_num, 1), 'Mon')::TEXT AS month_name,
    COALESCE(cy.total, 0)::DECIMAL(12, 2) AS current_year_amount,
    COALESCE(py.total, 0)::DECIMAL(12, 2) AS previous_year_amount,
    (COALESCE(cy.total, 0) - COALESCE(py.total, 0))::DECIMAL(12, 2) AS change_amount,
    CASE
      WHEN COALESCE(py.total, 0) > 0 THEN
        ((COALESCE(cy.total, 0) - COALESCE(py.total, 0)) / py.total * 100)::DECIMAL(5, 2)
      ELSE 0::DECIMAL(5, 2)
    END AS change_percent
  FROM months m
  LEFT JOIN current_year cy ON m.month_num = cy.month
  LEFT JOIN previous_year py ON m.month_num = py.month
  ORDER BY m.month_num;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- DASHBOARD SUMMARY
-- =============================================================================

-- Get comprehensive dashboard summary
CREATE OR REPLACE FUNCTION get_analytics_summary(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  metric_key TEXT,
  metric_value DECIMAL(12, 2),
  previous_value DECIMAL(12, 2),
  change_percent DECIMAL(5, 2)
) AS $$
DECLARE
  v_days INT;
  v_prev_start DATE;
  v_prev_end DATE;
BEGIN
  -- Calculate previous period
  v_days := p_end_date - p_start_date;
  v_prev_end := p_start_date - 1;
  v_prev_start := v_prev_end - v_days;

  RETURN QUERY

  -- Total expenses
  SELECT
    'total_expenses'::TEXT,
    (SELECT COALESCE(SUM(amount), 0) FROM expenses
     WHERE organization_id = p_organization_id
       AND expense_date >= p_start_date AND expense_date <= p_end_date)::DECIMAL(12, 2),
    (SELECT COALESCE(SUM(amount), 0) FROM expenses
     WHERE organization_id = p_organization_id
       AND expense_date >= v_prev_start AND expense_date <= v_prev_end)::DECIMAL(12, 2),
    0::DECIMAL(5, 2)

  UNION ALL

  -- Expense count
  SELECT
    'expense_count'::TEXT,
    (SELECT COUNT(*) FROM expenses
     WHERE organization_id = p_organization_id
       AND expense_date >= p_start_date AND expense_date <= p_end_date)::DECIMAL(12, 2),
    (SELECT COUNT(*) FROM expenses
     WHERE organization_id = p_organization_id
       AND expense_date >= v_prev_start AND expense_date <= v_prev_end)::DECIMAL(12, 2),
    0::DECIMAL(5, 2)

  UNION ALL

  -- Average expense
  SELECT
    'avg_expense'::TEXT,
    (SELECT COALESCE(AVG(amount), 0) FROM expenses
     WHERE organization_id = p_organization_id
       AND expense_date >= p_start_date AND expense_date <= p_end_date)::DECIMAL(12, 2),
    (SELECT COALESCE(AVG(amount), 0) FROM expenses
     WHERE organization_id = p_organization_id
       AND expense_date >= v_prev_start AND expense_date <= v_prev_end)::DECIMAL(12, 2),
    0::DECIMAL(5, 2)

  UNION ALL

  -- Pending reimbursements
  SELECT
    'pending_reimbursements'::TEXT,
    (SELECT COALESCE(SUM(amount), 0) FROM expenses
     WHERE organization_id = p_organization_id
       AND status = 'approved' AND is_reimbursable = true
       AND reimbursed_at IS NULL)::DECIMAL(12, 2),
    0::DECIMAL(12, 2),
    0::DECIMAL(5, 2);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- MATERIALIZED VIEW FOR DASHBOARD PERFORMANCE (Optional)
-- =============================================================================

-- Create materialized view for faster dashboard loading
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_expense_daily_stats AS
SELECT
  organization_id,
  expense_date,
  category,
  COUNT(*) AS expense_count,
  SUM(amount) AS total_amount,
  AVG(amount) AS avg_amount,
  COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_count,
  COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected_count,
  COUNT(CASE WHEN jsonb_array_length(policy_violations) > 0 THEN 1 END) AS violation_count
FROM expenses
WHERE status != 'draft'
GROUP BY organization_id, expense_date, category;

-- Index for the materialized view
CREATE INDEX IF NOT EXISTS idx_mv_expense_daily_stats_org_date
  ON mv_expense_daily_stats(organization_id, expense_date);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_expense_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_expense_daily_stats;
END;
$$ LANGUAGE plpgsql;
