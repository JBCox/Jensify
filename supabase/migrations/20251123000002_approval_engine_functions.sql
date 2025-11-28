/**
 * Approval Engine Database Functions
 *
 * This migration creates the PostgreSQL functions that implement the core
 * approval workflow logic. These functions are called by the ApprovalService.
 *
 * Functions:
 * - get_approval_workflow_for_expense: Determine which workflow applies
 * - get_approval_workflow_for_report: Determine workflow for reports
 * - get_approver_for_step: Resolve approver for a specific step
 * - create_approval_chain: Initialize approval process
 * - approve_expense: Handle approval action
 * - reject_expense: Handle rejection action
 * - get_approval_stats: Get approval statistics for dashboard
 *
 * Author: Claude Code
 * Date: 2025-11-23
 */

-- ============================================================================
-- 1. GET_APPROVAL_WORKFLOW_FOR_EXPENSE
-- ============================================================================
-- Determines which workflow applies to a given expense based on amount and conditions

CREATE OR REPLACE FUNCTION get_approval_workflow_for_expense(p_expense_id UUID)
RETURNS UUID AS $$
DECLARE
  v_expense_record RECORD;
  v_workflow_id UUID;
BEGIN
  -- Get expense details
  SELECT amount, category, user_id, organization_id
  INTO v_expense_record
  FROM expenses
  WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found: %', p_expense_id;
  END IF;

  -- Find matching workflow (highest priority first)
  -- Matches based on amount range and optional category filter
  SELECT id INTO v_workflow_id
  FROM approval_workflows
  WHERE organization_id = v_expense_record.organization_id
    AND is_active = true
    AND (
      -- Amount range check
      (
        (conditions->>'amount_min' IS NULL OR v_expense_record.amount >= (conditions->>'amount_min')::NUMERIC)
        AND
        (conditions->>'amount_max' IS NULL OR v_expense_record.amount <= (conditions->>'amount_max')::NUMERIC)
      )
      -- Category check (if specified in conditions)
      AND (
        conditions->'categories' IS NULL
        OR v_expense_record.category = ANY(
          ARRAY(SELECT jsonb_array_elements_text(conditions->'categories'))
        )
      )
    )
  ORDER BY priority DESC
  LIMIT 1;

  IF v_workflow_id IS NULL THEN
    RAISE EXCEPTION 'No matching workflow found for expense amount: %', v_expense_record.amount;
  END IF;

  RETURN v_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. GET_APPROVAL_WORKFLOW_FOR_REPORT
-- ============================================================================
-- Determines which workflow applies to a report (uses total_amount)

CREATE OR REPLACE FUNCTION get_approval_workflow_for_report(p_report_id UUID)
RETURNS UUID AS $$
DECLARE
  v_report_record RECORD;
  v_workflow_id UUID;
BEGIN
  -- Get report details
  SELECT total_amount, user_id, organization_id
  INTO v_report_record
  FROM expense_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found: %', p_report_id;
  END IF;

  -- Find matching workflow
  SELECT id INTO v_workflow_id
  FROM approval_workflows
  WHERE organization_id = v_report_record.organization_id
    AND is_active = true
    AND (
      (conditions->>'amount_min' IS NULL OR v_report_record.total_amount >= (conditions->>'amount_min')::NUMERIC)
      AND
      (conditions->>'amount_max' IS NULL OR v_report_record.total_amount <= (conditions->>'amount_max')::NUMERIC)
    )
  ORDER BY priority DESC
  LIMIT 1;

  IF v_workflow_id IS NULL THEN
    RAISE EXCEPTION 'No matching workflow found for report amount: %', v_report_record.total_amount;
  END IF;

  RETURN v_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. GET_APPROVER_FOR_STEP
-- ============================================================================
-- Resolves the actual user ID for a given workflow step

