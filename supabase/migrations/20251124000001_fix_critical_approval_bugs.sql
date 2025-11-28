-- ============================================================================
-- CRITICAL BUGFIXES FOR APPROVAL SYSTEM
-- Created: 2025-11-24
-- Description: Fixes critical security and functional bugs in approval system
-- ============================================================================

-- ============================================================================
-- FIX #1: Manager Lookup Bug in get_approver_for_step()
-- Problem: manager_id references organization_members.id, not auth.users(id)
-- Impact: ALL manager approvals fail
-- ============================================================================

CREATE OR REPLACE FUNCTION get_approver_for_step(
  p_workflow_id UUID,
  p_step_number INT,
  p_expense_id UUID DEFAULT NULL,
  p_report_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step RECORD;
  v_submitter_id UUID;
  v_organization_id UUID;
  v_approver_id UUID;
BEGIN
  -- Get the approval step
  SELECT * INTO v_step
  FROM approval_steps
  WHERE workflow_id = p_workflow_id
    AND step_order = p_step_number;

  IF v_step IS NULL THEN
    RAISE EXCEPTION 'Approval step not found for workflow % step %', p_workflow_id, p_step_number;
  END IF;

  -- Get submitter and organization from expense or report
  IF p_expense_id IS NOT NULL THEN
    SELECT user_id, organization_id INTO v_submitter_id, v_organization_id
    FROM expenses
    WHERE id = p_expense_id;
  ELSIF p_report_id IS NOT NULL THEN
    SELECT user_id, organization_id INTO v_submitter_id, v_organization_id
    FROM expense_reports
    WHERE id = p_report_id;
  ELSE
    RAISE EXCEPTION 'Must provide either expense_id or report_id';
  END IF;

  -- Resolve approver based on step type
  CASE v_step.step_type
    WHEN 'manager' THEN
      -- ✅ FIX: Join to manager's organization_members record to get their user_id
      SELECT om_manager.user_id INTO v_approver_id
      FROM organization_members om_submitter
      JOIN organization_members om_manager ON om_submitter.manager_id = om_manager.id
      WHERE om_submitter.user_id = v_submitter_id
        AND om_submitter.organization_id = v_organization_id
        AND om_manager.is_active = true;

      IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Submitter has no active manager assigned';
      END IF;

    WHEN 'role' THEN
      -- Find first user with the specified role (finance or admin)
      -- Prefer active users, exclude submitter for separation of duties
      -- ✅ FIX: Also exclude users who already approved earlier steps
      SELECT user_id INTO v_approver_id
      FROM organization_members
      WHERE organization_id = v_organization_id
        AND role = v_step.approver_role
        AND user_id != v_submitter_id
        AND is_active = true
        -- Exclude users who already approved this approval chain
        AND user_id NOT IN (
          SELECT actor_id
          FROM approval_actions aa
          JOIN expense_approvals ea ON aa.expense_approval_id = ea.id
          WHERE (ea.expense_id = p_expense_id OR ea.report_id = p_report_id)
            AND aa.action = 'approved'
        )
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'No eligible user found with role: %', v_step.approver_role;
      END IF;

    WHEN 'specific_user' THEN
      -- Use the specified user
      v_approver_id := v_step.approver_user_id;

      IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Specific user not set for step';
      END IF;

      -- Separation of duties: cannot approve own submission
      IF v_approver_id = v_submitter_id THEN
        RAISE EXCEPTION 'Approver cannot be the same as submitter (separation of duties)';
      END IF;

      -- ✅ FIX: Verify approver hasn't already approved earlier step
      IF EXISTS (
        SELECT 1
        FROM approval_actions aa
        JOIN expense_approvals ea ON aa.expense_approval_id = ea.id
        WHERE (ea.expense_id = p_expense_id OR ea.report_id = p_report_id)
          AND aa.actor_id = v_approver_id
          AND aa.action = 'approved'
      ) THEN
        RAISE EXCEPTION 'User has already approved an earlier step (separation of duties)';
      END IF;

    ELSE
      RAISE EXCEPTION 'Unknown step type: %', v_step.step_type;
  END CASE;

  RETURN v_approver_id;
END;
$$;

-- ============================================================================
-- FIX #2: SQL Injection Risk in get_approval_workflow_for_expense()
-- Problem: Unsafe JSONB casting without validation
-- Impact: Malicious workflows can crash system or cause SQL errors
-- ============================================================================

CREATE OR REPLACE FUNCTION get_approval_workflow_for_expense(p_expense_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_record RECORD;
  v_workflow_id UUID;
BEGIN
  -- Get expense details
  SELECT * INTO v_expense_record
  FROM expenses
  WHERE id = p_expense_id;

  IF v_expense_record IS NULL THEN
    RAISE EXCEPTION 'Expense not found: %', p_expense_id;
  END IF;

  -- Find matching workflow (ordered by priority desc)
  SELECT id INTO v_workflow_id
  FROM approval_workflows
  WHERE organization_id = v_expense_record.organization_id
    AND is_active = true
    AND (
      (
        -- ✅ FIX: Validate JSONB values are numeric before casting
        (
          conditions->>'amount_min' IS NULL
          OR (
            conditions->>'amount_min' ~ '^[0-9]+(\.[0-9]+)?$'
            AND v_expense_record.amount >= (conditions->>'amount_min')::NUMERIC
          )
        )
        AND
        (
          conditions->>'amount_max' IS NULL
          OR (
            conditions->>'amount_max' ~ '^[0-9]+(\.[0-9]+)?$'
            AND v_expense_record.amount <= (conditions->>'amount_max')::NUMERIC
          )
        )
      )
      OR
      (
        conditions->'categories' IS NOT NULL
        AND conditions->'categories' ? v_expense_record.category
      )
      OR
      (
        conditions->'user_ids' IS NOT NULL
        AND conditions->'user_ids' ? v_expense_record.user_id::TEXT
      )
    )
  ORDER BY priority DESC, created_at DESC
  LIMIT 1;

  RETURN v_workflow_id;
END;
$$;

-- ============================================================================
-- FIX #3: Missing Transaction Locking in approve_expense()
-- Problem: Race condition when multiple approvers act simultaneously
-- Impact: Approval can advance 2 steps instead of 1
-- ============================================================================

CREATE OR REPLACE FUNCTION approve_expense(
  p_approval_id UUID,
  p_approver_id UUID,
  p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval RECORD;
  v_approver_role TEXT;
  v_next_step INT;
  v_next_approver_id UUID;
BEGIN
  -- ✅ FIX: Add row-level lock to prevent race conditions
  SELECT * INTO v_approval
  FROM expense_approvals
  WHERE id = p_approval_id
  FOR UPDATE;

  IF v_approval IS NULL THEN
    RAISE EXCEPTION 'Approval not found: %', p_approval_id;
  END IF;

  -- Verify approval is pending
  IF v_approval.status != 'pending' THEN
    RAISE EXCEPTION 'Approval is not pending (current status: %)', v_approval.status;
  END IF;

  -- Verify approver is the current approver
  IF v_approval.current_approver_id != p_approver_id THEN
    RAISE EXCEPTION 'User is not the current approver';
  END IF;

  -- Get approver's role
  SELECT role INTO v_approver_role
  FROM organization_members
  WHERE user_id = p_approver_id
    AND organization_id = v_approval.organization_id
    AND is_active = true;

  IF v_approver_role IS NULL THEN
    RAISE EXCEPTION 'Approver not found in organization or is inactive';
  END IF;

  -- ✅ FIX: Validate approver has authority
  IF v_approver_role NOT IN ('manager', 'finance', 'admin') THEN
    RAISE EXCEPTION 'User role % does not have approval authority', v_approver_role;
  END IF;

  -- Record the approval action
  INSERT INTO approval_actions (
    expense_approval_id,
    step_number,
    action,
    actor_id,
    actor_role,
    comment,
    action_at
  ) VALUES (
    p_approval_id,
    v_approval.current_step,
    'approved',
    p_approver_id,
    v_approver_role,
    p_comment,
    NOW()
  );

  -- Check if this was the final step
  IF v_approval.current_step >= v_approval.total_steps THEN
    -- Final approval - mark as approved
    UPDATE expense_approvals
    SET status = 'approved',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_approval_id;

    -- Update the expense/report status
    IF v_approval.expense_id IS NOT NULL THEN
      UPDATE expenses
      SET status = 'approved',
          approved_by = p_approver_id,
          updated_at = NOW()
      WHERE id = v_approval.expense_id;
    ELSIF v_approval.report_id IS NOT NULL THEN
      UPDATE expense_reports
      SET status = 'approved',
          approved_by = p_approver_id,
          updated_at = NOW()
      WHERE id = v_approval.report_id;
    END IF;
  ELSE
    -- Move to next step
    v_next_step := v_approval.current_step + 1;

    -- Get next approver
    v_next_approver_id := get_approver_for_step(
      v_approval.workflow_id,
      v_next_step,
      v_approval.expense_id,
      v_approval.report_id
    );

    -- Update approval to next step
    UPDATE expense_approvals
    SET current_step = v_next_step,
        current_approver_id = v_next_approver_id,
        updated_at = NOW()
    WHERE id = p_approval_id;
  END IF;
END;
$$;

-- ============================================================================
-- FIX #4: Add Missing Indexes for Performance
-- Problem: Joins on foreign keys without indexes cause slow queries
-- Impact: Poor performance on approval queue and history queries
-- ============================================================================

-- Index for expense approval lookups
CREATE INDEX IF NOT EXISTS idx_expenses_approval_id
ON expenses(approval_id)
WHERE approval_id IS NOT NULL;

-- Index for report approval lookups
CREATE INDEX IF NOT EXISTS idx_expense_reports_approval_id
ON expense_reports(approval_id)
WHERE approval_id IS NOT NULL;

-- Composite index for pending approval queue (most common query)
CREATE INDEX IF NOT EXISTS idx_expense_approvals_pending_approver
ON expense_approvals(current_approver_id, status, organization_id, submitted_at DESC)
WHERE status = 'pending';

-- Index for workflow matching performance
CREATE INDEX IF NOT EXISTS idx_approval_workflows_org_active_priority
ON approval_workflows(organization_id, is_active, priority DESC)
WHERE is_active = true;

-- Index for audit trail queries
CREATE INDEX IF NOT EXISTS idx_approval_actions_approval_step
ON approval_actions(expense_approval_id, step_number, action_at DESC);

-- GIN index for JSONB conditions
CREATE INDEX IF NOT EXISTS idx_approval_workflows_conditions
ON approval_workflows USING GIN(conditions);

-- ============================================================================
-- FIX #5: Add Unique Constraints to Prevent Duplicate Approvals
-- Problem: No constraint prevents multiple approval records for same expense/report
-- Impact: Could create duplicate approval chains
-- ============================================================================

-- Unique constraint for expense approvals (excluding NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS unique_expense_approval
ON expense_approvals(expense_id)
WHERE expense_id IS NOT NULL;

-- Unique constraint for report approvals (excluding NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS unique_report_approval
ON expense_approvals(report_id)
WHERE report_id IS NOT NULL;

-- ============================================================================
-- FIX #6: RLS Authorization Bypass - Restrict Direct INSERT
-- Problem: Any organization member can create approvals for other users' expenses
-- Impact: Bypasses approval workflow, allows malicious approval creation
-- ============================================================================

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "System can create and update approval records" ON expense_approvals;

-- ✅ FIX: Only allow creating approvals for own expenses/reports
-- This prevents malicious users from creating approvals for other people's submissions
-- SECURITY DEFINER functions bypass RLS, so they continue to work normally
CREATE POLICY "Users can create approvals for own submissions only"
  ON expense_approvals FOR INSERT
  WITH CHECK (
    -- Verify user is in the organization
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = expense_approvals.organization_id
      AND is_active = true
    )
    AND
    -- Verify user owns the expense or report being approved
    (
      (expense_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM expenses
        WHERE id = expense_approvals.expense_id
        AND user_id = auth.uid()
      ))
      OR
      (report_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM expense_reports
        WHERE id = expense_approvals.report_id
        AND user_id = auth.uid()
      ))
    )
  );

-- ============================================================================
-- Add helpful comments for documentation
-- ============================================================================

COMMENT ON FUNCTION get_approver_for_step IS 'Determines the next approver for an approval step. FIXED: manager lookup now properly joins to get user_id, separation of duties enforced';
COMMENT ON FUNCTION get_approval_workflow_for_expense IS 'Finds matching approval workflow for an expense. FIXED: JSONB values validated before casting to prevent SQL injection';
COMMENT ON FUNCTION approve_expense IS 'Processes expense approval. FIXED: Added row-level locking to prevent race conditions';

COMMENT ON INDEX idx_expenses_approval_id IS 'Performance: Fast lookup of expenses by approval ID';
COMMENT ON INDEX idx_expense_approvals_pending_approver IS 'Performance: Optimized for pending approval queue queries';
COMMENT ON INDEX unique_expense_approval IS 'Data integrity: Prevents duplicate approval chains for same expense';

COMMENT ON POLICY "Users can create approvals for own submissions only" ON expense_approvals IS 'Security: Prevents users from creating approvals for other users'' expenses. SECURITY DEFINER functions bypass this restriction.';
