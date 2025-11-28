/**
 * Multi-Level Approval System
 *
 * This migration creates the infrastructure for multi-level approval workflows
 * including configurable approval chains, approval tracking, and audit trails.
 *
 * Tables Created:
 * - approval_workflows: Admin-configured approval rules
 * - approval_steps: Individual steps in each workflow
 * - expense_approvals: Track approval status for expenses/reports
 * - approval_actions: Complete audit trail of all approval actions
 * - approval_delegations: Temporary delegation support (Phase 2)
 *
 * Author: Claude Code
 * Date: 2025-11-23
 * Phase: Phase 1 - Multi-Level Approval MVP
 */

-- ============================================================================
-- 1. APPROVAL_WORKFLOWS TABLE
-- ============================================================================
-- Stores admin-configured approval workflow rules
-- Each workflow defines when it applies (conditions) and what steps to execute

CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Workflow metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,

  -- Trigger conditions (JSONB for flexibility)
  -- Examples:
  -- {"amount_min": 500, "amount_max": 1000}
  -- {"categories": ["Airfare", "Lodging"]}
  -- {"amount_min": 1000, "categories": ["Software"]}
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Priority (higher number = higher priority when multiple workflows match)
  priority INTEGER DEFAULT 0,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT unique_workflow_name_per_org UNIQUE(organization_id, name)
);

-- Indexes for performance
CREATE INDEX idx_approval_workflows_org ON approval_workflows(organization_id);
CREATE INDEX idx_approval_workflows_active ON approval_workflows(is_active) WHERE is_active = true;
CREATE INDEX idx_approval_workflows_priority ON approval_workflows(priority DESC);

-- RLS Policies
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflows"
  ON approval_workflows FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = approval_workflows.organization_id
      AND role = 'admin'
    )
  );

CREATE POLICY "Finance and managers can view workflows"
  ON approval_workflows FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = approval_workflows.organization_id
      AND role IN ('finance', 'manager', 'admin')
    )
  );

-- ============================================================================
-- 2. APPROVAL_STEPS TABLE
-- ============================================================================
-- Defines the individual steps within each approval workflow

CREATE TABLE IF NOT EXISTS approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,

  -- Step order (1 = first step, 2 = second step, etc.)
  step_order INTEGER NOT NULL,

  -- Step type determines how approver is selected
  step_type VARCHAR(50) NOT NULL CHECK (step_type IN ('manager', 'role', 'specific_user', 'department_owner')),

  -- Approver specification (based on step_type)
  approver_role VARCHAR(50), -- 'manager', 'finance', 'admin'
  approver_user_id UUID REFERENCES auth.users(id),

  -- Parallel approval settings (Phase 2)
  require_all BOOLEAN DEFAULT true, -- For steps with multiple approvers

  -- Validation: ensure step_type matches provided fields
  CONSTRAINT valid_step_type CHECK (
    (step_type = 'role' AND approver_role IS NOT NULL) OR
    (step_type = 'specific_user' AND approver_user_id IS NOT NULL) OR
    (step_type IN ('manager', 'department_owner'))
  ),

  -- Ensure unique step order within each workflow
  CONSTRAINT unique_step_order_per_workflow UNIQUE(workflow_id, step_order)
);

-- Indexes
CREATE INDEX idx_approval_steps_workflow ON approval_steps(workflow_id);
CREATE INDEX idx_approval_steps_order ON approval_steps(workflow_id, step_order);

-- RLS: Inherits from approval_workflows via workflow_id

ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage approval steps"
  ON approval_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM approval_workflows aw
      JOIN organization_members om ON om.organization_id = aw.organization_id
      WHERE aw.id = approval_steps.workflow_id
      AND om.user_id = auth.uid()
      AND om.role = 'admin'
    )
  );

CREATE POLICY "Finance and managers can view approval steps"
  ON approval_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM approval_workflows aw
      JOIN organization_members om ON om.organization_id = aw.organization_id
      WHERE aw.id = approval_steps.workflow_id
      AND om.user_id = auth.uid()
      AND om.role IN ('finance', 'manager', 'admin')
    )
  );

-- ============================================================================
-- 3. EXPENSE_APPROVALS TABLE
-- ============================================================================
-- Tracks the current approval status for each expense or report

CREATE TABLE IF NOT EXISTS expense_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Link to expense OR report (one must be set, not both)
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  report_id UUID REFERENCES expense_reports(id) ON DELETE CASCADE,

  -- Workflow being executed
  workflow_id UUID REFERENCES approval_workflows(id),

  -- Current state in approval chain
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

  -- Current approver
  current_approver_id UUID REFERENCES auth.users(id),

  -- Timestamps
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure only one of expense_id or report_id is set
  CONSTRAINT expense_or_report CHECK (
    (expense_id IS NOT NULL AND report_id IS NULL) OR
    (expense_id IS NULL AND report_id IS NOT NULL)
  )
);

