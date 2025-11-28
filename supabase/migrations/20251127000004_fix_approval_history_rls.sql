-- Fix RLS recursion between expense_approvals and approval_actions
-- and allow approvers to see their history

-- 1. Function to check if user has acted on an approval
CREATE OR REPLACE FUNCTION has_acted_on_approval(p_approval_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM approval_actions
    WHERE expense_approval_id = p_approval_id
    AND actor_id = auth.uid()
  );
END;
$$;

-- 2. Add policy to expense_approvals
-- We don't drop the existing "pending" policy, we just add this one as an OR condition (new policy)
DROP POLICY IF EXISTS "Approvers can view approvals they have acted on" ON expense_approvals;

CREATE POLICY "Approvers can view approvals they have acted on"
  ON expense_approvals FOR SELECT
  USING (has_acted_on_approval(id));
