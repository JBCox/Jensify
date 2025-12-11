-- ============================================================================
-- Jensify Database Schema - Subscription System
-- Created: 2025-12-07
-- Description: SaaS subscription billing with Stripe, Super Admin dashboard
--
-- PRICING TIERS:
-- - Free:       1-3 users, 10 receipts/month, limited features
-- - Starter:    1-5 users, $9.99/mo or $95.90/yr, all features
-- - Team:       6-15 users, $24.99/mo or $239.90/yr, all features
-- - Business:   16-50 users, $59.99/mo or $575.90/yr, all features
-- - Enterprise: 50+ users, custom pricing, all features
--
-- SECURITY NOTES:
-- 1. Super Admins CANNOT access customer expense/receipt data
-- 2. RLS policies enforce strict data isolation
-- 3. Complete audit trail for all billing actions
-- ============================================================================

-- ============================================================================
-- SUBSCRIPTION PLANS
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,                    -- 'free', 'starter', 'team', 'business', 'enterprise'
  display_name TEXT NOT NULL,                   -- 'Free', 'Starter', 'Team', etc.
  description TEXT,

  -- Pricing (in cents)
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  annual_price_cents INTEGER NOT NULL DEFAULT 0,

  -- User limits
  min_users INTEGER NOT NULL DEFAULT 1,
  max_users INTEGER,                            -- NULL = unlimited for enterprise

  -- Feature flags (determines what's enabled)
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "receipts_per_month": 10,              -- NULL = unlimited
  --   "stripe_payouts_enabled": false,
  --   "api_access_enabled": false,
  --   "mileage_gps_enabled": false,
  --   "multi_level_approval": false,
  --   "support_level": "community"           -- community, email, priority
  -- }

  -- Stripe product/price IDs (set after Stripe setup)
  stripe_product_id TEXT,
  stripe_monthly_price_id TEXT,
  stripe_annual_price_id TEXT,

  -- Display order and visibility
  display_order INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,              -- Enterprise is not public (custom quotes)
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE subscription_plans IS 'Available subscription plans/tiers for organizations';
COMMENT ON COLUMN subscription_plans.features IS 'Feature flags and limits for this plan tier';

-- Insert default plans
INSERT INTO subscription_plans (name, display_name, description, monthly_price_cents, annual_price_cents, min_users, max_users, features, display_order, is_public)
VALUES
  ('free', 'Free', 'Perfect for trying out Expensed', 0, 0, 1, 3,
   '{"receipts_per_month": 10, "stripe_payouts_enabled": false, "api_access_enabled": false, "mileage_gps_enabled": false, "multi_level_approval": false, "support_level": "community"}'::jsonb,
   1, true),

  ('starter', 'Starter', 'Great for small teams getting started', 999, 9590, 1, 5,
   '{"receipts_per_month": null, "stripe_payouts_enabled": true, "api_access_enabled": true, "mileage_gps_enabled": true, "multi_level_approval": true, "support_level": "email"}'::jsonb,
   2, true),

  ('team', 'Team', 'Built for growing teams', 2499, 23990, 6, 15,
   '{"receipts_per_month": null, "stripe_payouts_enabled": true, "api_access_enabled": true, "mileage_gps_enabled": true, "multi_level_approval": true, "support_level": "priority"}'::jsonb,
   3, true),

  ('business', 'Business', 'For larger organizations', 5999, 57590, 16, 50,
   '{"receipts_per_month": null, "stripe_payouts_enabled": true, "api_access_enabled": true, "mileage_gps_enabled": true, "multi_level_approval": true, "support_level": "priority"}'::jsonb,
   4, true),

  ('enterprise', 'Enterprise', 'Custom solutions for large enterprises', 0, 0, 51, NULL,
   '{"receipts_per_month": null, "stripe_payouts_enabled": true, "api_access_enabled": true, "mileage_gps_enabled": true, "multi_level_approval": true, "support_level": "dedicated"}'::jsonb,
   5, false)
ON CONFLICT (name) DO NOTHING;

-- Index for quick plan lookups
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active, display_order);

