-- Delegation/Proxy Submission Migration
-- Allows users to delegate expense submission to assistants or submit on behalf of others

-- =============================================================================
-- DELEGATION TABLE
-- =============================================================================

-- Table to track delegation relationships
CREATE TABLE IF NOT EXISTS expense_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Who is delegating (the employee whose expenses will be submitted)
  delegator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Who receives the delegation (the assistant/delegate)
  delegate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Delegation scope
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'create', 'submit', 'view')),
  -- 'all' - Full access: create, submit, and view expenses
  -- 'create' - Can create drafts only
  -- 'submit' - Can create and submit expenses
  -- 'view' - View only, no modification

  -- Time bounds (optional)
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT now(),
  valid_until TIMESTAMP WITH TIME ZONE, -- NULL = no expiration

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Notes
  notes TEXT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES users(id),

  -- Ensure unique active delegation per pair
  CONSTRAINT unique_active_delegation UNIQUE (delegator_id, delegate_id, organization_id)
);

-- =============================================================================
-- EXPENSE SUBMISSION TRACKING
-- =============================================================================

-- Add delegation fields to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS submitted_on_behalf_of UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS delegation_id UUID REFERENCES expense_delegations(id);

-- Add similar fields to mileage_trips
ALTER TABLE mileage_trips
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS submitted_on_behalf_of UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS delegation_id UUID REFERENCES expense_delegations(id);

-- Add to expense_reports
ALTER TABLE expense_reports
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS submitted_on_behalf_of UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS delegation_id UUID REFERENCES expense_delegations(id);

-- =============================================================================
-- DELEGATION HISTORY/AUDIT
-- =============================================================================

