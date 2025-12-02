-- =============================================================================
-- FIX: Organization Members RLS Infinite Recursion (Final Fix)
-- Date: 2025-12-01
-- =============================================================================
-- This migration fixes the infinite recursion error (42P17) in organization_members
-- RLS policies by using SECURITY DEFINER functions that bypass RLS.
-- =============================================================================

-- Drop all existing policies on organization_members (clean slate)
DROP POLICY IF EXISTS "Members can view all organization members" ON organization_members;
DROP POLICY IF EXISTS "Admins can update organization members" ON organization_members;
DROP POLICY IF EXISTS "Admins can delete organization members" ON organization_members;
DROP POLICY IF EXISTS "Members added via secure functions only" ON organization_members;
DROP POLICY IF EXISTS "Users can view own memberships" ON organization_members;
DROP POLICY IF EXISTS "Admins can insert members" ON organization_members;
DROP POLICY IF EXISTS "om_select_own_row" ON organization_members;
DROP POLICY IF EXISTS "om_select_org_members" ON organization_members;
DROP POLICY IF EXISTS "om_insert_by_admin" ON organization_members;
DROP POLICY IF EXISTS "om_update_by_admin" ON organization_members;
DROP POLICY IF EXISTS "om_delete_by_admin" ON organization_members;

-- =============================================================================
-- SECURITY DEFINER HELPER FUNCTIONS (bypass RLS for internal checks)
-- =============================================================================

-- Function to get user's organization IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_organization_ids(p_user_id UUID)
RETURNS UUID[]
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(organization_id), ARRAY[]::UUID[])
  FROM organization_members
  WHERE user_id = p_user_id AND is_active = true;
$$;

-- Function to check if user is member of an organization (bypasses RLS)
CREATE OR REPLACE FUNCTION is_member_of_org(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = p_user_id
      AND organization_id = p_org_id
      AND is_active = true
  );
$$;

-- Function to check if user is admin of an organization (bypasses RLS)
CREATE OR REPLACE FUNCTION is_admin_of_org(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = p_user_id
      AND organization_id = p_org_id
      AND role = 'admin'
      AND is_active = true
  );
$$;

-- =============================================================================
-- NON-RECURSIVE POLICIES FOR organization_members
-- =============================================================================

-- SELECT: Users can see all members of orgs they belong to
-- Uses SECURITY DEFINER function to avoid recursion
CREATE POLICY "om_select_org_members"
ON organization_members FOR SELECT
TO authenticated
USING (
  organization_id = ANY(get_user_organization_ids(auth.uid()))
);

-- INSERT: Only via secure admin functions or self-registration
CREATE POLICY "om_insert_by_admin"
ON organization_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()  -- Users can only insert their own membership
  OR is_admin_of_org(auth.uid(), organization_id)  -- Or admin of the org
);

-- UPDATE: Only admins can update (using SECURITY DEFINER function)
CREATE POLICY "om_update_by_admin"
ON organization_members FOR UPDATE
TO authenticated
USING (is_admin_of_org(auth.uid(), organization_id))
WITH CHECK (is_admin_of_org(auth.uid(), organization_id));

-- DELETE: Only admins can delete (and cannot delete themselves)
CREATE POLICY "om_delete_by_admin"
ON organization_members FOR DELETE
TO authenticated
USING (
  is_admin_of_org(auth.uid(), organization_id)
  AND user_id != auth.uid()  -- Cannot delete own admin role
);

-- =============================================================================
-- Grant permissions
-- =============================================================================
GRANT EXECUTE ON FUNCTION get_user_organization_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_member_of_org(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_of_org(UUID, UUID) TO authenticated;

-- =============================================================================
-- DONE
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Organization Members RLS Recursion Fix Applied!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Policies created:';
  RAISE NOTICE '  - om_select_org_members (SELECT)';
  RAISE NOTICE '  - om_insert_by_admin (INSERT)';
  RAISE NOTICE '  - om_update_by_admin (UPDATE)';
  RAISE NOTICE '  - om_delete_by_admin (DELETE)';
  RAISE NOTICE 'Helper functions (SECURITY DEFINER):';
  RAISE NOTICE '  - get_user_organization_ids(UUID)';
  RAISE NOTICE '  - is_member_of_org(UUID, UUID)';
  RAISE NOTICE '  - is_admin_of_org(UUID, UUID)';
  RAISE NOTICE '========================================';
END $$;
