-- Multi-Currency Support Migration
-- Adds support for multiple currencies with automatic conversion to organization's base currency

-- =============================================================================
-- CURRENCY EXCHANGE RATES TABLE
-- =============================================================================

-- Table to store exchange rates for currency conversion
CREATE TABLE IF NOT EXISTS currency_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Currency pair
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,

  -- Exchange rate (1 from_currency = rate to_currency)
  rate NUMERIC(15,6) NOT NULL,

  -- Rate source and date
  source TEXT NOT NULL DEFAULT 'manual', -- 'api', 'manual', 'fixed'
  rate_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Ensure unique rates per currency pair per date
  CONSTRAINT unique_currency_pair_date UNIQUE (from_currency, to_currency, rate_date)
);

-- =============================================================================
-- SUPPORTED CURRENCIES TABLE
-- =============================================================================

-- Table to store supported currencies with their details
CREATE TABLE IF NOT EXISTS supported_currencies (
  code TEXT PRIMARY KEY, -- ISO 4217 code (e.g., 'USD', 'EUR')
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimal_places INTEGER NOT NULL DEFAULT 2,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================================================
-- ORGANIZATION CURRENCY SETTINGS
-- =============================================================================

-- Add base currency and multi-currency settings to organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'USD' REFERENCES supported_currencies(code),
ADD COLUMN IF NOT EXISTS supported_currencies TEXT[] DEFAULT ARRAY['USD'],
ADD COLUMN IF NOT EXISTS auto_convert_currency BOOLEAN DEFAULT true;

-- =============================================================================
-- EXPENSE CURRENCY FIELDS
-- =============================================================================

-- Add multi-currency fields to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS original_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15,6),
ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE;

-- Update existing expenses to have original_currency and original_amount
UPDATE expenses
SET original_currency = 'USD',
    original_amount = amount
WHERE original_currency IS NULL OR original_amount IS NULL;

-- =============================================================================
-- ADD MULTI-CURRENCY TO MILEAGE TRIPS
-- =============================================================================

-- Add currency fields to mileage_trips
ALTER TABLE mileage_trips
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15,6);

-- Update existing trips (use reimbursement_amount which is the generated column in mileage_trips)
UPDATE mileage_trips
SET currency = 'USD',
    original_amount = reimbursement_amount
WHERE currency IS NULL OR original_amount IS NULL;

-- =============================================================================
-- POPULATE SUPPORTED CURRENCIES
-- =============================================================================

INSERT INTO supported_currencies (code, name, symbol, decimal_places) VALUES
  ('USD', 'US Dollar', '$', 2),
  ('EUR', 'Euro', '€', 2),
  ('GBP', 'British Pound', '£', 2),
  ('CAD', 'Canadian Dollar', 'C$', 2),
  ('AUD', 'Australian Dollar', 'A$', 2),
  ('JPY', 'Japanese Yen', '¥', 0),
  ('CHF', 'Swiss Franc', 'CHF', 2),
  ('CNY', 'Chinese Yuan', '¥', 2),
  ('INR', 'Indian Rupee', '₹', 2),
  ('MXN', 'Mexican Peso', 'MX$', 2),
  ('BRL', 'Brazilian Real', 'R$', 2),
  ('KRW', 'South Korean Won', '₩', 0),
  ('SGD', 'Singapore Dollar', 'S$', 2),
  ('HKD', 'Hong Kong Dollar', 'HK$', 2),
  ('SEK', 'Swedish Krona', 'kr', 2),
  ('NOK', 'Norwegian Krone', 'kr', 2),
  ('DKK', 'Danish Krone', 'kr', 2),
  ('NZD', 'New Zealand Dollar', 'NZ$', 2),
  ('ZAR', 'South African Rand', 'R', 2),
  ('AED', 'UAE Dirham', 'د.إ', 2)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SEED DEFAULT EXCHANGE RATES (USD base)
-- =============================================================================

