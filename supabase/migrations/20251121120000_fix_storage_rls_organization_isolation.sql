-- ============================================================================
-- Fix Storage RLS Policies - Organization Isolation
-- Created: 2025-11-21
-- Description: Fix critical security vulnerability where finance users could
--              access receipts from ALL organizations instead of just their own
-- Security Issue: CRITICAL - Cross-organization data access
-- ============================================================================

BEGIN;

-- ============================================================================
-- DROP EXISTING VULNERABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Finance can read all receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own receipts" ON storage.objects;

-- ============================================================================
-- RECREATE POLICIES WITH ORGANIZATION ISOLATION
-- ============================================================================

-- 1. Users can upload to their organization's folder
-- Path structure: receipts/{org_id}/{user_id}/{filename}
CREATE POLICY "Users can upload organization receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );

-- 2. Users can read receipts from their organization
CREATE POLICY "Users can read organization receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );

-- 3. Finance/Admin can read receipts ONLY from their organization
-- FIXED: Was checking users.role (deprecated, global access)
-- NOW: Checks organization_members.role (respects org boundaries)
CREATE POLICY "Finance can read organization receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('finance', 'admin')
        AND is_active = true
    )
  );

-- 4. Users can delete receipts from their organization
-- (Finance/admin will be able to delete due to role check in application logic)
CREATE POLICY "Users can delete organization receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_policy_count INTEGER;
BEGIN
  -- Count storage policies for receipts bucket
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname LIKE '%receipt%';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Storage RLS Security Fix Applied!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Fixed: Cross-organization access vulnerability';
  RAISE NOTICE 'Policies updated: 4 (INSERT, SELECT x2, DELETE)';
  RAISE NOTICE 'Policy count for receipts: %', v_policy_count;
  RAISE NOTICE 'Security: Finance users now restricted to their org';
  RAISE NOTICE '========================================';

  IF v_policy_count < 3 THEN
    RAISE WARNING 'Expected at least 3 receipt policies, found %', v_policy_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (for emergencies)
-- ============================================================================
-- To rollback this migration, run:
-- 1. DROP the 4 new policies created above
-- 2. Recreate the old policies from 20251113000002_storage_policies.sql
-- 3. Note: This will RESTORE the security vulnerability
-- ============================================================================
