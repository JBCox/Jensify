/**
 * Approval Engine V2 - Enhanced Functions
 *
 * This migration updates the approval engine functions to support:
 * 1. New step types: specific_manager, multiple_users, payment
 * 2. New statuses: awaiting_payment, paid
 * 3. Expanded workflow conditions: departments, project_codes, tags
 * 4. Default workflow fallback
 * 5. Payment step handling with Finance-only authorization
 *
 * Author: Claude Code
 * Date: 2025-12-12
 */

-- ============================================================================
-- 1. GET_APPROVAL_WORKFLOW_FOR_EXPENSE - Enhanced with new conditions
-- ============================================================================

CREATE OR REPLACE FUNCTION get_approval_workflow_for_expense(p_expense_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense RECORD;
  v_workflow_id UUID;
BEGIN
  -- Get expense with all relevant fields
  SELECT
    e.*,
    om.department
  INTO v_expense
  FROM expenses e
  LEFT JOIN organization_members om ON om.user_id = e.user_id
    AND om.organization_id = e.organization_id
  WHERE e.id = p_expense_id;

  IF v_expense IS NULL THEN
    RAISE EXCEPTION 'Expense not found: %', p_expense_id;
  END IF;

  -- Find matching workflow (highest priority first, non-default first)
  SELECT id INTO v_workflow_id
  FROM approval_workflows
  WHERE organization_id = v_expense.organization_id
    AND is_active = true
    AND is_default = false  -- Non-default workflows first
    AND (
      -- Amount range check (with validation)
      (
        (
          conditions->>'amount_min' IS NULL
          OR (
            conditions->>'amount_min' ~ '^[0-9]+(\.[0-9]+)?$'
            AND v_expense.amount >= (conditions->>'amount_min')::NUMERIC
          )
        )
        AND
        (
          conditions->>'amount_max' IS NULL
          OR (
            conditions->>'amount_max' ~ '^[0-9]+(\.[0-9]+)?$'
            AND v_expense.amount <= (conditions->>'amount_max')::NUMERIC
          )
        )
      )
    )
    AND (
      -- Category check
      conditions->'categories' IS NULL
      OR conditions->'categories' = '[]'::jsonb
      OR v_expense.category = ANY(
        ARRAY(SELECT jsonb_array_elements_text(conditions->'categories'))
      )
    )
    AND (
      -- Department check (NEW)
      conditions->'departments' IS NULL
      OR conditions->'departments' = '[]'::jsonb
      OR v_expense.department = ANY(
        ARRAY(SELECT jsonb_array_elements_text(conditions->'departments'))
      )
    )
    AND (
      -- Project code check (NEW)
      conditions->'project_codes' IS NULL
      OR conditions->'project_codes' = '[]'::jsonb
      OR v_expense.project_code = ANY(
        ARRAY(SELECT jsonb_array_elements_text(conditions->'project_codes'))
      )
    )
    AND (
      -- Tags check (NEW) - expense must have at least one matching tag
      conditions->'tags' IS NULL
      OR conditions->'tags' = '[]'::jsonb
      OR v_expense.tags && ARRAY(SELECT jsonb_array_elements_text(conditions->'tags'))
    )
    AND (
      -- Submitter check
      conditions->'submitter_ids' IS NULL
      OR conditions->'submitter_ids' = '[]'::jsonb
      OR v_expense.user_id::text = ANY(
        ARRAY(SELECT jsonb_array_elements_text(conditions->'submitter_ids'))
      )
    )
  ORDER BY priority DESC, created_at DESC
  LIMIT 1;

  -- Fall back to default workflow if no match
  IF v_workflow_id IS NULL THEN
    SELECT id INTO v_workflow_id
    FROM approval_workflows
    WHERE organization_id = v_expense.organization_id
      AND is_active = true
      AND is_default = true
    LIMIT 1;
  END IF;

  IF v_workflow_id IS NULL THEN
    RAISE EXCEPTION 'No matching workflow found for expense. Please configure a default workflow.';
  END IF;

  RETURN v_workflow_id;
END;
$$;

-- ============================================================================
-- 2. GET_APPROVAL_WORKFLOW_FOR_REPORT - Enhanced with new conditions
-- ============================================================================

CREATE OR REPLACE FUNCTION get_approval_workflow_for_report(p_report_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report RECORD;
  v_workflow_id UUID;
BEGIN
  -- Get report details
  SELECT
    er.*,
    om.department
  INTO v_report
  FROM expense_reports er
  LEFT JOIN organization_members om ON om.user_id = er.user_id
    AND om.organization_id = er.organization_id
  WHERE er.id = p_report_id;

  IF v_report IS NULL THEN
    RAISE EXCEPTION 'Report not found: %', p_report_id;
  END IF;

  -- Find matching workflow (same logic as expense, using total_amount)
  SELECT id INTO v_workflow_id
  FROM approval_workflows
  WHERE organization_id = v_report.organization_id
    AND is_active = true
    AND is_default = false
    AND (
      (
        (
          conditions->>'amount_min' IS NULL
          OR (
            conditions->>'amount_min' ~ '^[0-9]+(\.[0-9]+)?$'
            AND v_report.total_amount >= (conditions->>'amount_min')::NUMERIC
          )
        )
        AND
        (
          conditions->>'amount_max' IS NULL
          OR (
            conditions->>'amount_max' ~ '^[0-9]+(\.[0-9]+)?$'
            AND v_report.total_amount <= (conditions->>'amount_max')::NUMERIC
          )
        )
      )
    )
    AND (
      conditions->'departments' IS NULL
      OR conditions->'departments' = '[]'::jsonb
      OR v_report.department = ANY(
        ARRAY(SELECT jsonb_array_elements_text(conditions->'departments'))
      )
    )
  ORDER BY priority DESC, created_at DESC
  LIMIT 1;

  -- Fall back to default workflow
  IF v_workflow_id IS NULL THEN
    SELECT id INTO v_workflow_id
    FROM approval_workflows
    WHERE organization_id = v_report.organization_id
      AND is_active = true
      AND is_default = true
    LIMIT 1;
  END IF;

  IF v_workflow_id IS NULL THEN
    RAISE EXCEPTION 'No matching workflow found for report. Please configure a default workflow.';
  END IF;

  RETURN v_workflow_id;
END;
$$;

-- ============================================================================
-- 3. GET_APPROVER_FOR_STEP - Enhanced with new step types
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
      -- Get submitter's direct manager
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
      -- Find first user with the specified role
      -- Exclude submitter and previous approvers for separation of duties
      SELECT user_id INTO v_approver_id
      FROM organization_members
      WHERE organization_id = v_organization_id
        AND role = v_step.approver_role
        AND user_id != v_submitter_id
        AND is_active = true
        -- Exclude users who already approved this chain
        AND user_id NOT IN (
          SELECT actor_id
          FROM approval_actions aa
          JOIN expense_approvals ea ON aa.expense_approval_id = ea.id
          WHERE (ea.expense_id = p_expense_id OR ea.report_id = p_report_id)
            AND aa.action IN ('approved', 'paid')
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

      IF v_approver_id = v_submitter_id THEN
        RAISE EXCEPTION 'Approver cannot be the same as submitter (separation of duties)';
      END IF;

      -- Verify approver hasn't already approved earlier step
      IF EXISTS (
        SELECT 1
        FROM approval_actions aa
        JOIN expense_approvals ea ON aa.expense_approval_id = ea.id
        WHERE (ea.expense_id = p_expense_id OR ea.report_id = p_report_id)
          AND aa.actor_id = v_approver_id
          AND aa.action IN ('approved', 'paid')
      ) THEN
        RAISE EXCEPTION 'User has already approved an earlier step (separation of duties)';
      END IF;

    WHEN 'specific_manager' THEN
      -- NEW: Named manager (same as specific_user, but UI presents managers only)
      v_approver_id := v_step.approver_user_id;

      IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Specific manager not set for step';
      END IF;

      IF v_approver_id = v_submitter_id THEN
        RAISE EXCEPTION 'Approver cannot be the same as submitter (separation of duties)';
      END IF;

      -- Verify approver is actually a manager in the organization
      IF NOT EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = v_approver_id
          AND organization_id = v_organization_id
          AND role IN ('manager', 'admin')
          AND is_active = true
      ) THEN
        RAISE EXCEPTION 'Specified user is not a manager or admin in this organization';
      END IF;

    WHEN 'multiple_users' THEN
      -- NEW: Any of the specified users can approve
      SELECT om.user_id INTO v_approver_id
      FROM organization_members om
      WHERE om.organization_id = v_organization_id
        AND om.user_id = ANY(v_step.approver_user_ids)
        AND om.user_id != v_submitter_id
        AND om.is_active = true
        -- Exclude users who already approved
        AND om.user_id NOT IN (
          SELECT actor_id
          FROM approval_actions aa
          JOIN expense_approvals ea ON aa.expense_approval_id = ea.id
          WHERE (ea.expense_id = p_expense_id OR ea.report_id = p_report_id)
            AND aa.action IN ('approved', 'paid')
        )
      ORDER BY om.created_at ASC
      LIMIT 1;

      IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'No available approver from the specified users list';
      END IF;

    WHEN 'payment' THEN
      -- NEW: Payment step - must be Finance role
      SELECT user_id INTO v_approver_id
      FROM organization_members
      WHERE organization_id = v_organization_id
        AND role = 'finance'
        AND user_id != v_submitter_id
        AND is_active = true
        -- Exclude users who already approved earlier steps
        AND user_id NOT IN (
          SELECT actor_id
          FROM approval_actions aa
          JOIN expense_approvals ea ON aa.expense_approval_id = ea.id
          WHERE (ea.expense_id = p_expense_id OR ea.report_id = p_report_id)
            AND aa.action IN ('approved', 'paid')
        )
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_approver_id IS NULL THEN
        -- If all finance users have already approved, pick any active finance user
        SELECT user_id INTO v_approver_id
        FROM organization_members
        WHERE organization_id = v_organization_id
          AND role = 'finance'
          AND user_id != v_submitter_id
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;

      IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'No active Finance user available for payment step';
      END IF;

    ELSE
      RAISE EXCEPTION 'Unknown step type: %', v_step.step_type;
  END CASE;

  RETURN v_approver_id;
END;
$$;

-- ============================================================================
-- 4. APPROVE_EXPENSE - Enhanced with payment step handling
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
  v_current_step RECORD;
  v_next_step RECORD;
  v_approver_role TEXT;
  v_next_step_num INT;
  v_next_approver_id UUID;
  v_is_current_payment_step BOOLEAN;
  v_is_next_payment_step BOOLEAN;
  v_action_type TEXT;
  v_new_status TEXT;
BEGIN
  -- Get current approval state with row-level lock
  SELECT * INTO v_approval
  FROM expense_approvals
  WHERE id = p_approval_id
  FOR UPDATE;

  IF v_approval IS NULL THEN
    RAISE EXCEPTION 'Approval not found: %', p_approval_id;
  END IF;

  -- Verify approval is in approvable state
  IF v_approval.status NOT IN ('pending', 'awaiting_payment') THEN
    RAISE EXCEPTION 'Approval is not in approvable state (current status: %)', v_approval.status;
  END IF;

  -- Verify approver is the current approver
  IF v_approval.current_approver_id != p_approver_id THEN
    RAISE EXCEPTION 'User is not the current approver';
  END IF;

  -- Get current step details
  SELECT * INTO v_current_step
  FROM approval_steps
  WHERE workflow_id = v_approval.workflow_id
    AND step_order = v_approval.current_step;

  v_is_current_payment_step := COALESCE(v_current_step.is_payment_step, v_current_step.step_type = 'payment');

  -- Get approver's role
  SELECT role INTO v_approver_role
  FROM organization_members
  WHERE user_id = p_approver_id
    AND organization_id = v_approval.organization_id
    AND is_active = true;

  IF v_approver_role IS NULL THEN
    RAISE EXCEPTION 'Approver not found in organization or is inactive';
  END IF;

  -- If payment step, verify approver is Finance
  IF v_is_current_payment_step AND v_approver_role != 'finance' THEN
    RAISE EXCEPTION 'Only Finance users can complete payment steps';
  END IF;

  -- Validate approver has authority (for non-payment steps)
  IF NOT v_is_current_payment_step AND v_approver_role NOT IN ('manager', 'finance', 'admin') THEN
    RAISE EXCEPTION 'User role % does not have approval authority', v_approver_role;
  END IF;

  -- Determine action type
  v_action_type := CASE WHEN v_is_current_payment_step THEN 'paid' ELSE 'approved' END;

  -- Record the action
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
    v_action_type,
    p_approver_id,
    v_approver_role,
    p_comment,
    NOW()
  );

  -- Check if this was the final step
  IF v_approval.current_step >= v_approval.total_steps THEN
    -- Final step complete
    v_new_status := CASE WHEN v_is_current_payment_step THEN 'paid' ELSE 'approved' END;

    UPDATE expense_approvals
    SET status = v_new_status,
        current_approver_id = NULL,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_approval_id;

    -- Update the expense/report status
    IF v_approval.expense_id IS NOT NULL THEN
      IF v_is_current_payment_step THEN
        UPDATE expenses
        SET status = 'reimbursed',
            approved_by = p_approver_id,
            approved_at = COALESCE(approved_at, NOW()),
            reimbursed_at = NOW(),
            reimbursed_by = p_approver_id,
            updated_at = NOW()
        WHERE id = v_approval.expense_id;
      ELSE
        UPDATE expenses
        SET status = 'approved',
            approved_by = p_approver_id,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = v_approval.expense_id;
      END IF;
    ELSIF v_approval.report_id IS NOT NULL THEN
      UPDATE expense_reports
      SET status = CASE WHEN v_is_current_payment_step THEN 'paid' ELSE 'approved' END,
          approved_by = p_approver_id,
          approved_at = CASE WHEN v_is_current_payment_step THEN COALESCE(approved_at, NOW()) ELSE NOW() END,
          paid_at = CASE WHEN v_is_current_payment_step THEN NOW() ELSE NULL END,
          paid_by = CASE WHEN v_is_current_payment_step THEN p_approver_id ELSE NULL END,
          updated_at = NOW()
      WHERE id = v_approval.report_id;
    END IF;
  ELSE
    -- Move to next step
    v_next_step_num := v_approval.current_step + 1;

    -- Check if next step is a payment step
    SELECT * INTO v_next_step
    FROM approval_steps
    WHERE workflow_id = v_approval.workflow_id
      AND step_order = v_next_step_num;

    v_is_next_payment_step := COALESCE(v_next_step.is_payment_step, v_next_step.step_type = 'payment');

    -- Get next approver
    v_next_approver_id := get_approver_for_step(
      v_approval.workflow_id,
      v_next_step_num,
      v_approval.expense_id,
      v_approval.report_id
    );

    -- Set status based on whether entering payment phase
    v_new_status := CASE WHEN v_is_next_payment_step THEN 'awaiting_payment' ELSE 'pending' END;

    -- Update approval to next step
    UPDATE expense_approvals
    SET current_step = v_next_step_num,
        current_approver_id = v_next_approver_id,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = p_approval_id;

    -- If moving to awaiting_payment, update expense/report to approved
    IF v_is_next_payment_step THEN
      IF v_approval.expense_id IS NOT NULL THEN
        UPDATE expenses
        SET status = 'approved',
            approved_by = p_approver_id,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = v_approval.expense_id;
      ELSIF v_approval.report_id IS NOT NULL THEN
        UPDATE expense_reports
        SET status = 'approved',
            approved_by = p_approver_id,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = v_approval.report_id;
      END IF;
    END IF;
  END IF;
END;
$$;

-- ============================================================================
-- 5. UPDATE_WORKFLOW_STEPS - Enhanced with payment step validation
-- ============================================================================

CREATE OR REPLACE FUNCTION update_workflow_steps(
  p_workflow_id UUID,
  p_steps JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step JSONB;
  v_organization_id UUID;
  v_has_payment_step BOOLEAN := false;
  v_payment_step_order INTEGER := 0;
  v_max_step_order INTEGER := 0;
BEGIN
  -- Verify workflow exists and get organization
  SELECT organization_id INTO v_organization_id
  FROM approval_workflows WHERE id = p_workflow_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Workflow not found: %', p_workflow_id;
  END IF;

  -- Verify admin permission
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = v_organization_id
      AND role = 'admin'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can update workflow steps';
  END IF;

  -- Validate: count payment steps and find max step order
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps)
  LOOP
    v_max_step_order := GREATEST(v_max_step_order, (v_step->>'step_order')::INTEGER);

    IF v_step->>'step_type' = 'payment' OR (v_step->>'is_payment_step')::BOOLEAN = true THEN
      IF v_has_payment_step THEN
        RAISE EXCEPTION 'Only one payment step is allowed per workflow';
      END IF;
      v_has_payment_step := true;
      v_payment_step_order := (v_step->>'step_order')::INTEGER;
    END IF;
  END LOOP;

  -- Validate: payment step must be last
  IF v_has_payment_step AND v_payment_step_order != v_max_step_order THEN
    RAISE EXCEPTION 'Payment step must be the final step in the workflow';
  END IF;

  -- Delete existing steps
  DELETE FROM approval_steps WHERE workflow_id = p_workflow_id;

  -- Insert new steps
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps)
  LOOP
    INSERT INTO approval_steps (
      workflow_id,
      step_order,
      step_type,
      approver_role,
      approver_user_id,
      approver_user_ids,
      is_payment_step,
      require_all
    ) VALUES (
      p_workflow_id,
      (v_step->>'step_order')::INTEGER,
      v_step->>'step_type',
      v_step->>'approver_role',
      (v_step->>'approver_user_id')::UUID,
      COALESCE(
        (SELECT array_agg(value::UUID) FROM jsonb_array_elements_text(v_step->'approver_user_ids')),
        '{}'::UUID[]
      ),
      COALESCE(
        (v_step->>'is_payment_step')::BOOLEAN,
        v_step->>'step_type' = 'payment'
      ),
      COALESCE((v_step->>'require_all')::BOOLEAN, true)
    );
  END LOOP;

  -- Update workflow timestamp
  UPDATE approval_workflows
  SET updated_at = NOW()
  WHERE id = p_workflow_id;
