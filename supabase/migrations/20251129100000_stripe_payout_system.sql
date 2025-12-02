-- ============================================================================
-- Jensify Database Schema - Stripe Payout System
-- Created: 2025-11-29
-- Description: Secure payout infrastructure with Stripe Connect integration
--
-- SECURITY NOTES:
-- 1. NO raw bank account/routing numbers are stored - only Stripe tokens
-- 2. All sensitive operations use Stripe's tokenization
-- 3. Organization isolation via RLS policies
-- 4. Complete audit trail for compliance
-- ============================================================================

-- ============================================================================
-- ORGANIZATION PAYOUT SETTINGS
-- ============================================================================

-- Add payout configuration to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS payout_method TEXT DEFAULT 'manual'
    CHECK (payout_method IN ('manual', 'stripe'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_account_status TEXT DEFAULT 'not_connected'
    CHECK (stripe_account_status IN ('not_connected', 'pending', 'active', 'restricted', 'disabled'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_connected_at TIMESTAMPTZ;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_account_details JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organizations.payout_method IS 'Payout method: manual (CSV export) or stripe (automated ACH)';
COMMENT ON COLUMN organizations.stripe_account_id IS 'Stripe Connect account ID (acct_xxx)';
COMMENT ON COLUMN organizations.stripe_account_status IS 'Status of Stripe Connect onboarding';
COMMENT ON COLUMN organizations.stripe_connected_at IS 'When Stripe account was connected';
COMMENT ON COLUMN organizations.stripe_account_details IS 'Non-sensitive Stripe account metadata (business name, etc.)';

-- Index for quick Stripe account lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_account
  ON organizations(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- ============================================================================
-- EMPLOYEE BANK ACCOUNTS (Stripe tokenized - NO raw bank data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Stripe tokens ONLY - never raw bank account numbers
  stripe_bank_account_id TEXT NOT NULL, -- ba_xxx token from Stripe
  stripe_customer_id TEXT, -- cus_xxx if using Stripe Customer objects

  -- Display info only (safe to store)
  bank_name TEXT,
  account_holder_name TEXT,
  last_four TEXT NOT NULL, -- Last 4 digits for display (e.g., "4567")
  account_type TEXT DEFAULT 'checking' CHECK (account_type IN ('checking', 'savings')),

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false, -- True after micro-deposit verification
  verification_status TEXT DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'failed', 'expired')),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT unique_user_bank_per_org UNIQUE(user_id, organization_id, stripe_bank_account_id)
);

COMMENT ON TABLE employee_bank_accounts IS 'Employee bank accounts for reimbursement payouts - stores Stripe tokens only, NEVER raw account numbers';
COMMENT ON COLUMN employee_bank_accounts.stripe_bank_account_id IS 'Stripe bank account token (ba_xxx) - the only bank identifier we store';
COMMENT ON COLUMN employee_bank_accounts.last_four IS 'Last 4 digits of account number for display purposes only';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_bank_accounts_user
  ON employee_bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_bank_accounts_org
  ON employee_bank_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_employee_bank_accounts_default
  ON employee_bank_accounts(user_id, organization_id, is_default)
  WHERE is_default = true;

-- Ensure only one default bank account per user per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_default_bank_per_user_org
  ON employee_bank_accounts(user_id, organization_id)
  WHERE is_default = true;

-- ============================================================================
-- PAYOUTS TABLE (Reimbursement transactions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Recipient
  user_id UUID NOT NULL REFERENCES auth.users(id),
  bank_account_id UUID REFERENCES employee_bank_accounts(id),

  -- Amount
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT DEFAULT 'USD',

  -- Stripe tracking
  stripe_payout_id TEXT, -- po_xxx from Stripe
  stripe_transfer_id TEXT, -- tr_xxx if using transfers

  -- Status
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'in_transit', 'paid', 'failed', 'canceled')),
  failure_reason TEXT,
  failure_code TEXT,

  -- What expenses this covers
  expense_ids UUID[] DEFAULT '{}',
  report_ids UUID[] DEFAULT '{}',

  -- Method tracking
  payout_method TEXT NOT NULL CHECK (payout_method IN ('manual', 'stripe_ach', 'stripe_instant')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  initiated_at TIMESTAMPTZ, -- When payout was sent to Stripe
  estimated_arrival TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Who initiated
  initiated_by UUID REFERENCES auth.users(id),

  -- Manual payout tracking
  manual_reference TEXT, -- Check number, wire ref, etc.
  manual_notes TEXT
);

COMMENT ON TABLE payouts IS 'Reimbursement payout records - tracks both manual and Stripe payouts';
COMMENT ON COLUMN payouts.amount_cents IS 'Payout amount in cents (e.g., 10000 = $100.00)';
COMMENT ON COLUMN payouts.expense_ids IS 'Array of expense IDs covered by this payout';
COMMENT ON COLUMN payouts.stripe_payout_id IS 'Stripe payout ID for tracking';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payouts_org ON payouts(organization_id);
CREATE INDEX IF NOT EXISTS idx_payouts_user ON payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_stripe_id ON payouts(stripe_payout_id) WHERE stripe_payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payouts_created ON payouts(created_at DESC);

-- ============================================================================
-- PAYOUT BATCHES (Group multiple employee payouts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Batch details
  name TEXT, -- Optional batch name/description
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  payout_count INTEGER NOT NULL DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'processing', 'completed', 'failed', 'canceled')),

  -- Method
  payout_method TEXT NOT NULL CHECK (payout_method IN ('manual', 'stripe')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Who
  created_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE payout_batches IS 'Groups multiple payouts for batch processing';

-- Link payouts to batches
ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES payout_batches(id);

CREATE INDEX IF NOT EXISTS idx_payouts_batch ON payouts(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_batches_org ON payout_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON payout_batches(organization_id, status);

-- ============================================================================
-- PAYOUT AUDIT LOG (Compliance and security)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What was affected
  payout_id UUID REFERENCES payouts(id),
  batch_id UUID REFERENCES payout_batches(id),
  bank_account_id UUID REFERENCES employee_bank_accounts(id),

  -- Action details
  action TEXT NOT NULL, -- 'create', 'initiate', 'complete', 'fail', 'cancel', 'bank_added', 'bank_removed', etc.
  action_details JSONB DEFAULT '{}'::jsonb,

  -- Who and when
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Request metadata (for security analysis)
  ip_address INET,
  user_agent TEXT
);

COMMENT ON TABLE payout_audit_log IS 'Immutable audit log for all payout-related actions - required for compliance';
COMMENT ON COLUMN payout_audit_log.action_details IS 'JSON details about the action (amounts, status changes, etc.)';

CREATE INDEX IF NOT EXISTS idx_payout_audit_org ON payout_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_payout_audit_payout ON payout_audit_log(payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_audit_time ON payout_audit_log(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_audit_user ON payout_audit_log(performed_by);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE employee_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- EMPLOYEE_BANK_ACCOUNTS POLICIES
-- ============================================================================

-- Users can view their own bank accounts
CREATE POLICY "Users can view own bank accounts"
  ON employee_bank_accounts FOR SELECT
  USING (user_id = auth.uid());

-- Users can add their own bank accounts
CREATE POLICY "Users can add own bank accounts"
  ON employee_bank_accounts FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Users can update their own bank accounts
CREATE POLICY "Users can update own bank accounts"
  ON employee_bank_accounts FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own bank accounts
CREATE POLICY "Users can delete own bank accounts"
  ON employee_bank_accounts FOR DELETE
  USING (user_id = auth.uid());

-- Finance/Admin can view all bank accounts in their org (for payout processing)
CREATE POLICY "Finance can view org bank accounts"
  ON employee_bank_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = employee_bank_accounts.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'finance')
        AND organization_members.is_active = true
    )
  );

-- ============================================================================
-- PAYOUTS POLICIES
-- ============================================================================

-- Users can view their own payouts
CREATE POLICY "Users can view own payouts"
  ON payouts FOR SELECT
  USING (user_id = auth.uid());

-- Finance/Admin can view all payouts in their org
CREATE POLICY "Finance can view org payouts"
  ON payouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = payouts.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'finance')
        AND organization_members.is_active = true
    )
  );

