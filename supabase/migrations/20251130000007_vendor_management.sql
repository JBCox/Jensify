-- Vendor Management Migration
-- Track and manage vendors/merchants for expense categorization and analytics

-- =============================================================================
-- VENDORS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  display_name TEXT, -- Normalized display name
  description TEXT,

  -- Contact info
  email TEXT,
  phone TEXT,
  website TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',

  -- Business info
  tax_id TEXT, -- EIN/Tax ID for 1099 reporting
  business_type TEXT CHECK (business_type IN ('individual', 'company', 'government', 'nonprofit', 'other')),

  -- Categorization
  default_category TEXT, -- Default expense category for this vendor
  tags TEXT[], -- Custom tags for filtering

  -- Payment info
  payment_terms TEXT, -- Net 30, etc.
  preferred_payment_method TEXT CHECK (preferred_payment_method IN ('check', 'ach', 'wire', 'card', 'other')),

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  is_preferred BOOLEAN DEFAULT false, -- Preferred vendor flag
  is_w9_on_file BOOLEAN DEFAULT false, -- W-9 collected for 1099

  -- Notes
  notes TEXT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES users(id),

  -- Unique vendor name per org
  CONSTRAINT unique_vendor_name UNIQUE (organization_id, name)
);

-- =============================================================================
-- VENDOR ALIASES
-- =============================================================================

-- Map different merchant names to same vendor (for OCR normalization)
CREATE TABLE IF NOT EXISTS vendor_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  alias TEXT NOT NULL, -- Alternative name/spelling

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT unique_alias_per_vendor UNIQUE (vendor_id, alias)
);

-- Index for quick alias lookups
CREATE INDEX IF NOT EXISTS idx_vendor_aliases_alias ON vendor_aliases(LOWER(alias));

-- =============================================================================
-- VENDOR CONTACTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS vendor_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,

  -- Contact info
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN DEFAULT false,

  -- Notes
  notes TEXT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================================================
-- VENDOR DOCUMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS vendor_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,

  -- Document info
  name TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('w9', 'contract', 'insurance', 'license', 'other')),
  file_path TEXT NOT NULL, -- Storage path
  file_size INT,
  mime_type TEXT,

  -- Dates
  issue_date DATE,
  expiry_date DATE, -- For licenses, insurance

  -- Notes
  notes TEXT,

  -- Audit
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  uploaded_by UUID REFERENCES users(id)
);

-- =============================================================================
-- LINK EXPENSES TO VENDORS
-- =============================================================================

-- Add vendor_id to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);

-- Index for vendor lookups
CREATE INDEX IF NOT EXISTS idx_expenses_vendor_id ON expenses(vendor_id);

-- =============================================================================
-- VENDOR SPENDING SUMMARY
-- =============================================================================

-- View for vendor spending analytics
CREATE OR REPLACE VIEW vendor_spending_summary AS
SELECT
  v.id AS vendor_id,
  v.organization_id,
  v.name AS vendor_name,
  v.display_name,
  v.default_category,
  v.status,
  v.is_preferred,
  COUNT(e.id) AS expense_count,
  SUM(e.amount) AS total_spent,
  AVG(e.amount) AS avg_expense,
  MAX(e.expense_date) AS last_expense_date,
  MIN(e.expense_date) AS first_expense_date,
  COUNT(DISTINCT e.user_id) AS unique_users
FROM vendors v
LEFT JOIN expenses e ON v.id = e.vendor_id
GROUP BY v.id;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Auto-match merchant to vendor
CREATE OR REPLACE FUNCTION match_vendor_for_merchant(
  p_organization_id UUID,
  p_merchant_name TEXT
)
RETURNS UUID AS $$
DECLARE
  v_vendor_id UUID;
  v_normalized TEXT;
BEGIN
  -- Normalize merchant name
  v_normalized := UPPER(TRIM(p_merchant_name));

  -- Try exact match on vendor name
  SELECT id INTO v_vendor_id
  FROM vendors
  WHERE organization_id = p_organization_id
    AND UPPER(TRIM(name)) = v_normalized
    AND status = 'active'
  LIMIT 1;

  IF v_vendor_id IS NOT NULL THEN
    RETURN v_vendor_id;
  END IF;

  -- Try match on aliases
  SELECT va.vendor_id INTO v_vendor_id
  FROM vendor_aliases va
  JOIN vendors v ON va.vendor_id = v.id
  WHERE v.organization_id = p_organization_id
    AND UPPER(TRIM(va.alias)) = v_normalized
    AND v.status = 'active'
  LIMIT 1;

  IF v_vendor_id IS NOT NULL THEN
    RETURN v_vendor_id;
  END IF;

  -- Try fuzzy match (starts with)
  SELECT id INTO v_vendor_id
  FROM vendors
  WHERE organization_id = p_organization_id
    AND (
      UPPER(TRIM(name)) LIKE v_normalized || '%'
      OR v_normalized LIKE UPPER(TRIM(name)) || '%'
    )
    AND status = 'active'
  ORDER BY LENGTH(name)
  LIMIT 1;

  RETURN v_vendor_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get vendor statistics
