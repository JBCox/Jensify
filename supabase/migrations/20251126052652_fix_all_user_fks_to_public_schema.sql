-- Migration: Fix all user foreign keys to reference public.users instead of auth.users
-- This is required for PostgREST to resolve joins in queries
-- Also adds missing expense_count column to expense_reports

-- ============================================
-- 1. approval_actions table
-- ============================================
ALTER TABLE approval_actions DROP CONSTRAINT IF EXISTS approval_actions_actor_id_fkey;
ALTER TABLE approval_actions
  ADD CONSTRAINT approval_actions_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE approval_actions DROP CONSTRAINT IF EXISTS approval_actions_delegated_to_fkey;
ALTER TABLE approval_actions
  ADD CONSTRAINT approval_actions_delegated_to_fkey
  FOREIGN KEY (delegated_to) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 2. expense_approvals table
-- ============================================
ALTER TABLE expense_approvals DROP CONSTRAINT IF EXISTS expense_approvals_current_approver_id_fkey;
ALTER TABLE expense_approvals
  ADD CONSTRAINT expense_approvals_current_approver_id_fkey
  FOREIGN KEY (current_approver_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 3. organization_members table
-- ============================================
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_user_id_fkey;
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_invited_by_fkey;
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 4. invitations table
-- ============================================
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey;
ALTER TABLE invitations
  ADD CONSTRAINT invitations_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_accepted_by_fkey;
ALTER TABLE invitations
  ADD CONSTRAINT invitations_accepted_by_fkey
  FOREIGN KEY (accepted_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 5. expense_reports table
-- ============================================
ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS expense_reports_user_id_fkey;
ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS expense_reports_submitted_by_fkey;
ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS fk_expense_reports_submitted_by;
ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS expense_reports_approved_by_fkey;
ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS fk_expense_reports_approved_by;
ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS expense_reports_rejected_by_fkey;
ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS fk_expense_reports_rejected_by;
ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_rejected_by_fkey
  FOREIGN KEY (rejected_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS expense_reports_paid_by_fkey;
ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS fk_expense_reports_paid_by;
ALTER TABLE expense_reports
  ADD CONSTRAINT expense_reports_paid_by_fkey
  FOREIGN KEY (paid_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Add missing expense_count column
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS expense_count INTEGER DEFAULT 0;

-- ============================================
-- 6. expenses table
-- ============================================
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_approved_by_fkey;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_rejected_by_fkey;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_rejected_by_fkey
  FOREIGN KEY (rejected_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS fk_expenses_reimbursed_by;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_reimbursed_by_fkey;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_reimbursed_by_fkey
  FOREIGN KEY (reimbursed_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 7. mileage_trips table
-- ============================================
ALTER TABLE mileage_trips DROP CONSTRAINT IF EXISTS mileage_trips_user_id_fkey;
ALTER TABLE mileage_trips
  ADD CONSTRAINT mileage_trips_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE mileage_trips DROP CONSTRAINT IF EXISTS mileage_trips_approved_by_fkey;
ALTER TABLE mileage_trips DROP CONSTRAINT IF EXISTS fk_mileage_trips_approved_by;
ALTER TABLE mileage_trips
  ADD CONSTRAINT mileage_trips_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE mileage_trips DROP CONSTRAINT IF EXISTS mileage_trips_rejected_by_fkey;
ALTER TABLE mileage_trips DROP CONSTRAINT IF EXISTS fk_mileage_trips_rejected_by;
ALTER TABLE mileage_trips
  ADD CONSTRAINT mileage_trips_rejected_by_fkey
  FOREIGN KEY (rejected_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 8. report_expenses table
-- ============================================
ALTER TABLE report_expenses DROP CONSTRAINT IF EXISTS report_expenses_added_by_fkey;
ALTER TABLE report_expenses
  ADD CONSTRAINT report_expenses_added_by_fkey
  FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 9. approval_workflows table
-- ============================================
ALTER TABLE approval_workflows DROP CONSTRAINT IF EXISTS approval_workflows_created_by_fkey;
ALTER TABLE approval_workflows
  ADD CONSTRAINT approval_workflows_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 10. approval_steps table
-- ============================================
ALTER TABLE approval_steps DROP CONSTRAINT IF EXISTS approval_steps_approver_user_id_fkey;
ALTER TABLE approval_steps
  ADD CONSTRAINT approval_steps_approver_user_id_fkey
  FOREIGN KEY (approver_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 11. approval_delegations table
-- ============================================
ALTER TABLE approval_delegations DROP CONSTRAINT IF EXISTS approval_delegations_delegator_id_fkey;
ALTER TABLE approval_delegations
  ADD CONSTRAINT approval_delegations_delegator_id_fkey
  FOREIGN KEY (delegator_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE approval_delegations DROP CONSTRAINT IF EXISTS approval_delegations_delegate_id_fkey;
ALTER TABLE approval_delegations
  ADD CONSTRAINT approval_delegations_delegate_id_fkey
  FOREIGN KEY (delegate_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE approval_delegations DROP CONSTRAINT IF EXISTS approval_delegations_created_by_fkey;
ALTER TABLE approval_delegations
  ADD CONSTRAINT approval_delegations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
