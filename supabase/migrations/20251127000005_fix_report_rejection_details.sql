/**
 * Fix Report Rejection Details
 *
 * The reject_expense function was not updating rejection details
 * (rejected_by, rejected_at, rejection_reason) for expense_reports.
 * This migration fixes the function to properly update these fields.
 *
 * Author: Claude Code
 * Date: 2025-11-27
 */

-- Drop and recreate the reject_expense function with the fix
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

  -- Update expense/report status with ALL rejection details
  IF v_approval.expense_id IS NOT NULL THEN
    UPDATE expenses
    SET status = 'rejected',
        rejected_by = p_approver_id,
        rejected_at = NOW(),
        rejection_reason = p_rejection_reason
    WHERE id = v_approval.expense_id;
  ELSE
    -- FIX: Also update rejection details for reports (was missing before)
    UPDATE expense_reports
    SET status = 'rejected',
        rejected_by = p_approver_id,
        rejected_at = NOW(),
        rejection_reason = p_rejection_reason
    WHERE id = v_approval.report_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reject_expense IS 'Handles rejection action with full rejection details for both expenses and reports';
