-- ============================================================================
-- Jensify Database Schema - Organization Multi-Tenancy
-- Created: 2025-11-15
-- Description: Add organization structure, member roles, and invitation system
-- ============================================================================

-- ============================================================================
-- NEW TABLES
-- ============================================================================

-- Organizations table (top-level tenant)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT, -- Optional: For domain-based auto-join (e.g., "corvaer.com")

  -- Settings
  settings JSONB DEFAULT '{
    "expense_policies": {
      "max_single_receipt": 500,
      "max_daily_total": 750,
      "max_receipt_age_days": 90
    },
    "approval_workflow": {
      "require_manager_approval": true,
      "require_finance_approval": true
    }
  }'::jsonb,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_domain UNIQUE(domain)
);

COMMENT ON TABLE organizations IS 'Top-level tenant organizations (companies)';
COMMENT ON COLUMN organizations.domain IS 'Company email domain for auto-join (optional)';
COMMENT ON COLUMN organizations.settings IS 'Organization-level settings and policies';

-- Organization members (user-org relationship with roles)
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role and permissions
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'finance', 'employee')),

  -- Organizational structure
  manager_id UUID REFERENCES organization_members(id), -- Reports to (approval hierarchy)
  department TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_per_org UNIQUE(organization_id, user_id)
);

COMMENT ON TABLE organization_members IS 'User membership in organizations with roles';
COMMENT ON COLUMN organization_members.role IS 'User role within the organization: admin, manager, finance, employee';
COMMENT ON COLUMN organization_members.manager_id IS 'Reference to manager in approval hierarchy';

-- Invitations table
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Invitation details
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'finance', 'employee')),
  manager_id UUID REFERENCES organization_members(id),
  department TEXT,

  -- Token and expiration
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  accepted_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_invitation_token UNIQUE(token)
);

COMMENT ON TABLE invitations IS 'User invitations to join organizations';
COMMENT ON COLUMN invitations.token IS 'Unique invitation token sent via email';
COMMENT ON COLUMN invitations.expires_at IS 'Invitation expiration date (default: 7 days)';

-- ============================================================================
-- ADD ORGANIZATION_ID TO EXISTING TABLES
-- ============================================================================

-- Add organization_id to users table (keep for backward compatibility with user profiles)
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

COMMENT ON COLUMN users.organization_id IS 'DEPRECATED: Use organization_members table instead. Kept for backward compatibility.';

-- Add organization_id to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

COMMENT ON COLUMN expenses.organization_id IS 'Organization this expense belongs to (tenant isolation)';

-- Add organization_id to receipts table
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

COMMENT ON COLUMN receipts.organization_id IS 'Organization this receipt belongs to (tenant isolation)';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Organizations indexes
CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain) WHERE domain IS NOT NULL;

-- Organization members indexes
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(organization_id, role);
CREATE INDEX IF NOT EXISTS idx_org_members_manager_id ON organization_members(manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_members_active ON organization_members(organization_id, is_active);

-- Invitations indexes
CREATE INDEX IF NOT EXISTS idx_invitations_org_id ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON invitations(expires_at) WHERE status = 'pending';

-- Partial unique index to enforce one pending invitation per email per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_email_per_org
  ON invitations(organization_id, email)
  WHERE status = 'pending';

-- Add organization_id indexes to existing tables
CREATE INDEX IF NOT EXISTS idx_expenses_organization_id ON expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_receipts_organization_id ON receipts(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp on organization tables
CREATE OR REPLACE FUNCTION update_organization_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically expire invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS void AS $$
BEGIN
  UPDATE invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_old_invitations() IS 'Marks pending invitations as expired if past expiration date';

-- Function to create organization member when invitation is accepted
CREATE OR REPLACE FUNCTION accept_invitation(
  p_token UUID,
  p_user_id UUID
)
RETURNS organization_members AS $$
DECLARE
  v_invitation invitations;
  v_member organization_members;
BEGIN
  -- Get invitation
  SELECT * INTO v_invitation
  FROM invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation token';
  END IF;

  -- Create organization member
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role,
    manager_id,
    department,
    invited_by
  ) VALUES (
    v_invitation.organization_id,
    p_user_id,
    v_invitation.role,
    v_invitation.manager_id,
    v_invitation.department,
    v_invitation.invited_by
  ) RETURNING * INTO v_member;

  -- Mark invitation as accepted
  UPDATE invitations
  SET status = 'accepted',
      accepted_by = p_user_id,
      accepted_at = NOW()
  WHERE id = v_invitation.id;

  RETURN v_member;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION accept_invitation(UUID, UUID) IS 'Accepts an invitation and creates organization membership';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Drop triggers if they exist (for idempotency)
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
DROP TRIGGER IF EXISTS update_org_members_updated_at ON organization_members;

-- Trigger to update updated_at on organizations table
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_organization_updated_at();

-- Trigger to update updated_at on organization_members table
CREATE TRIGGER update_org_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION update_organization_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Members can view their organizations" ON organizations;
DROP POLICY IF EXISTS "Admins can update their organizations" ON organizations;
DROP POLICY IF EXISTS "Users can view their organization memberships" ON organization_members;
DROP POLICY IF EXISTS "Admins can manage organization members" ON organization_members;
DROP POLICY IF EXISTS "Users can view invitations sent to their email" ON invitations;
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;

-- ============================================================================
-- ORGANIZATIONS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Members can view their organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "Admins can update their organizations"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'admin'
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "Admins can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (true); -- Any authenticated user can create an org (they become admin)

-- ============================================================================
-- ORGANIZATION_MEMBERS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view their organization memberships"
  ON organization_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM organization_members AS om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'manager', 'finance')
        AND om.is_active = true
    )
  );

