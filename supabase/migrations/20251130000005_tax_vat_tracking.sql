-- Tax/VAT Tracking Migration
-- Enables tracking of tax amounts on receipts for compliance and reporting

-- =============================================================================
-- TAX RATES TABLE
-- =============================================================================

-- Tax rates by jurisdiction (country/state)
CREATE TABLE IF NOT EXISTS tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Jurisdiction
  name TEXT NOT NULL, -- e.g., "US Sales Tax", "UK VAT", "CA GST"
  country_code TEXT NOT NULL, -- ISO 3166-1 alpha-2
  state_province TEXT, -- State/province code (optional)

  -- Tax details
  tax_type TEXT NOT NULL CHECK (tax_type IN ('sales_tax', 'vat', 'gst', 'hst', 'pst', 'other')),
  rate DECIMAL(6, 4) NOT NULL, -- e.g., 0.0825 for 8.25%
  is_recoverable BOOLEAN DEFAULT false, -- Can business claim back (VAT/GST)
  is_compound BOOLEAN DEFAULT false, -- Applied on top of other taxes

  -- Validity
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_until DATE, -- NULL = current

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Unique rate per jurisdiction per org
  CONSTRAINT unique_tax_rate UNIQUE (organization_id, country_code, state_province, tax_type, effective_from)
);

-- =============================================================================
-- TAX CATEGORIES TABLE
-- =============================================================================

-- Expense categories can have different tax treatments
CREATE TABLE IF NOT EXISTS tax_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name TEXT NOT NULL, -- e.g., "Exempt", "Zero-rated", "Standard", "Reduced"
  code TEXT NOT NULL, -- Short code for reporting
  description TEXT,

  -- Tax behavior
  is_taxable BOOLEAN DEFAULT true,
  default_rate_id UUID REFERENCES tax_rates(id),

  -- For VAT reporting
  vat_code TEXT, -- EU VAT code if applicable

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT unique_tax_category UNIQUE (organization_id, code)
);

-- =============================================================================
-- EXPENSE TAX DETAILS
-- =============================================================================

-- Add tax fields to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(6, 4),
ADD COLUMN IF NOT EXISTS tax_type TEXT CHECK (tax_type IN ('sales_tax', 'vat', 'gst', 'hst', 'pst', 'other', 'exempt', 'zero_rated')),
ADD COLUMN IF NOT EXISTS tax_jurisdiction TEXT,
ADD COLUMN IF NOT EXISTS is_tax_recoverable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS net_amount DECIMAL(12, 2), -- Amount before tax
ADD COLUMN IF NOT EXISTS tax_category_id UUID REFERENCES tax_categories(id);

-- Add tax fields to receipts for OCR-extracted tax info
ALTER TABLE receipts
ADD COLUMN IF NOT EXISTS extracted_tax_amount DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS extracted_tax_rate DECIMAL(6, 4),
ADD COLUMN IF NOT EXISTS tax_number TEXT; -- Merchant's tax registration number

-- =============================================================================
-- TAX SUMMARY VIEW
-- =============================================================================

-- Tax summary by expense for reporting
CREATE OR REPLACE VIEW expense_tax_summary AS
SELECT
  e.organization_id,
  e.user_id,
  e.id AS expense_id,
  e.merchant,
  e.expense_date,
  e.amount AS gross_amount,
  e.net_amount,
  e.tax_amount,
  e.tax_rate,
  e.tax_type,
  e.tax_jurisdiction,
  e.is_tax_recoverable,
  tc.name AS tax_category_name,
  tc.code AS tax_category_code,
  CASE
    WHEN e.is_tax_recoverable THEN e.tax_amount
    ELSE 0
  END AS recoverable_tax,
  CASE
    WHEN NOT e.is_tax_recoverable THEN e.tax_amount
    ELSE 0
  END AS non_recoverable_tax
FROM expenses e
LEFT JOIN tax_categories tc ON e.tax_category_id = tc.id
WHERE e.tax_amount IS NOT NULL AND e.tax_amount > 0;

-- =============================================================================
-- TAX REPORT AGGREGATION
-- =============================================================================

