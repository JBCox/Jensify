-- =====================================================================================
-- Development Seed Data
-- =====================================================================================
-- Description: Creates organization and sample data for local development
-- Author: Claude Code
-- Date: 2025-11-18
--
-- This file is automatically run after migrations when using `supabase db reset`
-- =====================================================================================

-- Create Corvaer Manufacturing organization
INSERT INTO organizations (
  id,
  name,
  created_at,
  updated_at
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Corvaer Manufacturing',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Log seed completion
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Seed Data Loaded Successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Organization: Corvaer Manufacturing (ID: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)';
  RAISE NOTICE '';
  RAISE NOTICE 'To create test users:';
  RAISE NOTICE '1. Register at http://localhost:4200/auth/register';
  RAISE NOTICE '   - Use emails: josh@corvaer.com, manager@corvaer.com, finance@corvaer.com, admin@corvaer.com';
  RAISE NOTICE '   - Password: password123';
  RAISE NOTICE '2. Create/join organization through the setup wizard';
  RAISE NOTICE '';
  RAISE NOTICE 'Or run: node register-test-users.js (to auto-register via API)';
  RAISE NOTICE '========================================';
END $$;