CREATE OR REPLACE FUNCTION get_vendor_stats(
  p_organization_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  vendor_id UUID,
  vendor_name TEXT,
  expense_count BIGINT,
  total_spent DECIMAL(12, 2),
  avg_expense DECIMAL(12, 2),
  last_expense_date DATE,
  unique_users BIGINT,
  top_category TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH vendor_expenses AS (
    SELECT
      v.id AS vid,
      v.name AS vname,
      e.amount,
      e.expense_date,
      e.user_id,
      e.category,
      ROW_NUMBER() OVER (PARTITION BY v.id ORDER BY COUNT(*) DESC) AS cat_rank
    FROM vendors v
    LEFT JOIN expenses e ON v.id = e.vendor_id
    WHERE v.organization_id = p_organization_id
      AND v.status = 'active'
      AND (p_start_date IS NULL OR e.expense_date >= p_start_date)
      AND (p_end_date IS NULL OR e.expense_date <= p_end_date)
    GROUP BY v.id, v.name, e.amount, e.expense_date, e.user_id, e.category
  )
  SELECT
    ve.vid AS vendor_id,
    ve.vname AS vendor_name,
    COUNT(*)::BIGINT AS expense_count,
    SUM(ve.amount)::DECIMAL(12, 2) AS total_spent,
    AVG(ve.amount)::DECIMAL(12, 2) AS avg_expense,
    MAX(ve.expense_date)::DATE AS last_expense_date,
    COUNT(DISTINCT ve.user_id)::BIGINT AS unique_users,
    MAX(CASE WHEN ve.cat_rank = 1 THEN ve.category END)::TEXT AS top_category
  FROM vendor_expenses ve
  GROUP BY ve.vid, ve.vname
  ORDER BY total_spent DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get vendors needing W-9
CREATE OR REPLACE FUNCTION get_vendors_needing_w9(
  p_organization_id UUID,
  p_threshold DECIMAL DEFAULT 600 -- IRS 1099 threshold
)
RETURNS TABLE (
  vendor_id UUID,
  vendor_name TEXT,
  total_paid DECIMAL(12, 2),
  has_w9 BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id AS vendor_id,
    v.name AS vendor_name,
    COALESCE(SUM(e.amount), 0)::DECIMAL(12, 2) AS total_paid,
    v.is_w9_on_file AS has_w9
  FROM vendors v
  LEFT JOIN expenses e ON v.id = e.vendor_id
    AND e.status = 'approved'
    AND EXTRACT(YEAR FROM e.expense_date) = EXTRACT(YEAR FROM CURRENT_DATE)
  WHERE v.organization_id = p_organization_id
    AND v.business_type IN ('individual', 'company')
  GROUP BY v.id, v.name, v.is_w9_on_file
  HAVING COALESCE(SUM(e.amount), 0) >= p_threshold
  ORDER BY total_paid DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Auto-create vendor from expense
CREATE OR REPLACE FUNCTION auto_create_vendor_from_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  -- Only process if no vendor_id set and we have a merchant
  IF NEW.vendor_id IS NULL AND NEW.merchant IS NOT NULL AND LENGTH(TRIM(NEW.merchant)) > 0 THEN
    -- Try to match existing vendor
    v_vendor_id := match_vendor_for_merchant(NEW.organization_id, NEW.merchant);

    IF v_vendor_id IS NOT NULL THEN
      NEW.vendor_id := v_vendor_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-link vendors
DROP TRIGGER IF EXISTS expense_auto_vendor_trigger ON expenses;
CREATE TRIGGER expense_auto_vendor_trigger
  BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_vendor_from_expense();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;

-- Vendors: viewable by all org members, editable by admin/finance
CREATE POLICY "Vendors viewable by org members"
  ON vendors FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Vendors editable by admin/finance"
  ON vendors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance')
      AND organization_id = vendors.organization_id
    )
  );

-- Vendor aliases
CREATE POLICY "Vendor aliases viewable by org members"
  ON vendor_aliases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendors v
      WHERE v.id = vendor_aliases.vendor_id
      AND v.organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Vendor aliases editable by admin/finance"
  ON vendor_aliases FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendors v
      JOIN users u ON v.organization_id = u.organization_id
      WHERE v.id = vendor_aliases.vendor_id
      AND u.id = auth.uid()
      AND u.role IN ('admin', 'finance')
    )
  );

-- Vendor contacts
CREATE POLICY "Vendor contacts viewable by org members"
  ON vendor_contacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendors v
      WHERE v.id = vendor_contacts.vendor_id
      AND v.organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Vendor contacts editable by admin/finance"
  ON vendor_contacts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendors v
      JOIN users u ON v.organization_id = u.organization_id
      WHERE v.id = vendor_contacts.vendor_id
      AND u.id = auth.uid()
      AND u.role IN ('admin', 'finance')
    )
  );

-- Vendor documents
CREATE POLICY "Vendor documents viewable by org members"
  ON vendor_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendors v
      WHERE v.id = vendor_documents.vendor_id
      AND v.organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Vendor documents editable by admin/finance"
  ON vendor_documents FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendors v
      JOIN users u ON v.organization_id = u.organization_id
      WHERE v.id = vendor_documents.vendor_id
      AND u.id = auth.uid()
      AND u.role IN ('admin', 'finance')
    )
  );

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_vendors_org ON vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_vendors_preferred ON vendors(is_preferred) WHERE is_preferred = true;

CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor ON vendor_contacts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_expiry ON vendor_documents(expiry_date) WHERE expiry_date IS NOT NULL;