-- ============================================================================
-- ORGANIZATION SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),

  -- Stripe IDs
  stripe_customer_id TEXT,                      -- cus_xxx (for billing, NOT Connect)
  stripe_subscription_id TEXT,                  -- sub_xxx

  -- Subscription status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',           -- Currently paying or on free plan
    'trialing',         -- On paid feature trial
    'past_due',         -- Payment failed, still has access temporarily
    'canceled',         -- Canceled at period end
    'unpaid',           -- Payment failed, access restricted
    'paused'            -- Temporarily suspended (by admin)
  )),
  billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),

  -- Billing dates
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,

  -- Usage tracking (reset monthly)
  current_user_count INTEGER DEFAULT 0,
  current_month_receipts INTEGER DEFAULT 0,
  usage_reset_at TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),

  -- Pricing overrides (for custom deals/discounts)
  custom_price_cents INTEGER,                   -- Override plan price
  discount_percent NUMERIC(5,2),                -- Permanent discount (0-100)
  discount_expires_at TIMESTAMPTZ,              -- NULL = permanent
  discount_reason TEXT,                         -- Why discount was applied

  -- Billing contact (may differ from org admin)
  billing_email TEXT,
  billing_name TEXT,
  billing_company TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE organization_subscriptions IS 'Organization subscription status and billing details';
COMMENT ON COLUMN organization_subscriptions.stripe_customer_id IS 'Stripe Customer ID for billing (different from Stripe Connect account)';
COMMENT ON COLUMN organization_subscriptions.custom_price_cents IS 'Override monthly price for custom deals';
COMMENT ON COLUMN organization_subscriptions.discount_percent IS 'Percentage discount (0-100), may be temporary or permanent';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org ON organization_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON organization_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_stripe ON organization_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_period_end ON organization_subscriptions(current_period_end) WHERE status = 'active';

-- ============================================================================
-- SUBSCRIPTION INVOICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES organization_subscriptions(id),

  -- Stripe IDs
  stripe_invoice_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,

  -- Invoice details
  amount_cents INTEGER NOT NULL,
  amount_paid_cents INTEGER DEFAULT 0,
  amount_refunded_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN (
    'draft', 'open', 'paid', 'void', 'uncollectible', 'refunded', 'partially_refunded'
  )),

  -- Description
  description TEXT,
  line_items JSONB,                             -- Array of line item details

  -- Dates
  invoice_date TIMESTAMPTZ DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- PDF URLs (from Stripe)
  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE subscription_invoices IS 'Billing history and invoice records';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_org ON subscription_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_date ON subscription_invoices(organization_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_status ON subscription_invoices(status);

-- ============================================================================
-- COUPON CODES
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupon_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,                    -- e.g., 'WELCOME20', 'STARTUP50'

  -- Discount details
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL,        -- Percent (0-100) or cents for fixed

  -- Restrictions
  applies_to_plans TEXT[],                      -- NULL = all plans, e.g., ['starter', 'team']
  min_users INTEGER,                            -- Minimum user requirement
  max_redemptions INTEGER,                      -- NULL = unlimited
  max_redemptions_per_org INTEGER DEFAULT 1,    -- Usually 1
  redemption_count INTEGER DEFAULT 0,

  -- Duration of discount
  duration TEXT CHECK (duration IN ('once', 'repeating', 'forever')),
  duration_months INTEGER,                      -- For 'repeating' (e.g., 3 = 3 months)

  -- Validity period
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,

  -- Stripe coupon ID (if synced)
  stripe_coupon_id TEXT,

  -- Metadata
  campaign_name TEXT,                           -- e.g., 'Black Friday 2024'
  internal_notes TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE coupon_codes IS 'Promotional coupon codes and discounts';
COMMENT ON COLUMN coupon_codes.duration IS 'once = first invoice, repeating = X months, forever = all invoices';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coupon_codes_code ON coupon_codes(code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coupon_codes_valid ON coupon_codes(valid_from, valid_until) WHERE is_active = true;

-- ============================================================================
-- COUPON REDEMPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupon_codes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES organization_subscriptions(id),

  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  redeemed_by UUID REFERENCES auth.users(id),

  -- Calculated discount for audit
  discount_applied_cents INTEGER,
  discount_type TEXT,                           -- Snapshot of coupon type at redemption
  discount_value NUMERIC(10,2),                 -- Snapshot of coupon value at redemption

  -- For repeating coupons
  remaining_months INTEGER,                     -- How many more months of discount

  UNIQUE(coupon_id, organization_id)
);

COMMENT ON TABLE coupon_redemptions IS 'Track which organizations have used which coupons';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_org ON coupon_redemptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);

