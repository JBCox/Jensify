-- Fix RLS recursion by using SECURITY DEFINER functions

-- 1. Function to check if user is an approver for a report
CREATE OR REPLACE FUNCTION is_approver_for_report(p_report_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM expense_approvals
    WHERE report_id = p_report_id
    AND current_approver_id = auth.uid()
  );
END;
$$;

-- 2. Function to check if user is an approver for an expense
CREATE OR REPLACE FUNCTION is_approver_for_expense(p_expense_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM expense_approvals
    WHERE expense_id = p_expense_id
    AND current_approver_id = auth.uid()
  );
END;
$$;

-- 3. Drop the recursive policies
DROP POLICY IF EXISTS "Approvers can view reports they are approving" ON expense_reports;
DROP POLICY IF EXISTS "Approvers can view expenses in reports they are approving" ON expenses;

-- 4. Re-create policies using the secure functions
CREATE POLICY "Approvers can view reports they are approving"
  ON expense_reports FOR SELECT
  USING (is_approver_for_report(id));

-- For expenses, we need to handle both direct expense approvals and report-based approvals
CREATE POLICY "Approvers can view expenses they are approving"
  ON expenses FOR SELECT
  USING (
    -- Direct expense approval
    is_approver_for_expense(id)
    OR
    -- Expense part of a report being approved
    EXISTS (
      SELECT 1 FROM report_expenses re
      WHERE re.expense_id = id
      AND is_approver_for_report(re.report_id)
    )
  );
