-- Migration: Add PostgreSQL function for batch reordering report expenses
-- Created: 2025-11-21
-- Purpose: Optimize reorderExpenses() method - converts N queries into 1 query
--
-- Performance Impact:
-- - Before: N UPDATE queries (one per expense)
-- - After: 1 UPDATE query (batch operation)
-- - Example: Reordering 100 expenses = 100x fewer database round trips

-- Drop function if it exists (for idempotent migrations)
DROP FUNCTION IF EXISTS reorder_report_expenses(uuid, text[]);

-- Create the batch reorder function
CREATE OR REPLACE FUNCTION reorder_report_expenses(
  p_report_id uuid,
  p_expense_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update display_order for all expenses in a single query
  -- Uses UNNEST to create a temporary table from arrays
  UPDATE report_expenses re
  SET display_order = new_order.idx
  FROM (
    SELECT
      unnest(p_expense_ids::uuid[]) AS expense_id,
      generate_series(0, array_length(p_expense_ids, 1) - 1) AS idx
  ) AS new_order
  WHERE re.report_id = p_report_id
    AND re.expense_id = new_order.expense_id;

  -- Verify all expenses were updated
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No expenses found to reorder for report %', p_report_id;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION reorder_report_expenses(uuid, text[]) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION reorder_report_expenses IS
  'Batch updates display_order for multiple report expenses in a single query. Optimizes N+1 query pattern.';