INSERT INTO currency_exchange_rates (from_currency, to_currency, rate, source, rate_date) VALUES
  ('EUR', 'USD', 1.08, 'seed', CURRENT_DATE),
  ('GBP', 'USD', 1.27, 'seed', CURRENT_DATE),
  ('CAD', 'USD', 0.74, 'seed', CURRENT_DATE),
  ('AUD', 'USD', 0.65, 'seed', CURRENT_DATE),
  ('JPY', 'USD', 0.0067, 'seed', CURRENT_DATE),
  ('CHF', 'USD', 1.13, 'seed', CURRENT_DATE),
  ('CNY', 'USD', 0.14, 'seed', CURRENT_DATE),
  ('INR', 'USD', 0.012, 'seed', CURRENT_DATE),
  ('MXN', 'USD', 0.058, 'seed', CURRENT_DATE),
  ('BRL', 'USD', 0.20, 'seed', CURRENT_DATE),
  ('KRW', 'USD', 0.00075, 'seed', CURRENT_DATE),
  ('SGD', 'USD', 0.74, 'seed', CURRENT_DATE),
  ('HKD', 'USD', 0.13, 'seed', CURRENT_DATE),
  ('SEK', 'USD', 0.095, 'seed', CURRENT_DATE),
  ('NOK', 'USD', 0.092, 'seed', CURRENT_DATE),
  ('DKK', 'USD', 0.14, 'seed', CURRENT_DATE),
  ('NZD', 'USD', 0.60, 'seed', CURRENT_DATE),
  ('ZAR', 'USD', 0.055, 'seed', CURRENT_DATE),
  ('AED', 'USD', 0.27, 'seed', CURRENT_DATE),
  -- Reverse rates (USD to other currencies)
  ('USD', 'EUR', 0.93, 'seed', CURRENT_DATE),
  ('USD', 'GBP', 0.79, 'seed', CURRENT_DATE),
  ('USD', 'CAD', 1.35, 'seed', CURRENT_DATE),
  ('USD', 'AUD', 1.54, 'seed', CURRENT_DATE),
  ('USD', 'JPY', 149.50, 'seed', CURRENT_DATE),
  ('USD', 'CHF', 0.88, 'seed', CURRENT_DATE),
  ('USD', 'CNY', 7.15, 'seed', CURRENT_DATE),
  ('USD', 'INR', 83.50, 'seed', CURRENT_DATE),
  ('USD', 'MXN', 17.25, 'seed', CURRENT_DATE)
ON CONFLICT (from_currency, to_currency, rate_date) DO UPDATE
SET rate = EXCLUDED.rate,
    updated_at = now();

-- =============================================================================
-- CURRENCY CONVERSION FUNCTIONS
-- =============================================================================