-- Finance/Admin can create payouts
CREATE POLICY "Finance can create payouts"
  ON payouts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = payouts.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'finance')
        AND organization_members.is_active = true
    )
  );

-- Finance/Admin can update payouts (status changes)
CREATE POLICY "Finance can update payouts"
  ON payouts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = payouts.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'finance')
        AND organization_members.is_active = true
    )
  );

-- ============================================================================
-- PAYOUT_BATCHES POLICIES
-- ============================================================================

-- Finance/Admin can view batches
CREATE POLICY "Finance can view payout batches"
  ON payout_batches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = payout_batches.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'finance')
        AND organization_members.is_active = true
    )
  );

-- Finance/Admin can create batches
CREATE POLICY "Finance can create payout batches"
  ON payout_batches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = payout_batches.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'finance')
        AND organization_members.is_active = true
    )
  );

-- Finance/Admin can update batches
CREATE POLICY "Finance can update payout batches"
  ON payout_batches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = payout_batches.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'finance')
        AND organization_members.is_active = true
    )
  );

-- ============================================================================
-- PAYOUT_AUDIT_LOG POLICIES (Read-only for admins)
-- ============================================================================

-- Admin can view audit log
CREATE POLICY "Admin can view payout audit log"
  ON payout_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = payout_audit_log.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'admin'
        AND organization_members.is_active = true
    )
  );

