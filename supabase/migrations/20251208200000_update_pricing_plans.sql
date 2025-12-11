-- ============================================================================
-- Update Pricing Plans - December 8, 2025
-- ============================================================================
--
-- NEW PRICING STRUCTURE:
-- - Free:       3 users, 20 receipts/month, ALL features
-- - Starter:    5 users, $9.99/mo, unlimited receipts, ALL features
-- - Team:       10 users, $18.99/mo, unlimited receipts, ALL features
-- - Business:   20 users, $29.99/mo, unlimited receipts, ALL features
-- - Enterprise: 50 users, $69/mo, unlimited receipts, ALL features
--
-- KEY CHANGES:
-- - All plans now have full features (payouts, GPS, approvals, API)
-- - Free tier increased from 10 to 20 receipts/month
-- - User limits adjusted to match new tiers
-- - Pricing simplified across tiers
-- ============================================================================

-- Update existing plans
UPDATE subscription_plans
SET
  display_name = 'Free',
  description = 'Get started with expense tracking',
  monthly_price_cents = 0,
  annual_price_cents = 0,
  min_users = 1,
  max_users = 3,
  features = '{
    "receipts_per_month": 20,
    "stripe_payouts_enabled": true,
    "api_access_enabled": true,
    "mileage_gps_enabled": true,
    "multi_level_approval": true,
    "support_level": "community"
  }'::jsonb,
  display_order = 1,
  is_public = true,
  updated_at = NOW()
WHERE name = 'free';

UPDATE subscription_plans
SET
  display_name = 'Starter',
  description = 'Perfect for small teams',
  monthly_price_cents = 999,
  annual_price_cents = 9590,
  min_users = 1,
  max_users = 5,
  features = '{
    "receipts_per_month": null,
    "stripe_payouts_enabled": true,
    "api_access_enabled": true,
    "mileage_gps_enabled": true,
    "multi_level_approval": true,
    "support_level": "email"
  }'::jsonb,
  display_order = 2,
  is_public = true,
  updated_at = NOW()
WHERE name = 'starter';

UPDATE subscription_plans
SET
  display_name = 'Team',
  description = 'Built for growing teams',
  monthly_price_cents = 1899,
  annual_price_cents = 18230,
  min_users = 1,
  max_users = 10,
  features = '{
    "receipts_per_month": null,
    "stripe_payouts_enabled": true,
    "api_access_enabled": true,
    "mileage_gps_enabled": true,
    "multi_level_approval": true,
    "support_level": "priority"
  }'::jsonb,
  display_order = 3,
  is_public = true,
  updated_at = NOW()
WHERE name = 'team';

UPDATE subscription_plans
SET
  display_name = 'Business',
  description = 'For scaling organizations',
  monthly_price_cents = 2999,
  annual_price_cents = 28790,
  min_users = 1,
  max_users = 20,
  features = '{
    "receipts_per_month": null,
    "stripe_payouts_enabled": true,
    "api_access_enabled": true,
    "mileage_gps_enabled": true,
    "multi_level_approval": true,
    "support_level": "priority"
  }'::jsonb,
  display_order = 4,
  is_public = true,
  updated_at = NOW()
WHERE name = 'business';

UPDATE subscription_plans
SET
  display_name = 'Enterprise',
  description = 'For large organizations',
  monthly_price_cents = 5999,
  annual_price_cents = 57590,
  min_users = 1,
  max_users = 50,
  features = '{
    "receipts_per_month": null,
    "stripe_payouts_enabled": true,
    "api_access_enabled": true,
    "mileage_gps_enabled": true,
    "multi_level_approval": true,
    "support_level": "dedicated"
  }'::jsonb,
  display_order = 5,
  is_public = true,
  updated_at = NOW()
WHERE name = 'enterprise';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Pricing Plans Updated Successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New Pricing Structure:';
  RAISE NOTICE '  Free:       3 users, 20 receipts/mo, $0';
  RAISE NOTICE '  Starter:    5 users, unlimited, $9.99/mo';
  RAISE NOTICE '  Team:       10 users, unlimited, $18.99/mo';
  RAISE NOTICE '  Business:   20 users, unlimited, $29.99/mo';
  RAISE NOTICE '  Enterprise: 50 users, unlimited, $59.99/mo';
  RAISE NOTICE '';
  RAISE NOTICE 'All plans now include full features!';
  RAISE NOTICE '========================================';
END $$;
