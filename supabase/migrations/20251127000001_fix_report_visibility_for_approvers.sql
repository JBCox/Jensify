-- Allow approvers to view the reports they need to approve
CREATE POLICY "Approvers can view reports they are approving"
  ON expense_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expense_approvals ea
      WHERE ea.report_id = expense_reports.id
      AND ea.current_approver_id = auth.uid()
    )
  );

-- Also allow approvers to view the expenses within those reports
CREATE POLICY "Approvers can view expenses in reports they are approving"
  ON expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM report_expenses re
      JOIN expense_reports er ON re.report_id = er.id
      JOIN expense_approvals ea ON ea.report_id = er.id
      WHERE re.expense_id = expenses.id
      AND ea.current_approver_id = auth.uid()
    )
  );