-- Indexes for performance
CREATE INDEX idx_expense_approvals_expense ON expense_approvals(expense_id);
CREATE INDEX idx_expense_approvals_report ON expense_approvals(report_id);
CREATE INDEX idx_expense_approvals_status ON expense_approvals(status);
CREATE INDEX idx_expense_approvals_approver ON expense_approvals(current_approver_id) WHERE status = 'pending';
CREATE INDEX idx_expense_approvals_org ON expense_approvals(organization_id);

-- RLS Policies
ALTER TABLE expense_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view approvals for their own submissions"
  ON expense_approvals FOR SELECT
  USING (
    expense_id IN (SELECT id FROM expenses WHERE user_id = auth.uid())
    OR report_id IN (SELECT id FROM expense_reports WHERE user_id = auth.uid())
  );

CREATE POLICY "Approvers can view pending approvals assigned to them"
  ON expense_approvals FOR SELECT
  USING (current_approver_id = auth.uid() AND status = 'pending');

CREATE POLICY "Finance and Admin can view all approvals"
  ON expense_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = expense_approvals.organization_id
      AND role IN ('finance', 'admin')
    )
  );

CREATE POLICY "Approvers can update approvals assigned to them"
  ON expense_approvals FOR UPDATE
  USING (current_approver_id = auth.uid() AND status = 'pending');

CREATE POLICY "System can create and update approval records"
  ON expense_approvals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = expense_approvals.organization_id
    )
  );

-- ============================================================================
-- 4. APPROVAL_ACTIONS TABLE
-- ============================================================================
-- Complete audit trail of all approval/rejection actions

CREATE TABLE IF NOT EXISTS approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_approval_id UUID NOT NULL REFERENCES expense_approvals(id) ON DELETE CASCADE,

  -- Action details
  step_number INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('approved', 'rejected', 'delegated', 'commented', 'submitted')),

  -- Actor (who performed the action)
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  actor_role VARCHAR(50) NOT NULL,

  -- Action metadata
  comment TEXT,
  rejection_reason TEXT,
  delegated_to UUID REFERENCES auth.users(id),

  -- Timestamp
  action_at TIMESTAMPTZ DEFAULT NOW(),

  -- Security audit fields
  ip_address INET,
  user_agent TEXT
);

-- Indexes
CREATE INDEX idx_approval_actions_approval ON approval_actions(expense_approval_id);
CREATE INDEX idx_approval_actions_actor ON approval_actions(actor_id);
CREATE INDEX idx_approval_actions_timestamp ON approval_actions(action_at DESC);

-- RLS Policies
ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view actions for their own submissions"
  ON approval_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expense_approvals ea
      LEFT JOIN expenses e ON ea.expense_id = e.id
      LEFT JOIN expense_reports er ON ea.report_id = er.id
      WHERE ea.id = approval_actions.expense_approval_id
      AND (e.user_id = auth.uid() OR er.user_id = auth.uid())
    )
  );

CREATE POLICY "Approvers can view actions for approvals they're involved in"
  ON approval_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expense_approvals ea
      WHERE ea.id = approval_actions.expense_approval_id
      AND ea.current_approver_id = auth.uid()
    )
  );

CREATE POLICY "Finance and Admin can view all approval actions"
  ON approval_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expense_approvals ea
      JOIN organization_members om ON om.organization_id = ea.organization_id
      WHERE ea.id = approval_actions.expense_approval_id
      AND om.user_id = auth.uid()
      AND om.role IN ('finance', 'admin')
    )
  );

CREATE POLICY "Users can insert approval actions for their actions"
  ON approval_actions FOR INSERT
  WITH CHECK (actor_id = auth.uid());

-- ============================================================================
-- 5. APPROVAL_DELEGATIONS TABLE (Phase 2 - Future)
-- ============================================================================
-- Support temporary delegation for out-of-office approvers

CREATE TABLE IF NOT EXISTS approval_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Delegation details
  delegator_id UUID NOT NULL REFERENCES auth.users(id),
  delegate_id UUID NOT NULL REFERENCES auth.users(id),

  -- Time period
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Reason
  reason TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT valid_delegation_period CHECK (end_date >= start_date),
  CONSTRAINT no_self_delegation CHECK (delegator_id != delegate_id)
);

-- Indexes
CREATE INDEX idx_approval_delegations_delegator ON approval_delegations(delegator_id);
CREATE INDEX idx_approval_delegations_active ON approval_delegations(is_active, start_date, end_date);

