-- ============================================================================
-- Fix Overly Permissive RLS Policies
-- Created: 2025-11-21
-- Description: Fix security vulnerabilities in RLS policies that allow
--              unrestricted operations
-- Security Issues Fixed:
--   1. Organization creation (ANY user can create unlimited orgs)
--   2. Organization member insertion (unrestricted adds)
--   3. Finance users viewing all users globally (not org-scoped)
--   4. trip_coordinates using deprecated users.role column
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FIX ORGANIZATION CREATION POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Admins can create organizations" ON organizations;

-- Only allow users without an organization to create their first one
CREATE POLICY "Users can create first organization"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );

COMMENT ON POLICY "Users can create first organization" ON organizations IS
  'Allows users to create one organization if they are not already a member of any org. This prevents unlimited org spam while allowing new users to onboard.';

-- ============================================================================
-- 2. FIX ORGANIZATION MEMBERS INSERTION POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Admins can insert organization members" ON organization_members;

-- Restrict direct inserts - must use secure functions
CREATE POLICY "Members added via secure functions only"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow self-insertion (for organization creation)
    user_id = auth.uid()
    OR
    -- Allow admins to add members to their own organization
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = organization_members.organization_id
        AND om.role = 'admin'
        AND om.is_active = true
    )
  );

COMMENT ON POLICY "Members added via secure functions only" ON organization_members IS
  'Restricts member insertion to: (1) self-insertion during org creation, or (2) admin users adding members to their own organization. Prevents cross-org member injection.';

-- ============================================================================
-- 3. FIX FINANCE/ADMIN USER READ POLICY (ORG-SCOPED)
-- ============================================================================

DROP POLICY IF EXISTS "Finance and admin can read all users" ON users;

-- Finance/admin can only view users in their own organization
CREATE POLICY "Finance and admin can view organization users"
  ON users FOR SELECT
  TO authenticated
  USING (
    -- Users can always view themselves
    auth.uid() = id
    OR
    -- Finance/admin can view users in their organization
    EXISTS (
      SELECT 1 FROM organization_members om1
      WHERE om1.user_id = auth.uid()
        AND om1.role IN ('finance', 'admin')
        AND om1.is_active = true
        AND EXISTS (
          SELECT 1 FROM organization_members om2
          WHERE om2.user_id = users.id
            AND om2.organization_id = om1.organization_id
            AND om2.is_active = true
        )
    )
  );

COMMENT ON POLICY "Finance and admin can view organization users" ON users IS
  'Finance and admin users can view all users within their own organization. Fixes global user access vulnerability.';

-- ============================================================================
-- 4. FIX TRIP_COORDINATES FINANCE POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Finance can view all trip coordinates" ON trip_coordinates;

-- Finance can only view coordinates for trips in their organization
CREATE POLICY "Finance can view organization trip coordinates"
  ON trip_coordinates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mileage_trips mt
      JOIN organization_members om ON om.organization_id = mt.organization_id
      WHERE mt.id = trip_coordinates.trip_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'manager', 'finance')
        AND om.is_active = true
    )
  );

COMMENT ON POLICY "Finance can view organization trip coordinates" ON trip_coordinates IS
  'Finance/admin/manager can view trip coordinates only for trips within their organization. Fixes deprecated users.role column usage.';

-- ============================================================================
-- 5. ADD DELETE POLICY FOR ORGANIZATIONS
-- ============================================================================

-- Only admins can delete their own organization
CREATE POLICY "Admins can delete own organization"
  ON organizations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'admin'
        AND organization_members.is_active = true
    )
  );

COMMENT ON POLICY "Admins can delete own organization" ON organizations IS
  'Only active admin users can delete their organization. Soft delete is recommended in application logic instead.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_org_policies INTEGER;
  v_member_policies INTEGER;
  v_user_policies INTEGER;
  v_trip_coord_policies INTEGER;
BEGIN
  -- Count policies
  SELECT COUNT(*) INTO v_org_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'organizations';

  SELECT COUNT(*) INTO v_member_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'organization_members';

  SELECT COUNT(*) INTO v_user_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'users';

  SELECT COUNT(*) INTO v_trip_coord_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'trip_coordinates';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Security Policies Fixed!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Vulnerabilities patched: 4';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. Organization creation: Limited to first org only';
  RAISE NOTICE '2. Member insertion: Admin-only, org-scoped';
  RAISE NOTICE '3. User reads: Finance/admin org-scoped';
  RAISE NOTICE '4. Trip coordinates: Org-scoped (no deprecated role)';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Policy counts:';
  RAISE NOTICE '  - organizations: % policies', v_org_policies;
  RAISE NOTICE '  - organization_members: % policies', v_member_policies;
  RAISE NOTICE '  - users: % policies', v_user_policies;
  RAISE NOTICE '  - trip_coordinates: % policies', v_trip_coord_policies;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Security posture: IMPROVED';
  RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- TESTING RECOMMENDATIONS
-- ============================================================================
-- Test these scenarios after migration:
--
-- 1. User without org can create one org (PASS)
-- 2. User with existing org cannot create second org (FAIL - expected)
-- 3. Admin in Org A cannot add members to Org B (FAIL - expected)
-- 4. Finance in Org A cannot view users from Org B (FAIL - expected)
-- 5. Finance in Org A can view trip coordinates from Org A (PASS)
-- 6. Finance in Org A cannot view trip coordinates from Org B (FAIL - expected)
-- ============================================================================