-- ============================================================================
-- SUPER ADMINS (Platform-level administrators)
-- ============================================================================

CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Display info
  display_name TEXT,

  -- Granular permissions
  permissions JSONB DEFAULT '{
    "view_organizations": true,
    "manage_subscriptions": true,
    "issue_refunds": true,
    "create_coupons": true,
    "view_analytics": true,
    "manage_super_admins": false
  }'::jsonb,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE super_admins IS 'Platform-level administrators who manage all organizations (not org-level admins)';
COMMENT ON COLUMN super_admins.permissions IS 'Granular permission flags for different super admin capabilities';

-- ============================================================================
-- SUBSCRIPTION AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES organization_subscriptions(id) ON DELETE SET NULL,

  -- Action details
  action TEXT NOT NULL,
  -- Actions: 'plan_created', 'plan_upgraded', 'plan_downgraded', 'plan_canceled',
  --          'payment_succeeded', 'payment_failed', 'refund_issued',
  --          'coupon_applied', 'discount_added', 'discount_removed',
  --          'subscription_paused', 'subscription_resumed',
  --          'trial_started', 'trial_extended', 'trial_ended'
  action_details JSONB DEFAULT '{}'::jsonb,

  -- Who performed the action
  performed_by UUID REFERENCES auth.users(id),
  is_super_admin BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,              -- Automated actions (webhooks, etc.)

  -- Request metadata (for debugging)
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE subscription_audit_log IS 'Complete audit trail of all subscription and billing changes';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscription_audit_org ON subscription_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_action ON subscription_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_super_admin ON subscription_audit_log(is_super_admin, created_at DESC) WHERE is_super_admin = true;

-- ============================================================================
-- ADD SUBSCRIPTION COLUMNS TO ORGANIZATIONS
-- ============================================================================

-- Add subscription-related columns to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

COMMENT ON COLUMN organizations.stripe_customer_id IS 'Stripe Customer ID for billing (cus_xxx)';

-- Index for customer lookup
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer
  ON organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to check if an organization can use a feature
CREATE OR REPLACE FUNCTION check_feature_access(
  p_organization_id UUID,
  p_feature TEXT
)
RETURNS BOOLEAN 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_features JSONB;
  v_feature_value JSONB;
BEGIN
  -- Get the features for this organization's plan
  SELECT sp.features INTO v_features
  FROM organization_subscriptions os
  JOIN subscription_plans sp ON sp.id = os.plan_id
  WHERE os.organization_id = p_organization_id
    AND os.status IN ('active', 'trialing');

  IF v_features IS NULL THEN
    -- No active subscription, treat as free tier
    SELECT features INTO v_features
    FROM subscription_plans
    WHERE name = 'free';
  END IF;

  -- Get the specific feature value
  v_feature_value := v_features -> p_feature;

  -- Handle different feature types
  IF v_feature_value IS NULL THEN
    RETURN false;
  ELSIF v_feature_value::text = 'true' THEN
    RETURN true;
  ELSIF v_feature_value::text = 'false' THEN
    RETURN false;
  ELSE
    -- Numeric value means it's a limit, not a boolean
    RETURN true;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_feature_access(UUID, TEXT) IS 'Check if an organization has access to a specific feature based on their subscription plan';

-- Function to get remaining receipt limit
CREATE OR REPLACE FUNCTION get_receipt_limit_remaining(
  p_organization_id UUID
)
RETURNS TABLE(limit_value INTEGER, used INTEGER, remaining INTEGER) 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_features JSONB;
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  -- Get the features for this organization's plan
  SELECT sp.features, os.current_month_receipts
  INTO v_features, v_used
  FROM organization_subscriptions os
  JOIN subscription_plans sp ON sp.id = os.plan_id
  WHERE os.organization_id = p_organization_id
    AND os.status IN ('active', 'trialing');

  IF v_features IS NULL THEN
    -- No active subscription, use free tier
    SELECT features INTO v_features
    FROM subscription_plans
    WHERE name = 'free';
    v_used := 0;
  END IF;

  -- Get the receipt limit
  v_limit := (v_features ->> 'receipts_per_month')::INTEGER;

  IF v_limit IS NULL THEN
    -- NULL means unlimited
    RETURN QUERY SELECT NULL::INTEGER, v_used, NULL::INTEGER;
  ELSE
    RETURN QUERY SELECT v_limit, v_used, GREATEST(0, v_limit - v_used);
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_receipt_limit_remaining(UUID) IS 'Get receipt usage limits for an organization';