-- Function to get the latest exchange rate for a currency pair
CREATE OR REPLACE FUNCTION get_exchange_rate(
  p_from_currency TEXT,
  p_to_currency TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  -- Same currency = 1:1
  IF p_from_currency = p_to_currency THEN
    RETURN 1.0;
  END IF;

  -- Try to get direct rate for the date or earlier
  SELECT rate INTO v_rate
  FROM currency_exchange_rates
  WHERE from_currency = p_from_currency
    AND to_currency = p_to_currency
    AND rate_date <= p_date
  ORDER BY rate_date DESC
  LIMIT 1;

  -- If no direct rate found, try inverse
  IF v_rate IS NULL THEN
    SELECT 1.0 / rate INTO v_rate
    FROM currency_exchange_rates
    WHERE from_currency = p_to_currency
      AND to_currency = p_from_currency
      AND rate_date <= p_date
    ORDER BY rate_date DESC
    LIMIT 1;
  END IF;

  -- If still no rate, try through USD as intermediate
  IF v_rate IS NULL AND p_from_currency != 'USD' AND p_to_currency != 'USD' THEN
    DECLARE
      v_from_to_usd NUMERIC;
      v_usd_to_target NUMERIC;
    BEGIN
      v_from_to_usd := get_exchange_rate(p_from_currency, 'USD', p_date);
      v_usd_to_target := get_exchange_rate('USD', p_to_currency, p_date);

      IF v_from_to_usd IS NOT NULL AND v_usd_to_target IS NOT NULL THEN
        v_rate := v_from_to_usd * v_usd_to_target;
      END IF;
    END;
  END IF;

  RETURN COALESCE(v_rate, 1.0); -- Default to 1:1 if no rate found
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to convert an amount between currencies
CREATE OR REPLACE FUNCTION convert_currency(
  p_amount NUMERIC,
  p_from_currency TEXT,
  p_to_currency TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  v_rate := get_exchange_rate(p_from_currency, p_to_currency, p_date);
  RETURN ROUND(p_amount * v_rate, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- TRIGGER: AUTO-CONVERT EXPENSE AMOUNTS
-- =============================================================================

-- Trigger function to auto-convert expense amounts on insert/update
CREATE OR REPLACE FUNCTION auto_convert_expense_currency()
RETURNS TRIGGER AS $$
DECLARE
  v_base_currency TEXT;
  v_auto_convert BOOLEAN;
BEGIN
  -- Get organization settings
  SELECT base_currency, auto_convert_currency
  INTO v_base_currency, v_auto_convert
  FROM organizations
  WHERE id = NEW.organization_id;

  -- Default to USD if not set
  v_base_currency := COALESCE(v_base_currency, 'USD');
  v_auto_convert := COALESCE(v_auto_convert, true);

  -- Set original values if not set
  IF NEW.original_amount IS NULL THEN
    NEW.original_amount := NEW.amount;
  END IF;

  IF NEW.original_currency IS NULL THEN
    NEW.original_currency := v_base_currency;
  END IF;

  -- Auto-convert to base currency if enabled and currencies differ
  IF v_auto_convert AND NEW.original_currency != v_base_currency THEN
    NEW.exchange_rate := get_exchange_rate(NEW.original_currency, v_base_currency, NEW.expense_date::DATE);
    NEW.amount := ROUND(NEW.original_amount * NEW.exchange_rate, 2);
    NEW.converted_at := now();
  ELSIF NEW.original_currency = v_base_currency THEN
    -- Same currency, no conversion needed
    NEW.amount := NEW.original_amount;
    NEW.exchange_rate := 1.0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for expenses
DROP TRIGGER IF EXISTS expense_currency_conversion_trigger ON expenses;
CREATE TRIGGER expense_currency_conversion_trigger
  BEFORE INSERT OR UPDATE OF original_amount, original_currency
  ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION auto_convert_expense_currency();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE supported_currencies ENABLE ROW LEVEL SECURITY;

-- Exchange rates are readable by all authenticated users
CREATE POLICY "Exchange rates are viewable by authenticated users"
  ON currency_exchange_rates FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify exchange rates
CREATE POLICY "Admins can manage exchange rates"
  ON currency_exchange_rates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance')
    )
  );

-- Supported currencies are readable by all authenticated users
CREATE POLICY "Supported currencies are viewable by all"
  ON supported_currencies FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify supported currencies
CREATE POLICY "Admins can manage supported currencies"
  ON supported_currencies FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair
  ON currency_exchange_rates(from_currency, to_currency);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date
  ON currency_exchange_rates(rate_date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_original_currency
  ON expenses(original_currency);

-- =============================================================================
-- HELPER VIEW: EXPENSES WITH CURRENCY DETAILS
-- =============================================================================

CREATE OR REPLACE VIEW expenses_with_currency AS
SELECT
  e.*,
  sc_orig.name AS original_currency_name,
  sc_orig.symbol AS original_currency_symbol,
  sc_base.code AS base_currency,
  sc_base.symbol AS base_currency_symbol,
  CASE
    WHEN e.original_currency != o.base_currency THEN true
    ELSE false
  END AS is_foreign_currency
FROM expenses e
JOIN organizations o ON e.organization_id = o.id
LEFT JOIN supported_currencies sc_orig ON e.original_currency = sc_orig.code
LEFT JOIN supported_currencies sc_base ON o.base_currency = sc_base.code;

-- =============================================================================
-- FUNCTION: GET ORGANIZATION CURRENCY SUMMARY
-- =============================================================================

CREATE OR REPLACE FUNCTION get_currency_summary(p_organization_id UUID)
RETURNS TABLE (
  currency TEXT,
  currency_name TEXT,
  currency_symbol TEXT,
  expense_count BIGINT,
  total_original_amount NUMERIC,
  total_converted_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.original_currency,
    sc.name,
    sc.symbol,
    COUNT(*) AS expense_count,
    SUM(e.original_amount) AS total_original_amount,
    SUM(e.amount) AS total_converted_amount
  FROM expenses e
  JOIN supported_currencies sc ON e.original_currency = sc.code
  WHERE e.organization_id = p_organization_id
  GROUP BY e.original_currency, sc.name, sc.symbol
  ORDER BY expense_count DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
