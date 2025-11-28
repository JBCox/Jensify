-- =============================================
-- Migration: Expense Items (Split Receipt Feature)
-- Date: 2025-11-25
-- Description: Adds expense_items table to support splitting
--              a single receipt into multiple expense categories
-- =============================================

-- Create expense_items table
-- This allows users to split one receipt into multiple line items
-- with different categories (e.g., hotel bill with room + meals)
CREATE TABLE IF NOT EXISTS expense_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Item details
  description TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,

  -- Line ordering
  line_number INTEGER NOT NULL DEFAULT 1,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique line numbers per expense
  UNIQUE (expense_id, line_number)
);

-- Add comment for documentation
COMMENT ON TABLE expense_items IS 'Line items for split expenses - allows one receipt to have multiple categories';
COMMENT ON COLUMN expense_items.description IS 'Description of this line item (e.g., "Room charge", "Room service meal")';
COMMENT ON COLUMN expense_items.amount IS 'Amount for this specific line item';
COMMENT ON COLUMN expense_items.category IS 'Category for this line item (may differ from parent expense)';
COMMENT ON COLUMN expense_items.line_number IS 'Order of items within the expense (1-based)';

-- Create indexes for common queries
CREATE INDEX idx_expense_items_expense_id ON expense_items(expense_id);
CREATE INDEX idx_expense_items_organization_id ON expense_items(organization_id);
CREATE INDEX idx_expense_items_category ON expense_items(category);

-- Add is_split flag to expenses table for easy filtering
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN expenses.is_split IS 'True if expense has been split into multiple line items';

-- Create index for split expenses
CREATE INDEX IF NOT EXISTS idx_expenses_is_split ON expenses(is_split) WHERE is_split = TRUE;

-- =============================================
-- Row Level Security Policies
-- =============================================

ALTER TABLE expense_items ENABLE ROW LEVEL SECURITY;

-- Users can view expense items for expenses they own or manage
CREATE POLICY "Users can view own expense items"
ON expense_items FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
  AND (
    -- Owner of the expense
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_items.expense_id
      AND e.user_id = auth.uid()
    )
    -- Or has manager/finance/admin role
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = expense_items.organization_id
      AND om.role IN ('manager', 'finance', 'admin')
    )
  )
);

-- Users can insert expense items for their own expenses
CREATE POLICY "Users can create own expense items"
ON expense_items FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = expense_items.expense_id
    AND e.user_id = auth.uid()
    AND e.status = 'draft'  -- Only allow adding items to draft expenses
  )
);

-- Users can update expense items for their own draft expenses
CREATE POLICY "Users can update own expense items"
ON expense_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = expense_items.expense_id
    AND e.user_id = auth.uid()
    AND e.status = 'draft'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = expense_items.expense_id
    AND e.user_id = auth.uid()
    AND e.status = 'draft'
  )
);

-- Users can delete expense items for their own draft expenses
CREATE POLICY "Users can delete own expense items"
ON expense_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = expense_items.expense_id
    AND e.user_id = auth.uid()
    AND e.status = 'draft'
  )
);

-- =============================================
-- Trigger Functions
-- =============================================

-- Function to update expense is_split flag when items change
CREATE OR REPLACE FUNCTION update_expense_is_split()
RETURNS TRIGGER AS $$
DECLARE
  item_count INTEGER;
BEGIN
  -- Count items for the expense
  IF TG_OP = 'DELETE' THEN
    SELECT COUNT(*) INTO item_count
    FROM expense_items
    WHERE expense_id = OLD.expense_id;

    UPDATE expenses
    SET is_split = (item_count > 0),
        updated_at = NOW()
    WHERE id = OLD.expense_id;
  ELSE
    SELECT COUNT(*) INTO item_count
    FROM expense_items
    WHERE expense_id = NEW.expense_id;

    UPDATE expenses
    SET is_split = (item_count > 0),
        updated_at = NOW()
    WHERE id = NEW.expense_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update is_split flag
DROP TRIGGER IF EXISTS trg_update_expense_is_split ON expense_items;
CREATE TRIGGER trg_update_expense_is_split
AFTER INSERT OR UPDATE OR DELETE ON expense_items
FOR EACH ROW
EXECUTE FUNCTION update_expense_is_split();