-- Aggregate tax by period and type
CREATE OR REPLACE FUNCTION get_tax_report(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'tax_type' -- 'tax_type', 'jurisdiction', 'category', 'user'
)
RETURNS TABLE (
  group_key TEXT,
  total_gross DECIMAL(12, 2),
  total_net DECIMAL(12, 2),
  total_tax DECIMAL(12, 2),
  recoverable_tax DECIMAL(12, 2),
  non_recoverable_tax DECIMAL(12, 2),
  expense_count BIGINT
) AS $$
BEGIN
  IF p_group_by = 'tax_type' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.tax_type, 'unknown')::TEXT AS group_key,
      SUM(e.amount)::DECIMAL(12, 2) AS total_gross,
      SUM(COALESCE(e.net_amount, e.amount - COALESCE(e.tax_amount, 0)))::DECIMAL(12, 2) AS total_net,
      SUM(COALESCE(e.tax_amount, 0))::DECIMAL(12, 2) AS total_tax,
      SUM(CASE WHEN e.is_tax_recoverable THEN COALESCE(e.tax_amount, 0) ELSE 0 END)::DECIMAL(12, 2) AS recoverable_tax,
      SUM(CASE WHEN NOT e.is_tax_recoverable THEN COALESCE(e.tax_amount, 0) ELSE 0 END)::DECIMAL(12, 2) AS non_recoverable_tax,
      COUNT(*)::BIGINT AS expense_count
    FROM expenses e
    WHERE e.organization_id = p_organization_id
      AND e.expense_date >= p_start_date
      AND e.expense_date <= p_end_date
      AND e.status != 'rejected'
    GROUP BY e.tax_type
    ORDER BY total_tax DESC;

  ELSIF p_group_by = 'jurisdiction' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.tax_jurisdiction, 'Unknown')::TEXT AS group_key,
      SUM(e.amount)::DECIMAL(12, 2) AS total_gross,
      SUM(COALESCE(e.net_amount, e.amount - COALESCE(e.tax_amount, 0)))::DECIMAL(12, 2) AS total_net,
      SUM(COALESCE(e.tax_amount, 0))::DECIMAL(12, 2) AS total_tax,
      SUM(CASE WHEN e.is_tax_recoverable THEN COALESCE(e.tax_amount, 0) ELSE 0 END)::DECIMAL(12, 2) AS recoverable_tax,
      SUM(CASE WHEN NOT e.is_tax_recoverable THEN COALESCE(e.tax_amount, 0) ELSE 0 END)::DECIMAL(12, 2) AS non_recoverable_tax,
      COUNT(*)::BIGINT AS expense_count
    FROM expenses e
    WHERE e.organization_id = p_organization_id
      AND e.expense_date >= p_start_date
      AND e.expense_date <= p_end_date
      AND e.status != 'rejected'
    GROUP BY e.tax_jurisdiction
    ORDER BY total_tax DESC;

  ELSIF p_group_by = 'category' THEN
    RETURN QUERY
    SELECT
      COALESCE(tc.name, 'Uncategorized')::TEXT AS group_key,
      SUM(e.amount)::DECIMAL(12, 2) AS total_gross,
      SUM(COALESCE(e.net_amount, e.amount - COALESCE(e.tax_amount, 0)))::DECIMAL(12, 2) AS total_net,
      SUM(COALESCE(e.tax_amount, 0))::DECIMAL(12, 2) AS total_tax,
      SUM(CASE WHEN e.is_tax_recoverable THEN COALESCE(e.tax_amount, 0) ELSE 0 END)::DECIMAL(12, 2) AS recoverable_tax,
      SUM(CASE WHEN NOT e.is_tax_recoverable THEN COALESCE(e.tax_amount, 0) ELSE 0 END)::DECIMAL(12, 2) AS non_recoverable_tax,
      COUNT(*)::BIGINT AS expense_count
    FROM expenses e
    LEFT JOIN tax_categories tc ON e.tax_category_id = tc.id
    WHERE e.organization_id = p_organization_id
      AND e.expense_date >= p_start_date
      AND e.expense_date <= p_end_date
      AND e.status != 'rejected'
    GROUP BY tc.name
    ORDER BY total_tax DESC;

  ELSE -- 'user'
    RETURN QUERY
    SELECT
      COALESCE(u.full_name, 'Unknown')::TEXT AS group_key,
      SUM(e.amount)::DECIMAL(12, 2) AS total_gross,
      SUM(COALESCE(e.net_amount, e.amount - COALESCE(e.tax_amount, 0)))::DECIMAL(12, 2) AS total_net,
      SUM(COALESCE(e.tax_amount, 0))::DECIMAL(12, 2) AS total_tax,
      SUM(CASE WHEN e.is_tax_recoverable THEN COALESCE(e.tax_amount, 0) ELSE 0 END)::DECIMAL(12, 2) AS recoverable_tax,
      SUM(CASE WHEN NOT e.is_tax_recoverable THEN COALESCE(e.tax_amount, 0) ELSE 0 END)::DECIMAL(12, 2) AS non_recoverable_tax,
      COUNT(*)::BIGINT AS expense_count
    FROM expenses e
    LEFT JOIN users u ON e.user_id = u.id
    WHERE e.organization_id = p_organization_id
      AND e.expense_date >= p_start_date
      AND e.expense_date <= p_end_date
      AND e.status != 'rejected'
    GROUP BY u.full_name
    ORDER BY total_tax DESC;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- AUTO-CALCULATE NET AMOUNT
-- =============================================================================

-- Trigger to auto-calculate net amount when tax is set
CREATE OR REPLACE FUNCTION calculate_expense_net_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- If tax_amount is set but net_amount is not, calculate it
  IF NEW.tax_amount IS NOT NULL AND NEW.net_amount IS NULL THEN
    NEW.net_amount := NEW.amount - NEW.tax_amount;
  END IF;

  -- If net_amount is set but tax_amount is not, and we have a rate, calculate tax
  IF NEW.net_amount IS NOT NULL AND NEW.tax_amount IS NULL AND NEW.tax_rate IS NOT NULL THEN
    NEW.tax_amount := NEW.net_amount * NEW.tax_rate;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expense_net_amount_trigger ON expenses;
