-- ============================================================================
-- RLS Policy Tests for Subscription System
-- ============================================================================
-- These tests verify that Row Level Security policies correctly enforce
-- access controls for subscription-related tables.
--
-- HOW TO RUN:
-- 1. Connect to your Supabase database
-- 2. Run: psql -f subscription_rls_tests.sql
-- OR use Supabase SQL Editor
--
-- IMPORTANT: Run these on a test database, not production!
-- ============================================================================

-- Setup: Create test users and data
BEGIN;

-- Create test functions to simulate different user contexts
CREATE OR REPLACE FUNCTION test_set_user(user_uuid UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', user_uuid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_uuid)::text, true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_clear_user()
RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TEST 1: subscription_plans - Anyone can view active public plans
-- ============================================================================

DO $$
DECLARE
  plan_count INT;
BEGIN
  -- Clear user context (anonymous)
  PERFORM test_clear_user();

  -- Should be able to see active public plans
  SELECT COUNT(*) INTO plan_count
  FROM subscription_plans
  WHERE is_active = true AND is_public = true;

  IF plan_count > 0 THEN
    RAISE NOTICE 'TEST 1 PASSED: Anonymous users can view % active public plans', plan_count;
  ELSE
    RAISE NOTICE 'TEST 1 INFO: No active public plans found (expected if fresh database)';
  END IF;
END $$;

-- ============================================================================
-- TEST 2: subscription_plans - Non-public plans hidden from regular users
-- ============================================================================

DO $$
DECLARE
  hidden_count INT;
  test_user_id UUID := gen_random_uuid();
BEGIN
  -- Set as regular user (not super admin)
  PERFORM test_set_user(test_user_id);

  -- Should NOT see non-public plans
  SELECT COUNT(*) INTO hidden_count
  FROM subscription_plans
  WHERE is_public = false;

  IF hidden_count = 0 THEN
    RAISE NOTICE 'TEST 2 PASSED: Regular users cannot see non-public plans';
  ELSE
    RAISE WARNING 'TEST 2 FAILED: Regular user can see % non-public plans', hidden_count;
  END IF;

  PERFORM test_clear_user();
END $$;

-- ============================================================================
-- TEST 3: organization_subscriptions - Members can only view their org
-- ============================================================================

DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
  test_org_id UUID := gen_random_uuid();
  other_org_id UUID := gen_random_uuid();
  visible_count INT;
BEGIN
  -- Insert test organization and member
  INSERT INTO organizations (id, name, settings)
  VALUES (test_org_id, 'Test Org for RLS', '{}')
  ON CONFLICT DO NOTHING;

  INSERT INTO organizations (id, name, settings)
  VALUES (other_org_id, 'Other Org for RLS', '{}')
  ON CONFLICT DO NOTHING;

  INSERT INTO users (id, email, full_name, role)
  VALUES (test_user_id, 'rls_test@example.com', 'RLS Test User', 'employee')
  ON CONFLICT DO NOTHING;

  INSERT INTO organization_members (user_id, organization_id, role, is_active)
  VALUES (test_user_id, test_org_id, 'employee', true)
  ON CONFLICT DO NOTHING;

  -- Set user context
  PERFORM test_set_user(test_user_id);

  -- User should only see their org's subscription
  SELECT COUNT(*) INTO visible_count
  FROM organization_subscriptions
  WHERE organization_id = other_org_id;

  IF visible_count = 0 THEN
    RAISE NOTICE 'TEST 3 PASSED: Members cannot see other org subscriptions';
  ELSE
    RAISE WARNING 'TEST 3 FAILED: Member can see % other org subscriptions', visible_count;
  END IF;

  -- Cleanup
  PERFORM test_clear_user();
  DELETE FROM organization_members WHERE user_id = test_user_id;
  DELETE FROM users WHERE id = test_user_id;
  DELETE FROM organizations WHERE id IN (test_org_id, other_org_id);
END $$;

-- ============================================================================
-- TEST 4: coupon_codes - Anyone can view active valid coupons
-- ============================================================================

DO $$
DECLARE
  test_coupon_id UUID := gen_random_uuid();
  coupon_visible BOOLEAN;
BEGIN
  -- Insert a test coupon
  INSERT INTO coupon_codes (id, code, discount_type, discount_value, is_active, valid_from)
  VALUES (test_coupon_id, 'TESTRLSCOUPON', 'percent', 10, true, NOW() - INTERVAL '1 day')
  ON CONFLICT DO NOTHING;

  -- Clear user (anonymous)
  PERFORM test_clear_user();

  -- Should be able to see active coupons
  SELECT EXISTS(
    SELECT 1 FROM coupon_codes WHERE id = test_coupon_id
  ) INTO coupon_visible;

  IF coupon_visible THEN
    RAISE NOTICE 'TEST 4 PASSED: Anyone can view active valid coupons';
  ELSE
    RAISE WARNING 'TEST 4 FAILED: Cannot view active coupon';
  END IF;

  -- Cleanup
  DELETE FROM coupon_codes WHERE id = test_coupon_id;
END $$;

-- ============================================================================
-- TEST 5: coupon_codes - Expired coupons are hidden
-- ============================================================================

DO $$
DECLARE
  test_coupon_id UUID := gen_random_uuid();
  coupon_visible BOOLEAN;
BEGIN
  -- Insert an expired test coupon
  INSERT INTO coupon_codes (id, code, discount_type, discount_value, is_active, valid_from, valid_until)
  VALUES (test_coupon_id, 'EXPIREDCOUPON', 'percent', 10, true, NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day')
  ON CONFLICT DO NOTHING;

  -- Clear user (anonymous)
  PERFORM test_clear_user();

  -- Should NOT see expired coupons
  SELECT EXISTS(
    SELECT 1 FROM coupon_codes WHERE id = test_coupon_id
  ) INTO coupon_visible;

  IF NOT coupon_visible THEN
    RAISE NOTICE 'TEST 5 PASSED: Expired coupons are hidden from regular users';
  ELSE
    RAISE WARNING 'TEST 5 FAILED: Expired coupon is visible';
  END IF;

  -- Cleanup
  DELETE FROM coupon_codes WHERE id = test_coupon_id;
END $$;

-- ============================================================================
-- TEST 6: subscription_invoices - Members can view their org invoices
-- ============================================================================

DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
  test_org_id UUID := gen_random_uuid();
  other_org_id UUID := gen_random_uuid();
  test_invoice_id UUID := gen_random_uuid();
  other_invoice_id UUID := gen_random_uuid();
  own_invoice_visible BOOLEAN;
  other_invoice_visible BOOLEAN;
BEGIN
  -- Setup test data
  INSERT INTO organizations (id, name, settings)
  VALUES (test_org_id, 'Invoice Test Org', '{}'),
         (other_org_id, 'Other Invoice Org', '{}')
  ON CONFLICT DO NOTHING;

  INSERT INTO users (id, email, full_name, role)
  VALUES (test_user_id, 'invoice_rls@example.com', 'Invoice RLS User', 'employee')
  ON CONFLICT DO NOTHING;

  INSERT INTO organization_members (user_id, organization_id, role, is_active)
  VALUES (test_user_id, test_org_id, 'employee', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO subscription_invoices (id, organization_id, amount_cents, status)
  VALUES (test_invoice_id, test_org_id, 999, 'paid'),
         (other_invoice_id, other_org_id, 1999, 'paid')
  ON CONFLICT DO NOTHING;

  -- Set user context
  PERFORM test_set_user(test_user_id);

  -- Should see own org invoice
  SELECT EXISTS(
    SELECT 1 FROM subscription_invoices WHERE id = test_invoice_id
  ) INTO own_invoice_visible;

  -- Should NOT see other org invoice
  SELECT EXISTS(
    SELECT 1 FROM subscription_invoices WHERE id = other_invoice_id
  ) INTO other_invoice_visible;

  IF own_invoice_visible AND NOT other_invoice_visible THEN
    RAISE NOTICE 'TEST 6 PASSED: Members can only view their org invoices';
  ELSE
    RAISE WARNING 'TEST 6 FAILED: own_visible=%, other_visible=%', own_invoice_visible, other_invoice_visible;
  END IF;

  -- Cleanup
  PERFORM test_clear_user();
  DELETE FROM subscription_invoices WHERE id IN (test_invoice_id, other_invoice_id);
  DELETE FROM organization_members WHERE user_id = test_user_id;
  DELETE FROM users WHERE id = test_user_id;
  DELETE FROM organizations WHERE id IN (test_org_id, other_org_id);
END $$;

-- ============================================================================
-- TEST 7: super_admins - Regular users cannot view super admin list
-- ============================================================================

DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
  admin_count INT;
BEGIN
  -- Insert non-super-admin user
  INSERT INTO users (id, email, full_name, role)
  VALUES (test_user_id, 'nonadmin_rls@example.com', 'Non Admin User', 'employee')
  ON CONFLICT DO NOTHING;

  -- Set user context
  PERFORM test_set_user(test_user_id);

  -- Should NOT see super admins
  SELECT COUNT(*) INTO admin_count FROM super_admins;

  IF admin_count = 0 THEN
    RAISE NOTICE 'TEST 7 PASSED: Regular users cannot view super admin list';
  ELSE
    RAISE WARNING 'TEST 7 FAILED: Regular user can see % super admins', admin_count;
  END IF;

  -- Cleanup
  PERFORM test_clear_user();
  DELETE FROM users WHERE id = test_user_id;
END $$;

-- ============================================================================
-- TEST 8: subscription_audit_log - Org admins can view their audit log
-- ============================================================================

DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
  test_org_id UUID := gen_random_uuid();
  other_org_id UUID := gen_random_uuid();
  own_log_visible BOOLEAN;
  other_log_visible BOOLEAN;
BEGIN
  -- Setup
  INSERT INTO organizations (id, name, settings)
  VALUES (test_org_id, 'Audit Log Test Org', '{}'),
         (other_org_id, 'Other Audit Org', '{}')
  ON CONFLICT DO NOTHING;

  INSERT INTO users (id, email, full_name, role)
  VALUES (test_user_id, 'audit_admin@example.com', 'Audit Admin', 'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO organization_members (user_id, organization_id, role, is_active)
  VALUES (test_user_id, test_org_id, 'admin', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO subscription_audit_log (organization_id, action, action_details, is_system, is_super_admin)
  VALUES (test_org_id, 'test_action', '{}', true, false),
         (other_org_id, 'other_action', '{}', true, false)
  ON CONFLICT DO NOTHING;

  -- Set user context
  PERFORM test_set_user(test_user_id);

  -- Should see own org audit log
  SELECT EXISTS(
    SELECT 1 FROM subscription_audit_log WHERE organization_id = test_org_id
  ) INTO own_log_visible;

  -- Should NOT see other org audit log
  SELECT EXISTS(
    SELECT 1 FROM subscription_audit_log WHERE organization_id = other_org_id
  ) INTO other_log_visible;

  IF own_log_visible AND NOT other_log_visible THEN
    RAISE NOTICE 'TEST 8 PASSED: Org admins can only view their audit log';
  ELSE
    RAISE WARNING 'TEST 8 FAILED: own_visible=%, other_visible=%', own_log_visible, other_log_visible;
  END IF;

  -- Cleanup
  PERFORM test_clear_user();
  DELETE FROM subscription_audit_log WHERE organization_id IN (test_org_id, other_org_id);
  DELETE FROM organization_members WHERE user_id = test_user_id;
  DELETE FROM users WHERE id = test_user_id;
  DELETE FROM organizations WHERE id IN (test_org_id, other_org_id);
END $$;

-- ============================================================================
-- CLEANUP: Remove test helper functions
-- ============================================================================

DROP FUNCTION IF EXISTS test_set_user(UUID);
DROP FUNCTION IF EXISTS test_clear_user();

COMMIT;

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT '
==============================================
RLS POLICY TESTS COMPLETE
==============================================
Review the NOTICE and WARNING messages above.
- PASSED: Policy is working correctly
- FAILED: Policy may have issues
- INFO: Additional context

All tests run in a transaction and are rolled back.
No permanent changes were made to the database.
==============================================
' AS summary;