-- Function to validate split amounts match expense total
CREATE OR REPLACE FUNCTION validate_expense_split_total()
RETURNS TRIGGER AS $$
DECLARE
  expense_total DECIMAL(10, 2);
  items_total DECIMAL(10, 2);
BEGIN
  -- Get the expense total
  SELECT amount INTO expense_total
  FROM expenses
  WHERE id = NEW.expense_id;

  -- Calculate sum of all items (including this one)
  SELECT COALESCE(SUM(amount), 0) INTO items_total
  FROM expense_items
  WHERE expense_id = NEW.expense_id
  AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  -- Add the new/updated item amount
  items_total := items_total + NEW.amount;

  -- Validate total doesn't exceed expense amount (allow slight tolerance for rounding)
  IF items_total > expense_total + 0.01 THEN
    RAISE EXCEPTION 'Split items total ($%) exceeds expense total ($%)',
      items_total, expense_total;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate split totals on insert/update
DROP TRIGGER IF EXISTS trg_validate_expense_split_total ON expense_items;
CREATE TRIGGER trg_validate_expense_split_total
BEFORE INSERT OR UPDATE ON expense_items
FOR EACH ROW
EXECUTE FUNCTION validate_expense_split_total();

-- Function to auto-assign line numbers
CREATE OR REPLACE FUNCTION assign_expense_item_line_number()
RETURNS TRIGGER AS $$
DECLARE
  max_line INTEGER;
BEGIN
  -- If line_number not specified or 0, auto-assign next available
  IF NEW.line_number IS NULL OR NEW.line_number = 0 THEN
    SELECT COALESCE(MAX(line_number), 0) + 1 INTO max_line
    FROM expense_items
    WHERE expense_id = NEW.expense_id;

    NEW.line_number := max_line;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign line numbers
DROP TRIGGER IF EXISTS trg_assign_expense_item_line_number ON expense_items;
CREATE TRIGGER trg_assign_expense_item_line_number
BEFORE INSERT ON expense_items
FOR EACH ROW
EXECUTE FUNCTION assign_expense_item_line_number();

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_expense_items_updated_at ON expense_items;
CREATE TRIGGER trg_expense_items_updated_at
BEFORE UPDATE ON expense_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Helper Functions
-- =============================================

-- Function to split an expense into multiple items
CREATE OR REPLACE FUNCTION split_expense(
  p_expense_id UUID,
  p_items JSONB  -- Array of {description, amount, category}
)
RETURNS SETOF expense_items AS $$
DECLARE
  item JSONB;
  expense_record RECORD;
  item_total DECIMAL(10, 2) := 0;
  new_item expense_items%ROWTYPE;
BEGIN
  -- Get expense details
  SELECT * INTO expense_record
  FROM expenses
  WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found: %', p_expense_id;
  END IF;

  -- Validate expense is in draft status
  IF expense_record.status != 'draft' THEN
    RAISE EXCEPTION 'Can only split expenses in draft status';
  END IF;

  -- Validate total
  SELECT SUM((value->>'amount')::DECIMAL) INTO item_total
  FROM jsonb_array_elements(p_items) AS value;

  IF ABS(item_total - expense_record.amount) > 0.01 THEN
    RAISE EXCEPTION 'Split items total ($%) must equal expense total ($%)',
      item_total, expense_record.amount;
  END IF;

  -- Delete existing items
  DELETE FROM expense_items WHERE expense_id = p_expense_id;

  -- Insert new items
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO expense_items (
      expense_id,
      organization_id,
      description,
      amount,
      category
    ) VALUES (
      p_expense_id,
      expense_record.organization_id,
      item->>'description',
      (item->>'amount')::DECIMAL,
      item->>'category'
    )
    RETURNING * INTO new_item;

    RETURN NEXT new_item;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unsplit an expense (remove all items)
CREATE OR REPLACE FUNCTION unsplit_expense(p_expense_id UUID)
RETURNS VOID AS $$
DECLARE
  expense_record RECORD;
BEGIN
  -- Get expense details
  SELECT * INTO expense_record
  FROM expenses
  WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found: %', p_expense_id;
  END IF;

  -- Validate expense is in draft status
  IF expense_record.status != 'draft' THEN
    RAISE EXCEPTION 'Can only unsplit expenses in draft status';
  END IF;

  -- Delete all items
  DELETE FROM expense_items WHERE expense_id = p_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION split_expense(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION unsplit_expense(UUID) TO authenticated;
