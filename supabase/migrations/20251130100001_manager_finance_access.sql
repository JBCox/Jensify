-- =====================================================================================
-- MANAGER FINANCE ACCESS MIGRATION
-- =====================================================================================
-- Adds the ability for managers to optionally access the Finance Dashboard
-- (i.e., process payouts and view finance data)
--
-- Created: 2024-11-30
-- =====================================================================================

-- Add can_access_finance column to organization_members
-- This allows admins to grant finance dashboard access to managers
ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS can_access_finance BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN organization_members.can_access_finance IS
  'When true, allows managers to access the Finance Dashboard for payout processing';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_organization_members_can_access_finance
ON organization_members (organization_id, can_access_finance)
WHERE can_access_finance = true;

-- =====================================================================================
-- FLEXIBLE PERMISSION SUMMARY
-- =====================================================================================
-- The permission system now supports:
--
-- can_manage_expenses (for Finance users):
--   - When true, finance users can approve expenses like managers
--   - They appear in the manager dropdown for employee assignment
--   - They see the Approvals menu
--
-- can_access_finance (for Managers):
--   - When true, managers can access the Finance Dashboard
--   - They can process payouts and view finance data
--   - They see the Finance menu
--
-- This allows for flexible role combinations:
--   - Manager + can_access_finance = Approvals + Finance Dashboard
--   - Finance + can_manage_expenses = Finance Dashboard + Approvals
--   - Admin = Everything (always)
-- =====================================================================================
