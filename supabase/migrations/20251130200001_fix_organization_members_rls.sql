-- ============================================================================
-- FIX ORGANIZATION MEMBERS RLS POLICY
-- Created: 2024-11-30
-- Issue: The SELECT policy only allowed users to view their own membership,
--        not other members in their organization. This caused User Management
--        to show only 1 member instead of all organization members.
-- ============================================================================

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Users can view own organization memberships" ON organization_members;

-- Create a new policy that allows users to view ALL members of organizations they belong to
-- This is essential for User Management, Manager dropdown selection, approval workflows, etc.
CREATE POLICY "Members can view all organization members"
ON organization_members FOR SELECT
USING (
    -- User can see members if they are an active member of the same organization
    organization_id IN (
        SELECT om.organization_id
        FROM organization_members om
        WHERE om.user_id = auth.uid()
        AND om.is_active = true
    )
);

-- Update the UPDATE policy to allow admins to update any member in their org
-- (not just their own record)
DROP POLICY IF EXISTS "Admins can update organization members" ON organization_members;

CREATE POLICY "Admins can update organization members"
ON organization_members FOR UPDATE
USING (
    -- User is an admin of the organization this member belongs to
    organization_id IN (
        SELECT om.organization_id
        FROM organization_members om
        WHERE om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.is_active = true
    )
);

-- Add a policy allowing admins to delete (deactivate) members
DROP POLICY IF EXISTS "Admins can delete organization members" ON organization_members;

CREATE POLICY "Admins can delete organization members"
ON organization_members FOR DELETE
USING (
    -- User is an admin of the organization
    organization_id IN (
        SELECT om.organization_id
        FROM organization_members om
        WHERE om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.is_active = true
    )
    -- Prevent admin from deleting themselves
    AND user_id != auth.uid()
);

-- Also update the users table policy to allow all organization members to view each other
-- (not just finance/admin). This is needed for the manager dropdown and user display.
DROP POLICY IF EXISTS "Finance and admin can view organization users" ON users;
DROP POLICY IF EXISTS "Users can read own data" ON users;

-- All authenticated users can view other users in their organization
CREATE POLICY "Organization members can view each other"
ON users FOR SELECT
TO authenticated
USING (
    -- User can see their own data
    auth.uid() = id
    OR
    -- User can see others in the same organization
    EXISTS (
        SELECT 1
        FROM organization_members my_member
        JOIN organization_members their_member ON my_member.organization_id = their_member.organization_id
        WHERE my_member.user_id = auth.uid()
        AND their_member.user_id = users.id
        AND my_member.is_active = true
        AND their_member.is_active = true
    )
);
