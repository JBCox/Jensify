-- =============================================================================
-- SECURITY FIXES MIGRATION
-- =============================================================================
-- This migration addresses critical security vulnerabilities identified in
-- the security audit conducted on December 9, 2025.
--
-- FIXES:
-- 1. Audit log injection vulnerability - secret_access_log INSERT policy
-- 2. Invoice visibility to all members - restrict to admin/finance only
-- 3. Logo storage bucket - change from public to private
-- =============================================================================

-- =============================================================================
-- FIX 1: Audit Log Injection Vulnerability
-- =============================================================================
-- The previous policy allowed ANY authenticated user to insert audit logs,
-- enabling attackers to forge fake entries and hide malicious activity.
--
-- New policy: Only allow inserts where performed_by matches the current user
-- OR the user has admin/finance role in the organization.

DROP POLICY IF EXISTS "System can insert audit logs" ON secret_access_log;

CREATE POLICY "Authenticated users can insert own audit logs"
  ON secret_access_log FOR INSERT
  WITH CHECK (
    -- User can only create logs for themselves
    performed_by = auth.uid()
    -- OR they have admin/finance role in the organization (for system-generated logs)
    OR EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = secret_access_log.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('admin', 'finance')
      AND organization_members.is_active = true
    )
  );

-- =============================================================================
-- FIX 2: Invoice Visibility - Restrict to Admin/Finance Only
-- =============================================================================
-- All organization members could previously see billing invoices.
-- This should be restricted to admin and finance roles only.

DROP POLICY IF EXISTS "Members can view their org invoices" ON subscription_invoices;

CREATE POLICY "Admins and Finance can view org invoices"
  ON subscription_invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = subscription_invoices.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('admin', 'finance')
      AND organization_members.is_active = true
    )
    -- Super admins can always view
    OR EXISTS (
      SELECT 1 FROM super_admins
      WHERE super_admins.user_id = auth.uid()
      AND super_admins.is_active = true
    )
  );

-- =============================================================================
-- FIX 3: Organization Logo Storage Bucket - Make Private
-- =============================================================================
-- The logo bucket was public, allowing anyone to enumerate all org logos.
-- Change to private with role-based access.

-- Update bucket to private (if exists)
UPDATE storage.buckets
SET public = false
WHERE id = 'organization-logos';

-- Drop overly permissive policy
DROP POLICY IF EXISTS "anyone_can_view_logos" ON storage.objects;

-- Create restricted view policy - only org members can view their org's logo
CREATE POLICY "org_members_can_view_logos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'organization-logos'
    AND (
      -- User is a member of the organization (extracted from file path)
      EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_members.organization_id::text = (string_to_array(name, '/'))[1]
        AND organization_members.user_id = auth.uid()
        AND organization_members.is_active = true
      )
      -- OR super admin
      OR EXISTS (
        SELECT 1 FROM super_admins
        WHERE super_admins.user_id = auth.uid()
        AND super_admins.is_active = true
      )
    )
  );

-- =============================================================================
-- FIX 4: Add is_active check to expense reports visibility
-- =============================================================================
-- Ensure deactivated members can't access expense reports

DROP POLICY IF EXISTS "Users can view reports in their organization" ON expense_reports;

CREATE POLICY "Users can view reports in their organization"
  ON expense_reports FOR SELECT
  USING (
    -- Reports must have an organization_id
    organization_id IS NOT NULL
    AND (
      -- User owns the report
      user_id = auth.uid()
      -- OR user is an active member of the organization
      OR EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_members.organization_id = expense_reports.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.is_active = true
      )
    )
  );

-- =============================================================================
-- AUDIT LOG: Record this security update
-- =============================================================================
INSERT INTO admin_audit_log (admin_id, action, data, timestamp)
SELECT
  id,
  'security_migration_applied',
  jsonb_build_object(
    'migration', '20251209200000_security_fixes',
    'fixes', ARRAY[
      'audit_log_injection',
      'invoice_visibility',
      'logo_bucket_public',
      'expense_reports_is_active'
    ]
  ),
  NOW()
FROM user_profiles
WHERE is_super_admin = true
LIMIT 1;

COMMENT ON POLICY "Authenticated users can insert own audit logs" ON secret_access_log IS
  'SECURITY FIX: Prevents audit log injection by requiring performed_by = auth.uid()';

COMMENT ON POLICY "Admins and Finance can view org invoices" ON subscription_invoices IS
  'SECURITY FIX: Restricts invoice visibility to admin/finance roles only';

COMMENT ON POLICY "org_members_can_view_logos" ON storage.objects IS
  'SECURITY FIX: Restricts logo access to organization members only';
