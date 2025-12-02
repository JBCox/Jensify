-- =====================================================================================
-- FINANCE MANAGER RIGHTS MIGRATION
-- =====================================================================================
-- Adds the ability for finance users to optionally have manager rights
-- (i.e., employees can report to them for expense approvals)
--
-- Created: 2024-11-30
-- =====================================================================================

-- Add can_manage_expenses column to organization_members
-- This allows admins to grant manager capabilities to finance users
ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS can_manage_expenses BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN organization_members.can_manage_expenses IS
  'When true, allows finance users to act as managers for expense approvals (employees can report to them)';

-- Create index for efficient filtering of users who can manage expenses
CREATE INDEX IF NOT EXISTS idx_organization_members_can_manage
ON organization_members (organization_id, can_manage_expenses)
WHERE can_manage_expenses = true;

-- =====================================================================================
-- UPDATE HELPER FUNCTION to include can_manage_expenses in context
-- =====================================================================================

-- Update the get_user_organization_context function to include the new field
-- (Note: The existing function will automatically include it since it uses SELECT *)