-- Function to increment receipt count
CREATE OR REPLACE FUNCTION increment_receipt_count(
  p_organization_id UUID
)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organization_subscriptions
  SET current_month_receipts = current_month_receipts + 1,
      updated_at = NOW()
  WHERE organization_id = p_organization_id;

  -- If no subscription exists, create one on free plan
  IF NOT FOUND THEN
    INSERT INTO organization_subscriptions (organization_id, plan_id, status, current_month_receipts)
    SELECT p_organization_id, sp.id, 'active', 1
    FROM subscription_plans sp
    WHERE sp.name = 'free';
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_receipt_count(UUID) IS 'Increment the monthly receipt count for usage tracking';

-- Function to reset monthly usage (called by cron)
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS INTEGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE organization_subscriptions
  SET current_month_receipts = 0,
      usage_reset_at = date_trunc('month', NOW()),
      updated_at = NOW()
  WHERE usage_reset_at < date_trunc('month', NOW());

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_monthly_usage() IS 'Reset monthly usage counters (run via pg_cron on 1st of each month)';

-- Function to check if user is a super admin
CREATE OR REPLACE FUNCTION is_super_admin(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM super_admins
    WHERE user_id = p_user_id
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_super_admin(UUID) IS 'Check if a user is an active super admin';

-- Function to get super admin permissions
CREATE OR REPLACE FUNCTION get_super_admin_permissions(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT permissions FROM super_admins
    WHERE user_id = p_user_id
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_super_admin_permissions(UUID) IS 'Get super admin permission flags';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update coupon redemption count
CREATE OR REPLACE FUNCTION update_coupon_redemption_count()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE coupon_codes
  SET redemption_count = redemption_count + 1
  WHERE id = NEW.coupon_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_coupon_count ON coupon_redemptions;
CREATE TRIGGER trigger_update_coupon_count
  AFTER INSERT ON coupon_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION update_coupon_redemption_count();

-- Trigger to update organization_subscriptions.updated_at
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_subscription_updated_at ON organization_subscriptions;
CREATE TRIGGER trigger_update_subscription_updated_at
  BEFORE UPDATE ON organization_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SUBSCRIPTION PLANS POLICIES (Public read for active plans)
-- ============================================================================

CREATE POLICY "Anyone can view active public plans"
  ON subscription_plans FOR SELECT
  USING (is_active = true AND is_public = true);

CREATE POLICY "Super admins can view all plans"
  ON subscription_plans FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Super admins can manage plans"
  ON subscription_plans FOR ALL
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'manage_subscriptions')::boolean = true);

-- ============================================================================
-- ORGANIZATION SUBSCRIPTIONS POLICIES
-- ============================================================================

CREATE POLICY "Members can view their org subscription"
  ON organization_subscriptions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Org admins can update subscription billing info"
  ON organization_subscriptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_subscriptions.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'admin'
        AND organization_members.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_subscriptions.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'admin'
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "Super admins can view all subscriptions"
  ON organization_subscriptions FOR SELECT
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'view_organizations')::boolean = true);

CREATE POLICY "Super admins can manage all subscriptions"
  ON organization_subscriptions FOR ALL
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'manage_subscriptions')::boolean = true);

-- ============================================================================
-- SUBSCRIPTION INVOICES POLICIES
-- ============================================================================

CREATE POLICY "Members can view their org invoices"
  ON subscription_invoices FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Super admins can view all invoices"
  ON subscription_invoices FOR SELECT
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'view_organizations')::boolean = true);

CREATE POLICY "Super admins can manage invoices"
  ON subscription_invoices FOR ALL
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'issue_refunds')::boolean = true);

-- ============================================================================
-- COUPON CODES POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view active public coupons by code"
  ON coupon_codes FOR SELECT
  USING (is_active = true AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW()));