-- Table to track delegation actions for audit purposes
CREATE TABLE IF NOT EXISTS delegation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id UUID NOT NULL REFERENCES expense_delegations(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'revoked', 'expired', 'used'
  actor_id UUID REFERENCES users(id),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to check if a user can act on behalf of another
CREATE OR REPLACE FUNCTION can_act_on_behalf_of(
  p_delegate_id UUID,
  p_delegator_id UUID,
  p_action TEXT DEFAULT 'all'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_delegation BOOLEAN;
BEGIN
  -- Check for valid, active delegation
  SELECT EXISTS (
    SELECT 1
    FROM expense_delegations
    WHERE delegate_id = p_delegate_id
      AND delegator_id = p_delegator_id
      AND is_active = true
      AND (valid_from IS NULL OR valid_from <= now())
      AND (valid_until IS NULL OR valid_until >= now())
      AND (
        scope = 'all'
        OR scope = p_action
        OR (p_action = 'view' AND scope IN ('all', 'create', 'submit'))
        OR (p_action = 'create' AND scope IN ('all', 'submit'))
      )
  ) INTO v_has_delegation;

  RETURN v_has_delegation;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get users I can submit expenses for
CREATE OR REPLACE FUNCTION get_delegators_for_user(p_user_id UUID)
RETURNS TABLE (
  delegator_id UUID,
  delegator_name TEXT,
  delegator_email TEXT,
  scope TEXT,
  valid_until TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.delegator_id,
    u.full_name AS delegator_name,
    u.email AS delegator_email,
    d.scope,
    d.valid_until
  FROM expense_delegations d
  JOIN users u ON d.delegator_id = u.id
  WHERE d.delegate_id = p_user_id
    AND d.is_active = true
    AND (d.valid_from IS NULL OR d.valid_from <= now())
    AND (d.valid_until IS NULL OR d.valid_until >= now())
  ORDER BY u.full_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get my delegates (people who can submit for me)
CREATE OR REPLACE FUNCTION get_delegates_for_user(p_user_id UUID)
RETURNS TABLE (
  delegate_id UUID,
  delegate_name TEXT,
  delegate_email TEXT,
  scope TEXT,
  valid_until TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.delegate_id,
    u.full_name AS delegate_name,
    u.email AS delegate_email,
    d.scope,
    d.valid_until
  FROM expense_delegations d
  JOIN users u ON d.delegate_id = u.id
  WHERE d.delegator_id = p_user_id
    AND d.is_active = true
    AND (d.valid_from IS NULL OR d.valid_from <= now())
    AND (d.valid_until IS NULL OR d.valid_until >= now())
  ORDER BY u.full_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to create or update a delegation
CREATE OR REPLACE FUNCTION create_delegation(
  p_organization_id UUID,
  p_delegator_id UUID,
  p_delegate_id UUID,
  p_scope TEXT DEFAULT 'all',
  p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT now(),
  p_valid_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_delegation_id UUID;
BEGIN
  -- Cannot delegate to yourself
  IF p_delegator_id = p_delegate_id THEN
    RAISE EXCEPTION 'Cannot delegate to yourself';
  END IF;

  -- Insert or update delegation
  INSERT INTO expense_delegations (
    organization_id,
    delegator_id,
    delegate_id,
    scope,
    valid_from,
    valid_until,
    notes,
    created_by,
    is_active
  ) VALUES (
    p_organization_id,
    p_delegator_id,
    p_delegate_id,
    p_scope,
    p_valid_from,
    p_valid_until,
    p_notes,
    p_created_by,
    true
  )
  ON CONFLICT (delegator_id, delegate_id, organization_id)
  DO UPDATE SET
    scope = EXCLUDED.scope,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    notes = EXCLUDED.notes,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_delegation_id;

  -- Log the action
  INSERT INTO delegation_audit_log (delegation_id, action, actor_id, details)
  VALUES (v_delegation_id, 'created', p_created_by, jsonb_build_object(
    'scope', p_scope,
    'valid_until', p_valid_until
  ));

  RETURN v_delegation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke a delegation
CREATE OR REPLACE FUNCTION revoke_delegation(
  p_delegation_id UUID,
  p_revoked_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE expense_delegations
  SET is_active = false,
      updated_at = now()
  WHERE id = p_delegation_id;

  -- Log the action
  INSERT INTO delegation_audit_log (delegation_id, action, actor_id)
  VALUES (p_delegation_id, 'revoked', p_revoked_by);

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TRIGGER: LOG DELEGATION USAGE
-- =============================================================================

-- Trigger to log when delegation is used to create expense
CREATE OR REPLACE FUNCTION log_delegation_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- If expense is being submitted on behalf of someone else
  IF NEW.delegation_id IS NOT NULL AND NEW.submitted_on_behalf_of IS NOT NULL THEN
    INSERT INTO delegation_audit_log (delegation_id, action, actor_id, details)
    VALUES (NEW.delegation_id, 'used', NEW.submitted_by, jsonb_build_object(
      'expense_id', NEW.id,
      'expense_type', TG_TABLE_NAME,
      'on_behalf_of', NEW.submitted_on_behalf_of
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS expense_delegation_usage_trigger ON expenses;
CREATE TRIGGER expense_delegation_usage_trigger
  AFTER INSERT ON expenses
  FOR EACH ROW
  WHEN (NEW.delegation_id IS NOT NULL)
  EXECUTE FUNCTION log_delegation_usage();

DROP TRIGGER IF EXISTS mileage_delegation_usage_trigger ON mileage_trips;
CREATE TRIGGER mileage_delegation_usage_trigger
  AFTER INSERT ON mileage_trips
  FOR EACH ROW
  WHEN (NEW.delegation_id IS NOT NULL)
  EXECUTE FUNCTION log_delegation_usage();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE expense_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegation_audit_log ENABLE ROW LEVEL SECURITY;

-- Delegations: users can see delegations they're part of
CREATE POLICY "Users can view their delegations"
  ON expense_delegations FOR SELECT
  TO authenticated
  USING (
    delegator_id = auth.uid()
    OR delegate_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance')
      AND organization_id = expense_delegations.organization_id
    )
  );

-- Delegations: users can create delegations for themselves, admins for anyone
CREATE POLICY "Users can create their own delegations"
  ON expense_delegations FOR INSERT
  TO authenticated
  WITH CHECK (
    delegator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = expense_delegations.organization_id
    )
  );

-- Delegations: users can update their own delegations
CREATE POLICY "Users can update their delegations"
  ON expense_delegations FOR UPDATE
  TO authenticated
  USING (
    delegator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = expense_delegations.organization_id
    )
  );

-- Delegations: users can delete their own delegations
CREATE POLICY "Users can delete their delegations"
  ON expense_delegations FOR DELETE
  TO authenticated
  USING (
    delegator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = expense_delegations.organization_id
    )
  );

-- Audit log: viewable by participants and admins
CREATE POLICY "Delegation audit viewable by participants"
  ON delegation_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expense_delegations d
      WHERE d.id = delegation_audit_log.delegation_id
      AND (d.delegator_id = auth.uid() OR d.delegate_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance')
    )
  );

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_delegations_delegator
  ON expense_delegations(delegator_id);

CREATE INDEX IF NOT EXISTS idx_delegations_delegate
  ON expense_delegations(delegate_id);

CREATE INDEX IF NOT EXISTS idx_delegations_active
  ON expense_delegations(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_delegations_org
  ON expense_delegations(organization_id);

CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by
  ON expenses(submitted_by);

CREATE INDEX IF NOT EXISTS idx_expenses_on_behalf_of
  ON expenses(submitted_on_behalf_of);

CREATE INDEX IF NOT EXISTS idx_delegation_audit_delegation
  ON delegation_audit_log(delegation_id);

-- =============================================================================
-- HELPER VIEW: EXPENSES WITH DELEGATION INFO
-- =============================================================================

CREATE OR REPLACE VIEW expenses_with_delegation AS
SELECT
  e.*,
  CASE
    WHEN e.submitted_on_behalf_of IS NOT NULL THEN true
    ELSE false
  END AS is_proxy_submission,
  submitter.full_name AS submitter_name,
  submitter.email AS submitter_email,
  behalf_of.full_name AS on_behalf_of_name,
  behalf_of.email AS on_behalf_of_email
FROM expenses e
LEFT JOIN users submitter ON e.submitted_by = submitter.id
LEFT JOIN users behalf_of ON e.submitted_on_behalf_of = behalf_of.id;
