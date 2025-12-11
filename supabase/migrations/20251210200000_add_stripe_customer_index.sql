-- ============================================================================
-- Migration: Add stripe_customer_id index
-- ============================================================================
-- Adds an index on organization_subscriptions.stripe_customer_id for faster
-- customer lookups when processing Stripe webhooks.
-- ============================================================================

-- Add index for stripe_customer_id lookups (webhooks need fast customer resolution)
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_stripe_customer
  ON organization_subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Add comment explaining the index
COMMENT ON INDEX idx_org_subscriptions_stripe_customer IS
  'Index for fast Stripe customer lookups during webhook processing';
