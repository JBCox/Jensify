-- Add logo_url column to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create storage bucket for organization logos (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organization-logos',
  'organization-logos',
  true,  -- Public bucket for logo display
  2097152,  -- 2MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for organization-logos bucket
-- Allow admins to upload logos for their organization
CREATE POLICY "org_admins_can_upload_logos" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'organization-logos'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text
    FROM organization_members om
    WHERE om.user_id = auth.uid()
    AND om.role = 'admin'
    AND om.is_active = true
  )
);

-- Allow admins to update (replace) logos for their organization
CREATE POLICY "org_admins_can_update_logos" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'organization-logos'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text
    FROM organization_members om
    WHERE om.user_id = auth.uid()
    AND om.role = 'admin'
    AND om.is_active = true
  )
);

-- Allow admins to delete logos for their organization
CREATE POLICY "org_admins_can_delete_logos" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'organization-logos'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text
    FROM organization_members om
    WHERE om.user_id = auth.uid()
    AND om.role = 'admin'
    AND om.is_active = true
  )
);

-- Allow anyone to view logos (public bucket)
CREATE POLICY "anyone_can_view_logos" ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'organization-logos');