CREATE OR REPLACE FUNCTION get_approver_for_step(
  p_workflow_id UUID,
  p_step_number INTEGER,
  p_expense_id UUID DEFAULT NULL,
  p_report_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_step RECORD;
  v_submitter_id UUID;
  v_approver_id UUID;
  v_organization_id UUID;
BEGIN
  -- Get the step details
  SELECT * INTO v_step
  FROM approval_steps
  WHERE workflow_id = p_workflow_id
    AND step_order = p_step_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step % not found for workflow %', p_step_number, p_workflow_id;
  END IF;

  -- Get submitter and organization
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
      -- Get submitter's manager
      SELECT manager_id INTO v_approver_id
      FROM organization_members
      WHERE user_id = v_submitter_id
        AND organization_id = v_organization_id;

      IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Submitter has no manager assigned';
      END IF;

    WHEN 'role' THEN
      -- Find first user with the specified role (finance or admin)
      -- Prefer active users, exclude submitter for separation of duties
      SELECT user_id INTO v_approver_id
      FROM organization_members
      WHERE organization_id = v_organization_id
        AND role = v_step.approver_role
        AND user_id != v_submitter_id
        AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'No user found with role: %', v_step.approver_role;
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

    ELSE
      RAISE EXCEPTION 'Unknown step type: %', v_step.step_type;
  END CASE;

  RETURN v_approver_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. CREATE_APPROVAL_CHAIN
-- ============================================================================
-- Initializes the approval process for an expense or report

CREATE OR REPLACE FUNCTION create_approval_chain(
  p_expense_id UUID DEFAULT NULL,
  p_report_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_workflow_id UUID;
  v_approval_id UUID;
  v_step_count INTEGER;
  v_first_approver UUID;
  v_organization_id UUID;
  v_submitter_id UUID;
BEGIN
  -- Validate inputs
  IF p_expense_id IS NULL AND p_report_id IS NULL THEN
    RAISE EXCEPTION 'Must provide either expense_id or report_id';
  END IF;

  IF p_expense_id IS NOT NULL AND p_report_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot provide both expense_id and report_id';
  END IF;

  -- Get workflow
  IF p_expense_id IS NOT NULL THEN
    v_workflow_id := get_approval_workflow_for_expense(p_expense_id);
    SELECT organization_id, user_id INTO v_organization_id, v_submitter_id
    FROM expenses WHERE id = p_expense_id;
  ELSE
    v_workflow_id := get_approval_workflow_for_report(p_report_id);
    SELECT organization_id, user_id INTO v_organization_id, v_submitter_id
    FROM expense_reports WHERE id = p_report_id;
  END IF;

  -- Count steps
  SELECT COUNT(*) INTO v_step_count
  FROM approval_steps
  WHERE workflow_id = v_workflow_id;

  IF v_step_count = 0 THEN
    RAISE EXCEPTION 'Workflow has no steps defined';
  END IF;

  -- Get first approver
  v_first_approver := get_approver_for_step(v_workflow_id, 1, p_expense_id, p_report_id);

  -- Create approval record
  INSERT INTO expense_approvals (
    organization_id,
    expense_id,
    report_id,
    workflow_id,
    current_step,
    total_steps,
    current_approver_id,
    status,
    submitted_at
  )
  VALUES (
    v_organization_id,
    p_expense_id,
    p_report_id,
    v_workflow_id,
    1,
    v_step_count,
    v_first_approver,
    'pending',
    NOW()
  )
  RETURNING id INTO v_approval_id;

  -- Log submission action
  INSERT INTO approval_actions (
    expense_approval_id,
    step_number,
    action,
    actor_id,
    actor_role,
    action_at
  )
  VALUES (
    v_approval_id,
    0,
    'submitted',
    v_submitter_id,
    'employee',
    NOW()
  );

  -- Update expense/report status
  IF p_expense_id IS NOT NULL THEN
    UPDATE expenses
    SET status = 'submitted', approval_id = v_approval_id
    WHERE id = p_expense_id;
  ELSE
    UPDATE expense_reports
    SET status = 'submitted', approval_id = v_approval_id
    WHERE id = p_report_id;
  END IF;

  RETURN v_approval_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. APPROVE_EXPENSE
-- ============================================================================
-- Handles approval action and advances to next step or completes

CREATE OR REPLACE FUNCTION approve_expense(
  p_approval_id UUID,
  p_approver_id UUID,
  p_comment TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_approval RECORD;
  v_next_approver UUID;
  v_approver_role TEXT;
BEGIN
  -- Get current approval state
  SELECT * INTO v_approval
  FROM expense_approvals
  WHERE id = p_approval_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;

  -- Verify approver
  IF v_approval.current_approver_id != p_approver_id THEN
    RAISE EXCEPTION 'User is not authorized to approve this expense';
  END IF;

  IF v_approval.status != 'pending' THEN
    RAISE EXCEPTION 'Approval is not in pending state';
  END IF;

  -- Get approver role
  SELECT role INTO v_approver_role
  FROM organization_members
  WHERE user_id = p_approver_id
    AND organization_id = v_approval.organization_id;

  -- Log approval action
  INSERT INTO approval_actions (
    expense_approval_id,
    step_number,
    action,
    actor_id,
    actor_role,
    comment,
    action_at
  )
  VALUES (
    p_approval_id,
    v_approval.current_step,
    'approved',
    p_approver_id,
    COALESCE(v_approver_role, 'unknown'),
    p_comment,
    NOW()
  );

  -- Check if more steps remaining
  IF v_approval.current_step < v_approval.total_steps THEN
    -- Advance to next step
    v_next_approver := get_approver_for_step(
      v_approval.workflow_id,
      v_approval.current_step + 1,
      v_approval.expense_id,
      v_approval.report_id
    );

    UPDATE expense_approvals
    SET current_step = current_step + 1,
        current_approver_id = v_next_approver,
        updated_at = NOW()
    WHERE id = p_approval_id;
  ELSE
    -- All steps complete - mark as approved
    UPDATE expense_approvals
    SET status = 'approved',
        current_approver_id = NULL,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_approval_id;

    -- Update expense/report status
    IF v_approval.expense_id IS NOT NULL THEN
      UPDATE expenses
      SET status = 'approved',
          approved_by = p_approver_id,
          approved_at = NOW()
      WHERE id = v_approval.expense_id;
    ELSE
      UPDATE expense_reports
      SET status = 'approved'
      WHERE id = v_approval.report_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. REJECT_EXPENSE
-- ============================================================================
-- Handles rejection action and returns to submitter

CREATE OR REPLACE FUNCTION reject_expense(
  p_approval_id UUID,
  p_approver_id UUID,
  p_rejection_reason TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_approval RECORD;
  v_approver_role TEXT;
BEGIN
  -- Get current approval state
  SELECT * INTO v_approval
  FROM expense_approvals
  WHERE id = p_approval_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;

  -- Verify approver
  IF v_approval.current_approver_id != p_approver_id THEN
    RAISE EXCEPTION 'User is not authorized to reject this expense';
  END IF;

  IF v_approval.status != 'pending' THEN
    RAISE EXCEPTION 'Approval is not in pending state';
  END IF;

  -- Get approver role
  SELECT role INTO v_approver_role
  FROM organization_members
  WHERE user_id = p_approver_id
    AND organization_id = v_approval.organization_id;

  -- Log rejection action
  INSERT INTO approval_actions (
    expense_approval_id,
    step_number,
    action,
    actor_id,
    actor_role,
    comment,
    rejection_reason,
    action_at
  )
  VALUES (
    p_approval_id,
    v_approval.current_step,
    'rejected',
    p_approver_id,
    COALESCE(v_approver_role, 'unknown'),
    p_comment,
    p_rejection_reason,
    NOW()
  );

  -- Mark approval as rejected
  UPDATE expense_approvals
  SET status = 'rejected',
      current_approver_id = NULL,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_approval_id;

  -- Update expense/report status
  IF v_approval.expense_id IS NOT NULL THEN
    UPDATE expenses
    SET status = 'rejected',
        rejected_by = p_approver_id,
        rejected_at = NOW(),
        rejection_reason = p_rejection_reason
    WHERE id = v_approval.expense_id;
  ELSE
    UPDATE expense_reports
    SET status = 'rejected'
    WHERE id = v_approval.report_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. GET_APPROVAL_STATS
-- ============================================================================
-- Get approval statistics for a specific approver

CREATE OR REPLACE FUNCTION get_approval_stats(
  p_approver_id UUID,
  p_organization_id UUID
)
RETURNS TABLE (
  pending_count BIGINT,
  approved_count BIGINT,
  rejected_count BIGINT,
  avg_approval_time_hours NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE ea.status = 'pending' AND ea.current_approver_id = p_approver_id) AS pending_count,
    COUNT(*) FILTER (WHERE aa.action = 'approved' AND aa.actor_id = p_approver_id) AS approved_count,
    COUNT(*) FILTER (WHERE aa.action = 'rejected' AND aa.actor_id = p_approver_id) AS rejected_count,
    COALESCE(
      AVG(
        EXTRACT(EPOCH FROM (ea.completed_at - ea.submitted_at)) / 3600
      ) FILTER (WHERE ea.status = 'approved' AND aa.actor_id = p_approver_id),
      0
    )::NUMERIC AS avg_approval_time_hours
  FROM expense_approvals ea
  LEFT JOIN approval_actions aa ON aa.expense_approval_id = ea.id
  WHERE ea.organization_id = p_organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_approval_workflow_for_expense IS 'Determines which workflow applies to an expense based on amount and category';
COMMENT ON FUNCTION get_approval_workflow_for_report IS 'Determines which workflow applies to a report based on total amount';
COMMENT ON FUNCTION get_approver_for_step IS 'Resolves the actual user ID for a given workflow step (handles manager, role, specific_user)';
COMMENT ON FUNCTION create_approval_chain IS 'Initializes the approval process and creates the first approval step';
COMMENT ON FUNCTION approve_expense IS 'Handles approval action, advances to next step, or marks as fully approved';
COMMENT ON FUNCTION reject_expense IS 'Handles rejection action and returns expense/report to submitter';
COMMENT ON FUNCTION get_approval_stats IS 'Returns approval statistics for dashboard (pending, approved, rejected counts, avg time)';
