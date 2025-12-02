-- Plaid Credit Card Transaction Import Migration
-- Allows users to link bank accounts and import credit card transactions

-- =============================================================================
-- PLAID LINKED ACCOUNTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Plaid identifiers
  plaid_item_id TEXT NOT NULL, -- Unique Plaid item ID
  plaid_access_token TEXT NOT NULL, -- Encrypted access token

  -- Institution info
  institution_id TEXT,
  institution_name TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reauth', 'disconnected', 'error')),
  error_code TEXT,
  error_message TEXT,

  -- Sync info
  last_sync_at TIMESTAMP WITH TIME ZONE,
  next_sync_at TIMESTAMP WITH TIME ZONE,
  sync_cursor TEXT, -- For incremental transaction sync

  -- Consent
  consent_expires_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT unique_plaid_item UNIQUE (plaid_item_id)
);

-- =============================================================================
-- LINKED ACCOUNTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS linked_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id UUID NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Plaid account identifiers
  plaid_account_id TEXT NOT NULL,

  -- Account info
  account_name TEXT NOT NULL,
  account_mask TEXT, -- Last 4 digits
  account_type TEXT, -- credit, depository, loan, etc.
  account_subtype TEXT, -- credit card, checking, savings, etc.

  -- Settings
  is_enabled BOOLEAN DEFAULT true, -- Import transactions from this account
  auto_create_expense BOOLEAN DEFAULT false, -- Auto-create draft expenses
  default_category TEXT, -- Default category for imported transactions

  -- Balances (from last sync)
  current_balance DECIMAL(12, 2),
  available_balance DECIMAL(12, 2),
  credit_limit DECIMAL(12, 2),
  currency_code TEXT DEFAULT 'USD',

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT unique_linked_account UNIQUE (plaid_account_id)
);

-- =============================================================================
-- IMPORTED TRANSACTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS imported_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_account_id UUID NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Plaid transaction identifiers
  plaid_transaction_id TEXT NOT NULL,
  plaid_pending_transaction_id TEXT, -- For pending transactions

  -- Transaction details
  merchant_name TEXT,
  transaction_name TEXT NOT NULL, -- Full description from bank
  amount DECIMAL(12, 2) NOT NULL, -- Positive = expense, negative = refund
  currency_code TEXT DEFAULT 'USD',
  transaction_date DATE NOT NULL,
  authorized_date DATE,
  posted_date DATE,

  -- Categorization (from Plaid)
  plaid_category TEXT[],
  plaid_category_id TEXT,
  plaid_personal_finance_category JSONB,

  -- Location
  merchant_address TEXT,
  merchant_city TEXT,
  merchant_region TEXT,
  merchant_postal_code TEXT,
  merchant_country TEXT,
  merchant_lat DECIMAL(10, 6),
  merchant_lon DECIMAL(10, 6),

  -- Status
  is_pending BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'matched', 'converted', 'ignored', 'duplicate')),

  -- Matching
  matched_expense_id UUID REFERENCES expenses(id), -- Matched to existing expense
  created_expense_id UUID REFERENCES expenses(id), -- Created new expense

  -- Manual review
  needs_review BOOLEAN DEFAULT false,
  review_notes TEXT,

  -- Raw data
  raw_data JSONB,

  -- Audit
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT unique_plaid_transaction UNIQUE (plaid_transaction_id)
);

-- =============================================================================
-- TRANSACTION RULES
-- =============================================================================

-- Rules for auto-categorizing imported transactions
CREATE TABLE IF NOT EXISTS transaction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Rule name
  name TEXT NOT NULL,
  description TEXT,

  -- Matching criteria (any matching = apply rule)
  match_merchant_contains TEXT[], -- Merchant name contains any of these
  match_merchant_exact TEXT[], -- Merchant name equals any of these
  match_category TEXT[], -- Plaid category matches any of these
  match_amount_min DECIMAL(12, 2),
  match_amount_max DECIMAL(12, 2),

  -- Actions
  set_category TEXT, -- Override category
  set_is_reimbursable BOOLEAN,
  auto_create_expense BOOLEAN DEFAULT false,
  mark_as_ignored BOOLEAN DEFAULT false,

  -- Priority (lower = higher priority)
  priority INT DEFAULT 100,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Match transaction to existing expense
