-- Fix PostgREST relationship error between organization_members and public.users
-- The original FK references auth.users, but queries use public.users for user name/email
-- This adds a second FK to public.users so PostgREST can find the relationship

-- Add FK from organization_members.user_id to public.users.id
-- This enables PostgREST to use the join syntax: users!user_id(id, email, full_name)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'organization_members_user_id_public_users_fkey'
    ) THEN
        ALTER TABLE public.organization_members
        ADD CONSTRAINT organization_members_user_id_public_users_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id);
    END IF;
END $$;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
