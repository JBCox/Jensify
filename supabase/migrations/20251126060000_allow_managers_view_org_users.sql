-- Migration: Allow managers to view organization users
-- Required for approval queue to show submitter names

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Finance and admin can view organization users" ON users;

-- Create updated policy that includes managers
CREATE POLICY "Manager finance admin can view organization users"
ON users FOR SELECT
USING (
  auth.uid() = id  -- Users can always see themselves
  OR EXISTS (
    SELECT 1 FROM organization_members om1
    WHERE om1.user_id = auth.uid()
    AND om1.role IN ('manager', 'finance', 'admin')  -- Include managers
    AND om1.is_active = true
    AND EXISTS (
      SELECT 1 FROM organization_members om2
      WHERE om2.user_id = users.id
      AND om2.organization_id = om1.organization_id
      AND om2.is_active = true
    )
  )
);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