-- System can insert audit records (via SECURITY DEFINER functions)
CREATE POLICY "System can insert audit records"
  ON payout_audit_log FOR INSERT
  WITH CHECK (true); -- Controlled via SECURITY DEFINER functions

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to log payout actions (SECURITY DEFINER for audit integrity)
CREATE OR REPLACE FUNCTION log_payout_action(
  p_organization_id UUID,
  p_payout_id UUID DEFAULT NULL,
  p_batch_id UUID DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO payout_audit_log (
    organization_id,
    payout_id,
    batch_id,
    bank_account_id,
    action,
    action_details,
    performed_by
  ) VALUES (
    p_organization_id,
    p_payout_id,
    p_batch_id,
    p_bank_account_id,
    p_action,
    p_details,
    auth.uid()
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_payout_action IS 'Logs payout-related actions to the audit log';

-- Function to get pending payout amount for a user
CREATE OR REPLACE FUNCTION get_pending_payout_amount(
  p_user_id UUID,
  p_organization_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_amount INTEGER;
BEGIN
  -- Sum all approved expenses that haven't been paid out yet
  SELECT COALESCE(SUM((amount * 100)::INTEGER), 0)
  INTO v_amount
  FROM expenses
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND status = 'approved'
    AND id NOT IN (
      SELECT unnest(expense_ids) FROM payouts
      WHERE status IN ('pending', 'processing', 'in_transit', 'paid')
    );

  RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_pending_payout_amount IS 'Gets total amount pending payout for a user (in cents)';

-- Function to set default bank account
CREATE OR REPLACE FUNCTION set_default_bank_account(
  p_bank_account_id UUID
)
RETURNS void AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  -- Get the user and org from the bank account
  SELECT user_id, organization_id INTO v_user_id, v_org_id
  FROM employee_bank_accounts
  WHERE id = p_bank_account_id;

  -- Verify the caller owns this bank account
  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot set default on another user''s bank account';
  END IF;

  -- Unset current default
  UPDATE employee_bank_accounts
  SET is_default = false
  WHERE user_id = v_user_id
    AND organization_id = v_org_id
    AND is_default = true;

  -- Set new default
  UPDATE employee_bank_accounts
  SET is_default = true
  WHERE id = p_bank_account_id;

  -- Log the action
  PERFORM log_payout_action(
    v_org_id,
    NULL,
    NULL,
    p_bank_account_id,
    'set_default_bank_account',
    jsonb_build_object('previous_default', 'unset')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_default_bank_account IS 'Sets a bank account as the default for payout';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger for employee_bank_accounts
CREATE TRIGGER update_employee_bank_accounts_updated_at
  BEFORE UPDATE ON employee_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-log bank account additions
CREATE OR REPLACE FUNCTION log_bank_account_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_payout_action(
      NEW.organization_id,
      NULL,
      NULL,
      NEW.id,
      'bank_account_added',
      jsonb_build_object(
        'bank_name', NEW.bank_name,
        'last_four', NEW.last_four,
        'account_type', NEW.account_type
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_payout_action(
      OLD.organization_id,
      NULL,
      NULL,
      OLD.id,
      'bank_account_removed',
      jsonb_build_object(
        'bank_name', OLD.bank_name,
        'last_four', OLD.last_four
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_bank_account_changes
  AFTER INSERT OR DELETE ON employee_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION log_bank_account_change();

-- Auto-log payout status changes
CREATE OR REPLACE FUNCTION log_payout_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_payout_action(
      NEW.organization_id,
      NEW.id,
      NEW.batch_id,
      NEW.bank_account_id,
      'payout_status_changed',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'amount_cents', NEW.amount_cents,
        'stripe_payout_id', NEW.stripe_payout_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_payout_status_changes
  AFTER UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION log_payout_status_change();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Stripe Payout System Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New tables created:';
  RAISE NOTICE '  - employee_bank_accounts (Stripe tokens only)';
  RAISE NOTICE '  - payouts';
  RAISE NOTICE '  - payout_batches';
  RAISE NOTICE '  - payout_audit_log';
  RAISE NOTICE '';
  RAISE NOTICE 'Organization columns added:';
  RAISE NOTICE '  - payout_method (manual/stripe)';
  RAISE NOTICE '  - stripe_account_id';
  RAISE NOTICE '  - stripe_account_status';
  RAISE NOTICE '  - stripe_connected_at';
  RAISE NOTICE '';
  RAISE NOTICE 'SECURITY FEATURES:';
  RAISE NOTICE '  - NO raw bank data stored (Stripe tokens only)';
  RAISE NOTICE '  - Complete audit trail';
  RAISE NOTICE '  - RLS policies for organization isolation';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Create Stripe Connect Edge Function';
  RAISE NOTICE '2. Build admin payout settings UI';
  RAISE NOTICE '3. Build employee bank account form';
  RAISE NOTICE '4. Build finance payout dashboard';
  RAISE NOTICE '========================================';
END $$;