CREATE POLICY "Super admins can view all coupons"
  ON coupon_codes FOR SELECT
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'create_coupons')::boolean = true);

CREATE POLICY "Super admins can manage coupons"
  ON coupon_codes FOR ALL
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'create_coupons')::boolean = true);

-- ============================================================================
-- COUPON REDEMPTIONS POLICIES
-- ============================================================================

CREATE POLICY "Org admins can view their redemptions"
  ON coupon_redemptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = coupon_redemptions.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'admin'
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "Super admins can view all redemptions"
  ON coupon_redemptions FOR SELECT
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'create_coupons')::boolean = true);

-- ============================================================================
-- SUPER ADMINS POLICIES
-- ============================================================================

CREATE POLICY "Super admins can view super admin list"
  ON super_admins FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Super admins with manage permission can manage super admins"
  ON super_admins FOR ALL
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'manage_super_admins')::boolean = true);

-- ============================================================================
-- SUBSCRIPTION AUDIT LOG POLICIES
-- ============================================================================

CREATE POLICY "Org admins can view their audit log"
  ON subscription_audit_log FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

CREATE POLICY "Super admins can view all audit logs"
  ON subscription_audit_log FOR SELECT
  USING (is_super_admin() AND (get_super_admin_permissions() ->> 'view_analytics')::boolean = true);

CREATE POLICY "System can insert audit logs"
  ON subscription_audit_log FOR INSERT
  WITH CHECK (true);  -- Controlled by SECURITY DEFINER functions

-- ============================================================================
-- HELPER VIEW FOR SUPER ADMIN DASHBOARD (No private data!)
-- ============================================================================

CREATE OR REPLACE VIEW super_admin_organization_summary AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.created_at AS org_created_at,

  -- Subscription info
  os.status AS subscription_status,
  os.billing_cycle,
  os.current_period_end,
  os.current_user_count,
  os.current_month_receipts,
  os.billing_email,
  os.discount_percent,
  os.discount_expires_at,

  -- Plan info
  sp.name AS plan_name,
  sp.display_name AS plan_display_name,
  sp.monthly_price_cents,
  sp.annual_price_cents,

  -- Calculated revenue
  CASE
    WHEN os.custom_price_cents IS NOT NULL THEN os.custom_price_cents
    WHEN os.billing_cycle = 'annual' THEN sp.annual_price_cents / 12
    ELSE sp.monthly_price_cents
  END AS effective_mrr_cents,

  -- User count (from organization_members, not expenses)
  (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id AND om.is_active = true) AS active_member_count

FROM organizations o
LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
LEFT JOIN subscription_plans sp ON sp.id = os.plan_id;

COMMENT ON VIEW super_admin_organization_summary IS 'Summary view for super admin dashboard - NO private expense/receipt data';

-- Grant access to the view for super admins via RLS on underlying tables
-- (The view inherits RLS from the tables it queries)

-- ============================================================================
-- ANALYTICS FUNCTIONS FOR SUPER ADMIN
-- ============================================================================

-- Get MRR (Monthly Recurring Revenue)
CREATE OR REPLACE FUNCTION get_mrr_stats()
RETURNS TABLE(
  total_mrr_cents BIGINT,
  total_arr_cents BIGINT,
  paying_customer_count BIGINT,
  free_customer_count BIGINT,
  average_revenue_per_customer_cents INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(
      CASE
        WHEN os.custom_price_cents IS NOT NULL THEN os.custom_price_cents
        WHEN os.billing_cycle = 'annual' THEN sp.annual_price_cents / 12
        ELSE sp.monthly_price_cents
      END
    ), 0)::BIGINT AS total_mrr_cents,
    COALESCE(SUM(
      CASE
        WHEN os.custom_price_cents IS NOT NULL THEN os.custom_price_cents * 12
        WHEN os.billing_cycle = 'annual' THEN sp.annual_price_cents
        ELSE sp.monthly_price_cents * 12
      END
    ), 0)::BIGINT AS total_arr_cents,
    COUNT(*) FILTER (WHERE sp.monthly_price_cents > 0)::BIGINT AS paying_customer_count,
    COUNT(*) FILTER (WHERE sp.monthly_price_cents = 0)::BIGINT AS free_customer_count,
    CASE
      WHEN COUNT(*) FILTER (WHERE sp.monthly_price_cents > 0) > 0 THEN
        (SUM(
          CASE
            WHEN os.custom_price_cents IS NOT NULL THEN os.custom_price_cents
            WHEN os.billing_cycle = 'annual' THEN sp.annual_price_cents / 12
            ELSE sp.monthly_price_cents
          END
        ) FILTER (WHERE sp.monthly_price_cents > 0) / COUNT(*) FILTER (WHERE sp.monthly_price_cents > 0))::INTEGER
      ELSE 0
    END AS average_revenue_per_customer_cents
  FROM organization_subscriptions os
  JOIN subscription_plans sp ON sp.id = os.plan_id
  WHERE os.status IN ('active', 'trialing');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_mrr_stats() IS 'Get MRR/ARR statistics for super admin analytics';