END;
$$;

-- ============================================================================
-- 6. GET_PAYMENT_QUEUE - New function for Finance dashboard
-- ============================================================================

CREATE OR REPLACE FUNCTION get_payment_queue(
  p_organization_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  approval_id UUID,
  expense_id UUID,
  report_id UUID,
  submitter_id UUID,
  submitter_name TEXT,
  amount NUMERIC,
  description TEXT,
  current_approver_id UUID,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ea.id AS approval_id,
    ea.expense_id,
    ea.report_id,
    COALESCE(e.user_id, er.user_id) AS submitter_id,
    COALESCE(p.full_name, 'Unknown') AS submitter_name,
    COALESCE(e.amount, er.total_amount) AS amount,
    COALESCE(e.description, er.name) AS description,
    ea.current_approver_id,
    ea.submitted_at,
    COALESCE(e.approved_at, er.approved_at) AS approved_at
  FROM expense_approvals ea
  LEFT JOIN expenses e ON ea.expense_id = e.id
  LEFT JOIN expense_reports er ON ea.report_id = er.id
  LEFT JOIN profiles p ON p.id = COALESCE(e.user_id, er.user_id)
  WHERE ea.organization_id = p_organization_id
    AND ea.status = 'awaiting_payment'
  ORDER BY ea.submitted_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ============================================================================
-- 7. GET_APPROVAL_STATS - Updated with new statuses
-- ============================================================================

CREATE OR REPLACE FUNCTION get_approval_stats(
  p_approver_id UUID,
  p_organization_id UUID
)
RETURNS TABLE (
  pending_count BIGINT,
  awaiting_payment_count BIGINT,
  approved_count BIGINT,
  paid_count BIGINT,
  rejected_count BIGINT,
  avg_approval_time_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (
      WHERE ea.status = 'pending' AND ea.current_approver_id = p_approver_id
    ) AS pending_count,
    COUNT(*) FILTER (
      WHERE ea.status = 'awaiting_payment' AND ea.current_approver_id = p_approver_id
    ) AS awaiting_payment_count,
    COUNT(DISTINCT aa.expense_approval_id) FILTER (
      WHERE aa.action = 'approved' AND aa.actor_id = p_approver_id
    ) AS approved_count,
    COUNT(DISTINCT aa.expense_approval_id) FILTER (
      WHERE aa.action = 'paid' AND aa.actor_id = p_approver_id
    ) AS paid_count,
    COUNT(DISTINCT aa.expense_approval_id) FILTER (
      WHERE aa.action = 'rejected' AND aa.actor_id = p_approver_id
    ) AS rejected_count,
    COALESCE(
      AVG(
        EXTRACT(EPOCH FROM (ea.completed_at - ea.submitted_at)) / 3600
      ) FILTER (WHERE ea.status IN ('approved', 'paid') AND ea.completed_at IS NOT NULL),
      0
    )::NUMERIC AS avg_approval_time_hours
  FROM expense_approvals ea
  LEFT JOIN approval_actions aa ON aa.expense_approval_id = ea.id
  WHERE ea.organization_id = p_organization_id;
END;
$$;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_approval_workflow_for_expense IS
  'Determines which workflow applies to an expense. Now supports departments, project_codes, tags matching and default workflow fallback.';

COMMENT ON FUNCTION get_approval_workflow_for_report IS
  'Determines which workflow applies to a report. Now supports departments matching and default workflow fallback.';

COMMENT ON FUNCTION get_approver_for_step IS
  'Resolves the approver for a workflow step. Now supports specific_manager, multiple_users, and payment step types.';

COMMENT ON FUNCTION approve_expense IS
  'Handles approval/payment action. Payment steps require Finance role and set final status to paid.';

COMMENT ON FUNCTION update_workflow_steps IS
  'Updates workflow steps with validation. Payment step must be last and only one allowed per workflow.';

COMMENT ON FUNCTION get_payment_queue IS
  'Returns items awaiting payment for the Finance dashboard.';

COMMENT ON FUNCTION get_approval_stats IS
  'Returns approval statistics including new awaiting_payment and paid counts.';
