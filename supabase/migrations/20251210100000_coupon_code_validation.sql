-- ============================================================================
-- Migration: Coupon Code Validation Constraints
-- Created: 2024-12-10
-- Description: Adds proper validation constraints to the coupon_codes table
--              to ensure codes follow a consistent format
-- ============================================================================

-- Add CHECK constraint for coupon code format
-- Rules:
-- 1. Only uppercase alphanumeric characters allowed
-- 2. Length between 4 and 20 characters
-- 3. Cannot be empty or whitespace
ALTER TABLE coupon_codes
DROP CONSTRAINT IF EXISTS coupon_codes_code_format_check;

ALTER TABLE coupon_codes
ADD CONSTRAINT coupon_codes_code_format_check
CHECK (
  code ~ '^[A-Z0-9]{4,20}$'
);

-- Add a trigger to auto-uppercase coupon codes on insert/update
-- This ensures case-insensitive matching while storing consistently
CREATE OR REPLACE FUNCTION normalize_coupon_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Uppercase and trim the code
  NEW.code := UPPER(TRIM(NEW.code));

  -- Validate format after normalization
  IF NEW.code !~ '^[A-Z0-9]{4,20}$' THEN
    RAISE EXCEPTION 'Invalid coupon code format. Code must be 4-20 uppercase alphanumeric characters (A-Z, 0-9). Got: %', NEW.code;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS normalize_coupon_code_trigger ON coupon_codes;

-- Create trigger for insert and update
CREATE TRIGGER normalize_coupon_code_trigger
  BEFORE INSERT OR UPDATE OF code ON coupon_codes
  FOR EACH ROW
  EXECUTE FUNCTION normalize_coupon_code();

-- Add index for case-insensitive lookups (if not already exists)
-- This helps with searching for coupons regardless of input case
CREATE INDEX IF NOT EXISTS idx_coupon_codes_code_upper ON coupon_codes (UPPER(code));

-- Add comment explaining the validation rules
COMMENT ON COLUMN coupon_codes.code IS
  'Coupon code for discounts. Format: 4-20 uppercase alphanumeric characters (A-Z, 0-9). Examples: WELCOME20, STARTUP50, BLACKFRIDAY2024';

-- ============================================================================
-- Validation function for checking coupon code format (can be used from app)
-- ============================================================================
CREATE OR REPLACE FUNCTION is_valid_coupon_code(code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN UPPER(TRIM(code)) ~ '^[A-Z0-9]{4,20}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION is_valid_coupon_code(TEXT) IS
  'Validates if a coupon code follows the required format (4-20 uppercase alphanumeric characters)';