CREATE OR REPLACE FUNCTION match_transaction_to_expense(
  p_transaction_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_tx RECORD;
  v_expense_id UUID;
BEGIN
  -- Get transaction details
  SELECT * INTO v_tx
  FROM imported_transactions
  WHERE id = p_transaction_id;

  IF v_tx IS NULL THEN
    RETURN NULL;
  END IF;

  -- Try to match by amount and date (within 3 days)
  SELECT e.id INTO v_expense_id
  FROM expenses e
  WHERE e.organization_id = v_tx.organization_id
    AND e.user_id = v_tx.user_id
    AND ABS(e.amount - v_tx.amount) < 0.01
    AND ABS(e.expense_date::DATE - v_tx.transaction_date) <= 3
    AND (
      UPPER(e.merchant) LIKE '%' || UPPER(COALESCE(v_tx.merchant_name, v_tx.transaction_name)) || '%'
      OR UPPER(COALESCE(v_tx.merchant_name, v_tx.transaction_name)) LIKE '%' || UPPER(e.merchant) || '%'
    )
  ORDER BY ABS(e.expense_date::DATE - v_tx.transaction_date)
  LIMIT 1;

  IF v_expense_id IS NOT NULL THEN
    UPDATE imported_transactions
    SET
      status = 'matched',
      matched_expense_id = v_expense_id,
      processed_at = now()
    WHERE id = p_transaction_id;
  END IF;

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply transaction rules
CREATE OR REPLACE FUNCTION apply_transaction_rules(
  p_transaction_id UUID
)
RETURNS TABLE (
  rule_id UUID,
  rule_name TEXT,
  category TEXT,
  is_reimbursable BOOLEAN,
  auto_create BOOLEAN,
  mark_ignored BOOLEAN
) AS $$
DECLARE
  v_tx RECORD;
BEGIN
  -- Get transaction details
  SELECT * INTO v_tx
  FROM imported_transactions
  WHERE id = p_transaction_id;

  IF v_tx IS NULL THEN
    RETURN;
  END IF;

  -- Find matching rules
  RETURN QUERY
  SELECT
    r.id AS rule_id,
    r.name AS rule_name,
    r.set_category AS category,
    r.set_is_reimbursable AS is_reimbursable,
    r.auto_create_expense AS auto_create,
    r.mark_as_ignored AS mark_ignored
  FROM transaction_rules r
  WHERE r.organization_id = v_tx.organization_id
    AND r.is_active = true
    AND (
      -- Match merchant contains
      (r.match_merchant_contains IS NOT NULL AND
       EXISTS (SELECT 1 FROM unnest(r.match_merchant_contains) m
               WHERE UPPER(COALESCE(v_tx.merchant_name, v_tx.transaction_name)) LIKE '%' || UPPER(m) || '%'))
      OR
      -- Match merchant exact
      (r.match_merchant_exact IS NOT NULL AND
       UPPER(COALESCE(v_tx.merchant_name, '')) = ANY(SELECT UPPER(m) FROM unnest(r.match_merchant_exact) m))
      OR
      -- Match amount range
      (r.match_amount_min IS NOT NULL AND r.match_amount_max IS NOT NULL AND
       v_tx.amount BETWEEN r.match_amount_min AND r.match_amount_max)
    )
  ORDER BY r.priority ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Convert transaction to expense
CREATE OR REPLACE FUNCTION convert_transaction_to_expense(
  p_transaction_id UUID,
  p_category TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_tx RECORD;
  v_expense_id UUID;
  v_category TEXT;
BEGIN
  -- Get transaction details
  SELECT * INTO v_tx
  FROM imported_transactions
  WHERE id = p_transaction_id;

  IF v_tx IS NULL OR v_tx.status = 'converted' THEN
    RETURN NULL;
  END IF;

  -- Determine category
  v_category := COALESCE(p_category, v_tx.plaid_category[1], 'miscellaneous');

  -- Create expense
  INSERT INTO expenses (
    organization_id,
    user_id,
    merchant,
    amount,
    currency,
    category,
    expense_date,
    notes,
    status,
    is_reimbursable
  ) VALUES (
    v_tx.organization_id,
    v_tx.user_id,
    COALESCE(v_tx.merchant_name, v_tx.transaction_name),
    ABS(v_tx.amount), -- Expenses are positive
    v_tx.currency_code,
    v_category,
    v_tx.transaction_date,
    COALESCE(p_notes, 'Imported from ' || (SELECT account_name FROM linked_accounts WHERE id = v_tx.linked_account_id)),
    'draft',
    true
  )
  RETURNING id INTO v_expense_id;

  -- Update transaction
  UPDATE imported_transactions
  SET
    status = 'converted',
    created_expense_id = v_expense_id,
    processed_at = now()
  WHERE id = p_transaction_id;

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get import statistics
CREATE OR REPLACE FUNCTION get_import_stats(
  p_organization_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_transactions BIGINT,
  new_count BIGINT,
  matched_count BIGINT,
  converted_count BIGINT,
  ignored_count BIGINT,
  total_amount DECIMAL(12, 2),
  converted_amount DECIMAL(12, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_transactions,
    COUNT(CASE WHEN status = 'new' THEN 1 END)::BIGINT AS new_count,
    COUNT(CASE WHEN status = 'matched' THEN 1 END)::BIGINT AS matched_count,
    COUNT(CASE WHEN status = 'converted' THEN 1 END)::BIGINT AS converted_count,
    COUNT(CASE WHEN status = 'ignored' THEN 1 END)::BIGINT AS ignored_count,
    SUM(ABS(amount))::DECIMAL(12, 2) AS total_amount,
    SUM(CASE WHEN status = 'converted' THEN ABS(amount) ELSE 0 END)::DECIMAL(12, 2) AS converted_amount
  FROM imported_transactions
  WHERE organization_id = p_organization_id
    AND (p_start_date IS NULL OR transaction_date >= p_start_date)
    AND (p_end_date IS NULL OR transaction_date <= p_end_date);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE linked_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_rules ENABLE ROW LEVEL SECURITY;

-- Plaid items: users can view own items
CREATE POLICY "Users can view own plaid items"
  ON plaid_items FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own plaid items"
  ON plaid_items FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Linked accounts: users can view own accounts
CREATE POLICY "Users can view own linked accounts"
  ON linked_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own linked accounts"
  ON linked_accounts FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Imported transactions: users can view own transactions
CREATE POLICY "Users can view own imported transactions"
  ON imported_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own imported transactions"
  ON imported_transactions FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Transaction rules: org members can view, admin/finance can manage
CREATE POLICY "Org members can view transaction rules"
  ON transaction_rules FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admin/finance can manage transaction rules"
  ON transaction_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance')
      AND organization_id = transaction_rules.organization_id
    )
  );

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_plaid_items_org ON plaid_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_items_status ON plaid_items(status);

CREATE INDEX IF NOT EXISTS idx_linked_accounts_plaid_item ON linked_accounts(plaid_item_id);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_user ON linked_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_enabled ON linked_accounts(is_enabled) WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS idx_imported_tx_account ON imported_transactions(linked_account_id);
CREATE INDEX IF NOT EXISTS idx_imported_tx_user ON imported_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_imported_tx_status ON imported_transactions(status);
CREATE INDEX IF NOT EXISTS idx_imported_tx_date ON imported_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_imported_tx_merchant ON imported_transactions(merchant_name);

CREATE INDEX IF NOT EXISTS idx_transaction_rules_org ON transaction_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rules_active ON transaction_rules(is_active) WHERE is_active = true;
