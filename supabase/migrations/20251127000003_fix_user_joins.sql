-- Add FK to public.users to allow PostgREST resource embedding
-- This is required because the frontend tries to join 'users' (public.users)
-- but the existing FK likely points to auth.users, which PostgREST doesn't expose for joins.

-- For expense_reports
ALTER TABLE expense_reports 
DROP CONSTRAINT IF EXISTS expense_reports_user_id_fkey_public;

ALTER TABLE expense_reports
ADD CONSTRAINT expense_reports_user_id_fkey_public 
FOREIGN KEY (user_id) 
REFERENCES public.users(id);

-- For expenses
ALTER TABLE expenses 
DROP CONSTRAINT IF EXISTS expenses_user_id_fkey_public;

ALTER TABLE expenses
ADD CONSTRAINT expenses_user_id_fkey_public 
FOREIGN KEY (user_id) 
REFERENCES public.users(id);