-- RLS Policies
ALTER TABLE approval_delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own delegations"
  ON approval_delegations FOR ALL
  USING (delegator_id = auth.uid() OR delegate_id = auth.uid());

CREATE POLICY "Admins can view all delegations"
  ON approval_delegations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = approval_delegations.organization_id
      AND role = 'admin'
    )
  );

-- ============================================================================
-- 6. MODIFY EXISTING TABLES
-- ============================================================================

-- Add approval tracking fields to expenses table
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES expense_approvals(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add approval tracking fields to expense_reports table
ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES expense_approvals(id);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to create default approval workflows for new organizations
CREATE OR REPLACE FUNCTION create_default_approval_workflows(p_organization_id UUID)
RETURNS VOID AS $$
DECLARE
  v_workflow_small UUID;
  v_workflow_medium UUID;
  v_workflow_large UUID;
BEGIN
  -- Workflow 1: Small expenses ($0 - $500) - Manager approval only
  INSERT INTO approval_workflows (organization_id, name, description, conditions, priority, is_active)
  VALUES (
    p_organization_id,
    'Small Expenses ($0-$500)',
    'Manager approval for expenses under $500',
    '{"amount_min": 0, "amount_max": 500}'::jsonb,
    1,
    true
  )
  RETURNING id INTO v_workflow_small;

  INSERT INTO approval_steps (workflow_id, step_order, step_type, approver_role)
  VALUES (v_workflow_small, 1, 'manager', 'manager');

  -- Workflow 2: Medium expenses ($501 - $1,000) - Manager + Finance approval
  INSERT INTO approval_workflows (organization_id, name, description, conditions, priority, is_active)
  VALUES (
    p_organization_id,
    'Medium Expenses ($501-$1,000)',
    'Manager and Finance approval for expenses $501-$1,000',
    '{"amount_min": 501, "amount_max": 1000}'::jsonb,
    2,
    true
  )
  RETURNING id INTO v_workflow_medium;

  INSERT INTO approval_steps (workflow_id, step_order, step_type, approver_role)
  VALUES
    (v_workflow_medium, 1, 'manager', 'manager'),
    (v_workflow_medium, 2, 'role', 'finance');

  -- Workflow 3: Large expenses ($1,001+) - Manager + Finance + Admin approval
  INSERT INTO approval_workflows (organization_id, name, description, conditions, priority, is_active)
  VALUES (
    p_organization_id,
    'Large Expenses ($1,001+)',
    'Manager, Finance, and Admin approval for expenses over $1,000',
    '{"amount_min": 1001}'::jsonb,
    3,
    true
  )
  RETURNING id INTO v_workflow_large;

  INSERT INTO approval_steps (workflow_id, step_order, step_type, approver_role)
  VALUES
    (v_workflow_large, 1, 'manager', 'manager'),
    (v_workflow_large, 2, 'role', 'finance'),
    (v_workflow_large, 3, 'role', 'admin');

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default workflows when new organization is created
CREATE OR REPLACE FUNCTION trigger_create_default_workflows()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_default_approval_workflows(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_organization_created_create_workflows ON organizations;
CREATE TRIGGER on_organization_created_create_workflows
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_default_workflows();

-- ============================================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE approval_workflows IS 'Admin-configured approval workflow rules that define when and how expenses/reports should be approved';
COMMENT ON TABLE approval_steps IS 'Individual steps within each approval workflow, defining the sequence of approvers';
COMMENT ON TABLE expense_approvals IS 'Tracks the current approval status and progress for each expense or report';
COMMENT ON TABLE approval_actions IS 'Complete audit trail of all approval/rejection actions for compliance and transparency';
COMMENT ON TABLE approval_delegations IS 'Temporary delegation of approval authority for out-of-office scenarios (Phase 2)';

COMMENT ON COLUMN approval_workflows.conditions IS 'JSONB field storing trigger conditions (e.g., {"amount_min": 500, "amount_max": 1000, "categories": ["Airfare"]})';
COMMENT ON COLUMN approval_workflows.priority IS 'Higher priority workflows are selected first when multiple workflows match the same expense';
COMMENT ON COLUMN approval_steps.step_type IS 'Determines how approver is selected: manager (direct manager), role (by role name), specific_user (specific person), department_owner';
COMMENT ON COLUMN expense_approvals.current_step IS 'The current step number in the approval chain (1-indexed)';
COMMENT ON COLUMN expense_approvals.status IS 'Approval status: pending (awaiting approval), approved (all steps approved), rejected (any step rejected), cancelled (withdrawn by submitter)';
