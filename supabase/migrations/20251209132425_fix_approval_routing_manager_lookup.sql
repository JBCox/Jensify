/**
 * Fix Approval Routing Bug - Manager Lookup
 *
 * PROBLEM:
 * The get_approver_for_step function was incorrectly retrieving manager_id
 * (which references organization_members.id) instead of the manager's user_id
 * (which references auth.users.id). This caused approvals to be routed to
 * incorrect approvers.
 *
 * SCENARIO:
 * - testemployee submits a report
 * - Workflow step_type = 'manager' should route to testemployee's manager
 * - Bug: get_approver_for_step returns manager_id (org_member.id) instead of manager's user_id
 * - Result: approval gets assigned to wrong user (e.g., testmanager instead of testadmin)
 *
 * ROOT CAUSE:
 * In organization_members table:
 * - manager_id REFERENCES organization_members(id)  -- FK to org member record
 * - user_id REFERENCES auth.users(id)              -- FK to auth user
 *
 * The function was selecting manager_id directly, but expense_approvals.current_approver_id
 * expects a user_id from auth.users table.
 *
 * FIX:
 * Query the manager's user_id by joining through organization_members:
 * 1. Find the submitter's org_member record
 * 2. Follow manager_id to manager's org_member record
 * 3. Return the manager's user_id
 *
 * Author: Claude Code
 * Date: 2025-12-09
 */

-- ============================================================================
-- FIX: get_approver_for_step function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_approver_for_step(
  p_workflow_id UUID,
  p_step_number INTEGER,
  p_expense_id UUID DEFAULT NULL,
  p_report_id UUID DEFAULT NULL
)
RETURNS UUID 
SECURITY DEFINER
SET search_path = public
AS $$
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
      -- FIX: Get the manager's user_id (not just manager_id)
      -- Join through organization_members to get the actual user_id
      SELECT manager.user_id INTO v_approver_id
      FROM organization_members submitter
      JOIN organization_members manager ON manager.id = submitter.manager_id
      WHERE submitter.user_id = v_submitter_id
        AND submitter.organization_id = v_organization_id
        AND manager.is_active = true;

      IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Submitter has no active manager assigned';
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
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION QUERY (for testing)
-- ============================================================================
-- To test this fix, run the following query after applying the migration:
--
-- SELECT
--   submitter.user_id as submitter_user_id,
--   submitter_user.email as submitter_email,
--   submitter.manager_id as manager_org_member_id,
--   manager.user_id as manager_user_id,
--   manager_user.email as manager_email,
--   manager.role as manager_role
-- FROM organization_members submitter
-- JOIN auth.users submitter_user ON submitter.user_id = submitter_user.id
-- LEFT JOIN organization_members manager ON manager.id = submitter.manager_id
-- LEFT JOIN auth.users manager_user ON manager.user_id = manager_user.id
-- WHERE submitter_user.email LIKE '%e2etest%'
-- ORDER BY submitter_user.email;
--
-- Expected result for testemployee@e2etest.com:
-- - manager_user_id should be the UUID of testadmin@e2etest.com (if testadmin is the manager)
-- - manager_email should be testadmin@e2etest.com
-- - manager_role should be 'admin'
-- ============================================================================

COMMENT ON FUNCTION get_approver_for_step IS 'Resolves the actual user_id for a given workflow step. For manager step_type, joins through organization_members to get the manager''s user_id instead of manager_id.';