CREATE POLICY "Admins can manage organization members"
  ON organization_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members AS om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.is_active = true
    )
  );

-- ============================================================================
-- INVITATIONS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view invitations sent to their email"
  ON invitations FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = invitations.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'manager')
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "Admins can manage invitations"
  ON invitations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = invitations.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'admin'
        AND organization_members.is_active = true
    )
  );

-- ============================================================================
-- UPDATE EXISTING RLS POLICIES FOR ORGANIZATION ISOLATION
-- ============================================================================

-- Drop old expense policies
DROP POLICY IF EXISTS "Employees can view own expenses" ON expenses;
DROP POLICY IF EXISTS "Finance can view all expenses" ON expenses;
DROP POLICY IF EXISTS "Employees can create own expenses" ON expenses;
DROP POLICY IF EXISTS "Employees can update own draft expenses" ON expenses;
DROP POLICY IF EXISTS "Finance can update expenses" ON expenses;
DROP POLICY IF EXISTS "Employees can delete own draft expenses" ON expenses;

-- New expense policies with organization isolation
CREATE POLICY "Users can view own expenses in their organization"
  ON expenses FOR SELECT
  USING (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Managers and Finance can view all expenses in their organization"
  ON expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = expenses.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'manager', 'finance')
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "Users can create expenses in their organization"
  ON expenses FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can update own draft expenses in their organization"
  ON expenses FOR UPDATE
  USING (
    user_id = auth.uid()
    AND status = 'draft'
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Managers and Finance can update expenses in their organization"
  ON expenses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = expenses.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'manager', 'finance')
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "Users can delete own draft expenses"
  ON expenses FOR DELETE
  USING (
    user_id = auth.uid()
    AND status = 'draft'
  );

-- Drop old receipt policies
DROP POLICY IF EXISTS "Users can view own receipts" ON receipts;
DROP POLICY IF EXISTS "Finance can view all receipts" ON receipts;
DROP POLICY IF EXISTS "Users can create own receipts" ON receipts;
DROP POLICY IF EXISTS "Users can update own receipts" ON receipts;
DROP POLICY IF EXISTS "Users can delete own receipts" ON receipts;

-- New receipt policies with organization isolation
CREATE POLICY "Users can view own receipts in their organization"
  ON receipts FOR SELECT
  USING (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Managers and Finance can view all receipts in their organization"
  ON receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = receipts.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'manager', 'finance')
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "Users can create receipts in their organization"
  ON receipts FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can update own receipts in their organization"
  ON receipts FOR UPDATE
  USING (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can delete own receipts"
  ON receipts FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- DATA MIGRATION: Create default organization for existing data
-- ============================================================================

DO $$
DECLARE
  v_default_org_id UUID;
  v_user_record RECORD;
BEGIN
  -- Check if there are any existing users
  IF EXISTS (SELECT 1 FROM users LIMIT 1) THEN

    RAISE NOTICE 'Migrating existing data to default organization...';

    -- Create default organization
    INSERT INTO organizations (name, domain, created_at)
    VALUES ('Default Organization', NULL, NOW())
    RETURNING id INTO v_default_org_id;

    RAISE NOTICE 'Created default organization: %', v_default_org_id;

    -- Update all existing expenses and receipts with organization_id
    UPDATE expenses SET organization_id = v_default_org_id WHERE organization_id IS NULL;
    UPDATE receipts SET organization_id = v_default_org_id WHERE organization_id IS NULL;
    UPDATE users SET organization_id = v_default_org_id WHERE organization_id IS NULL;

    -- Create organization_members for all existing users
    FOR v_user_record IN SELECT id, role, manager_id, department FROM users LOOP
      INSERT INTO organization_members (
        organization_id,
        user_id,
        role,
        manager_id,
        department,
        is_active
      ) VALUES (
        v_default_org_id,
        v_user_record.id,
        v_user_record.role,
        NULL, -- Will need to be mapped manually if needed
        v_user_record.department,
        true
      ) ON CONFLICT (organization_id, user_id) DO NOTHING;
    END LOOP;

    RAISE NOTICE 'Migrated all existing users to default organization';

  ELSE
    RAISE NOTICE 'No existing users found. Skipping data migration.';
  END IF;
END $$;

-- ============================================================================
-- MAKE ORGANIZATION_ID REQUIRED FOR NEW RECORDS
-- ============================================================================

-- Note: We're not making organization_id NOT NULL immediately to allow for gradual migration
-- In production, after all data is migrated, you can run:
-- ALTER TABLE expenses ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE receipts ALTER COLUMN organization_id SET NOT NULL;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Organization Multi-Tenancy Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'New tables created:';
  RAISE NOTICE '  - organizations';
  RAISE NOTICE '  - organization_members';
  RAISE NOTICE '  - invitations';
  RAISE NOTICE '';
  RAISE NOTICE 'Updated tables:';
  RAISE NOTICE '  - expenses (added organization_id)';
  RAISE NOTICE '  - receipts (added organization_id)';
  RAISE NOTICE '  - users (added organization_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies: Updated with organization isolation';
  RAISE NOTICE 'Indexes: Created for optimal performance';
  RAISE NOTICE 'Functions: Invitation acceptance ready';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Update frontend services to use organization context';
  RAISE NOTICE '2. Create organization setup wizard UI';
  RAISE NOTICE '3. Implement invitation system UI';
  RAISE NOTICE '4. Test organization isolation thoroughly';
  RAISE NOTICE '========================================';
END $$;
