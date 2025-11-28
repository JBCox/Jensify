-- Migration: Add function to update workflow steps without recreating workflow
-- This allows admins to modify approval steps for existing workflows
-- Created: 2025-11-24

/**
 * Update approval steps for an existing workflow
 * Deletes old steps and inserts new ones in a single transaction
 *
 * @param p_workflow_id - UUID of the workflow to update
 * @param p_steps - JSONB array of new steps
 *
 * Example call:
 * SELECT update_workflow_steps(
 *   'workflow-uuid-here',
 *   '[
 *     {"step_order": 1, "step_type": "manager"},
 *     {"step_order": 2, "step_type": "role", "approver_role": "finance"}
 *   ]'::jsonb
 * );
 */
CREATE OR REPLACE FUNCTION update_workflow_steps(
  p_workflow_id UUID,
  p_steps JSONB
) RETURNS VOID AS $$
DECLARE
  v_step JSONB;
  v_organization_id UUID;
BEGIN
  -- Verify workflow exists and get organization_id
  SELECT organization_id INTO v_organization_id
  FROM approval_workflows
  WHERE id = p_workflow_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Workflow not found: %', p_workflow_id;
  END IF;

  -- Verify user has permission (admin only)
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = v_organization_id
      AND role = 'admin'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can update workflow steps';
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
      require_all
    ) VALUES (
      p_workflow_id,
      (v_step->>'step_order')::INTEGER,
      v_step->>'step_type',
      v_step->>'approver_role',
      (v_step->>'approver_user_id')::UUID,
      COALESCE((v_step->>'require_all')::BOOLEAN, false)
    );
  END LOOP;

  -- Update workflow's updated_at timestamp
  UPDATE approval_workflows
  SET updated_at = NOW()
  WHERE id = p_workflow_id;

  RAISE NOTICE 'Successfully updated % steps for workflow %',
    jsonb_array_length(p_steps), p_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON FUNCTION update_workflow_steps(UUID, JSONB) IS
  'Updates approval steps for an existing workflow. Admin only. Deletes old steps and creates new ones in a transaction.';

-- Grant execute permission to authenticated users
-- (function internally checks for admin role)
GRANT EXECUTE ON FUNCTION update_workflow_steps(UUID, JSONB) TO authenticated;