-- Get plan distribution
CREATE OR REPLACE FUNCTION get_plan_distribution()
RETURNS TABLE(
  plan_name TEXT,
  plan_display_name TEXT,
  customer_count BIGINT,
  percentage NUMERIC(5,2)
) 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM organization_subscriptions WHERE status IN ('active', 'trialing');

  RETURN QUERY
  SELECT
    sp.name,
    sp.display_name,
    COUNT(os.id)::BIGINT AS customer_count,
    CASE
      WHEN v_total > 0 THEN ROUND((COUNT(os.id)::NUMERIC / v_total) * 100, 2)
      ELSE 0
    END AS percentage
  FROM subscription_plans sp
  LEFT JOIN organization_subscriptions os ON os.plan_id = sp.id AND os.status IN ('active', 'trialing')
  GROUP BY sp.id, sp.name, sp.display_name, sp.display_order
  ORDER BY sp.display_order;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_plan_distribution() IS 'Get customer distribution across plans for super admin analytics';

-- ============================================================================
-- CREATE DEFAULT SUBSCRIPTIONS FOR EXISTING ORGANIZATIONS
-- ============================================================================

DO $$
DECLARE
  v_free_plan_id UUID;
  v_org RECORD;
BEGIN
  -- Get the free plan ID
  SELECT id INTO v_free_plan_id FROM subscription_plans WHERE name = 'free';

  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Free plan not found. Please ensure subscription_plans table is populated.';
  END IF;

  -- Create subscriptions for orgs that don't have one
  FOR v_org IN
    SELECT o.id, o.created_at
    FROM organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM organization_subscriptions os WHERE os.organization_id = o.id
    )
  LOOP
    INSERT INTO organization_subscriptions (
      organization_id,
      plan_id,
      status,
      current_period_start,
      current_user_count
    )
    SELECT
      v_org.id,
      v_free_plan_id,
      'active',
      v_org.created_at,
      (SELECT COUNT(*) FROM organization_members WHERE organization_id = v_org.id AND is_active = true)
    ON CONFLICT (organization_id) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Created default free subscriptions for all existing organizations';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Subscription System Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New tables created:';
  RAISE NOTICE '  - subscription_plans (5 tiers)';
  RAISE NOTICE '  - organization_subscriptions';
  RAISE NOTICE '  - subscription_invoices';
  RAISE NOTICE '  - coupon_codes';
  RAISE NOTICE '  - coupon_redemptions';
  RAISE NOTICE '  - super_admins';
  RAISE NOTICE '  - subscription_audit_log';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  - check_feature_access(org_id, feature)';
  RAISE NOTICE '  - get_receipt_limit_remaining(org_id)';
  RAISE NOTICE '  - increment_receipt_count(org_id)';
  RAISE NOTICE '  - reset_monthly_usage()';
  RAISE NOTICE '  - is_super_admin(user_id)';
  RAISE NOTICE '  - get_super_admin_permissions(user_id)';
  RAISE NOTICE '  - get_mrr_stats()';
  RAISE NOTICE '  - get_plan_distribution()';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Set up Stripe products/prices and update stripe_*_id columns';
  RAISE NOTICE '2. Create admin@expensed.app user and add to super_admins';
  RAISE NOTICE '3. Deploy stripe-billing edge function';
  RAISE NOTICE '4. Deploy stripe-webhooks edge function';
  RAISE NOTICE '5. Build Angular subscription service and UI';
  RAISE NOTICE '========================================';
END $$;