CREATE TRIGGER expense_net_amount_trigger
  BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION calculate_expense_net_amount();

-- =============================================================================
-- LOOKUP TAX RATE
-- =============================================================================

-- Get applicable tax rate for a jurisdiction
CREATE OR REPLACE FUNCTION get_applicable_tax_rate(
  p_organization_id UUID,
  p_country_code TEXT,
  p_state_province TEXT DEFAULT NULL,
  p_tax_type TEXT DEFAULT 'sales_tax',
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  rate_id UUID,
  rate DECIMAL(6, 4),
  is_recoverable BOOLEAN,
  tax_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tr.id AS rate_id,
    tr.rate,
    tr.is_recoverable,
    tr.name AS tax_name
  FROM tax_rates tr
  WHERE tr.organization_id = p_organization_id
    AND tr.country_code = p_country_code
    AND (tr.state_province = p_state_province OR (p_state_province IS NULL AND tr.state_province IS NULL))
    AND tr.tax_type = p_tax_type
    AND tr.is_active = true
    AND tr.effective_from <= p_date
    AND (tr.effective_until IS NULL OR tr.effective_until >= p_date)
  ORDER BY tr.effective_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- SEED COMMON TAX RATES
-- =============================================================================

-- Function to seed default tax rates for an organization
CREATE OR REPLACE FUNCTION seed_default_tax_rates(p_organization_id UUID)
RETURNS void AS $$
BEGIN
  -- US Federal (no federal sales tax, but placeholder)
  INSERT INTO tax_rates (organization_id, name, country_code, tax_type, rate, is_recoverable)
  VALUES
    -- US State Sales Taxes (examples)
    (p_organization_id, 'Texas Sales Tax', 'US', 'sales_tax', 0.0625, false),
    (p_organization_id, 'California Sales Tax', 'US', 'sales_tax', 0.0725, false),
    (p_organization_id, 'New York Sales Tax', 'US', 'sales_tax', 0.0400, false),
    (p_organization_id, 'Florida Sales Tax', 'US', 'sales_tax', 0.0600, false),

    -- UK VAT
    (p_organization_id, 'UK VAT Standard', 'GB', 'vat', 0.2000, true),
    (p_organization_id, 'UK VAT Reduced', 'GB', 'vat', 0.0500, true),
    (p_organization_id, 'UK VAT Zero', 'GB', 'vat', 0.0000, true),

    -- Canada GST/HST
    (p_organization_id, 'Canada GST', 'CA', 'gst', 0.0500, true),
    (p_organization_id, 'Ontario HST', 'CA', 'hst', 0.1300, true),
    (p_organization_id, 'BC PST', 'CA', 'pst', 0.0700, false),

    -- EU VAT (examples)
    (p_organization_id, 'Germany VAT Standard', 'DE', 'vat', 0.1900, true),
    (p_organization_id, 'France VAT Standard', 'FR', 'vat', 0.2000, true),
    (p_organization_id, 'Netherlands VAT Standard', 'NL', 'vat', 0.2100, true),

    -- Australia GST
    (p_organization_id, 'Australia GST', 'AU', 'gst', 0.1000, true)
  ON CONFLICT DO NOTHING;

  -- Seed default tax categories
  INSERT INTO tax_categories (organization_id, name, code, description, is_taxable)
  VALUES
    (p_organization_id, 'Standard Rate', 'STD', 'Standard tax rate applies', true),
    (p_organization_id, 'Reduced Rate', 'RED', 'Reduced tax rate applies', true),
    (p_organization_id, 'Zero Rated', 'ZERO', 'Zero-rated but still VAT reportable', true),
    (p_organization_id, 'Exempt', 'EXM', 'Tax exempt - not VAT reportable', false),
    (p_organization_id, 'Out of Scope', 'OOS', 'Outside VAT scope', false)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_categories ENABLE ROW LEVEL SECURITY;

-- Tax rates: viewable by all org members, editable by admin/finance
CREATE POLICY "Tax rates viewable by org members"
  ON tax_rates FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Tax rates editable by admin/finance"
  ON tax_rates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance')
      AND organization_id = tax_rates.organization_id
    )
  );

-- Tax categories: viewable by all org members, editable by admin/finance
CREATE POLICY "Tax categories viewable by org members"
  ON tax_categories FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Tax categories editable by admin/finance"
  ON tax_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance')
      AND organization_id = tax_categories.organization_id
    )
  );

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tax_rates_org ON tax_rates(organization_id);
CREATE INDEX IF NOT EXISTS idx_tax_rates_country ON tax_rates(country_code);
CREATE INDEX IF NOT EXISTS idx_tax_rates_active ON tax_rates(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tax_categories_org ON tax_categories(organization_id);

CREATE INDEX IF NOT EXISTS idx_expenses_tax_amount ON expenses(tax_amount) WHERE tax_amount > 0;
CREATE INDEX IF NOT EXISTS idx_expenses_tax_recoverable ON expenses(is_tax_recoverable) WHERE is_tax_recoverable = true;
