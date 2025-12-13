/**
 * Approval Workflow Enhancements
 *
 * This migration extends the approval workflow system to support:
 * 1. New step types: specific_manager, multiple_users, payment
 * 2. New statuses: awaiting_payment, paid
 * 3. Default workflow support
 * 4. Extended expense fields: project_code, tags
 *
 * Author: Claude Code
 * Date: 2025-12-12
 */

-- ============================================================================
-- 1. EXTEND APPROVAL_STEPS TABLE
-- ============================================================================

-- First, drop the existing step_type constraint
ALTER TABLE approval_steps
  DROP CONSTRAINT IF EXISTS approval_steps_step_type_check;

-- Add new constraint with extended step types
ALTER TABLE approval_steps
  ADD CONSTRAINT approval_steps_step_type_check
  CHECK (step_type IN (
    'manager',           -- Submitter's direct manager (existing)
    'role',              -- Any user with specified role (existing)
    'specific_user',     -- A single specific user (existing)
    'department_owner',  -- Department head (existing, rarely used)
    'specific_manager',  -- NEW: A named manager (not necessarily submitter's)
    'multiple_users',    -- NEW: Any of specified users can approve
    'payment'            -- NEW: Final payment step (Finance only)
  ));

-- Add column for multiple approvers (for 'multiple_users' step type)
ALTER TABLE approval_steps
  ADD COLUMN IF NOT EXISTS approver_user_ids UUID[] DEFAULT '{}';

-- Add column to indicate this is a payment step (denormalized for queries)
ALTER TABLE approval_steps
  ADD COLUMN IF NOT EXISTS is_payment_step BOOLEAN DEFAULT false;

-- Update existing step type validation constraint
ALTER TABLE approval_steps
  DROP CONSTRAINT IF EXISTS valid_step_type;

ALTER TABLE approval_steps
  ADD CONSTRAINT valid_step_type CHECK (
    (step_type = 'role' AND approver_role IS NOT NULL) OR
    (step_type = 'specific_user' AND approver_user_id IS NOT NULL) OR
    (step_type = 'specific_manager' AND approver_user_id IS NOT NULL) OR
    (step_type = 'multiple_users' AND array_length(approver_user_ids, 1) > 0) OR
    (step_type IN ('manager', 'department_owner', 'payment'))
  );

-- Index for multiple_users lookups
CREATE INDEX IF NOT EXISTS idx_approval_steps_approver_user_ids
  ON approval_steps USING GIN(approver_user_ids)
  WHERE array_length(approver_user_ids, 1) > 0;

-- Index for payment steps
CREATE INDEX IF NOT EXISTS idx_approval_steps_payment
  ON approval_steps(workflow_id)
  WHERE is_payment_step = true OR step_type = 'payment';

-- ============================================================================
-- 2. EXTEND EXPENSE_APPROVALS TABLE - New Statuses
-- ============================================================================

-- Drop existing status constraint
ALTER TABLE expense_approvals
  DROP CONSTRAINT IF EXISTS expense_approvals_status_check;

-- Add new constraint with extended statuses
ALTER TABLE expense_approvals
  ADD CONSTRAINT expense_approvals_status_check
  CHECK (status IN (
    'pending',           -- Awaiting approval at current step (existing)
    'approved',          -- All approval steps complete (existing)
    'awaiting_payment',  -- NEW: Approved, waiting for payment step
    'rejected',          -- Rejected at any step (existing)
    'cancelled',         -- Withdrawn by submitter (existing)
    'paid'               -- NEW: Payment step complete
  ));

-- Index for awaiting payment items (Finance dashboard)
CREATE INDEX IF NOT EXISTS idx_expense_approvals_awaiting_payment
  ON expense_approvals(organization_id, status, submitted_at DESC)
  WHERE status = 'awaiting_payment';

-- ============================================================================
-- 3. EXTEND APPROVAL_WORKFLOWS TABLE - Default Workflow Support
-- ============================================================================

-- Add default workflow indicator
ALTER TABLE approval_workflows
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Only one default per organization (unique partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_workflows_default
  ON approval_workflows (organization_id)
  WHERE is_default = true AND is_active = true;

-- Update column comment
COMMENT ON COLUMN approval_workflows.conditions IS
  'JSONB conditions for workflow matching. Supported keys:
   - amount_min (number): Minimum expense amount
   - amount_max (number): Maximum expense amount
   - categories (string[]): Expense categories
   - departments (string[]): Department names
   - project_codes (string[]): Project codes
   - tags (string[]): Custom tags
   - submitter_ids (uuid[]): Specific submitter UUIDs
   - is_default is now a dedicated column';

COMMENT ON COLUMN approval_workflows.is_default IS
  'If true, this workflow is used when no other workflow conditions match. Only one default per organization.';

-- ============================================================================
-- 4. EXTEND EXPENSES TABLE - Project Code and Tags
-- ============================================================================

-- Add project tracking to expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS project_code TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Index for project code lookups
CREATE INDEX IF NOT EXISTS idx_expenses_project_code
  ON expenses(organization_id, project_code)
  WHERE project_code IS NOT NULL;

-- GIN index for tag-based queries
CREATE INDEX IF NOT EXISTS idx_expenses_tags
  ON expenses USING GIN(tags)
  WHERE array_length(tags, 1) > 0;

-- ============================================================================
-- 5. EXTEND APPROVAL_ACTIONS TABLE - Payment Action
-- ============================================================================

-- Drop existing action constraint
ALTER TABLE approval_actions
  DROP CONSTRAINT IF EXISTS approval_actions_action_check;

-- Add new constraint with 'paid' action
ALTER TABLE approval_actions
  ADD CONSTRAINT approval_actions_action_check
  CHECK (action IN (
    'approved',    -- Existing
    'rejected',    -- Existing
    'delegated',   -- Existing
    'commented',   -- Existing
    'submitted',   -- Existing
    'paid'         -- NEW: Payment step completed
  ));

-- ============================================================================
-- 6. UPDATE DEFAULT WORKFLOW CREATION FUNCTION
-- ============================================================================

-- Drop existing function and recreate with payment step support
CREATE OR REPLACE FUNCTION create_default_approval_workflows(p_organization_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow_small UUID;
  v_workflow_medium UUID;
  v_workflow_large UUID;
  v_workflow_default UUID;
BEGIN
  -- Check if workflows already exist for this organization
  IF EXISTS (SELECT 1 FROM approval_workflows WHERE organization_id = p_organization_id) THEN
    RETURN;
  END IF;

  -- Workflow 1: Small expenses ($0 - $500) - Manager approval only
  INSERT INTO approval_workflows (organization_id, name, description, conditions, priority, is_active, is_default)
  VALUES (
    p_organization_id,
    'Small Expenses ($0-$500)',
    'Manager approval for expenses under $500',
    '{"amount_min": 0, "amount_max": 500}'::jsonb,
    1,
    true,
    false
  )
  RETURNING id INTO v_workflow_small;

  INSERT INTO approval_steps (workflow_id, step_order, step_type, approver_role, is_payment_step)
  VALUES (v_workflow_small, 1, 'manager', 'manager', false);

  -- Workflow 2: Medium expenses ($501 - $1,000) - Manager + Finance approval + Payment
  INSERT INTO approval_workflows (organization_id, name, description, conditions, priority, is_active, is_default)
  VALUES (
    p_organization_id,
    'Medium Expenses ($501-$1,000)',
    'Manager and Finance approval for expenses $501-$1,000',
    '{"amount_min": 501, "amount_max": 1000}'::jsonb,
    2,
    true,
    false
  )
  RETURNING id INTO v_workflow_medium;

  INSERT INTO approval_steps (workflow_id, step_order, step_type, approver_role, is_payment_step)
  VALUES
    (v_workflow_medium, 1, 'manager', 'manager', false),
    (v_workflow_medium, 2, 'role', 'finance', false),
    (v_workflow_medium, 3, 'payment', NULL, true);

  -- Workflow 3: Large expenses ($1,001+) - Manager + Finance + Admin approval + Payment
  INSERT INTO approval_workflows (organization_id, name, description, conditions, priority, is_active, is_default)
  VALUES (
    p_organization_id,
    'Large Expenses ($1,001+)',
    'Manager, Finance, and Admin approval for expenses over $1,000',
    '{"amount_min": 1001}'::jsonb,
    3,
    true,
    false
  )
  RETURNING id INTO v_workflow_large;

  INSERT INTO approval_steps (workflow_id, step_order, step_type, approver_role, is_payment_step)
  VALUES
    (v_workflow_large, 1, 'manager', 'manager', false),
    (v_workflow_large, 2, 'role', 'finance', false),
    (v_workflow_large, 3, 'role', 'admin', false),
    (v_workflow_large, 4, 'payment', NULL, true);

  -- Default workflow (catch-all) - Manager + Finance + Payment
  INSERT INTO approval_workflows (organization_id, name, description, conditions, priority, is_active, is_default)
  VALUES (
    p_organization_id,
    'Default Workflow',
    'Used when no other workflow conditions match',
    '{}'::jsonb,
    0,
    true,
    true
  )
  RETURNING id INTO v_workflow_default;

  INSERT INTO approval_steps (workflow_id, step_order, step_type, approver_role, is_payment_step)
  VALUES
    (v_workflow_default, 1, 'manager', 'manager', false),
    (v_workflow_default, 2, 'role', 'finance', false),
    (v_workflow_default, 3, 'payment', NULL, true);

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN approval_steps.step_type IS
  'Step type determines how approver is selected:
   - manager: Submitter''s direct manager
   - role: Any user with specified role (finance, admin, manager)
   - specific_user: A single named user
   - specific_manager: A named manager (not necessarily submitter''s)
   - multiple_users: Any one of the specified users can approve
   - payment: Final payment step (Finance role only)';

COMMENT ON COLUMN approval_steps.approver_user_ids IS
  'Array of user IDs for multiple_users step type. Any user in this list can approve.';

COMMENT ON COLUMN approval_steps.is_payment_step IS
  'True if this is a payment step. Payment steps require Finance role and mark the expense as paid when completed.';

COMMENT ON COLUMN expense_approvals.status IS
  'Approval status:
   - pending: Awaiting approval at current step
   - approved: All approval steps complete
   - awaiting_payment: All approval steps done, waiting for payment step
   - rejected: Rejected at any step
   - cancelled: Withdrawn by submitter
   - paid: Payment step complete';

COMMENT ON COLUMN expenses.project_code IS
  'Project code for cost allocation and workflow routing';

COMMENT ON COLUMN expenses.tags IS
  'Custom tags for categorization and workflow routing';
